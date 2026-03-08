import type { ComponentApi } from "../component/_generated/component.js";
import { generateToken, sha256Base64Url, tokenLast4 } from "./crypto.js";
import {
  type ApiKeysOptions,
  assertNullableNonNegativeInteger,
  normalizeApiKeysOptions,
  type NormalizedApiKeysOptions,
} from "./options.js";
import {
  ApiKeysClientError,
  optionsError,
  tokenRequiredError,
} from "./errors.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type {
  ApiKeysTypeOptions,
  CleanupEventsArgs,
  CleanupEventsResult,
  CleanupKeysArgs,
  CleanupKeysResult,
  CreateArgs,
  CreateResult,
  GetKeyArgs,
  GetKeyResult,
  InvalidateArgs,
  InvalidateAllArgs,
  InvalidateAllPageResult,
  InvalidateAllResult,
  InvalidateResult,
  ListKeysArgs,
  ListEventsArgs,
  ListEventsResult,
  ListKeyEventsArgs,
  ListKeyEventsResult,
  ListKeysResult,
  OnInvalidateHookPayload,
  RefreshArgs,
  RefreshResult,
  RunMutationCtx,
  RunQueryCtx,
  TouchArgs,
  TouchResult,
  UpdateArgs,
  UpdateResult,
  ValidateArgs,
  ValidateResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Inlined helpers (validate, create config, logging)
// ---------------------------------------------------------------------------

function normalizeValidateToken(token: string) {
  const normalized = token.trim();
  if (normalized.length === 0) {
    throw tokenRequiredError();
  }
  return normalized;
}

function validatePrefix(prefix: string) {
  if (prefix.length === 0) {
    throw optionsError("prefix must not be empty");
  }
  if (prefix.length > 32) {
    throw optionsError("prefix exceeds max allowed length (32)");
  }
}

function resolveCreateConfig(
  args: {
    prefix?: string;
    ttlMs?: number | null;
    idleTimeoutMs?: number | null;
  },
  options: NormalizedApiKeysOptions,
) {
  const prefix = args.prefix ?? options.keyDefaults.prefix;
  const ttlMs = args.ttlMs ?? options.keyDefaults.ttlMs;
  const idleTimeoutMs = args.idleTimeoutMs ?? options.keyDefaults.idleTimeoutMs;

  if (args.prefix !== undefined) validatePrefix(prefix);
  if (args.ttlMs !== undefined)
    assertNullableNonNegativeInteger(ttlMs, "ttlMs");
  if (args.idleTimeoutMs !== undefined)
    assertNullableNonNegativeInteger(idleTimeoutMs, "idleTimeoutMs");

  return { prefix, ttlMs, idleTimeoutMs };
}

function buildCreateLifecycle(
  now: number,
  ttlMs: number | null,
  idleTimeoutMs: number | null,
) {
  return {
    expiresAt: ttlMs === null ? undefined : now + ttlMs,
    maxIdleMs: idleTimeoutMs === null ? undefined : idleTimeoutMs,
  };
}

function resolveCreatePermissions(
  inputPermissions: Record<string, readonly string[]> | undefined,
  defaultPermissions: Record<string, string[]> | undefined,
): Record<string, Array<string>> | undefined {
  if (inputPermissions) {
    return canonicalizePermissions(inputPermissions);
  }
  if (defaultPermissions) {
    return canonicalizePermissions(defaultPermissions);
  }
  return undefined;
}

function canonicalizePermissions(
  permissions: Record<string, readonly string[] | undefined>,
): Record<string, Array<string>> {
  const canonical: Record<string, Array<string>> = {};
  for (const [scope, values] of Object.entries(permissions)) {
    if (values === undefined) {
      continue;
    }
    canonical[scope] = Array.from(new Set(values)).sort();
  }
  return canonical;
}

function readNamespace(args: object): string | undefined {
  if (!("namespace" in args)) {
    return undefined;
  }
  return typeof (args as { namespace?: unknown }).namespace === "string"
    ? (args as { namespace: string }).namespace
    : undefined;
}

