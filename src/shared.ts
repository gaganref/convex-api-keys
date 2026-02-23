import { v } from "convex/values";

/**
 * Stored status of an API key.
 *
 * Note: "expired" and "idle_timeout" are computed at read time from
 * `expiresAt` / `idleExpiresAt` fields, not stored directly.
 */
export const apiKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
);

export const permissionsValidator = v.record(v.string(), v.array(v.string()));

export const metadataValidator = v.record(v.string(), v.any());

export type ApiKeyStatus = "active" | "revoked";
