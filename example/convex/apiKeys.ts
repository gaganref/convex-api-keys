import { ApiKeys } from "@gaganref/convex-api-keys";
import { components, internal } from "./_generated/api.js";

export const apiKeys = new ApiKeys<{
  namespace: `${string}:${"production" | "testing"}`;
  requireName: true;
  metadata: { source: string };
  permissions: { beacon: Array<"events:write" | "reports:read" | "admin"> };
}>(components.apiKeys, {
  permissionDefaults: {
    beacon: ["events:write", "reports:read", "admin"],
  },
}).withHooks({
  onInvalidate: internal.hooks.onInvalidate,
});