function assertExclusiveListKeyFilters(args: {
  status?: "active" | "revoked";
  effectiveStatus?: "active" | "revoked" | "expired" | "idle_timeout";
}) {
  if (args.status !== undefined && args.effectiveStatus !== undefined) {
    throw new ApiKeysClientError(
      "INVALID_OPTIONS",
      "api-keys listKeys: status and effectiveStatus are mutually exclusive",
    );
  }
}

function shouldLog(
  configured: "debug" | "warn" | "error" | "none",
  level: "debug" | "warn" | "error",
): boolean {
  if (configured === "none") return false;
  if (configured === "debug") return true;
  if (configured === "warn") return level === "warn" || level === "error";
  return level === "error"; // configured === "error"
}

function logWithLevel(
  configured: "debug" | "warn" | "error" | "none",
  level: "debug" | "warn" | "error",
  tag: string,
  data: Record<string, unknown>,
): void {
  if (!shouldLog(configured, level)) return;
  const method =
    level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[method](`[api-keys:${tag}]`, data);
}

// ---------------------------------------------------------------------------
// ApiKeys class
// ---------------------------------------------------------------------------

/**
 * Client for managing API keys in a Convex application.
 *
 * Handles the full API key lifecycle: creation, validation, rotation,
 * revocation, and cleanup. Tokens are hashed with SHA-256 before storage —
 * plaintext tokens are only returned at creation and rotation time.
 *
 * Type-level configuration is passed via the generic parameter to narrow
 * namespace literals, permission shapes, metadata types, and whether `name`
 * is required on creation.
 *
 * ```ts
 * import { ApiKeys } from "convex-api-keys";
 * import { components } from "./_generated/api.js";
 *
 * export const apiKeys = new ApiKeys(components.apiKeys, {
 *   keyDefaults: { prefix: "myapp_", ttlMs: 90 * 24 * 60 * 60 * 1000 },
 *   logLevel: "debug",
 * });
 * ```
 *
 * @param component The API keys component. Like `components.apiKeys` from
 *   `./_generated/api.js`.
 * @param options Configuration for key defaults, permissions, and logging.
 *   See {@link ApiKeysOptions} for details.
 */
export class ApiKeys<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> {
  public readonly component: ComponentApi;
  public readonly options: NormalizedApiKeysOptions;
  private _onInvalidate:
    | FunctionReference<
        "mutation",
        FunctionVisibility,
        { event: OnInvalidateHookPayload },
        null
      >
    | undefined;

  constructor(component: ComponentApi, options?: ApiKeysOptions<TOptions>) {
    this.component = component;
    this.options = normalizeApiKeysOptions(options ?? {});
  }

  /**
   * Attach lifecycle hooks.
   *
   * Call this after construction to avoid circular module type inference
   * that occurs when `internal.*` references appear in the constructor call.
   *
   * @example
   * export const apiKeys = new ApiKeys<TOptions>(components.apiKeys, { ... })
   *   .withHooks({ onInvalidate: internal.hooks.onInvalidate });
   */
  withHooks(hooks: {
    onInvalidate?: FunctionReference<
      "mutation",
      FunctionVisibility,
      { event: OnInvalidateHookPayload },
      null
    >;
  }): this {
    this._onInvalidate = hooks.onInvalidate;
    return this;
  }

