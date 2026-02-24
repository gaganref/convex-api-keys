import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  apiKeyStatusValidator,
  metadataValidator,
  permissionsValidator,
} from "../shared.js";

export const apiKeysFields = {
  tokenHash: v.string(),
  tokenPrefix: v.string(),
  tokenLast4: v.string(),
  namespace: v.optional(v.string()),
  name: v.optional(v.string()),
  permissions: v.optional(permissionsValidator),
  metadata: v.optional(metadataValidator),
  status: apiKeyStatusValidator,
  expiresAt: v.optional(v.number()),
  maxIdleMs: v.optional(v.number()),
  idleExpiresAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  revocationReason: v.optional(v.string()),
  replaces: v.optional(v.id("apiKeys")),
  updatedAt: v.number(),
};

export const apiKeyEventsFields = {
  keyId: v.id("apiKeys"),
  namespace: v.optional(v.string()),
  type: v.union(
    v.literal("created"),
    v.literal("revoked"),
    v.literal("rotated"),
  ),
  reason: v.optional(v.string()),
  metadata: v.optional(metadataValidator),
};

export default defineSchema({
  apiKeys: defineTable(apiKeysFields)
    .index("by_token_hash", ["tokenHash"])
    .index("by_namespace_and_creation_time", ["namespace"])
    .index("by_namespace_and_status", ["namespace", "status"])
    .index("by_status_and_creation_time", ["status"])
    .index("by_status_and_expires_at", ["status", "expiresAt"])
    .index("by_status_and_idle_expires_at", ["status", "idleExpiresAt"])
    .index("by_revoked_at", ["revokedAt"]),

  apiKeyEvents: defineTable(apiKeyEventsFields)
    .index("by_key_id_and_creation_time", ["keyId"])
    .index("by_namespace_and_creation_time", ["namespace"])
    .index("by_type_and_creation_time", ["type"]),
});
