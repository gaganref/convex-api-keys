import { mutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import {
  apiKeyStatusValidator,
  metadataValidator,
  permissionsValidator,
} from "../shared.js";
import type { ApiKeyStatus } from "../shared.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import schema from "./schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusFields = {
  status: ApiKeyStatus;
  expiresAt?: number;
  idleExpiresAt?: number;
};

type EffectiveStatus = "active" | "revoked" | "expired" | "idle_timeout";

function effectiveStatus(key: StatusFields, now: number): EffectiveStatus {
  if (key.status === "revoked") return "revoked";
  if (key.expiresAt !== undefined && now >= key.expiresAt) return "expired";
  if (key.idleExpiresAt !== undefined && now >= key.idleExpiresAt)
    return "idle_timeout";
  return "active";
}

function mapEventRow(event: Doc<"apiKeyEvents">) {
  return {
    eventId: event._id,
    keyId: event.keyId,
    namespace: event.namespace,
    type: event.type,
    reason: event.reason,
    metadata: event.metadata,
    createdAt: event._creationTime,
  };
}

function throwDuplicateTokenHashError(): never {
  throw new ConvexError({
    code: "invalid_argument",
    message: "token hash already exists",
  });
}

async function recordEvent(
  ctx: MutationCtx,
  keyId: Id<"apiKeys">,
  namespace: string | undefined,
  type: "created" | "revoked" | "rotated",
  reason?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await ctx.db.insert("apiKeyEvents", {
    keyId,
    namespace,
    type,
    reason,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const effectiveStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
  v.literal("expired"),
  v.literal("idle_timeout"),
);

const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("revoked"),
  v.literal("expired"),
  v.literal("idle_timeout"),
);

const orderValidator = v.optional(
  v.union(v.literal("asc"), v.literal("desc")),
);

const logLevelValidator = v.optional(
  v.union(
    v.literal("debug"),
    v.literal("warn"),
    v.literal("error"),
    v.literal("none"),
  ),
);

const createResultValidator = v.object({
  keyId: v.id("apiKeys"),
  createdAt: v.number(),
});

const validateResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    keyId: v.id("apiKeys"),
    namespace: v.optional(v.string()),
    name: v.optional(v.string()),
    permissions: v.optional(permissionsValidator),
    metadata: v.optional(metadataValidator),
  }),
  v.object({
    ok: v.literal(false),
    reason: failureReasonValidator,
  }),
);

const touchResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    keyId: v.id("apiKeys"),
    touchedAt: v.number(),
    idleExpiresAt: v.optional(v.number()),
  }),
  v.object({
    ok: v.literal(false),
    reason: failureReasonValidator,
  }),
);

const invalidateResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    keyId: v.id("apiKeys"),
    revokedAt: v.number(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("not_found"), v.literal("revoked")),
  }),
);

const refreshResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    keyId: v.id("apiKeys"),
    replacedKeyId: v.id("apiKeys"),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    idleExpiresAt: v.optional(v.number()),
  }),
  v.object({
    ok: v.literal(false),
    reason: failureReasonValidator,
  }),
);

