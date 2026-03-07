import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";

const KEY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export const cleanupKeys = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx) => {
    return await apiKeys.cleanupKeys(ctx, {
      retentionMs: KEY_RETENTION_MS,
    });
  },
});

export const cleanupEvents = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx) => {
    return await apiKeys.cleanupEvents(ctx, {
      retentionMs: EVENT_RETENTION_MS,
    });
  },
});
