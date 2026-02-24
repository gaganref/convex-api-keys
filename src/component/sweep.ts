import { internalMutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

const BATCH_SIZE = 100;

function isIdleExpired(
  key: { maxIdleMs?: number; lastUsedAt: number },
  now: number,
): boolean {
  return key.maxIdleMs !== undefined && key.lastUsedAt + key.maxIdleMs < now;
}

/**
 * Marks active keys past their absolute TTL as revoked.
 *
 * Uses cursor-based pagination to scan all active keys across multiple
 * runs. Automatically reschedules itself until all pages are processed.
 * Runs via the component's internal cron.
 */
export const sweepExpired = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    swept: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const result = await ctx.db
      .query("apiKeys")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let swept = 0;
    for (const key of result.page) {
      if (key.expiresAt !== undefined && key.expiresAt < now) {
        await markAsRevoked(ctx, key._id, key.namespace, now, "expired");
        swept++;
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepExpired, {
        cursor: result.continueCursor,
      });
    }

    return { swept, isDone: result.isDone };
  },
});

/**
 * Marks active keys past their idle timeout as revoked.
 *
 * Uses cursor-based pagination to scan all active keys across multiple
 * runs. Automatically reschedules itself until all pages are processed.
 * Runs via the component's internal cron.
 */
export const sweepIdleExpired = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    swept: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const result = await ctx.db
      .query("apiKeys")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let swept = 0;
    for (const key of result.page) {
      if (isIdleExpired(key, now)) {
        await markAsRevoked(ctx, key._id, key.namespace, now, "idle_timeout");
        swept++;
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.sweep.sweepIdleExpired, {
        cursor: result.continueCursor,
      });
    }

    return { swept, isDone: result.isDone };
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