const invalidateAllResultValidator = v.object({
  processed: v.number(),
  revoked: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

const listKeyItemValidator = v.object({
  keyId: v.id("apiKeys"),
  namespace: v.optional(v.string()),
  name: v.optional(v.string()),
  tokenPrefix: v.string(),
  tokenLast4: v.string(),
  permissions: v.optional(permissionsValidator),
  metadata: v.optional(metadataValidator),
  status: apiKeyStatusValidator,
  effectiveStatus: effectiveStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  idleExpiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  revocationReason: v.optional(v.string()),
  replaces: v.optional(v.id("apiKeys")),
});

const listKeysResultValidator = v.object({
  page: v.array(listKeyItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

const getKeyResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    ...listKeyItemValidator.fields,
  }),
  v.object({
    ok: v.literal(false),
    reason: v.literal("not_found"),
  }),
);

const listEventItemValidator = v.object({
  eventId: v.id("apiKeyEvents"),
  keyId: v.id("apiKeys"),
  namespace: v.optional(v.string()),
  type: v.union(
    v.literal("created"),
    v.literal("revoked"),
    v.literal("rotated"),
  ),
  reason: v.optional(v.string()),
  metadata: v.optional(metadataValidator),
  createdAt: v.number(),
});

const listEventsResultValidator = v.object({
  page: v.array(listEventItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

const updateResultValidator = v.union(
  v.object({ ok: v.literal(true), keyId: v.id("apiKeys") }),
  v.object({ ok: v.literal(false), reason: v.literal("not_found") }),
);

// ---------------------------------------------------------------------------
// Mutations & Queries
// ---------------------------------------------------------------------------

/**
 * Creates a new key record and emits a creation audit event.
 */
export const create = mutation({
  args: {
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    tokenLast4: v.string(),
    namespace: v.optional(v.string()),
    name: v.optional(v.string()),
    permissions: v.optional(permissionsValidator),
    metadata: v.optional(metadataValidator),
    expiresAt: v.optional(v.number()),
    maxIdleMs: v.optional(v.number()),
    idleExpiresAt: v.optional(v.number()),
    logLevel: logLevelValidator,
  },
  returns: createResultValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (existing !== null) {
      throwDuplicateTokenHashError();
    }

    const now = Date.now();
    const keyId = await ctx.db.insert("apiKeys", {
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      tokenLast4: args.tokenLast4,
      namespace: args.namespace,
      name: args.name,
      permissions: args.permissions,
      metadata: args.metadata,
      status: "active" as const,
      expiresAt: args.expiresAt,
      maxIdleMs: args.maxIdleMs,
      idleExpiresAt: args.idleExpiresAt,
      updatedAt: now,
    });

    await recordEvent(
      ctx,
      keyId,
      args.namespace,
      "created",
      undefined,
      args.metadata,
    );

    if (args.logLevel === "debug") {
      console.log("[api-keys:create]", { keyId, namespace: args.namespace });
    }

    return { keyId, createdAt: now };
  },
});

/**
 * Validates a token hash and returns the matching active key.
 */
export const validate = query({
  args: {
    tokenHash: v.string(),
    now: v.number(),
    logLevel: logLevelValidator,
  },
  returns: validateResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (key === null) {
      if (args.logLevel === "debug") {
        console.log("[api-keys:validate]", { status: "not_found" });
      }
      return { ok: false as const, reason: "not_found" as const };
    }

    const status = effectiveStatus(key, args.now);

    if (args.logLevel === "debug") {
      console.log("[api-keys:validate]", { keyId: key._id, status });
    }

    if (status !== "active") {
      return { ok: false as const, reason: status };
    }

    return {
      ok: true as const,
      keyId: key._id,
      namespace: key.namespace,
      name: key.name,
      permissions: key.permissions,
      metadata: key.metadata,
    };
  },
});

/**
 * Marks a key as recently used and extends idle expiry when configured.
 */
export const touch = mutation({
  args: {
    keyId: v.id("apiKeys"),
    now: v.number(),
  },
  returns: touchResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const status = effectiveStatus(key, args.now);
    if (status !== "active") {
      return { ok: false as const, reason: status };
    }

    const idleExpiresAt =
      key.maxIdleMs === undefined ? undefined : args.now + key.maxIdleMs;
    await ctx.db.patch(key._id, {
      lastUsedAt: args.now,
      idleExpiresAt,
      updatedAt: args.now,
    });

    return {
      ok: true as const,
      keyId: key._id,
      touchedAt: args.now,
      idleExpiresAt,
    };
  },
});

/**
 * Lists API keys with derived effective status.
 */
export const listKeys = query({
  args: {
    paginationOpts: paginationOptsValidator,
    namespace: v.optional(v.string()),
    status: v.optional(apiKeyStatusValidator),
    now: v.number(),
    order: orderValidator,
  },
  returns: listKeysResultValidator,
  handler: async (ctx, args) => {
    const pages = paginator(ctx.db, schema).query("apiKeys");
    const order = args.order ?? "desc";

    let result;
    if (args.namespace !== undefined && args.status !== undefined) {
      result = await pages
        .withIndex("by_namespace_and_status", (q) =>
          q.eq("namespace", args.namespace).eq("status", args.status!),
        )
        .order(order)
        .paginate(args.paginationOpts);
    } else if (args.namespace !== undefined) {
      result = await pages
        .withIndex("by_namespace_and_creation_time", (q) =>
          q.eq("namespace", args.namespace),
        )
        .order(order)
        .paginate(args.paginationOpts);
    } else if (args.status !== undefined) {
      result = await pages
        .withIndex("by_status_and_creation_time", (q) =>
          q.eq("status", args.status!),
        )
        .order(order)
        .paginate(args.paginationOpts);
    } else {
      result = await pages.order(order).paginate(args.paginationOpts);
    }

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((key) => ({
        keyId: key._id,
        namespace: key.namespace,
        name: key.name,
        tokenPrefix: key.tokenPrefix,
        tokenLast4: key.tokenLast4,
        permissions: key.permissions,
        metadata: key.metadata,
        status: key.status,
        effectiveStatus: effectiveStatus(key, args.now),
        createdAt: key._creationTime,
        updatedAt: key.updatedAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        idleExpiresAt: key.idleExpiresAt,
        revokedAt: key.revokedAt,
        revocationReason: key.revocationReason,
        replaces: key.replaces,
      })),
    };
  },
});

/**
 * Fetches a single API key by ID with its derived effective status.
 */
export const getKey = query({
  args: {
    keyId: v.id("apiKeys"),
    now: v.number(),
  },
  returns: getKeyResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    return {
      ok: true as const,
      keyId: key._id,
      namespace: key.namespace,
      name: key.name,
      tokenPrefix: key.tokenPrefix,
      tokenLast4: key.tokenLast4,
      permissions: key.permissions,
      metadata: key.metadata,
      status: key.status,
      effectiveStatus: effectiveStatus(key, args.now),
      createdAt: key._creationTime,
      updatedAt: key.updatedAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      idleExpiresAt: key.idleExpiresAt,
      revokedAt: key.revokedAt,
      revocationReason: key.revocationReason,
      replaces: key.replaces,
    };
  },
});

