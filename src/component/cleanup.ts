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
/** Minimum allowed retention period: 1 hour. */
const MIN_RETENTION_MS = 3_600_000;

export const cleanupExpired = mutation({
  args: { retentionMs: v.number() },
  returns: v.object({
    deleted: v.number(),
    expired: v.number(),
    idle: v.number(),
    revoked: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { retentionMs }) => {
    if (!Number.isFinite(retentionMs) || retentionMs < MIN_RETENTION_MS) {
      throw new Error(
        `retentionMs must be a finite number >= ${MIN_RETENTION_MS} (1 hour), got ${retentionMs}`,
      );
    }

    const cutoff = Date.now() - retentionMs;
    const counts = { expired: 0, idle: 0, revoked: 0 };

    // 1. Time-expired keys
    const expiredKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of expiredKeys) {
      await deleteKeyAndEvents(ctx, key._id);
      counts.expired++;
    }
    if (expiredKeys.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      return { deleted: counts.expired, ...counts, isDone: false };
    }

    // 2. Idle-expired keys
    const idleExpired = await ctx.db
      .query("apiKeys")
      .withIndex("by_idle_expires_at", (q) => q.lt("idleExpiresAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of idleExpired) {
      await deleteKeyAndEvents(ctx, key._id);
      counts.idle++;
    }
    if (idleExpired.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      const deleted = counts.expired + counts.idle;
      return { deleted, ...counts, isDone: false };
    }

    // 3. Revoked keys past retention
    const revokedKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_revoked_at", (q) => q.lt("revokedAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const key of revokedKeys) {
      await deleteKeyAndEvents(ctx, key._id);
      counts.revoked++;
    }
    if (revokedKeys.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.cleanup.cleanupExpired, {
        retentionMs,
      });
      const deleted = counts.expired + counts.idle + counts.revoked;
      return { deleted, ...counts, isDone: false };
    }

    const deleted = counts.expired + counts.idle + counts.revoked;
    return { deleted, ...counts, isDone: true };
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
