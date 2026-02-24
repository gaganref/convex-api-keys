import { internalMutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

const BATCH_SIZE = 100;

/**
 * Marks active keys past their absolute TTL as revoked.
 *
 * Processes up to 100 keys per run and automatically reschedules itself
 * when a full batch is found. Runs via the component's internal cron.
 */
export const sweepExpired = internalMutation({
  args: {},
  returns: v.object({
    swept: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    const expiredKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_status_and_expires_at", (q) =>
        q.eq("status", "active").gte("expiresAt", 0).lt("expiresAt", now),
      )
      .take(BATCH_SIZE);

    for (const key of expiredKeys) {
      await markAsRevoked(ctx, key._id, key.namespace, now, "expired");
    }

    const isDone = expiredKeys.length < BATCH_SIZE;
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepExpired, {});
    }

    return { swept: expiredKeys.length, isDone };
  },
});

/**
 * Marks active keys past their idle timeout as revoked.
 *
 * Processes up to 100 keys per run and automatically reschedules itself
 * when a full batch is found. Runs via the component's internal cron.
 */
export const sweepIdleExpired = internalMutation({
  args: {},
  returns: v.object({
    swept: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    const idleExpiredKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_status_and_idle_expires_at", (q) =>
        q
          .eq("status", "active")
          .gte("idleExpiresAt", 0)
          .lt("idleExpiresAt", now),
      )
      .take(BATCH_SIZE);

    for (const key of idleExpiredKeys) {
      await markAsRevoked(ctx, key._id, key.namespace, now, "idle_timeout");
    }

    const isDone = idleExpiredKeys.length < BATCH_SIZE;
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepIdleExpired, {});
    }

    return { swept: idleExpiredKeys.length, isDone };
  },
});

async function markAsRevoked(
  ctx: MutationCtx,
  keyId: Id<"apiKeys">,
  namespace: string | undefined,
  now: number,
  reason: string,
): Promise<void> {
  await ctx.db.patch(keyId, {
    status: "revoked" as const,
    revokedAt: now,
    revocationReason: reason,
    updatedAt: now,
  });
  await ctx.db.insert("apiKeyEvents", {
    keyId,
    namespace,
    type: "revoked",
    reason,
  });
}