/**
 * Lists audit events for a single key.
 */
export const listKeyEvents = query({
  args: {
    keyId: v.id("apiKeys"),
    paginationOpts: paginationOptsValidator,
    order: orderValidator,
  },
  returns: listEventsResultValidator,
  handler: async (ctx, args) => {
    const result = await paginator(ctx.db, schema)
      .query("apiKeyEvents")
      .withIndex("by_key_id_and_creation_time", (q) =>
        q.eq("keyId", args.keyId),
      )
      .order(args.order ?? "desc")
      .paginate(args.paginationOpts);

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map(mapEventRow),
    };
  },
});

/**
 * Lists audit events across all keys, optionally scoped by namespace.
 */
export const listEvents = query({
  args: {
    paginationOpts: paginationOptsValidator,
    namespace: v.optional(v.string()),
    order: orderValidator,
  },
  returns: listEventsResultValidator,
  handler: async (ctx, args) => {
    const pages = paginator(ctx.db, schema).query("apiKeyEvents");
    const order = args.order ?? "desc";
    const result =
      args.namespace === undefined
        ? await pages.order(order).paginate(args.paginationOpts)
        : await pages
            .withIndex("by_namespace_and_creation_time", (q) =>
              q.eq("namespace", args.namespace),
            )
            .order(order)
            .paginate(args.paginationOpts);

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map(mapEventRow),
    };
  },
});

/**
 * Revokes a single key and records the revocation event.
 */
export const invalidate = mutation({
  args: {
    keyId: v.id("apiKeys"),
    now: v.number(),
    reason: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
    logLevel: logLevelValidator,
  },
  returns: invalidateResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (key.status === "revoked") {
      return { ok: false as const, reason: "revoked" as const };
    }

    await ctx.db.patch(key._id, {
      status: "revoked" as const,
      revokedAt: args.now,
      revocationReason: args.reason,
      updatedAt: args.now,
    });

    await recordEvent(
      ctx,
      key._id,
      key.namespace,
      "revoked",
      args.reason,
      args.metadata,
    );

    if (args.logLevel === "debug") {
      console.log("[api-keys:invalidate]", { keyId: key._id });
    }

    return { ok: true as const, keyId: key._id, revokedAt: args.now };
  },
});

/**
 * Revokes active keys in pages using optional namespace/time filters.
 */
