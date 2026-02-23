import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { apiKeys } from "./apiKeys.js";

type Namespace = `${string}:${"production" | "testing"}`;

const namespaceValidator = v.string();

const environmentValidator = v.union(
  v.literal("production"),
  v.literal("testing"),
);

const beaconPermissionValidator = v.union(
  v.literal("events:write"),
  v.literal("reports:read"),
  v.literal("admin"),
);

const createKeyArgsValidator = {
  workspace: v.string(),
  environment: environmentValidator,
  name: v.string(),
  permissions: v.array(beaconPermissionValidator),
  ttlDays: v.union(v.number(), v.null()),
  idleTimeoutMs: v.union(v.number(), v.null()),
};

export const createKey = mutation({
  args: createKeyArgsValidator,
  returns: {
    keyId: v.string(),
    token: v.string(),
    tokenPrefix: v.string(),
    tokenLast4: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    idleExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    const key = await apiKeys.create(ctx, {
      namespace,
      name: args.name,
      permissions: { beacon: args.permissions },
      ttlMs: args.ttlDays === null ? null : args.ttlDays * 24 * 60 * 60 * 1000,
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

const trackedEventPropsValidator = v.optional(v.record(v.string(), v.any()));

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

const recentAuditItemValidator = v.object({
  eventId: v.string(),
  keyId: v.string(),
  keyName: v.string(),
  type: v.union(
    v.literal("created"),
    v.literal("revoked"),
    v.literal("rotated"),
  ),
  createdAt: v.number(),
});

const weeklyChartPointValidator = v.object({
  date: v.string(),
  production: v.number(),
  testing: v.number(),
});

const trackedEventForUiValidator = v.object({
  id: v.string(),
  event: v.string(),
  userId: v.string(),
  keyId: v.string(),
  keyName: v.string(),
  props: trackedEventPropsValidator,
  receivedAt: v.number(),
});

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
      page: result.page.map((row: (typeof result.page)[number]) => ({
        keyId: String(row.keyId),
        namespace,
        name: row.name,
        tokenPreview: `${row.tokenPrefix}...${row.tokenLast4}`,
        permissions: row.permissions?.beacon ?? [],
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        status:
          row.effectiveStatus === "idle_timeout"
            ? "expired"
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
      page: result.page.map((event: (typeof result.page)[number]) => ({
        eventId: String(event.eventId),
        keyId: String(event.keyId),
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

    return {
      productionActive,
      testingActive,
    };
  },
});

export const dashboardData = query({
  args: {
    workspace: v.string(),
  },
  returns: v.object({
    activeKeys: v.number(),
    totalKeys: v.number(),
    productionEventsToday: v.number(),
    testingEventsToday: v.number(),
    uniqueEventTypes: v.number(),
    chart: v.array(weeklyChartPointValidator),
    recentAudit: v.array(recentAuditItemValidator),
  }),
  handler: async (ctx, args) => {
    const productionNamespace = toNamespace(args.workspace, "production");
    const testingNamespace = toNamespace(args.workspace, "testing");
    const productionRows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", productionNamespace),
      )
      .collect();
    const testingRows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", testingNamespace),
      )
      .collect();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const todaySince = now - dayMs;
    const productionEventsToday = productionRows.filter(
      (row) => row._creationTime >= todaySince,
    ).length;
    const testingEventsToday = testingRows.filter(
      (row) => row._creationTime >= todaySince,
    ).length;
    const uniqueEventTypes = new Set(
      [...productionRows, ...testingRows].map((row) => row.event),
    ).size;

    const chart: Array<{
      date: string;
      production: number;
      testing: number;
    }> = [];
    for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
      const dayDate = new Date(now - dayOffset * dayMs);
      const dayStart = new Date(dayDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setHours(23, 59, 59, 999);

      const production = productionRows.filter(
        (row) =>
          row._creationTime >= dayStart.getTime() &&
          row._creationTime <= dayEnd.getTime(),
      ).length;
      const testing = testingRows.filter(
        (row) =>
          row._creationTime >= dayStart.getTime() &&
          row._creationTime <= dayEnd.getTime(),
      ).length;

      chart.push({
        date: dayDate.toLocaleDateString("en-US", { weekday: "short" }),
        production,
        testing,
      });
    }

    const [productionStats, testingStats] = await Promise.all([
      listNamespaceKeyStats(ctx, productionNamespace),
      listNamespaceKeyStats(ctx, testingNamespace),
    ]);
    const keyNames: Record<string, string> = {
      ...productionStats.namesById,
      ...testingStats.namesById,
    };

    const auditEvents: Awaited<ReturnType<typeof apiKeys.listEvents>> =
      await apiKeys.listEvents(ctx, {
        namespace: productionNamespace,
        paginationOpts: {
          numItems: 8,
          cursor: null,
        },
      });
    const testingAuditEvents: Awaited<ReturnType<typeof apiKeys.listEvents>> =
      await apiKeys.listEvents(ctx, {
        namespace: testingNamespace,
        paginationOpts: {
          numItems: 8,
          cursor: null,
        },
      });
    const scopedAuditEvents = [...auditEvents.page, ...testingAuditEvents.page]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8);

    return {
      activeKeys: productionStats.active + testingStats.active,
      totalKeys: productionStats.total + testingStats.total,
      productionEventsToday,
      testingEventsToday,
      uniqueEventTypes,
      chart,
      recentAudit: scopedAuditEvents.map(
        (event: (typeof scopedAuditEvents)[number]) => ({
          eventId: String(event.eventId),
          keyId: String(event.keyId),
          keyName: keyNames[String(event.keyId)] ?? "Unknown key",
          type: event.type,
          createdAt: event.createdAt,
        }),
      ),
    };
  },
});

export const trackedEventsByNamespace = query({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    limit: v.optional(v.number()),
  },
  returns: v.array(trackedEventForUiValidator),
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    const cap = Math.max(1, Math.min(args.limit ?? 100, 250));
    const rows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", namespace),
      )
      .order("desc")
      .take(cap);

    return rows.map((row: (typeof rows)[number]) => ({
      id: String(row._id),
      event: row.event,
      userId: row.userId,
      keyId: row.keyId,
      keyName: row.keyName,
      props: row.props,
      receivedAt: row._creationTime,
    }));
  },
});

export const invalidateHookSummary = query({
  args: {},
  returns: v.object({
    total: v.number(),
    lastTrigger: v.optional(
      v.union(
        v.literal("invalidate"),
        v.literal("refresh"),
        v.literal("invalidateAll"),
      ),
    ),
    lastAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("invalidationHookEvents")
      .order("desc")
      .take(1);
    const all = await ctx.db.query("invalidationHookEvents").collect();

    return {
      total: all.length,
      lastTrigger: latest[0]?.trigger,
      lastAt: latest[0]?._creationTime,
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
    const namespace = toNamespace(args.workspace, args.environment);
    const owned = await keyExistsInNamespace(ctx, namespace, args.keyId);
    if (!owned) {
      return {
        ok: false as const,
        reason: "not_found" as const,
      };
    }

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
      keyId: String(result.keyId),
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
      idleExpiresAt: v.optional(v.number()),
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
    const namespace = toNamespace(args.workspace, args.environment);
    const owned = await keyExistsInNamespace(ctx, namespace, args.keyId);
    if (!owned) {
      return {
        ok: false as const,
        reason: "not_found" as const,
      };
    }

    const result = await apiKeys.refresh(ctx, {
      keyId: args.keyId,
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
      keyId: String(result.keyId),
      replacedKeyId: String(result.replacedKeyId),
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
    const namespace = toNamespace(args.workspace, args.environment);
    const owned = await keyExistsInNamespace(ctx, namespace, args.keyId);
    if (!owned) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const result = await apiKeys.update(ctx, {
      keyId: args.keyId,
      name: args.name,
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true as const };
  },
});

export const cleanupExpiredKeys = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx) => {
    return await apiKeys.cleanupExpired(ctx, {
      retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  },
});

export const recordTrackedEvent = internalMutation({
  args: {
    userId: v.string(),
    namespace: namespaceValidator,
    keyId: v.string(),
    keyName: v.string(),
    event: v.string(),
    props: trackedEventPropsValidator,
  },
  returns: v.object({
    eventId: v.id("trackedEvents"),
    receivedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("trackedEvents", {
      userId: args.userId,
      namespace: args.namespace,
      keyId: args.keyId,
      keyName: args.keyName,
      event: args.event,
      props: args.props,
    });
    const row = await ctx.db.get(eventId);
    return {
      eventId,
      receivedAt: row?._creationTime ?? Date.now(),
    };
  },
});

export const listTrackedEvents = internalQuery({
  args: {
    namespace: namespaceValidator,
    limit: v.optional(v.number()),
  },
  returns: v.object({
    events: v.array(
      v.object({
        id: v.id("trackedEvents"),
        event: v.string(),
        userId: v.string(),
        keyId: v.string(),
        keyName: v.string(),
        props: trackedEventPropsValidator,
        receivedAt: v.number(),
      }),
    ),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const totalRows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", args.namespace),
      )
      .collect();

    const cap = Math.max(1, Math.min(args.limit ?? 25, 100));
    const rows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", args.namespace),
      )
      .order("desc")
      .take(cap);

    return {
      events: rows.map((row) => ({
        id: row._id,
        event: row.event,
        userId: row.userId,
        keyId: row.keyId,
        keyName: row.keyName,
        props: row.props,
        receivedAt: row._creationTime,
      })),
      total: totalRows.length,
    };
  },
});

export const trackedEventStats = internalQuery({
  args: {
    namespace: namespaceValidator,
  },
  returns: v.object({
    total: v.number(),
    today: v.number(),
    uniqueEventTypes: v.number(),
    byType: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", args.namespace),
      )
      .collect();

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const byType: Record<string, number> = {};
    let today = 0;
    for (const row of rows) {
      byType[row.event] = (byType[row.event] ?? 0) + 1;
      if (row._creationTime >= since) {
        today += 1;
      }
    }

    return {
      total: rows.length,
      today,
      uniqueEventTypes: Object.keys(byType).length,
      byType,
    };
  },
});

async function countActiveKeys(ctx: QueryCtx, namespace: Namespace) {
  const stats = await listNamespaceKeyStats(ctx, namespace);
  return stats.active;
}

async function listNamespaceKeyStats(
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
          numItems: 100,
          cursor,
        },
      });

    total += result.page.length;
    active += result.page.filter(
      (row: (typeof result.page)[number]) => row.effectiveStatus === "active",
    ).length;
    for (const row of result.page) {
      if (row.name) {
        namesById[String(row.keyId)] = row.name;
      }
    }
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  return {
    total,
    active,
    namesById,
  };
}

function toNamespace(workspace: string, environment: "production" | "testing") {
  return `${workspace}:${environment}` as Namespace;
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
          numItems: 100,
          cursor,
        },
      });

    if (result.page.some((row) => String(row.keyId) === keyId)) {
      return true;
    }
    if (result.isDone) {
      return false;
    }
    cursor = result.continueCursor;
  }
}
