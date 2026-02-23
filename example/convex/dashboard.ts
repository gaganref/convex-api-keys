import { query } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";
import { toNamespace, listNamespaceKeyStats } from "./keys.js";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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
      recentAudit: scopedAuditEvents.map((event) => ({
        eventId: String(event.eventId),
        keyId: String(event.keyId),
        keyName: keyNames[String(event.keyId)] ?? "Unknown key",
        type: event.type,
        createdAt: event.createdAt,
      })),
    };
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
