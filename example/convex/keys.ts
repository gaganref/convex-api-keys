// ---------------------------------------------------------------------------
// Key management mutations & queries
//
// NOTE: In a production app, you may want to gate these mutations and queries
// behind a proper auth layer (e.g. Convex Auth, Clerk, Auth0). The "workspace"
// arg is trusted as-is to keep this example simple and focused on showcasing
// the API keys component. In production, prefer authenticating the caller and
// verifying workspace ownership.
// ---------------------------------------------------------------------------

import { mutation, query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { apiKeys } from "./apiKeys.js";

// ---------------------------------------------------------------------------
// Shared types & validators
// ---------------------------------------------------------------------------

export type Namespace = `${string}:${"production" | "testing"}`;

export const environmentValidator = v.union(
  v.literal("production"),
  v.literal("testing"),
);

const beaconPermissionValidator = v.union(
  v.literal("events:write"),
  v.literal("reports:read"),
  v.literal("admin"),
);

const listedKeyValidator = v.object({
  keyId: v.string(),
  namespace: v.string(),
  name: v.optional(v.string()),
  tokenPreview: v.string(),
  permissions: v.array(v.string()),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("expired"),
    v.literal("revoked"),
  ),
});

const listKeysResultValidator = v.object({
  page: v.array(listedKeyValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

const listedEventValidator = v.object({
  eventId: v.string(),
  keyId: v.string(),
  type: v.union(
    v.literal("created"),
    v.literal("revoked"),
    v.literal("rotated"),
  ),
  reason: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.any())),
  createdAt: v.number(),
});

const listKeyEventsResultValidator = v.object({
  page: v.array(listedEventValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_STRING_LENGTH = 256;
const KEYS_PAGE_SIZE = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ENV_PREFIX: Record<"production" | "testing", string> = {
  production: "sk_live_",
  testing: "sk_test_",
};

export function toNamespace(
  workspace: string,
  environment: "production" | "testing",
) {
  const trimmed = workspace.trim();
  if (trimmed.length === 0) {
    throw new Error("workspace must not be empty");
  }
  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new Error(`workspace exceeds max length of ${MAX_STRING_LENGTH}`);
  }
  return `${trimmed}:${environment}` as Namespace;
}

export async function listNamespaceKeyStats(
  ctx: QueryCtx,
  namespace: Namespace,
): Promise<{
  total: number;
  active: number;
  namesById: Record<string, string>;
}> {
  let active = 0;
  let total = 0;
  let cursor: string | null = null;
  const namesById: Record<string, string> = {};

  while (true) {
    const result: Awaited<ReturnType<typeof apiKeys.listKeys>> =
      await apiKeys.listKeys(ctx, {
        namespace,
        paginationOpts: {
          numItems: KEYS_PAGE_SIZE,
          cursor,
        },
      });

    total += result.page.length;
    active += result.page.filter(
      (row) => row.effectiveStatus === "active",
    ).length;
    for (const row of result.page) {
      if (row.name) {
        namesById[row.keyId] = row.name;
      }
    }
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  return { total, active, namesById };
}

async function countActiveKeys(ctx: QueryCtx, namespace: Namespace) {
  const stats = await listNamespaceKeyStats(ctx, namespace);
  return stats.active;
}

async function keyExistsInNamespace(
  ctx: QueryCtx,
  namespace: Namespace,
  keyId: string,
) {
  let cursor: string | null = null;

  while (true) {
    const result: Awaited<ReturnType<typeof apiKeys.listKeys>> =
      await apiKeys.listKeys(ctx, {
        namespace,
        paginationOpts: {
          numItems: KEYS_PAGE_SIZE,
          cursor,
        },
      });

    if (result.page.some((row) => row.keyId === keyId)) {
      return true;
    }
    if (result.isDone) {
      return false;
    }
    cursor = result.continueCursor;
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createKey = mutation({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    name: v.string(),
    permissions: v.array(beaconPermissionValidator),
    ttlDays: v.union(v.number(), v.null()),
    idleTimeoutMs: v.union(v.number(), v.null()),
  },
  returns: {
    keyId: v.string(),
    token: v.string(),
    tokenPrefix: v.string(),
    tokenLast4: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Key name must not be empty");
    }
    if (name.length > MAX_STRING_LENGTH) {
      throw new Error(`Key name exceeds max length of ${MAX_STRING_LENGTH}`);
    }
    const namespace = toNamespace(args.workspace, args.environment);
    const key = await apiKeys.create(ctx, {
      namespace,
      name,
      prefix: ENV_PREFIX[args.environment],
      permissions: { beacon: args.permissions },
      ttlMs: args.ttlDays === null ? null : args.ttlDays * ONE_DAY_MS,
      idleTimeoutMs: args.idleTimeoutMs,
      metadata: {
        source: "example.createKey",
      },
    });

    return {
      ...key,
      keyId: key.keyId,
    };
  },
});

export const revokeKey = mutation({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    keyId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      keyId: v.string(),
      revokedAt: v.number(),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(v.literal("not_found"), v.literal("revoked")),
    }),
  ),
  handler: async (ctx, args) => {
    const result = await apiKeys.invalidate(ctx, {
      keyId: args.keyId,
      reason: args.reason,
      metadata: {
        source: "example.revokeKey",
      },
    });

    if (!result.ok) {
      return result;
    }
    return {
      ok: true as const,
      keyId: result.keyId,
      revokedAt: result.revokedAt,
    };
  },
});

export const revokeAllKeys = mutation({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    revoked: v.number(),
    pages: v.number(),
  }),
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    return await apiKeys.invalidateAll(ctx, {
      namespace,
      before: args.before,
      after: args.after,
      reason: args.reason,
      metadata: {
        source: "example.revokeAllKeys",
      },
    });
  },
});

