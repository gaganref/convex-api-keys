import { optionsError } from "./errors.js";
import type { ApiKeysTypeOptions } from "./types.js";

/**
 * Initialization options for the API keys client.
 *
 * Type-level concerns (namespace shape, metadata shape, permissions shape,
 * requireName) are passed via the generic parameter of `ApiKeys<TOptions>`.
 */
export type ApiKeysOptions<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  /**
   * Default permissions applied when create args do not include permissions.
   *
   * Typed against the `permissions` field of `TOptions` when provided.
   * This is a convenience default — not a runtime allowlist validator.
   */
  permissionDefaults?: TOptions extends {
    permissions: infer P extends Record<string, string[]>;
  }
    ? { [K in keyof P]?: P[K] }
    : Record<string, string[]>;
  /**
   * Default key behavior applied when operation-level values are omitted.
   */
  keyDefaults?: {
    /**
     * Token prefix used when creating keys.
     *
     * @default "ak_"
     */
    prefix?: string;
    /**
     * Default absolute expiration in milliseconds.
     *
     * Set `null` for no expiration.
     *
     * @default null
     */
    ttlMs?: number | null;
    /**
     * Default idle timeout in milliseconds.
     *
     * Set `null` to disable idle expiration.
     *
     * @default null
     */
    idleTimeoutMs?: number | null;
  };
  /**
   * Minimum log level for console output.
   *
   * - `"debug"` — logs all operations including successes
   * - `"warn"` — logs warnings and errors only (default)
   * - `"error"` — logs infrastructure failures only
   * - `"none"` — disables all logging
   *
   * @default "warn"
   */
  logLevel?: "debug" | "warn" | "error" | "none";
};

/**
 * Fully validated options shape used by runtime internals.
 */
export type NormalizedApiKeysOptions = {
  permissionDefaults: Record<string, string[]> | undefined;
  keyDefaults: {
    prefix: string;
    keyLengthBytes: number;
    ttlMs: number | null;
    idleTimeoutMs: number | null;
  };
  logLevel: "debug" | "warn" | "error" | "none";
};

const KEY_DEFAULTS = {
  prefix: "ak_",
  keyLengthBytes: 32,
  ttlMs: null as number | null,
  idleTimeoutMs: null as number | null,
};

const LOG_LEVELS = ["debug", "warn", "error", "none"] as const;

/**
 * Normalize and validate API keys options.
 *
 * @throws {ApiKeysClientError} If any option value is invalid.
 */
export function normalizeApiKeysOptions(
  options: ApiKeysOptions<ApiKeysTypeOptions>,
): NormalizedApiKeysOptions {
  const keyDefaults = {
    prefix: options.keyDefaults?.prefix ?? KEY_DEFAULTS.prefix,
    keyLengthBytes: KEY_DEFAULTS.keyLengthBytes,
    ttlMs: options.keyDefaults?.ttlMs ?? KEY_DEFAULTS.ttlMs,
    idleTimeoutMs:
      options.keyDefaults?.idleTimeoutMs ?? KEY_DEFAULTS.idleTimeoutMs,
  };

  if (keyDefaults.prefix.length > 32) {
    throw optionsError(`keyDefaults.prefix exceeds max allowed length (32)`);
  }
  if (keyDefaults.prefix.length === 0) {
    throw optionsError("keyDefaults.prefix must not be empty");
  }
  assertNullableNonNegativeInteger(keyDefaults.ttlMs, "keyDefaults.ttlMs");
  assertNullableNonNegativeInteger(
    keyDefaults.idleTimeoutMs,
    "keyDefaults.idleTimeoutMs",
  );

  const logLevel = normalizeLogLevel(options.logLevel);

  return {
    permissionDefaults: options.permissionDefaults as
      | Record<string, string[]>
      | undefined,
    keyDefaults,
    logLevel,
  };
}

function normalizeLogLevel(
  level: "debug" | "warn" | "error" | "none" | undefined,
): "debug" | "warn" | "error" | "none" {
  const resolved = level ?? "warn";
  if (!LOG_LEVELS.includes(resolved)) {
    throw optionsError(`logLevel must be one of: ${LOG_LEVELS.join(", ")}`);
  }
  return resolved;
}

export function assertNullableNonNegativeInteger(
  value: number | null,
  path: string,
) {
  if (value === null) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw optionsError(`${path} must be null or a non-negative integer`);
  }
}
