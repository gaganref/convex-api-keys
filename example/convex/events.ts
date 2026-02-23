// ---------------------------------------------------------------------------
// Tracked event queries & internal mutations
//
// NOTE: In production, you may want to auth-gate the public query
// (trackedEventsByNamespace). See the note in keys.ts for details.
// ---------------------------------------------------------------------------

import { internalMutation, internalQuery, query } from "./_generated/server.js";
import { v } from "convex/values";
import { environmentValidator, toNamespace } from "./keys.js";

const MAX_QUERY_ROWS = 100;
const MAX_COUNT_ROWS = 10_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const namespaceValidator = v.string();

const trackedEventPropsValidator = v.optional(v.record(v.string(), v.any()));

const trackedEventForUiValidator = v.object({
  id: v.string(),
  event: v.string(),
  userId: v.string(),
  keyId: v.string(),
  keyName: v.string(),
  props: trackedEventPropsValidator,
  receivedAt: v.number(),
});

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export const trackedEventsByNamespace = query({
  args: {
    workspace: v.string(),
    environment: environmentValidator,
    limit: v.optional(v.number()),
  },
  returns: v.array(trackedEventForUiValidator),
  handler: async (ctx, args) => {
    const namespace = toNamespace(args.workspace, args.environment);
    const cap = Math.max(1, Math.min(args.limit ?? MAX_QUERY_ROWS, 250));
    const rows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", namespace),
      )
      .order("desc")
      .take(cap);

    return rows.map((row) => ({
      id: row._id,
      event: row.event,
      userId: row.userId,
      keyId: row.keyId,
      keyName: row.keyName,
      props: row.props,
      receivedAt: row._creationTime,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal mutations & queries (called by HTTP endpoints)
// ---------------------------------------------------------------------------

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
    const cap = Math.max(1, Math.min(args.limit ?? 25, MAX_QUERY_ROWS));
    const rows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", args.namespace),
      )
      .order("desc")
      .take(cap);

    // Count total with a bounded scan — good enough for an example app.
    const countRows = await ctx.db
      .query("trackedEvents")
      .withIndex("by_namespace_and_creation_time", (q) =>
        q.eq("namespace", args.namespace),
      )
      .take(MAX_COUNT_ROWS);

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
      total: countRows.length,
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
      .take(MAX_COUNT_ROWS);

    const since = Date.now() - ONE_DAY_MS;
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
