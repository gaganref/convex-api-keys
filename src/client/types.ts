import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  FunctionVisibility,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

type CreateMutationResult = FunctionReturnType<ComponentApi["lib"]["create"]>;
type ValidateQueryResult = FunctionReturnType<ComponentApi["lib"]["validate"]>;
type RefreshMutationResult = FunctionReturnType<ComponentApi["lib"]["refresh"]>;
type GetKeyQueryResult = FunctionReturnType<ComponentApi["lib"]["getKey"]>;
type CleanupExpiredMutationResult = FunctionReturnType<
  ComponentApi["cleanup"]["cleanupExpired"]
>;

/**
 * Type-level options passed as the generic parameter to `ApiKeys`.
 *
 * All fields are TypeScript-only — they are phantom types cast over `v.any()`
 * / `v.string()` storage. You are responsible for keeping your type param
 * consistent with the data already stored in the database.
 *
 * - `namespace` — any `string` subtype (literals, template literals).
 *   Presence implies namespace is required in `create` args.
 * - `requireName` — set to `true` to require `name` in `create` args.
 * - `metadata` — shape of the metadata object stored with each key.
 * - `permissions` — shape of the permissions object; values must be `string[]`
 *   subtypes (including literal arrays).
 */
export type ApiKeysTypeOptions = {
  namespace?: string;
  requireName?: true;
  metadata?: Record<string, unknown>;
  permissions?: Record<string, string[]>;
};

/**
 * Freeform metadata stored with an API key.
 */
export type ApiKeyMetadata = Record<string, unknown>;

/**
 * Metadata attached to lifecycle events (invalidate, refresh, bulk invalidate).
 */
export type ApiKeyEventMetadata = Record<string, unknown>;

// --- Internal arg shape helpers ---

type NamespaceArg<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  namespace: infer N extends string;
}
  ? { namespace: N }
  : { namespace?: string };

type NamespaceFilterArg<TOptions extends ApiKeysTypeOptions> =
  TOptions extends { namespace: infer N extends string }
    ? { namespace?: N }
    : object;

type NameArg<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  requireName: true;
}
  ? { name: string }
  : { name?: string };

type PermissionsInputArg<TOptions extends ApiKeysTypeOptions> =
  TOptions extends { permissions: infer P extends Record<string, string[]> }
    ? { permissions?: { [K in keyof P]?: P[K] } }
    : { permissions?: Record<string, string[]> };

// --- Internal result shape helpers ---

type NamespaceOutput<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  namespace: infer N extends string;
}
  ? N | undefined
  : string | undefined;

type MetadataOutput<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  metadata: infer M extends Record<string, unknown>;
}
  ? M | undefined
  : Record<string, unknown> | undefined;

type PermissionsOutput<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  permissions: infer P extends Record<string, string[]>;
}
  ? P | undefined
  : Record<string, string[]> | undefined;

// --- Public types ---

export type ApiKeyId = CreateMutationResult["keyId"];

/**
 * Plaintext API key token.
 *
 * Tokens are only available at creation/refresh time.
 */
export type ApiKeyToken = string;

export type CreateArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = NamespaceArg<TOptions> &
  NameArg<TOptions> &
  PermissionsInputArg<TOptions> & {
    metadata?: TOptions extends {
      metadata: infer M extends Record<string, unknown>;
    }
      ? M
      : ApiKeyMetadata;
    prefix?: string;
    ttlMs?: number | null;
    idleTimeoutMs?: number | null;
  };

export type CreateResult = {
  keyId: ApiKeyId;
  token: ApiKeyToken;
  tokenPrefix: string;
  tokenLast4: string;
  createdAt: CreateMutationResult["createdAt"];
  expiresAt?: number;
  idleExpiresAt?: number;
};

export type ValidateArgs = {
  token: ApiKeyToken;
};

export type TouchArgs = {
  keyId: ApiKeyId;
};

export type TouchResult = FunctionReturnType<ComponentApi["lib"]["touch"]>;

export type PaginationOptions = {
  numItems: number;
  cursor: string | null;
};

