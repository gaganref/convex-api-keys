import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiKeys } from "../index.js";
import { components, initConvexTest } from "./setup.test.js";
import type { RunMutationCtx, RunQueryCtx } from "../types.js";

function ctxFrom(t: ReturnType<typeof initConvexTest>) {
  const mutationCtx: RunMutationCtx = {
    runMutation: (mutation, args) => t.mutation(mutation, args),
  };
  const queryCtx: RunQueryCtx = {
    runQuery: (query, args) => t.query(query, args),
  };
  return { mutationCtx, queryCtx };
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("create", () => {
  test("generates token and stores only hash", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx } = ctxFrom(t);

    const result = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "test key",
    });

    expect(result.keyId).toBeDefined();
    expect(result.token).toMatch(/^ak_/);
    expect(result.tokenLast4).toBe(result.token.slice(-4));
    expect(result.token.length).toBeGreaterThan(20);
  });

  test("applies permissionDefaults when create args omit permissions", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{
      namespace: string;
      permissions: { beacon: string[] };
    }>(components.apiKeys, {
      permissionDefaults: {
        beacon: ["events:write", "reports:read"],
      },
    });
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "default permissions",
    });

    const result = await client.validate(queryCtx, { token: created.token });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.permissions?.beacon).toEqual([
        "events:write",
        "reports:read",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe("validate", () => {
  test("returns ok for valid token", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{
      namespace: string;
      permissions: { beacon: string[] };
    }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "validate me",
      permissions: { beacon: ["events:write"] },
    });

    const result = await client.validate(queryCtx, { token: created.token });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe(created.keyId);
      expect(result.namespace).toBe("team_alpha");
      expect(result.permissions?.beacon).toEqual(["events:write"]);
    }
  });

  test("returns not_found for unknown token", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { queryCtx } = ctxFrom(t);

    const result = await client.validate(queryCtx, {
      token: "ak_missing_token",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  test("returns expired for key past absolute ttl", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { ttlMs: 1_000 });
    vi.advanceTimersByTime(2_000);

    const result = await client.validate(queryCtx, { token: created.token });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  test("returns idle_timeout for key past idle window", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { idleTimeoutMs: 1_000 });
    vi.advanceTimersByTime(2_000);

    const result = await client.validate(queryCtx, { token: created.token });
    expect(result).toEqual({ ok: false, reason: "idle_timeout" });
  });

  test("throws typed input errors for invalid token input", async () => {
    const client = new ApiKeys(components.apiKeys, { logLevel: "none" });
    const queryCtx: RunQueryCtx = {
      runQuery: async () => {
        throw new Error("should not be called");
      },
    };

    await expect(
      client.validate(queryCtx, { token: "   " }),
    ).rejects.toMatchObject({
      name: "ApiKeysClientError",
      code: "TOKEN_REQUIRED",
    });
  });
});

// ---------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------

describe("touch", () => {
  test("succeeds for active key with idle timeout", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "touch me",
      idleTimeoutMs: 60_000,
    });

    const touched = await client.touch(mutationCtx, {
      keyId: created.keyId,
    });

    expect(touched.ok).toBe(true);
    if (touched.ok) {
      expect(touched.keyId).toBe(created.keyId);
      expect(touched.touchedAt).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getKey
// ---------------------------------------------------------------------------

describe("getKey", () => {
  test("returns key details for existing key", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "my key",
      permissions: { api: ["read"] },
    });

    const result = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.keyId).toBe(created.keyId);
    expect(result.namespace).toBe("team_alpha");
    expect(result.name).toBe("my key");
    expect(result.tokenLast4).toBe(created.tokenLast4);
    expect(result.tokenPrefix).toBe(created.tokenPrefix);
    expect(result.status).toBe("active");
    expect(result.effectiveStatus).toBe("active");
    expect(Math.abs(result.createdAt - created.createdAt)).toBeLessThanOrEqual(5);
    expect(result.permissions?.api).toEqual(["read"]);
  });

  test("returns ok for revoked key (not not_found)", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { name: "temp" });
    await client.invalidate(mutationCtx, { keyId: created.keyId });

    const result = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(result.ok).toBe(true);
  });

  test("reflects revoked status after invalidate", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "revoke me",
    });
    await client.invalidate(mutationCtx, {
      keyId: created.keyId,
      reason: "test revocation",
    });

    const result = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("revoked");
    expect(result.effectiveStatus).toBe("revoked");
    expect(result.revokedAt).toBeDefined();
    expect(result.revocationReason).toBe("test revocation");
  });

  test("reflects expired effectiveStatus past ttl", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { ttlMs: 1_000 });
    vi.advanceTimersByTime(2_000);

    const result = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("active");
    expect(result.effectiveStatus).toBe("expired");
  });
});

