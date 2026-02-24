import { internalMutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

const BATCH_SIZE = 100;

function isIdleExpired(
  key: { maxIdleMs?: number; lastUsedAt?: number },
  now: number,
): boolean {
  return (
    key.maxIdleMs !== undefined &&
    key.lastUsedAt !== undefined &&
    key.lastUsedAt + key.maxIdleMs < now
  );
}

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

    const activeKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(BATCH_SIZE);

    let swept = 0;
    for (const key of activeKeys) {
      if (key.expiresAt !== undefined && key.expiresAt < now) {
        await markAsRevoked(ctx, key._id, key.namespace, now, "expired");
        swept++;
      }
    }

    const isDone = activeKeys.length < BATCH_SIZE;
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepExpired, {});
    }

    return { swept, isDone };
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

    const activeKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(BATCH_SIZE);

    let swept = 0;
    for (const key of activeKeys) {
      if (isIdleExpired(key, now)) {
        await markAsRevoked(ctx, key._id, key.namespace, now, "idle_timeout");
        swept++;
      }
    }

    const isDone = activeKeys.length < BATCH_SIZE;
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepIdleExpired, {});
    }

    return { swept, isDone };
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
