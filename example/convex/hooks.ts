import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";
import { onInvalidateHookPayloadValidator } from "@gaganref/convex-api-keys";

export const onInvalidate = internalMutation({
  args: {
    event: onInvalidateHookPayloadValidator,
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
        });
        break;

      case "refresh":
        await ctx.db.insert("invalidationHookEvents", {
          trigger: event.trigger,
          at: event.at,
          keyId: event.keyId,
          replacementKeyId: event.replacementKeyId,
          reason: event.reason,
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
        });
        break;
    }

    return null;
  },
});
