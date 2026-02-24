/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    cleanup: {
      cleanupExpired: FunctionReference<
        "mutation",
        "internal",
        { retentionMs: number },
        { deleted: number; isDone: boolean },
        Name
      >;
    };
    lib: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: number;
          logLevel?: "debug" | "warn" | "error" | "none";
          maxIdleMs?: number;
          metadata?: Record<string, any>;
          name?: string;
          namespace?: string;
          permissions?: Record<string, Array<string>>;
          tokenHash: string;
          tokenLast4: string;
          tokenPrefix: string;
        },
        { createdAt: number; keyId: string },
        Name
      >;
      getKey: FunctionReference<
        "query",
        "internal",
        { keyId: string; now: number },
        | {
            createdAt: number;
            effectiveStatus: "active" | "revoked" | "expired" | "idle_timeout";
            expiresAt?: number;
            keyId: string;
            lastUsedAt?: number;
            maxIdleMs?: number;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            ok: true;
            permissions?: Record<string, Array<string>>;
            replaces?: string;
            revocationReason?: string;
            revokedAt?: number;
            status: "active" | "revoked";
            tokenLast4: string;
            tokenPrefix: string;
            updatedAt: number;
          }
        | { ok: false; reason: "not_found" },
        Name
      >;
      invalidate: FunctionReference<
        "mutation",
        "internal",
        {
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          now: number;
          reason?: string;
        },
        | { keyId: string; ok: true; revokedAt: number }
        | { ok: false; reason: "not_found" | "revoked" },
        Name
      >;
      invalidateAll: FunctionReference<
        "mutation",
        "internal",
        {
          after?: number;
          before?: number;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          namespace?: string;
          now: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          reason?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          processed: number;
          revoked: number;
        },
        Name
      >;
      listEvents: FunctionReference<
        "query",
        "internal",
        {
          namespace?: string;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            eventId: string;
            keyId: string;
            metadata?: Record<string, any>;
            namespace?: string;
            reason?: string;
            type: "created" | "revoked" | "rotated";
          }>;
        },
        Name
      >;
      listKeyEvents: FunctionReference<
        "query",
        "internal",
        {
          keyId: string;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            eventId: string;
            keyId: string;
            metadata?: Record<string, any>;
            namespace?: string;
            reason?: string;
            type: "created" | "revoked" | "rotated";
          }>;
        },
        Name
      >;
      listKeys: FunctionReference<
        "query",
        "internal",
        {
          namespace?: string;
          now: number;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          status?: "active" | "revoked";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            effectiveStatus: "active" | "revoked" | "expired" | "idle_timeout";
            expiresAt?: number;
            keyId: string;
            lastUsedAt?: number;
            maxIdleMs?: number;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            permissions?: Record<string, Array<string>>;
            replaces?: string;
            revocationReason?: string;
            revokedAt?: number;
            status: "active" | "revoked";
            tokenLast4: string;
            tokenPrefix: string;
            updatedAt: number;
          }>;
        },
        Name
      >;
      refresh: FunctionReference<
        "mutation",
        "internal",
        {
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          now: number;
          reason?: string;
          tokenHash: string;
          tokenLast4: string;
          tokenPrefix: string;
        },
        | {
            createdAt: number;
            expiresAt?: number;
            keyId: string;
            ok: true;
            replacedKeyId: string;
          }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          },
        Name
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; now: number },
        | { keyId: string; ok: true; touchedAt: number }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          },
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: number | null;
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          maxIdleMs?: number | null;
          metadata?: Record<string, any>;
          name?: string;
        },
        { keyId: string; ok: true } | { ok: false; reason: "not_found" },
        Name
      >;
      validate: FunctionReference<
        "query",
        "internal",
        {
          logLevel?: "debug" | "warn" | "error" | "none";
          now: number;
          tokenHash: string;
        },
        | {
            keyId: string;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            ok: true;
            permissions?: Record<string, Array<string>>;
          }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          },
        Name
      >;
    };
  };
