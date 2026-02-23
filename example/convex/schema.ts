import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Events tracked via POST /track — populated by the HTTP action once
  // the api-key component's validate() is implemented.
  trackedEvents: defineTable({
    userId: v.string(),
    namespace: v.string(),
    keyId: v.string(),
    keyName: v.string(),
    event: v.string(),
    props: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_user_and_namespace", ["userId", "namespace"])
    .index("by_namespace_and_creation_time", ["namespace"]),

  invalidationHookEvents: defineTable({
    trigger: v.union(
      v.literal("invalidate"),
      v.literal("refresh"),
      v.literal("invalidateAll"),
    ),
    at: v.number(),
    keyId: v.optional(v.string()),
    replacementKeyId: v.optional(v.string()),
    namespace: v.optional(v.string()),
    reason: v.optional(v.string()),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    processed: v.optional(v.number()),
    revoked: v.optional(v.number()),
    pages: v.optional(v.number()),
  }).index("by_namespace_and_creation_time", ["namespace"]),
});
