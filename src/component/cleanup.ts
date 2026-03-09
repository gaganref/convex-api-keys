import { mutation } from "./_generated/server.js";
import { api } from "./_generated/api.js";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";

const BATCH_SIZE = 100;
const cleanupResultValidator = v.object({
  deleted: v.number(),
  isDone: v.boolean(),
});

function assertRetentionMs(retentionMs: number) {
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    throw new ConvexError({
      code: "invalid_argument",
      message: `retentionMs must be a positive finite number, got ${retentionMs}`,
    });
  }
}

async function cleanupKeysImpl(ctx: MutationCtx, retentionMs: number) {
  assertRetentionMs(retentionMs);
  const cutoff = Date.now() - retentionMs;

  // Lower-bound with gte(0) to exclude keys where revokedAt is undefined,
  // since undefined sorts before all numbers in Convex indexes.
  const revokedKeys = await ctx.db
    .query("apiKeys")
    .withIndex("by_revoked_at", (q) => q.gte("revokedAt", 0).lt("revokedAt", cutoff))
    .take(BATCH_SIZE);

  for (const key of revokedKeys) {
    await ctx.db.delete(key._id);
  }

  const deleted = revokedKeys.length;
  const isDone = revokedKeys.length < BATCH_SIZE;

  if (!isDone) {
    await ctx.scheduler.runAfter(0, api.cleanup.cleanupKeys, {
      retentionMs,
    });
  }

  return { deleted, isDone };
}

async function cleanupEventsImpl(ctx: MutationCtx, retentionMs: number) {
  assertRetentionMs(retentionMs);
  const cutoff = Date.now() - retentionMs;

  const toDelete = await ctx.db
    .query("apiKeyEvents")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .order("asc")
    .take(BATCH_SIZE);

  for (const event of toDelete) {
    await ctx.db.delete(event._id);
  }

  const deleted = toDelete.length;
  const isDone = deleted < BATCH_SIZE;

  if (!isDone) {
    await ctx.scheduler.runAfter(0, api.cleanup.cleanupEvents, {
      retentionMs,
    });
  }

  return { deleted, isDone };
}

/**
 * Hard-deletes revoked keys older than
 * `retentionMs`. Processes up to 100 keys per run and automatically
 * reschedules itself when a full batch is found, so large backlogs
 * drain across multiple runs without hitting timeouts.
 *
 * Expired and idle keys are swept to revoked status automatically by
 * the component's internal cron — this function only needs to delete
 * revoked keys past the retention window.
 *
 * Call this from the host app's own cron job to control the schedule
 * and retention period:
 * ```ts
 * // convex/crons.ts
 * crons.interval("cleanup api keys", { hours: 24 }, internal.myApp.cleanupApiKeys);
 *
 * // convex/myApp.ts
 * export const cleanupApiKeys = internalMutation({
 *   handler: (ctx) => apiKeys.cleanupKeys(ctx, { retentionMs: 30 * 24 * 60 * 60 * 1000 }),
 * });
 * ```
 */
export const cleanupKeys = mutation({
  args: { retentionMs: v.number() },
  returns: cleanupResultValidator,
  handler: async (ctx, { retentionMs }) => {
    return await cleanupKeysImpl(ctx, retentionMs);
  },
});

/**
 * Hard-deletes audit events older than `retentionMs`, independently of whether
 * their parent keys still exist.
 */
export const cleanupEvents = mutation({
  args: { retentionMs: v.number() },
  returns: cleanupResultValidator,
  handler: async (ctx, { retentionMs }) => {
    return await cleanupEventsImpl(ctx, retentionMs);
  },
});