export type ListKeysArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  paginationOpts: PaginationOptions;
  status?: "active" | "revoked";
  order?: "asc" | "desc";
} & NamespaceFilterArg<TOptions>;

export type ListKeysResult = FunctionReturnType<
  ComponentApi["lib"]["listKeys"]
>;

export type ListEventsArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  paginationOpts: PaginationOptions;
  order?: "asc" | "desc";
} & NamespaceFilterArg<TOptions>;

export type ListEventsResult = FunctionReturnType<
  ComponentApi["lib"]["listEvents"]
>;

export type ListKeyEventsArgs = {
  keyId: ApiKeyId;
  paginationOpts: PaginationOptions;
  order?: "asc" | "desc";
};

export type ListKeyEventsResult = FunctionReturnType<
  ComponentApi["lib"]["listKeyEvents"]
>;

export type GetKeyArgs = {
  keyId: ApiKeyId;
};

export type GetKeyResult = GetKeyQueryResult;

export type InvalidateArgs = {
  keyId: ApiKeyId;
  reason?: string;
  metadata?: ApiKeyEventMetadata;
};

export type InvalidateResult = FunctionReturnType<
  ComponentApi["lib"]["invalidate"]
>;

export type InvalidateAllArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  before?: number;
  after?: number;
  reason?: string;
  metadata?: ApiKeyEventMetadata;
  pageSize?: number;
} & NamespaceFilterArg<TOptions>;

export type InvalidateAllResult = {
  processed: number;
  revoked: number;
  pages: number;
};

export type InvalidateAllPageResult = FunctionReturnType<
  ComponentApi["lib"]["invalidateAll"]
>;

export type OnInvalidateHookPayload =
  | {
      trigger: "invalidate";
      at: number;
      keyId: string;
      reason?: string;
    }
  | {
      trigger: "refresh";
      at: number;
      keyId: string;
      replacementKeyId: string;
      reason?: string;
    }
  | {
      trigger: "invalidateAll";
      at: number;
      namespace?: string;
      before?: number;
      after?: number;
      reason?: string;
      processed: number;
      revoked: number;
      pages: number;
    };

export type UpdateArgs = {
  keyId: ApiKeyId;
  name?: string;
  metadata?: ApiKeyMetadata;
  /** Pass `null` to remove the expiry entirely. */
  expiresAt?: number | null;
};

export type UpdateResult = FunctionReturnType<ComponentApi["lib"]["update"]>;

export type CleanupExpiredArgs = {
  /**
   * How long to retain dead keys (expired or revoked) before hard-deleting
   * them and their audit events.
   *
   * @default 30 days
   */
  retentionMs?: number;
};

export type CleanupExpiredResult = CleanupExpiredMutationResult;

export type RefreshArgs = {
  keyId: ApiKeyId;
  reason?: string;
  metadata?: ApiKeyEventMetadata;
};

type RefreshMutationSuccess = Extract<RefreshMutationResult, { ok: true }>;
type RefreshMutationFailure = Extract<RefreshMutationResult, { ok: false }>;

export type RefreshResult =
  | (RefreshMutationSuccess & {
      token: ApiKeyToken;
      tokenPrefix: string;
      tokenLast4: string;
    })
  | RefreshMutationFailure;

type ValidateSuccessBase = Extract<ValidateQueryResult, { ok: true }>;
type ValidateFailure = Extract<ValidateQueryResult, { ok: false }>;

export type ValidateResult<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> =
  | (Omit<ValidateSuccessBase, "permissions" | "namespace" | "metadata"> & {
      namespace: NamespaceOutput<TOptions>;
      permissions: PermissionsOutput<TOptions>;
      metadata: MetadataOutput<TOptions>;
    })
  | ValidateFailure;

export type RunMutationCtx = {
  runMutation: <
    Mutation extends FunctionReference<"mutation", FunctionVisibility>,
  >(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>;
};

export type RunQueryCtx = {
  runQuery: <Query extends FunctionReference<"query", "internal">>(
    query: Query,
    args: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>;
};
