/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("create inserts key and created event", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      tokenHash: "hash_1",
      tokenPrefix: "ak_live",
      tokenLast4: "1234",
      namespace: "test",
      name: "test key",
      metadata: { source: "test" },
    });
    expect(result.keyId).toBeDefined();
    expect(result.createdAt).toBeTypeOf("number");
  });

  test("create throws for duplicate token hash", async () => {
    const t = initConvexTest();
    const payload = {
      tokenHash: "duplicate_hash",
      tokenPrefix: "ak_live",
      tokenLast4: "5678",
      namespace: "test",
    };
    await t.mutation(api.lib.create, payload);
    await expect(t.mutation(api.lib.create, payload)).rejects.toMatchObject({
      data: expect.stringContaining('"code":"invalid_argument"'),
    });
  });

  test("validate returns success for active key", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await t.mutation(api.lib.create, {
      tokenHash: "hash_validate_ok",
      tokenPrefix: "ak_",
      tokenLast4: "1111",
      namespace: "test",
      name: "validate key",
      permissions: { beacon: ["events:write"] },
      metadata: { source: "test" },
    });

    const result = await t.query(api.lib.validate, {
      tokenHash: "hash_validate_ok",
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.namespace).toBe("test");
      expect(result.name).toBe("validate key");
      expect(result.permissions?.beacon).toEqual(["events:write"]);
    }
  });

  test("validate returns not_found for unknown token hash", async () => {
    const t = initConvexTest();
    const result = await t.query(api.lib.validate, {
      tokenHash: "hash_missing",
      now: Date.now(),
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  test("validate uses effective expired status when stored status is active", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await t.mutation(api.lib.create, {
      tokenHash: "hash_expired",
      tokenPrefix: "ak_",
      tokenLast4: "2222",
      expiresAt: now - 1,
    });

    const result = await t.query(api.lib.validate, {
      tokenHash: "hash_expired",
      now,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  test("validate prioritizes revoked over expiration", async () => {
    const t = initConvexTest();
    const now = Date.now();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_revoked",
      tokenPrefix: "ak_",
      tokenLast4: "3333",
      expiresAt: now - 1,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(created.keyId, {
        status: "revoked",
        revokedAt: now,
      });
    });

    const result = await t.query(api.lib.validate, {
      tokenHash: "hash_revoked",
      now,
    });
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  test("touch updates lastUsedAt", async () => {
    const t = initConvexTest();
    const now = Date.now();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_touch_ok",
      tokenPrefix: "ak_",
      tokenLast4: "4444",
      maxIdleMs: 60_000,
    });

    const touchedAt = now + 1_000;
    const touchResult = await t.mutation(api.lib.touch, {
      keyId: created.keyId,
      now: touchedAt,
    });

    expect(touchResult).toEqual({
      ok: true,
      keyId: created.keyId,
      touchedAt,
    });

    const key = await t.run(async (ctx) => ctx.db.get(created.keyId));
    expect(key?.lastUsedAt).toBe(touchedAt);
  });

  test("touch returns expired when key is no longer active", async () => {
    const t = initConvexTest();
    const now = Date.now();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_touch_expired",
      tokenPrefix: "ak_",
      tokenLast4: "5555",
      expiresAt: now - 1,
    });

    const result = await t.mutation(api.lib.touch, {
      keyId: created.keyId,
      now,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  test("listKeys paginates and filters by namespace", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, {
      tokenHash: "hash_list_1",
      tokenPrefix: "ak_",
      tokenLast4: "1001",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.create, {
      tokenHash: "hash_list_2",
      tokenPrefix: "ak_",
      tokenLast4: "1002",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.create, {
      tokenHash: "hash_list_3",
      tokenPrefix: "ak_",
      tokenLast4: "1003",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.create, {
      tokenHash: "hash_list_4",
      tokenPrefix: "ak_",
      tokenLast4: "1004",
      namespace: "team_beta",
    });

    const firstPage = await t.query(api.lib.listKeys, {
      namespace: "team_alpha",
      now: Date.now(),
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.page.every((row) => row.namespace === "team_alpha")).toBe(
      true,
    );
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.query(api.lib.listKeys, {
      namespace: "team_alpha",
      now: Date.now(),
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
  });

  test("listKeys returns effective status", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await t.mutation(api.lib.create, {
      tokenHash: "hash_list_expired",
      tokenPrefix: "ak_",
      tokenLast4: "2001",
      namespace: "team_alpha",
      expiresAt: now - 1,
    });

    const result = await t.query(api.lib.listKeys, {
      namespace: "team_alpha",
      now,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0]?.status).toBe("active");
    expect(result.page[0]?.effectiveStatus).toBe("expired");
  });

  test("invalidate revokes key and writes event", async () => {
    const t = initConvexTest();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_invalidate_ok",
      tokenPrefix: "ak_",
      tokenLast4: "3001",
      namespace: "team_alpha",
    });

    const revokedAt = Date.now();
    const result = await t.mutation(api.lib.invalidate, {
      keyId: created.keyId,
      now: revokedAt,
      reason: "manual revoke",
      metadata: { actor: "tester" },
    });

    expect(result).toEqual({ ok: true, keyId: created.keyId, revokedAt });

    const key = await t.run(async (ctx) => ctx.db.get(created.keyId));
    expect(key?.status).toBe("revoked");
    expect(key?.revokedAt).toBe(revokedAt);
    expect(key?.revocationReason).toBe("manual revoke");

    const events = await t.run(async (ctx) =>
      ctx.db
        .query("apiKeyEvents")
        .withIndex("by_key_id", (q) =>
          q.eq("keyId", created.keyId),
        )
        .collect(),
    );
    expect(events.some((event) => event.type === "revoked")).toBe(true);
  });

  test("invalidate returns revoked for already revoked key", async () => {
    const t = initConvexTest();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_invalidate_revoked",
      tokenPrefix: "ak_",
      tokenLast4: "3002",
    });

    await t.mutation(api.lib.invalidate, {
      keyId: created.keyId,
      now: Date.now(),
    });

    const second = await t.mutation(api.lib.invalidate, {
      keyId: created.keyId,
      now: Date.now(),
    });

    expect(second).toEqual({ ok: false, reason: "revoked" });
  });

  test("refresh rotates active key and links records", async () => {
    const t = initConvexTest();
    const now = Date.now();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_refresh_source",
      tokenPrefix: "ak_",
      tokenLast4: "4001",
      namespace: "team_alpha",
      name: "rotatable",
      permissions: { beacon: ["events:write"] },
      maxIdleMs: 60_000,
    });

    const refreshed = await t.mutation(api.lib.refresh, {
      keyId: created.keyId,
      tokenHash: "hash_refresh_new",
      tokenPrefix: "ak_",
      tokenLast4: "9001",
      now: now + 5_000,
      reason: "rotation",
    });

    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;

    const oldKey = await t.run(async (ctx) => ctx.db.get(created.keyId));
    const newKey = await t.run(async (ctx) => ctx.db.get(refreshed.keyId));

    expect(oldKey?.status).toBe("revoked");
    expect(newKey?.replaces).toBe(created.keyId);
    expect(newKey?.status).toBe("active");
  });

  test("refresh returns revoked for already revoked key", async () => {
    const t = initConvexTest();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_refresh_revoked",
      tokenPrefix: "ak_",
      tokenLast4: "4002",
    });

    await t.mutation(api.lib.invalidate, {
      keyId: created.keyId,
      now: Date.now(),
    });

    const refreshed = await t.mutation(api.lib.refresh, {
      keyId: created.keyId,
      tokenHash: "hash_refresh_should_fail",
      tokenPrefix: "ak_",
      tokenLast4: "9999",
      now: Date.now(),
    });

    expect(refreshed).toEqual({ ok: false, reason: "revoked" });
  });

  test("listKeyEvents returns lifecycle events for a key", async () => {
    const t = initConvexTest();
    const created = await t.mutation(api.lib.create, {
      tokenHash: "hash_events_key",
      tokenPrefix: "ak_",
      tokenLast4: "7001",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.invalidate, {
      keyId: created.keyId,
      now: Date.now(),
      reason: "manual",
    });

    const result = await t.query(api.lib.listKeyEvents, {
      keyId: created.keyId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page.length).toBeGreaterThanOrEqual(2);
    expect(result.page.some((event) => event.type === "created")).toBe(true);
    expect(result.page.some((event) => event.type === "revoked")).toBe(true);
  });

  test("listEvents filters by namespace", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, {
      tokenHash: "hash_events_ns_1",
      tokenPrefix: "ak_",
      tokenLast4: "8001",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.create, {
      tokenHash: "hash_events_ns_2",
      tokenPrefix: "ak_",
      tokenLast4: "8002",
      namespace: "team_beta",
    });

    const result = await t.query(api.lib.listEvents, {
      namespace: "team_alpha",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page.length).toBeGreaterThan(0);
    expect(result.page.every((event) => event.namespace === "team_alpha")).toBe(
      true,
    );
  });

  test("invalidateAll revokes active keys in namespace", async () => {
    const t = initConvexTest();
    const a1 = await t.mutation(api.lib.create, {
      tokenHash: "hash_bulk_a1",
      tokenPrefix: "ak_",
      tokenLast4: "9001",
      namespace: "team_alpha",
    });
    const a2 = await t.mutation(api.lib.create, {
      tokenHash: "hash_bulk_a2",
      tokenPrefix: "ak_",
      tokenLast4: "9002",
      namespace: "team_alpha",
    });
    await t.mutation(api.lib.create, {
      tokenHash: "hash_bulk_b1",
      tokenPrefix: "ak_",
      tokenLast4: "9003",
      namespace: "team_beta",
    });

    const result = await t.mutation(api.lib.invalidateAll, {
      namespace: "team_alpha",
      paginationOpts: { numItems: 10, cursor: null },
      now: Date.now(),
      reason: "bulk revoke",
    });

    expect(result.revoked).toBe(2);

    const keyA1 = await t.run(async (ctx) => ctx.db.get(a1.keyId));
    const keyA2 = await t.run(async (ctx) => ctx.db.get(a2.keyId));
    expect(keyA1?.status).toBe("revoked");
    expect(keyA2?.status).toBe("revoked");
  });
});
