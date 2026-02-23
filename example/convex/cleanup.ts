import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const cleanupExpiredKeys = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx) => {
    return await apiKeys.cleanupExpired(ctx, {
      retentionMs: RETENTION_MS,
    });
  },
});
