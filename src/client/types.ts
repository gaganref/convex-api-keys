import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  FunctionVisibility,
} from "convex/server";
import { v, type Infer } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

type CreateMutationResult = FunctionReturnType<ComponentApi["lib"]["create"]>;
type ValidateQueryResult = FunctionReturnType<ComponentApi["lib"]["validate"]>;
type RefreshMutationResult = FunctionReturnType<ComponentApi["lib"]["refresh"]>;
type GetKeyQueryResult = FunctionReturnType<ComponentApi["lib"]["getKey"]>;
type ListKeysQueryResult = FunctionReturnType<ComponentApi["lib"]["listKeys"]>;
type CleanupKeysMutationResult = FunctionReturnType<
  ComponentApi["cleanup"]["cleanupKeys"]
>;
type CleanupEventsMutationResult = FunctionReturnType<
  ComponentApi["cleanup"]["cleanupEvents"]
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

type MetadataInput<TOptions extends ApiKeysTypeOptions> = TOptions extends {
  metadata: infer M extends Record<string, unknown>;
}
  ? M
  : ApiKeyMetadata;

type TypedKeyRecordFields<
  TBase,
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = Omit<TBase, "namespace" | "permissions" | "metadata"> & {
  namespace: NamespaceOutput<TOptions>;
  permissions: PermissionsOutput<TOptions>;
  metadata: MetadataOutput<TOptions>;
};

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
    metadata?: MetadataInput<TOptions>;
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

export type ApiKeyEffectiveStatus =
  | "active"
  | "revoked"
  | "expired"
  | "idle_timeout";

type ListKeysFilterArgs =
  | {
      status?: "active" | "revoked";
      effectiveStatus?: never;
    }
  | {
      status?: never;
      effectiveStatus?: ApiKeyEffectiveStatus;
    };

export type ListKeysArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  paginationOpts: PaginationOptions;
  order?: "asc" | "desc";
} & ListKeysFilterArgs &
  NamespaceFilterArg<TOptions>;

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

type GetKeySuccessBase = Extract<GetKeyQueryResult, { ok: true }>;
type GetKeyFailure = Extract<GetKeyQueryResult, { ok: false }>;

export type GetKeyResult<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = TypedKeyRecordFields<GetKeySuccessBase, TOptions> | GetKeyFailure;

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

export const onInvalidateHookPayloadValidator = v.union(
  v.object({
    trigger: v.literal("invalidate"),
    at: v.number(),
    keyId: v.string(),
    reason: v.optional(v.string()),
  }),
  v.object({
    trigger: v.literal("refresh"),
    at: v.number(),
    keyId: v.string(),
    replacementKeyId: v.string(),
    reason: v.optional(v.string()),
  }),
  v.object({
    trigger: v.literal("invalidateAll"),
    at: v.number(),
    namespace: v.optional(v.string()),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    reason: v.optional(v.string()),
    processed: v.number(),
    revoked: v.number(),
    pages: v.number(),
  }),
);

export type OnInvalidateHookPayload = Infer<
  typeof onInvalidateHookPayloadValidator
>;

export type UpdateArgs<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = {
  keyId: ApiKeyId;
  name?: string;
  metadata?: MetadataInput<TOptions>;
  /** Pass `null` to remove the expiry entirely. */
  expiresAt?: number | null;
  /** Pass `null` to remove the idle timeout entirely. */
  maxIdleMs?: number | null;
};

export type UpdateResult = FunctionReturnType<ComponentApi["lib"]["update"]>;

export type CleanupKeysArgs = {
  /**
   * How long to retain revoked keys before hard-deleting them.
   *
   * @default 30 days
   */
  retentionMs?: number;
};

export type CleanupKeysResult = CleanupKeysMutationResult;

export type CleanupEventsArgs = {
  /**
   * How long to retain audit events before hard-deleting them.
   *
   * @default 180 days
   */
  retentionMs?: number;
};

export type CleanupEventsResult = CleanupEventsMutationResult;

export type RefreshArgs = {
  keyId: ApiKeyId;
  /** Override the token prefix for the new key. Falls back to `keyDefaults.prefix`. */
  prefix?: string;
  reason?: string;
  metadata?: ApiKeyEventMetadata;
};

type RefreshMutationSuccess = Extract<RefreshMutationResult, { ok: true }>;
type RefreshMutationFailure = Extract<RefreshMutationResult, { ok: false }>;
type ListKeysItemBase = ListKeysQueryResult["page"][number];

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
  | TypedKeyRecordFields<ValidateSuccessBase, TOptions>
  | ValidateFailure;

export type ListKeysResult<
  TOptions extends ApiKeysTypeOptions = Record<never, never>,
> = Omit<ListKeysQueryResult, "page"> & {
  page: Array<TypedKeyRecordFields<ListKeysItemBase, TOptions>>;
};

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
