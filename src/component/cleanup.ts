import { mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { api } from "./_generated/api.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

const CLEANUP_BATCH_SIZE = 100;

/**
 * Deletes expired and revoked keys (and their audit events) older than
 * `retentionMs`. Processes up to 100 keys per category per run and
 * automatically reschedules itself when a full batch is found, so large
 * backlogs drain across multiple runs without hitting timeouts.
 *
 * Call this from the host app's own cron job to control the schedule and
 * retention period:
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
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { retentionMs }) => {
    const cutoff = Date.now() - retentionMs;
    let deleted = 0;

    // 1. Time-expired keys
    const expired = await ctx.db
      .query("apiKeys")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of expired) {
      await deleteKeyAndEvents(ctx, key._id);
      deleted++;
    }
    if (expired.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      return { deleted, isDone: false };
    }

    // 2. Idle-expired keys
    const idleExpired = await ctx.db
      .query("apiKeys")
      .withIndex("by_idle_expires_at", (q) => q.lt("idleExpiresAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of idleExpired) {
      await deleteKeyAndEvents(ctx, key._id);
      deleted++;
    }
    if (idleExpired.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      return { deleted, isDone: false };
    }

    // 3. Revoked keys past retention
    const revoked = await ctx.db
      .query("apiKeys")
      .withIndex("by_revoked_at", (q) => q.lt("revokedAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of revoked) {
      await deleteKeyAndEvents(ctx, key._id);
      deleted++;
    }
    if (revoked.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      return { deleted, isDone: false };
    }

    return { deleted, isDone: true };
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
