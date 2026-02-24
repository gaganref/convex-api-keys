import { expectTypeOf, test } from "vitest";
import { ApiKeys } from "../index.js";
import { components } from "./setup.test.js";

test("client type contracts remain stable", () => {
  // --- Base client (no type param) ---

  const _baseClient = new ApiKeys(components.apiKeys, {});

  type BaseListKeysArgs = Parameters<typeof _baseClient.listKeys>[1];

  const invalidNamespaceFilter: BaseListKeysArgs = {
    paginationOpts: { numItems: 10, cursor: null },
    // @ts-expect-error namespace filter is not allowed when no namespace type is configured.
    namespace: "production",
  };
  void invalidNamespaceFilter;

  // --- Namespaced client ---

  const _namespacedClient = new ApiKeys<{ namespace: string }>(
    components.apiKeys,
    {},
  );

  type NamespacedListKeysArgs = Parameters<
    typeof _namespacedClient.listKeys
  >[1];
  const validNamespaceFilter: NamespacedListKeysArgs = {
    paginationOpts: { numItems: 10, cursor: null },
    namespace: "production",
  };
  expectTypeOf(validNamespaceFilter.namespace).toEqualTypeOf<
    string | undefined
  >();

  // --- Template literal namespace ---

  const _templateClient = new ApiKeys<{
    namespace: `live:${string}`;
  }>(components.apiKeys, {});

  type TemplateCreateArgs = Parameters<typeof _templateClient.create>[1];
  const validTemplateNs: TemplateCreateArgs = { namespace: "live:user_123" };
  void validTemplateNs;

  // --- requireName ---

  const _requireNameClient = new ApiKeys<{ requireName: true }>(
    components.apiKeys,
    {},
  );

  type RequireNameCreateArgs = Parameters<typeof _requireNameClient.create>[1];

  // @ts-expect-error name is required when requireName is true.
  const missingName: RequireNameCreateArgs = {};
  void missingName;

  // --- Typed permissions ---

  const _permissionsClient = new ApiKeys<{
    permissions: { beacon: Array<"events:write" | "reports:read"> };
  }>(components.apiKeys, {
    permissionDefaults: { beacon: ["events:write"] },
  });

  type PermissionsCreateArgs = Parameters<typeof _permissionsClient.create>[1];
  const validPermissionsArgs: PermissionsCreateArgs = {
    permissions: {
      beacon: ["events:write"],
    },
    metadata: {
      scope: "backend",
      label: "CI key",
    },
  };
  expectTypeOf(validPermissionsArgs.permissions?.beacon).toEqualTypeOf<
    Array<"events:write" | "reports:read"> | undefined
  >();

  const invalidPermissionsScope: PermissionsCreateArgs = {
    permissions: {
      // @ts-expect-error unknown permission scope key should be rejected.
      other: ["events:write"],
    },
  };
  void invalidPermissionsScope;

  // --- Typed metadata ---

  const _metadataClient = new ApiKeys<{
    metadata: { userId: string; plan: "free" | "pro" };
  }>(components.apiKeys, {});

  type MetadataCreateArgs = Parameters<typeof _metadataClient.create>[1];
  const validMetadataArgs: MetadataCreateArgs = {
    metadata: { userId: "user_123", plan: "free" },
  };
  expectTypeOf(validMetadataArgs.metadata?.userId).toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf(validMetadataArgs.metadata?.plan).toEqualTypeOf<
    "free" | "pro" | undefined
  >();

  // withHooks is available for attaching lifecycle hooks
  expectTypeOf(_baseClient).toHaveProperty("withHooks");
});
