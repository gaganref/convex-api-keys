import { mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { api } from "./_generated/api.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

const BATCH_SIZE = 100;

/**
 * Hard-deletes revoked keys (and their audit events) older than
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
 *   handler: (ctx) => apiKeys.cleanupExpired(ctx, { retentionMs: 30 * 24 * 60 * 60 * 1000 }),
 * });
 * ```
 */
export const cleanupExpired = mutation({
  args: { retentionMs: v.number() },
  returns: v.object({
    deleted: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { retentionMs }) => {
    if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
      throw new Error(
        `retentionMs must be a positive finite number, got ${retentionMs}`,
      );
    }

    const cutoff = Date.now() - retentionMs;

    // Lower-bound with gte(0) to exclude keys where revokedAt is undefined,
    // since undefined sorts before all numbers in Convex indexes.
    const revokedKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_revoked_at", (q) =>
        q.gte("revokedAt", 0).lt("revokedAt", cutoff),
      )
      .take(BATCH_SIZE);

    for (const key of revokedKeys) {
      await deleteKeyAndEvents(ctx, key._id);
    }

    const deleted = revokedKeys.length;
    const isDone = revokedKeys.length < BATCH_SIZE;

    if (!isDone) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
    }

    return { deleted, isDone };
  },
});

async function deleteKeyAndEvents(
  ctx: MutationCtx,
  keyId: Id<"apiKeys">,
): Promise<void> {
  const events = await ctx.db
    .query("apiKeyEvents")
    .withIndex("by_key_id_and_creation_time", (q) => q.eq("keyId", keyId))
    .collect();
  for (const event of events) {
    await ctx.db.delete(event._id);
  }
  await ctx.db.delete(keyId);
}