export const rotateKey = mutation({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    keyId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      keyId: v.string(),
      replacedKeyId: v.string(),
      token: v.string(),
      tokenPrefix: v.string(),
      tokenLast4: v.string(),
      createdAt: v.number(),
      expiresAt: v.optional(v.number()),
      }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("not_found"),
        v.literal("revoked"),
        v.literal("expired"),
        v.literal("idle_timeout"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const result = await apiKeys.refresh(ctx, {
      keyId: args.keyId,
      prefix: ENV_PREFIX[args.environment],
      reason: args.reason,
      metadata: {
        source: "example.rotateKey",
      },
    });

    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      keyId: result.keyId,
      replacedKeyId: result.replacedKeyId,
    };
  },
});

export const updateKey = mutation({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    keyId: v.string(),
    name: v.string(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.literal("not_found") }),
  ),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Key name must not be empty");
    }
    if (name.length > MAX_STRING_LENGTH) {
      throw new Error(`Key name exceeds max length of ${MAX_STRING_LENGTH}`);
    }
    const result = await apiKeys.update(ctx, {
      keyId: args.keyId,
      name,
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listKeys = query({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: listKeysResultValidator,
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    const result: Awaited<ReturnType<typeof apiKeys.listKeys>> =
      await apiKeys.listKeys(ctx, {
        namespace,
        paginationOpts: args.paginationOpts,
      });

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((row) => ({
        keyId: row.keyId,
        namespace,
        name: row.name,
        tokenPreview: `${row.tokenPrefix}...${row.tokenLast4}`,
        permissions: row.permissions?.beacon ?? [],
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        status:
          row.effectiveStatus === "idle_timeout"
            ? ("expired" as const)
            : row.effectiveStatus,
      })),
    };
  },
});

export const listKeyEvents = query({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    keyId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: listKeyEventsResultValidator,
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    const owned = await keyExistsInNamespace(ctx, namespace, args.keyId);
    if (!owned) {
      return {
        isDone: true,
        continueCursor: "",
        page: [],
      };
    }

    const result: Awaited<ReturnType<typeof apiKeys.listKeyEvents>> =
      await apiKeys.listKeyEvents(ctx, {
        keyId: args.keyId,
        paginationOpts: args.paginationOpts,
      });

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((event) => ({
        eventId: event.eventId,
        keyId: event.keyId,
        type: event.type,
        reason: event.reason,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
    };
  },
});

export const keyCounts = query({
  args: {
    workspace: v.string(),
  },
  returns: v.object({
    productionActive: v.number(),
    testingActive: v.number(),
  }),
  handler: async (ctx, args) => {
    const productionActive = await countActiveKeys(
      ctx,
      toNamespace(args.workspace, "production"),
    );
    const testingActive = await countActiveKeys(
      ctx,
      toNamespace(args.workspace, "testing"),
    );

    return { productionActive, testingActive };
  },
});
