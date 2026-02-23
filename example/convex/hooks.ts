import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";

const onInvalidateEventValidator = v.union(
  v.object({
    trigger: v.literal("invalidate"),
    at: v.number(),
    keyId: v.string(),
    reason: v.optional(v.string()),
    requestInfo: v.optional(v.record(v.string(), v.any())),
  }),
  v.object({
    trigger: v.literal("refresh"),
    at: v.number(),
    keyId: v.string(),
    replacementKeyId: v.string(),
    reason: v.optional(v.string()),
    requestInfo: v.optional(v.record(v.string(), v.any())),
  }),
  v.object({
    trigger: v.literal("invalidateAll"),
    at: v.number(),
    namespace: v.optional(v.string()),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    reason: v.optional(v.string()),
    processed: v.number(),
    revoked: v.number(),
    pages: v.number(),
    requestInfo: v.optional(v.record(v.string(), v.any())),
  }),
);

export const onInvalidate = internalMutation({
  args: {
    event: onInvalidateEventValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = args;

    switch (event.trigger) {
      case "invalidate":
        await ctx.db.insert("invalidationHookEvents", {
          trigger: event.trigger,
          at: event.at,
          keyId: event.keyId,
          reason: event.reason,
          requestInfo: event.requestInfo,
        });
        break;

      case "refresh":
        await ctx.db.insert("invalidationHookEvents", {
          trigger: event.trigger,
          at: event.at,
          keyId: event.keyId,
          replacementKeyId: event.replacementKeyId,
          reason: event.reason,
          requestInfo: event.requestInfo,
        });
        break;

      case "invalidateAll":
        await ctx.db.insert("invalidationHookEvents", {
          trigger: event.trigger,
          at: event.at,
          namespace: event.namespace,
          reason: event.reason,
          before: event.before,
          after: event.after,
          processed: event.processed,
          revoked: event.revoked,
          pages: event.pages,
          requestInfo: event.requestInfo,
        });
        break;
    }

    return null;
  },
});