  /**
   * Create a new API key.
   *
   * Generates a cryptographically random token, hashes it with SHA-256, and
   * stores only the hash. The plaintext token is returned exactly once — it
   * cannot be retrieved later.
   *
   * Per-key overrides for `prefix`, `ttlMs`, and `idleTimeoutMs` fall back to
   * the defaults configured in {@link ApiKeysOptions.keyDefaults}. Permissions
   * fall back to {@link ApiKeysOptions.permissionDefaults} when omitted.
   *
   * @param ctx Any context that can run a mutation.
   * @param args Key configuration including namespace, name, permissions,
   *   metadata, and optional lifecycle overrides. See {@link CreateArgs}.
   * @returns The plaintext token, key ID, and computed expiry timestamps.
   *   **Store or display the token immediately** — it will not be available again.
   * @throws {ApiKeysClientError} With code `OPERATION_FAILED` if the mutation fails.
   */
  async create(
    ctx: RunMutationCtx,
    args: CreateArgs<TOptions>,
  ): Promise<CreateResult> {
    const now = Date.now();

    try {
      const config = resolveCreateConfig(args, this.options);

      const token = generateToken(
        config.prefix,
        this.options.keyDefaults.keyLengthBytes,
      );
      const tokenHash = await sha256Base64Url(token);
      const lifecycle = buildCreateLifecycle(
        now,
        config.ttlMs,
        config.idleTimeoutMs,
      );
      const permissions = resolveCreatePermissions(
        (args as { permissions?: Record<string, readonly string[]> })
          .permissions,
        this.options.permissionDefaults as Record<string, string[]> | undefined,
      );
      const last4 = tokenLast4(token);

      const result = await ctx.runMutation(this.component.lib.create, {
        tokenHash,
        tokenPrefix: config.prefix,
        tokenLast4: last4,
        namespace: (args as { namespace?: string }).namespace,
        name: (args as { name?: string }).name,
        permissions,
        metadata: (args as { metadata?: Record<string, unknown> }).metadata,
        expiresAt: lifecycle.expiresAt,
        maxIdleMs: lifecycle.maxIdleMs,
        logLevel: this.options.logLevel,
      });

      logWithLevel(this.options.logLevel, "debug", "create", {
        keyId: String(result.keyId),
        namespace: (args as { namespace?: string }).namespace,
      });

      return {
        keyId: result.keyId,
        token,
        tokenPrefix: config.prefix,
        tokenLast4: last4,
        createdAt: result.createdAt,
        expiresAt: lifecycle.expiresAt,
      };
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "create", {
        code: "OPERATION_FAILED",
        message: "failed to create api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to create api key");
    }
  }

  /**
   * Validate a plaintext API key token.
   *
   * Hashes the token with SHA-256 and looks up the matching key. Returns the
   * key's metadata and permissions on success (`ok: true`), or a failure
   * reason on failure (`ok: false`).
   *
   * This method does **not** update `lastUsedAt` — call {@link touch} separately
   * if you need idle-timeout tracking.
   *
   * @param ctx Any context that can run a query.
   * @param args The plaintext token to validate. See {@link ValidateArgs}.
   * @returns `{ ok: true, keyId, namespace, name, permissions, metadata }` on
   *   success, or `{ ok: false, reason }` with one of `"not_found"`,
   *   `"revoked"`, `"expired"`, or `"idle_timeout"`.
   * @throws {ApiKeysClientError} With code `TOKEN_REQUIRED` if the token is empty.
   * @throws {ApiKeysClientError} With code `OPERATION_FAILED` if the query fails.
   */
  async validate(
    ctx: RunQueryCtx,
    args: ValidateArgs,
  ): Promise<ValidateResult<TOptions>> {
    const now = Date.now();

    // Input validation outside try-catch — throws TOKEN_REQUIRED
    const token = normalizeValidateToken(args.token);

    try {
      const tokenHash = await sha256Base64Url(token);

      const result = await ctx.runQuery(this.component.lib.validate, {
        tokenHash,
        now,
        logLevel: this.options.logLevel,
      });

      if (!result.ok) {
        logWithLevel(this.options.logLevel, "warn", "validate", {
          reason: result.reason,
          tokenLast4: tokenLast4(token),
        });
        return result as ValidateResult<TOptions>;
      }

      logWithLevel(this.options.logLevel, "debug", "validate", {
        keyId: String(result.keyId),
        namespace: result.namespace,
        tokenLast4: tokenLast4(token),
      });

      return result as ValidateResult<TOptions>;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "validate", {
        code: "OPERATION_FAILED",
        message: "failed to validate api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to validate api key");
    }
  }