// ---------------------------------------------------------------------------
// invalidate
// ---------------------------------------------------------------------------

describe("invalidate", () => {
  test("marks key as revoked", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "revoke me",
    });

    const invalidated = await client.invalidate(mutationCtx, {
      keyId: created.keyId,
      reason: "compromised",
    });
    expect(invalidated.ok).toBe(true);

    const validated = await client.validate(queryCtx, {
      token: created.token,
    });
    expect(validated).toEqual({ ok: false, reason: "revoked" });
  });

  test("invalidateAll revokes all active keys in namespace", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const k1 = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "bulk key 1",
    });
    const k2 = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "bulk key 2",
    });

    const result = await client.invalidateAll(mutationCtx, {
      namespace: "team_alpha",
      pageSize: 1,
      reason: "bulk test",
    });

    expect(result.revoked).toBe(2);
    expect(result.pages).toBeGreaterThanOrEqual(2);

    const v1 = await client.validate(queryCtx, { token: k1.token });
    const v2 = await client.validate(queryCtx, { token: k2.token });
    expect(v1).toEqual({ ok: false, reason: "revoked" });
    expect(v2).toEqual({ ok: false, reason: "revoked" });
  });

  test("invalidateAll respects before/after creation time filters", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const early = await client.create(mutationCtx, {
      namespace: "team_filter",
      name: "early key",
    });

    vi.advanceTimersByTime(2_000);
    const cutoff = Date.now();

    vi.advanceTimersByTime(2_000);
    const late = await client.create(mutationCtx, {
      namespace: "team_filter",
      name: "late key",
    });

    const result = await client.invalidateAll(mutationCtx, {
      namespace: "team_filter",
      before: cutoff,
    });
    expect(result.revoked).toBe(1);

    const earlyValidation = await client.validate(queryCtx, {
      token: early.token,
    });
    const lateValidation = await client.validate(queryCtx, {
      token: late.token,
    });
    expect(earlyValidation).toEqual({ ok: false, reason: "revoked" });
    expect(lateValidation.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe("refresh", () => {
  test("rotates key and returns new token", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "rotate me",
    });

    const refreshed = await client.refresh(mutationCtx, {
      keyId: created.keyId,
    });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;

    const oldValidation = await client.validate(queryCtx, {
      token: created.token,
    });
    expect(oldValidation).toEqual({ ok: false, reason: "revoked" });

    const newValidation = await client.validate(queryCtx, {
      token: refreshed.token,
    });
    expect(newValidation.ok).toBe(true);
  });

  test("inherits namespace, name, permissions, and expiresAt", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "inherit me",
      permissions: { api: ["read", "write"] },
      ttlMs: 60_000,
    });

    const refreshed = await client.refresh(mutationCtx, {
      keyId: created.keyId,
      reason: "rotation",
    });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;

    expect(refreshed.expiresAt).toBe(created.expiresAt);

    const validated = await client.validate(queryCtx, {
      token: refreshed.token,
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.namespace).toBe("team_alpha");
    expect(validated.name).toBe("inherit me");
    expect(validated.permissions?.api).toEqual(["read", "write"]);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("update", () => {
  test("updates key name", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "original name",
    });

    const updated = await client.update(mutationCtx, {
      keyId: created.keyId,
      name: "new name",
    });
    expect(updated.ok).toBe(true);

    const key = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    expect(key.name).toBe("new name");
  });

  test("updates key metadata", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{
      namespace: string;
      metadata: { source: string; owner?: string };
    }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "meta key",
      metadata: { source: "test" },
    });

    await client.update(mutationCtx, {
      keyId: created.keyId,
      metadata: { source: "updated", owner: "alice" },
    });

    const key = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    expect(key.metadata).toEqual({ source: "updated", owner: "alice" });
  });

  test("updates expiresAt to a future timestamp", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { name: "expiry key" });
    expect(created.expiresAt).toBeUndefined();

    const newExpiry = Date.now() + 60_000;
    await client.update(mutationCtx, {
      keyId: created.keyId,
      expiresAt: newExpiry,
    });

    const key = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    expect(key.expiresAt).toBe(newExpiry);
  });

  test("removes expiresAt when passed null", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      name: "remove expiry",
      ttlMs: 60_000,
    });
    expect(created.expiresAt).toBeDefined();

    await client.update(mutationCtx, {
      keyId: created.keyId,
      expiresAt: null,
    });

    const key = await client.getKey(queryCtx, { keyId: created.keyId });
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    expect(key.expiresAt).toBeUndefined();
  });

  test("returns not_found for unknown keyId", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { name: "temp" });
    const t2 = initConvexTest();
    const mutationCtx2: RunMutationCtx = {
      runMutation: (mutation, args) => t2.mutation(mutation, args),
    };

    const result = await client.update(mutationCtx2, {
      keyId: created.keyId,
      name: "ghost",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  test("updated name is visible via validate", async () => {
    const t = initConvexTest();
    const client = new ApiKeys(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, { name: "old name" });

    await client.update(mutationCtx, {
      keyId: created.keyId,
      name: "renamed",
    });

    const result = await client.validate(queryCtx, { token: created.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe("renamed");
  });
});

// ---------------------------------------------------------------------------
// listKeys / listEvents / listKeyEvents
// ---------------------------------------------------------------------------

describe("list operations", () => {
  test("listKeys returns paginated keys filtered by namespace", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "list key 1",
    });
    await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "list key 2",
    });
    await client.create(mutationCtx, {
      namespace: "team_beta",
      name: "list key 3",
    });

    const page = await client.listKeys(queryCtx, {
      namespace: "team_alpha",
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page.page).toHaveLength(2);
    expect(
      page.page.every(
        (row: { namespace?: string }) => row.namespace === "team_alpha",
      ),
    ).toBe(true);
  });

  test("listKeys defaults to desc (newest first)", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const k1 = await client.create(mutationCtx, {
      namespace: "ns",
      name: "first",
    });
    vi.advanceTimersByTime(10);
    const k2 = await client.create(mutationCtx, {
      namespace: "ns",
      name: "second",
    });

    const page = await client.listKeys(queryCtx, {
      namespace: "ns",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(page.page[0].keyId).toBe(k2.keyId);
    expect(page.page[1].keyId).toBe(k1.keyId);
  });

  test("listKeys with order asc returns oldest first", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const k1 = await client.create(mutationCtx, {
      namespace: "ns",
      name: "first",
    });
    vi.advanceTimersByTime(10);
    const k2 = await client.create(mutationCtx, {
      namespace: "ns",
      name: "second",
    });

    const page = await client.listKeys(queryCtx, {
      namespace: "ns",
      order: "asc",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(page.page[0].keyId).toBe(k1.keyId);
    expect(page.page[1].keyId).toBe(k2.keyId);
  });

  test("listEvents with order asc returns oldest event first", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    await client.create(mutationCtx, { namespace: "ns", name: "key 1" });
    vi.advanceTimersByTime(10);
    await client.create(mutationCtx, { namespace: "ns", name: "key 2" });

    const asc = await client.listEvents(queryCtx, {
      namespace: "ns",
      order: "asc",
      paginationOpts: { numItems: 10, cursor: null },
    });
    const desc = await client.listEvents(queryCtx, {
      namespace: "ns",
      order: "desc",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(asc.page.length).toBe(2);
    expect(asc.page[0].createdAt).toBeLessThanOrEqual(asc.page[1].createdAt);
    expect(desc.page[0].createdAt).toBeGreaterThanOrEqual(
      desc.page[1].createdAt,
    );
  });

  test("listEvents filterable by namespace", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    await client.create(mutationCtx, { namespace: "ns_a", name: "key a" });
    await client.create(mutationCtx, { namespace: "ns_b", name: "key b" });

    const all = await client.listEvents(queryCtx, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(all.page.length).toBeGreaterThanOrEqual(2);

    const filtered = await client.listEvents(queryCtx, {
      namespace: "ns_a",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(
      filtered.page.every(
        (e: { namespace?: string }) => e.namespace === "ns_a",
      ),
    ).toBe(true);
  });

  test("listKeyEvents returns events for key", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "events me",
    });
    await client.invalidate(mutationCtx, { keyId: created.keyId });

    const events = await client.listKeyEvents(queryCtx, {
      keyId: created.keyId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(
      events.page.some((event: { type: string }) => event.type === "created"),
    ).toBe(true);
    expect(
      events.page.some((event: { type: string }) => event.type === "revoked"),
    ).toBe(true);
  });

  test("listKeyEvents with order asc returns created before revoked", async () => {
    const t = initConvexTest();
    const client = new ApiKeys<{ namespace: string }>(components.apiKeys, {});
    const { mutationCtx, queryCtx } = ctxFrom(t);

    const created = await client.create(mutationCtx, {
      namespace: "ns",
      name: "event key",
    });
    await client.invalidate(mutationCtx, { keyId: created.keyId });

    const asc = await client.listKeyEvents(queryCtx, {
      keyId: created.keyId,
      order: "asc",
      paginationOpts: { numItems: 10, cursor: null },
    });
    const desc = await client.listKeyEvents(queryCtx, {
      keyId: created.keyId,
      order: "desc",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(asc.page[0].type).toBe("created");
    expect(asc.page[1].type).toBe("revoked");
    expect(desc.page[0].type).toBe("revoked");
    expect(desc.page[1].type).toBe("created");
  });
});
