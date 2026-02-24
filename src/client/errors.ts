export type ApiKeysClientErrorCode =
  // Init-time — bad config passed to createApiKeys()
  | "INVALID_OPTIONS"
  // Call-time — programmer mistakes at call site
  | "TOKEN_REQUIRED"
  // Infrastructure
  | "RUNTIME_UNAVAILABLE"
  | "OPERATION_FAILED";

/**
 * Structured runtime error thrown by client-side helpers.
 *
 * Chains the underlying error via `cause`, making it visible in
 * stack traces and debuggers.
 *
 * ```ts
 * try {
 *   await apiKeys.create(ctx, args);
 * } catch (error) {
 *   if (isApiKeysClientError(error)) {
 *     console.error(error.code, error.message);
 *     if (error.cause) console.error("Caused by:", error.cause);
 *   }
 * }
 * ```
 */
export class ApiKeysClientError extends Error {
  readonly name = "ApiKeysClientError";
  readonly code: ApiKeysClientErrorCode;
  readonly cause?: unknown;

  constructor(
    code: ApiKeysClientErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Type guard for structured API keys client errors.
 */
export function isApiKeysClientError(
  error: unknown,
): error is ApiKeysClientError {
  return error instanceof ApiKeysClientError;
}

export function optionsError(message: string) {
  return new ApiKeysClientError(
    "INVALID_OPTIONS",
    `api-keys options: ${message}`,
  );
}

export function tokenRequiredError() {
  return new ApiKeysClientError(
    "TOKEN_REQUIRED",
    "api-keys: token must not be empty",
  );
}

export function runtimeUnavailableError(message: string) {
  return new ApiKeysClientError(
    "RUNTIME_UNAVAILABLE",
    `api-keys runtime: ${message}`,
  );
}
