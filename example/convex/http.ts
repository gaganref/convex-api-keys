import { httpRouter } from "convex/server";
import { corsRouter } from "convex-helpers/server/cors";
import { httpAction } from "./_generated/server.js";
import type { ActionCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { apiKeys } from "./apiKeys.js";

const http = httpRouter();
const cors = corsRouter(http, {
  allowedOrigins: ["*"],
  allowedHeaders: ["Content-Type", "x-api-key", "authorization"],
  browserCacheMaxAge: 86400,
});

const PERMISSION_DOMAIN = "beacon";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function readApiKey(req: Request) {
  const fromHeader = req.headers.get("x-api-key")?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader) {
    return null;
  }
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }
  const token = authHeader.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : null;
}

const MISSING_KEY_MESSAGE =
  "No API key provided. Use x-api-key or Authorization: Bearer <key>.";

type ValidateSuccess = Extract<
  Awaited<ReturnType<typeof apiKeys.validate>>,
  { ok: true }
>;

type BeaconPermission = NonNullable<
  ValidateSuccess["permissions"]
>[typeof PERMISSION_DOMAIN][number];

function permissionGranted(
  permissions: ValidateSuccess["permissions"],
  required: BeaconPermission,
) {
  const granted = permissions?.[PERMISSION_DOMAIN];
  return granted?.includes("admin") || granted?.includes(required) || false;
}

async function authenticate(
  ctx: ActionCtx,
  req: Request,
  requiredPermission?: BeaconPermission,
): Promise<
  | {
      ok: true;
      validated: ValidateSuccess;
      namespace: string;
    }
  | { ok: false; response: Response }
> {
  const token = readApiKey(req);
  if (!token) {
    return {
      ok: false,
      response: json(401, {
        error: "UNAUTHORIZED",
        message: MISSING_KEY_MESSAGE,
      }),
    };
  }

  const validated = await apiKeys.validate(ctx, { token });
  if (!validated.ok) {
    if (validated.reason === "not_found") {
      return {
        ok: false,
        response: json(401, {
          error: "INVALID_API_KEY",
          reason: validated.reason,
        }),
      };
    }
    return {
      ok: false,
      response: json(403, {
        error: "API_KEY_REJECTED",
        reason: validated.reason,
      }),
    };
  }

  if (
    requiredPermission &&
    !permissionGranted(validated.permissions, requiredPermission)
  ) {
    return {
      ok: false,
      response: json(403, {
        error: "INSUFFICIENT_PERMISSIONS",
        required: requiredPermission,
        granted: validated.permissions?.[PERMISSION_DOMAIN] ?? [],
      }),
    };
  }

  const namespace = validated.namespace;
  if (!namespace) {
    return {
      ok: false,
      response: json(500, {
        error: "INVALID_KEY_NAMESPACE",
        message: "Validated key did not include a supported namespace.",
      }),
    };
  }

  try {
    await apiKeys.touch(ctx, { keyId: validated.keyId });
  } catch (err) {
    console.warn("Failed to touch key usage:", err);
  }

  return {
    ok: true,
    validated,
    namespace,
  };
}

const track = httpAction(async (ctx, req) => {
  if (req.method !== "POST") {
    return json(405, {
      error: "METHOD_NOT_ALLOWED",
      message: "Use POST for /track.",
    });
  }

  const auth = await authenticate(ctx, req, "events:write");
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, {
      error: "INVALID_JSON",
      message: "Request body must be valid JSON.",
    });
  }

  if (typeof payload !== "object" || payload === null) {
    return json(400, {
      error: "INVALID_BODY",
      message: "Body must be a JSON object.",
    });
  }

  const { event, properties } = payload as {
    event?: unknown;
    properties?: Record<string, unknown>;
  };
  if (typeof event !== "string" || event.trim().length === 0) {
    return json(400, {
      error: "INVALID_BODY",
      message: "Body.event is required and must be a non-empty string.",
    });
  }

  const userId =
    typeof properties?.user_id === "string" ? properties.user_id : "anonymous";

  const props =
    properties && typeof properties === "object" && !Array.isArray(properties)
      ? properties
      : undefined;

  const recorded = await ctx.runMutation(internal.events.recordTrackedEvent, {
    userId,
    namespace: auth.namespace,
    keyId: auth.validated.keyId,
    keyName: auth.validated.name ?? "Unnamed key",
    event: event.trim(),
    props,
  });

  return json(200, {
    ok: true,
    eventId: recorded.eventId,
    event: event.trim(),
    receivedAt: new Date(recorded.receivedAt).toISOString(),
  });
});

const events = httpAction(async (ctx, req) => {
  const auth = await authenticate(ctx, req, "reports:read");
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? undefined : Number(rawLimit);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

  const result = await ctx.runQuery(internal.events.listTrackedEvents, {
    namespace: auth.namespace,
    limit,
  });

  return json(200, {
    ok: true,
    events: result.events.map((row) => ({
      event: row.event,
      userId: row.userId,
      keyId: row.keyId,
      keyName: row.keyName,
      props: row.props ?? {},
      receivedAt: new Date(row.receivedAt).toISOString(),
    })),
    total: result.total,
  });
});

const stats = httpAction(async (ctx, req) => {
  const auth = await authenticate(ctx, req, "reports:read");
  if (!auth.ok) {
    return auth.response;
  }

  const statsResult = await ctx.runQuery(internal.events.trackedEventStats, {
    namespace: auth.namespace,
  });

  return json(200, {
    ok: true,
    stats: statsResult,
  });
});

const me = httpAction(async (ctx, req) => {
  const auth = await authenticate(ctx, req);
  if (!auth.ok) {
    return auth.response;
  }

  return json(200, {
    ok: true,
    key: {
      keyId: auth.validated.keyId,
      namespace: auth.validated.namespace ?? null,
      name: auth.validated.name ?? null,
      permissions: auth.validated.permissions ?? {},
      metadataSource: auth.validated.metadata?.source ?? null,
    },
  });
});

cors.route({ path: "/track", method: "POST", handler: track });
cors.route({ path: "/events", method: "GET", handler: events });
cors.route({ path: "/stats", method: "GET", handler: stats });
cors.route({ path: "/me", method: "GET", handler: me });

export default http;
