/**
 * Custom function builders that authenticate via API key.
 *
 * These wrap `query`, `mutation`, and `action` with middleware that:
 *  1. Reads the `apiKey` arg (consumed — not passed to your handler)
 *  2. Validates it via `apiKeys.validate()`
 *  3. Injects `ctx.key` with the validated key's info
 *
 * Usage:
 * ```ts
 * export const myQuery = queryWithApiKey({
 *   args: { workspace: v.string() },
 *   handler: async (ctx, args) => {
 *     const { key } = ctx;
 *     // key.keyId, key.namespace, key.name, key.permissions, key.metadata
 *   },
 * });
 *
 * // Client call — apiKey is always required:
 * await convex.query(api.withApiKey.myQuery, { apiKey: token, workspace: "acme" });
 * ```
 */

import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server.js";
import { apiKeys } from "./apiKeys.js";

// ─── Shared types ──────────────────────────────────────────────────────────

type ValidatedKey = Extract<
  Awaited<ReturnType<typeof apiKeys.validate>>,
  { ok: true }
>;

// ─── Shared validation helper ──────────────────────────────────────────────

async function validateApiKey(
  ctx: Parameters<typeof apiKeys.validate>[0],
  token: string,
): Promise<ValidatedKey> {
  const validated = await apiKeys.validate(ctx, { token });
  if (!validated.ok) {
    throw new ConvexError({
      code: "API_KEY_REJECTED" as const,
      reason: validated.reason,
    });
  }
  return validated;
}

// ─── Custom builders ───────────────────────────────────────────────────────

/**
 * Drop-in replacement for `query` that requires a valid API key.
 *
 * The `apiKey` argument is consumed by the middleware. Your handler receives
 * `ctx.key` with the validated key info.
 */
export const queryWithApiKey = customQuery(query, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    const key = await validateApiKey(ctx, args.apiKey);
    return { ctx: { key }, args: {} };
  },
});

/**
 * Drop-in replacement for `mutation` that requires a valid API key.
 *
 * The `apiKey` argument is consumed by the middleware. Your handler receives
 * `ctx.key` with the validated key info.
 */
export const mutationWithApiKey = customMutation(mutation, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    const key = await validateApiKey(ctx, args.apiKey);
    return { ctx: { key }, args: {} };
  },
});

/**
 * Drop-in replacement for `action` that requires a valid API key.
 *
 * The `apiKey` argument is consumed by the middleware. Your handler receives
 * `ctx.key` with the validated key info.
 */
export const actionWithApiKey = customAction(action, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    const key = await validateApiKey(ctx, args.apiKey);
    return { ctx: { key }, args: {} };
  },
});

// ─── Example usages ────────────────────────────────────────────────────────

/**
 * Returns metadata about the API key used in the request.
 *
 * Client usage:
 * ```ts
 * const info = await convex.query(api.withApiKey.keyInfo, { apiKey: token });
 * ```
 */
export const keyInfo = queryWithApiKey({
  args: {},
  handler: async (_ctx, _args) => {
    const { key } = _ctx;
    return {
      keyId: String(key.keyId),
      namespace: key.namespace ?? null,
      name: key.name ?? null,
      permissions: key.permissions ?? {},
    };
  },
});

/**
 * Tracks an analytics event authenticated by an API key.
 *
 * Requires the `events:write` permission in the key's `beacon` permissions.
 *
 * Client usage:
 * ```ts
 * await convex.mutation(api.withApiKey.trackEvent, {
 *   apiKey: token,
 *   event: "page_view",
 *   userId: "user_123",
 * });
 * ```
 */
export const trackEvent = mutationWithApiKey({
  args: {
    event: v.string(),
    userId: v.optional(v.string()),
    props: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const { key } = ctx;

    const permissions = key.permissions as
      | { beacon?: readonly string[] }
      | undefined;
    if (!permissions?.beacon?.includes("events:write")) {
      throw new ConvexError({
        code: "INSUFFICIENT_PERMISSIONS" as const,
        required: "events:write",
        granted: [...(permissions?.beacon ?? [])],
      });
    }

    const namespace = key.namespace;
    if (!namespace) {
      throw new ConvexError({
        code: "MISSING_NAMESPACE" as const,
        message: "API key has no namespace",
      });
    }

    const eventId = await ctx.db.insert("trackedEvents", {
      userId: args.userId ?? "anonymous",
      namespace,
      keyId: String(key.keyId),
      keyName: key.name ?? "Unnamed key",
      event: args.event,
      props: args.props,
    });

    return { eventId: String(eventId) };
  },
});

/**
 * Calls an external service authenticated by an API key.
 *
 * Demonstrates `actionWithApiKey` — actions can call third-party APIs,
 * send emails, etc. This example just echoes back the key info + a mock
 * downstream response.
 *
 * Client usage:
 * ```ts
 * const result = await convex.action(api.withApiKey.callDownstreamService, {
 *   apiKey: token,
 *   payload: { message: "hello" },
 * });
 * ```
 */
export const callDownstreamService = actionWithApiKey({
  args: {
    payload: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const { key } = ctx;

    // In a real action you might call fetch() here with the key's namespace
    // or permissions to gate access to the downstream service.
    //
    // Example:
    //   const resp = await fetch("https://api.myservice.com/ingest", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ ...args.payload, namespace: key.namespace }),
    //   });

    return {
      ok: true,
      keyId: String(key.keyId),
      namespace: key.namespace ?? null,
      echoed: args.payload,
    };
  },
});