export const invalidateAll = mutation({
  args: {
    paginationOpts: paginationOptsValidator,
    namespace: v.optional(v.string()),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    now: v.number(),
    reason: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
    logLevel: logLevelValidator,
  },
  returns: invalidateAllResultValidator,
  handler: async (ctx, args) => {
    const pages = paginator(ctx.db, schema).query("apiKeys");
    const result =
      args.namespace === undefined
        ? await pages
            .withIndex("by_status_and_creation_time", (q) =>
              q.eq("status", "active"),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await pages
            .withIndex("by_namespace_and_status", (q) =>
              q.eq("namespace", args.namespace).eq("status", "active"),
            )
            .order("desc")
            .paginate(args.paginationOpts);

    const toInvalidate = result.page.filter(
      (key) =>
        (args.before === undefined || key._creationTime < args.before) &&
        (args.after === undefined || key._creationTime > args.after),
    );

    for (const key of toInvalidate) {
      await ctx.db.patch(key._id, {
        status: "revoked" as const,
        revokedAt: args.now,
        revocationReason: args.reason,
        updatedAt: args.now,
      });

      await recordEvent(
        ctx,
        key._id,
        key.namespace,
        "revoked",
        args.reason,
        args.metadata,
      );
    }

    const processed = result.page.length;
    const revoked = toInvalidate.length;

    if (args.logLevel === "debug") {
      console.log("[api-keys:invalidateAll]", {
        processed,
        revoked,
        isDone: result.isDone,
        namespace: args.namespace,
      });
    }

    return {
      processed,
      revoked,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Updates mutable key properties (name, metadata, expiry).
 * Passing `expiresAt: null` removes the expiry field entirely.
 */
export const update = mutation({
  args: {
    keyId: v.id("apiKeys"),
    name: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    logLevel: logLevelValidator,
  },
  returns: updateResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const now = Date.now();

    if (args.expiresAt === null) {
      // Removing expiresAt requires replace (patch can't unset fields).
      const { _id, _creationTime, expiresAt: _removed, ...rest } = key;
      await ctx.db.replace(_id, {
        ...rest,
        updatedAt: now,
        ...(args.name !== undefined && { name: args.name }),
        ...(args.metadata !== undefined && { metadata: args.metadata }),
      });
    } else {
      const patch: {
        updatedAt: number;
        name?: string;
        metadata?: Record<string, any>;
        expiresAt?: number;
      } = { updatedAt: now };
      if (args.name !== undefined) patch.name = args.name;
      if (args.metadata !== undefined) patch.metadata = args.metadata;
      if (args.expiresAt !== undefined) patch.expiresAt = args.expiresAt;
      await ctx.db.patch(key._id, patch);
    }

    if (args.logLevel === "debug") {
      console.log("[api-keys:update]", { keyId: key._id });
    }

    return { ok: true as const, keyId: key._id };
  },
});

/**
 * Rotates a key by revoking the old key and creating a replacement.
 */
export const refresh = mutation({
  args: {
    keyId: v.id("apiKeys"),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    tokenLast4: v.string(),
    now: v.number(),
    reason: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
    logLevel: logLevelValidator,
  },
  returns: refreshResultValidator,
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const status = effectiveStatus(key, args.now);
    if (status !== "active") {
      return { ok: false as const, reason: status };
    }

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (existing !== null) {
      throwDuplicateTokenHashError();
    }

    const idleExpiresAt =
      key.maxIdleMs === undefined ? undefined : args.now + key.maxIdleMs;
    const newKeyId = await ctx.db.insert("apiKeys", {
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      tokenLast4: args.tokenLast4,
      namespace: key.namespace,
      name: key.name,
      permissions: key.permissions,
      metadata: key.metadata,
      status: "active" as const,
      expiresAt: key.expiresAt,
      maxIdleMs: key.maxIdleMs,
      idleExpiresAt,
      replaces: key._id,
      updatedAt: args.now,
    });

    await ctx.db.patch(key._id, {
      status: "revoked" as const,
      revokedAt: args.now,
      revocationReason: args.reason,
      updatedAt: args.now,
    });

    await recordEvent(
      ctx,
      key._id,
      key.namespace,
      "rotated",
      args.reason,
      args.metadata,
    );
    await recordEvent(
      ctx,
      newKeyId,
      key.namespace,
      "created",
      undefined,
      key.metadata,
    );

    if (args.logLevel === "debug") {
      console.log("[api-keys:refresh]", { oldKeyId: key._id, newKeyId });
    }

    return {
      ok: true as const,
      keyId: newKeyId,
      replacedKeyId: key._id,
      createdAt: args.now,
      expiresAt: key.expiresAt,
      idleExpiresAt,
    };
  },
});