  /**
   * Get a single API key by ID.
   *
   * Returns the key's full metadata including its computed
   * `effectiveStatus` (which accounts for expiry and idle timeout).
   *
   * @param ctx Any context that can run a query.
   * @param args The key ID to look up. See {@link GetKeyArgs}.
   * @returns `{ ok: true, ...keyData }` or `{ ok: false, reason: "not_found" }`.
   */
  async getKey(
    ctx: RunQueryCtx,
    args: GetKeyArgs,
  ): Promise<GetKeyResult<TOptions>> {
    const now = Date.now();

    try {
      return (await ctx.runQuery(this.component.lib.getKey, {
        keyId: args.keyId,
        now,
      })) as GetKeyResult<TOptions>;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "getKey", {
        code: "OPERATION_FAILED",
        message: "failed to get api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to get api key");
    }
  }

  /**
   * List API keys with cursor-based pagination.
   *
   * Results include the computed `effectiveStatus` for each key. Supports
   * optional filtering by namespace, stored `status`, or derived
   * `effectiveStatus`, and ordering by creation time. `status` and
   * `effectiveStatus` are mutually exclusive.
   *
   * @param ctx Any context that can run a query.
   * @param args Pagination options and optional filters. See {@link ListKeysArgs}.
   * @returns `{ page, isDone, continueCursor }`.
   */
  async listKeys(
    ctx: RunQueryCtx,
    args: ListKeysArgs<TOptions>,
  ): Promise<ListKeysResult<TOptions>> {
    const now = Date.now();
    const namespace = readNamespace(args);
    assertExclusiveListKeyFilters(args);
    try {
      return (await ctx.runQuery(this.component.lib.listKeys, {
        paginationOpts: args.paginationOpts,
        namespace,
        status: args.status,
        effectiveStatus: args.effectiveStatus,
        now,
        order: args.order,
      })) as ListKeysResult<TOptions>;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "listKeys", {
        code: "OPERATION_FAILED",
        message: "failed to list api keys",
        cause: error,
      });
      throw this.toThrownError(error, "failed to list api keys");
    }
  }

  /**
   * List audit events across all keys with cursor-based pagination.
   *
   * Events are immutable records of key lifecycle changes (`"created"`,
   * `"revoked"`, `"rotated"`). Optionally filter by namespace.
   *
   * @param ctx Any context that can run a query.
   * @param args Pagination options and optional namespace filter.
   *   See {@link ListEventsArgs}.
   * @returns `{ page, isDone, continueCursor }`.
   */
  async listEvents(
    ctx: RunQueryCtx,
    args: ListEventsArgs<TOptions>,
  ): Promise<ListEventsResult> {
    const namespace = readNamespace(args);

    try {
      return await ctx.runQuery(this.component.lib.listEvents, {
        paginationOpts: args.paginationOpts,
        namespace,
        order: args.order,
      });
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "listEvents", {
        code: "OPERATION_FAILED",
        message: "failed to list api key events",
        cause: error,
      });
      throw this.toThrownError(error, "failed to list api key events");
    }
  }

  /**
   * List audit events for a specific key with cursor-based pagination.
   *
   * @param ctx Any context that can run a query.
   * @param args The key ID, pagination options, and optional order.
   *   See {@link ListKeyEventsArgs}.
   * @returns `{ page, isDone, continueCursor }`.
   */
  async listKeyEvents(
    ctx: RunQueryCtx,
    args: ListKeyEventsArgs,
  ): Promise<ListKeyEventsResult> {
    try {
      return await ctx.runQuery(this.component.lib.listKeyEvents, {
        keyId: args.keyId,
        paginationOpts: args.paginationOpts,
        order: args.order,
      });
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "listKeyEvents", {
        code: "OPERATION_FAILED",
        message: "failed to list api key events for key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to list api key events for key");
    }
  }

  /**
   * Touch an API key, updating `lastUsedAt` and resetting the idle timeout.
   *
   * If the key has a `maxIdleMs` configured, the idle expiry is derived from
   * `lastUsedAt + maxIdleMs`. Call this during request handling to keep
   * idle-timeout keys alive.
   *
   * @param ctx Any context that can run a mutation.
   * @param args The key ID to touch. See {@link TouchArgs}.
   * @returns `{ ok: true, keyId, touchedAt }` on success,
   *   or `{ ok: false, reason }` if the key is not found or inactive.
   */
  async touch(ctx: RunMutationCtx, args: TouchArgs): Promise<TouchResult> {
    const now = Date.now();

    try {
      const result = await ctx.runMutation(this.component.lib.touch, {
        keyId: args.keyId,
        now,
      });

      if (!result.ok) {
        logWithLevel(this.options.logLevel, "warn", "touch", {
          reason: result.reason,
        });
        return result;
      }

      logWithLevel(this.options.logLevel, "debug", "touch", {
        keyId: String(result.keyId),
      });

      return result;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "touch", {
        code: "OPERATION_FAILED",
        message: "failed to touch api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to touch api key");
    }
  }

  /**
   * Invalidate (revoke) a single API key.
   *
   * Sets the key's status to `"revoked"` and records a revocation audit event.
   * If an `onInvalidate` hook is configured, it fires after the revocation
   * succeeds (hook failures are swallowed and logged).
   *
   * @param ctx Any context that can run a mutation.
   * @param args The key ID, optional reason, and optional event metadata.
   *   See {@link InvalidateArgs}.
   * @returns `{ ok: true, keyId, revokedAt }` on success,
   *   or `{ ok: false, reason }` if the key is not found or already revoked.
   */
  async invalidate(
    ctx: RunMutationCtx,
    args: InvalidateArgs,
  ): Promise<InvalidateResult> {
    const now = Date.now();

    try {
      const result = await ctx.runMutation(this.component.lib.invalidate, {
        keyId: args.keyId,
        now,
        reason: args.reason,
        metadata: args.metadata,
        logLevel: this.options.logLevel,
      });

      if (!result.ok) {
        logWithLevel(this.options.logLevel, "warn", "invalidate", {
          reason: result.reason,
        });
        return result;
      }

      await this.runOnInvalidateHook(ctx, {
        trigger: "invalidate",
        at: now,
        keyId: String(result.keyId),
        reason: args.reason,
      });

      return result;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "invalidate", {
        code: "OPERATION_FAILED",
        message: "failed to invalidate api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to invalidate api key");
    }
  }

  /**
   * Bulk-invalidate API keys matching the given filters.
   *
   * Iterates through all matching active keys in paginated batches,
   * revoking each one and recording audit events. Supports filtering by
   * namespace and creation-time range (`before` / `after`).
   *
   * The `onInvalidate` hook fires once after all pages are processed with
   * aggregated stats.
   *
   * @param ctx Any context that can run a mutation.
   * @param args Filters, optional reason/metadata, and page size.
   *   See {@link InvalidateAllArgs}.
   * @returns `{ processed, revoked, pages }` — total keys examined,
   *   total keys revoked, and number of pages processed.
   */
  async invalidateAll(
    ctx: RunMutationCtx,
    args: InvalidateAllArgs<TOptions>,
  ): Promise<InvalidateAllResult> {
    const now = Date.now();
    const namespace = readNamespace(args);
    const pageSize = args.pageSize ?? 100;
    let cursor: string | null = null;
    let pages = 0;
    let processed = 0;
    let revoked = 0;

    try {
      while (true) {
        const result: InvalidateAllPageResult = await ctx.runMutation(
          this.component.lib.invalidateAll,
          {
            namespace,
            before: args.before,
            after: args.after,
            paginationOpts: {
              numItems: pageSize,
              cursor,
            },
            now,
            reason: args.reason,
            metadata: args.metadata,
            logLevel: this.options.logLevel,
          },
        );

        pages += 1;
        processed += result.processed;
        revoked += result.revoked;

        if (result.isDone) {
          break;
        }
        cursor = result.continueCursor;
      }

      logWithLevel(this.options.logLevel, "debug", "invalidateAll", {
        processed,
        revoked,
      });

      await this.runOnInvalidateHook(ctx, {
        trigger: "invalidateAll",
        at: now,
        namespace,
        before: args.before,
        after: args.after,
        reason: args.reason,
        processed,
        revoked,
        pages,
      });

      return { processed, revoked, pages };
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "invalidateAll", {
        code: "OPERATION_FAILED",
        message: "failed to invalidate api keys in bulk",
        cause: error,
      });
      throw this.toThrownError(error, "failed to invalidate api keys in bulk");
    }
  }

  /**
   * Rotate an API key: revoke the current key and issue a replacement.
   *
   * The new key inherits the old key's namespace, name, permissions, metadata,
   * current absolute `expiresAt` timestamp (if any), and idle timeout.
   * Refresh does **not** renew the original TTL from "now" — it preserves the
   * remaining lifetime already on the key. A `"rotated"` event is recorded on
   * the old key and a `"created"` event on the new key.
   *
   * The `onInvalidate` hook fires with `trigger: "refresh"` after success.
   *
   * @param ctx Any context that can run a mutation.
   * @param args The key ID to rotate, optional reason, and optional event
   *   metadata. See {@link RefreshArgs}.
   * @returns On success: `{ ok: true, keyId, token, ... }` with the new
   *   plaintext token. On failure: `{ ok: false, reason }` if the key is
   *   not found or inactive.
   */
  async refresh(
    ctx: RunMutationCtx,
    args: RefreshArgs,
  ): Promise<RefreshResult> {
    const now = Date.now();

    try {
      const tokenPrefix = args.prefix ?? this.options.keyDefaults.prefix;
      if (args.prefix !== undefined) validatePrefix(tokenPrefix);
      const token = generateToken(
        tokenPrefix,
        this.options.keyDefaults.keyLengthBytes,
      );
      const tokenHash = await sha256Base64Url(token);
      const tokenLast4Value = tokenLast4(token);

      const result = await ctx.runMutation(this.component.lib.refresh, {
        keyId: args.keyId,
        tokenHash,
        tokenPrefix,
        tokenLast4: tokenLast4Value,
        now,
        reason: args.reason,
        metadata: args.metadata,
        logLevel: this.options.logLevel,
      });

      if (!result.ok) {
        logWithLevel(this.options.logLevel, "warn", "refresh", {
          reason: result.reason,
        });
        return result;
      }

      logWithLevel(this.options.logLevel, "debug", "refresh", {
        keyId: String(result.keyId),
      });

      await this.runOnInvalidateHook(ctx, {
        trigger: "refresh",
        at: now,
        keyId: String(result.replacedKeyId),
        replacementKeyId: String(result.keyId),
        reason: args.reason,
      });

      return {
        ...result,
        token,
        tokenPrefix,
        tokenLast4: tokenLast4Value,
      };
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "refresh", {
        code: "OPERATION_FAILED",
        message: "failed to refresh api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to refresh api key");
    }
  }

  /**
   * Update a key's mutable properties: name, metadata, and/or expiry.
   *
   * Pass `expiresAt: null` to remove the absolute expiry entirely.
   * Omitted fields are left unchanged.
   *
   * @param ctx Any context that can run a mutation.
   * @param args The key ID and fields to update. See {@link UpdateArgs}.
   * @returns `{ ok: true, keyId }` on success,
   *   or `{ ok: false, reason }` where reason is `"not_found"` or `"already_revoked"`.
   */
  async update(
    ctx: RunMutationCtx,
    args: UpdateArgs<TOptions>,
  ): Promise<UpdateResult> {
    if (args.expiresAt !== undefined)
      assertNullableNonNegativeInteger(args.expiresAt, "expiresAt");
    if (args.maxIdleMs !== undefined)
      assertNullableNonNegativeInteger(args.maxIdleMs, "maxIdleMs");

    try {
      const result = await ctx.runMutation(this.component.lib.update, {
        keyId: args.keyId,
        name: args.name,
        metadata: args.metadata,
        expiresAt: args.expiresAt,
        maxIdleMs: args.maxIdleMs,
        logLevel: this.options.logLevel,
      });

      if (!result.ok) {
        logWithLevel(this.options.logLevel, "warn", "update", {
          reason: result.reason,
        });
        return result;
      }

      logWithLevel(this.options.logLevel, "debug", "update", {
        keyId: String(result.keyId),
      });

      return result;
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "update", {
        code: "OPERATION_FAILED",
        message: "failed to update api key",
        cause: error,
      });
      throw this.toThrownError(error, "failed to update api key");
    }
  }

  /**
   * Hard-delete revoked keys older than the retention period.
   *
   * Expired and idle keys are automatically swept to revoked status by the
   * component's internal cron — this method only deletes revoked keys past
   * the retention window. Processes up to 100 keys per run and automatically
   * reschedules itself when a full batch is found.
   *
   * Call this from your app's cron job to control the schedule:
   *
   * ```ts
   * // convex/crons.ts
   * crons.interval("cleanup api keys", { hours: 24 }, internal.tasks.cleanupApiKeys);
   *
   * // convex/tasks.ts
   * export const cleanupApiKeys = internalMutation({
   *   handler: (ctx) => apiKeys.cleanupKeys(ctx),
   * });
   * ```
   *
   * @param ctx Any context that can run a mutation.
   * @param args Optional retention period override. Defaults to 30 days.
   *   See {@link CleanupKeysArgs}.
   * @returns `{ deleted, isDone }` — keys hard-deleted and whether all
   *   work was completed in this run.
   */
  async cleanupKeys(
    ctx: RunMutationCtx,
    args?: CleanupKeysArgs,
  ): Promise<CleanupKeysResult> {
    const retentionMs = args?.retentionMs ?? 30 * 24 * 60 * 60 * 1000;
    try {
      return await ctx.runMutation(this.component.cleanup.cleanupKeys, {
        retentionMs,
      });
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "cleanupKeys", {
        code: "OPERATION_FAILED",
        message: "failed to cleanup revoked api keys",
        cause: error,
      });
      throw this.toThrownError(error, "failed to cleanup revoked api keys");
    }
  }

  /**
   * Hard-delete audit events older than the retention period.
   *
   * This cleanup is independent from key cleanup. Events may outlive their
   * parent keys to preserve audit history.
   *
   * @param ctx Any context that can run a mutation.
   * @param args Optional retention period override. Defaults to 180 days.
   *   See {@link CleanupEventsArgs}.
   * @returns `{ deleted, isDone }` — events hard-deleted and whether all
   *   work was completed in this run.
   */
  async cleanupEvents(
    ctx: RunMutationCtx,
    args?: CleanupEventsArgs,
  ): Promise<CleanupEventsResult> {
    const retentionMs = args?.retentionMs ?? 180 * 24 * 60 * 60 * 1000;
    try {
      return await ctx.runMutation(this.component.cleanup.cleanupEvents, {
        retentionMs,
      });
    } catch (error) {
      logWithLevel(this.options.logLevel, "error", "cleanupEvents", {
        code: "OPERATION_FAILED",
        message: "failed to cleanup api key events",
        cause: error,
      });
      throw this.toThrownError(error, "failed to cleanup api key events");
    }
  }

  /**
   * Executes the optional invalidation hook and reports hook failures without
   * affecting the main API-key operation.
   */
  private async runOnInvalidateHook(
    ctx: RunMutationCtx,
    payload: OnInvalidateHookPayload,
  ): Promise<void> {
    const hook = this._onInvalidate;
    if (hook == null) {
      return;
    }

    try {
      await ctx.runMutation(hook, { event: payload });
    } catch (error) {
      logWithLevel(this.options.logLevel, "warn", "system", {
        message: "onInvalidate hook failed",
        error: error instanceof Error ? error.message : String(error),
      });
      // Swallowed — hook failure must not affect the operation.
    }
  }

  private toThrownError(error: unknown, message: string): ApiKeysClientError {
    if (error instanceof ApiKeysClientError) {
      return error;
    }
    const cause = error instanceof Error ? error : new Error(String(error));
    return new ApiKeysClientError(
      "OPERATION_FAILED",
      `api-keys: ${message}`,
      cause,
    );
  }
}
