import { ApiKeys } from "@gaganref/convex-api-keys";
import { components, internal } from "./_generated/api.js";

export const apiKeys = new ApiKeys<{
  namespace: `${string}:${"production" | "testing"}`;
  requireName: true;
  metadata: { source: string };
  permissions: { beacon: Array<"events:write" | "reports:read" | "admin"> };
}>(components.apiKeys, {
  permissionDefaults: {
    beacon: ["reports:read"],
  },
  keyDefaults: {
    prefix: "sk_", // fallback; createKey/rotateKey override per environment
    ttlMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    idleTimeoutMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  logLevel: "debug",
}).withHooks({
  onInvalidate: internal.hooks.onInvalidate,
});
