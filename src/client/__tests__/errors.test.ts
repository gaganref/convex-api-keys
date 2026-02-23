import { describe, expect, test } from "vitest";
import {
  ApiKeys,
  ApiKeysClientError,
  isApiKeysClientError,
} from "../index.js";
import { normalizeApiKeysOptions } from "../options.js";
import { components, initConvexTest } from "./setup.test.js";
import type { RunQueryCtx } from "../types.js";

// ---------------------------------------------------------------------------
// error contracts
// ---------------------------------------------------------------------------

describe("error contracts", () => {
  test("TOKEN_REQUIRED is an ApiKeysClientError", async () => {
    const client = new ApiKeys(components.apiKeys, { logLevel: "none" });
    const ctx: RunQueryCtx = {
      runQuery: async () => {
        throw new Error("should not be called");
      },
    };

    await expect(client.validate(ctx, { token: "  " })).rejects.toSatisfy(
      (e: unknown) =>
        isApiKeysClientError(e) && e.code === "TOKEN_REQUIRED",
    );
  });

  test("OPERATION_FAILED wraps infrastructure errors with cause", async () => {
    const client = new ApiKeys(components.apiKeys, { logLevel: "none" });
    const ctx: RunQueryCtx = {
      runQuery: async () => {
        throw new Error("simulated Convex failure");
      },
    };

    const error = await client
      .validate(ctx, { token: "ak_sometoken" })
      .catch((e) => e);
    expect(isApiKeysClientError(error)).toBe(true);
    if (isApiKeysClientError(error)) {
      expect(error.code).toBe("OPERATION_FAILED");
      expect(error.cause).toBeInstanceOf(Error);
    }
  });

  test("ok:false auth decisions do not throw — they return", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, { logLevel: "none" });
    const ctx: RunQueryCtx = { runQuery: (q, a) => t.query(q, a) };

    const result = await client.validate(ctx, { token: "ak_unknown_token" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });

  test("infrastructure failure throws ApiKeysClientError", async () => {
    const client = new ApiKeys(components.apiKeys, { logLevel: "none" });
    const ctx: RunQueryCtx = {
      runQuery: async () => {
        throw new Error("db down");
      },
    };

    await expect(
      client.validate(ctx, { token: "ak_sometoken" }),
    ).rejects.toBeInstanceOf(ApiKeysClientError);
  });

  test("INVALID_OPTIONS thrown at init time for bad config", () => {
    expect(
      () =>
        new ApiKeys(components.apiKeys, {
          keyDefaults: { prefix: "" },
        }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// option normalization
// ---------------------------------------------------------------------------

describe("option normalization", () => {
  test("normalizes defaults", () => {
    const normalized = normalizeApiKeysOptions({});

    expect(normalized.keyDefaults.prefix).toBe("ak_");
    expect(normalized.keyDefaults.keyLengthBytes).toBe(32);
    expect(normalized.keyDefaults.ttlMs).toBe(null);
    expect(normalized.logLevel).toBe("warn");
    expect(normalized.permissionDefaults).toBeUndefined();
  });

  test("normalizes logLevel option", () => {
    const normalized = normalizeApiKeysOptions({ logLevel: "debug" });
    expect(normalized.logLevel).toBe("debug");
  });

  test("normalizes permissionDefaults", () => {
    const normalized = normalizeApiKeysOptions({
      permissionDefaults: { beacon: ["events:read"] },
    });
    expect(normalized.permissionDefaults).toEqual({
      beacon: ["events:read"],
    });
  });

  test("throws for empty prefix", () => {
    expect(() =>
      normalizeApiKeysOptions({ keyDefaults: { prefix: "" } }),
    ).toThrow(/must not be empty/);
  });

  test("throws for prefix exceeding max length", () => {
    expect(() =>
      normalizeApiKeysOptions({ keyDefaults: { prefix: "a".repeat(33) } }),
    ).toThrow(/max allowed length/);
  });

  test("throws typed INVALID_OPTIONS for bad initialization", () => {
    try {
      new ApiKeys(components.apiKeys, {
        keyDefaults: { prefix: "" },
      });
      throw new Error("expected constructor to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiKeysClientError);
      expect(isApiKeysClientError(error)).toBe(true);
      if (isApiKeysClientError(error)) {
        expect(error.code).toBe("INVALID_OPTIONS");
      }
    }
  });
});
