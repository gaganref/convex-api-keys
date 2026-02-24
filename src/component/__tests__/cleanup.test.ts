/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api.js";
import type { Id } from "../_generated/dataModel.js";
import { initConvexTest } from "./setup.test.js";

// Helper: create a key via the component's create mutation.
// Default expiresAt is set to FAR_FUTURE so it doesn't interfere with
// sweep queries. Tests override to control behavior.
const FAR_FUTURE = Date.now() + 365 * 86_400_000;

async function createKey(
  t: ReturnType<typeof initConvexTest>,
  overrides: {
    tokenHash: string;
    expiresAt?: number;
    maxIdleMs?: number;
    lastUsedAt?: number;
    namespace?: string;
  },
) {
  const result = await t.mutation(api.lib.create, {
    tokenHash: overrides.tokenHash,
    tokenPrefix: "ak_",
    tokenLast4: "test",
    namespace: overrides.namespace ?? "cleanup-ns",
    expiresAt: overrides.expiresAt ?? FAR_FUTURE,
    maxIdleMs: overrides.maxIdleMs,
  });

  // If lastUsedAt is provided, patch it directly (simulates a past touch)
  if (overrides.lastUsedAt !== undefined) {
    await t.run(async (ctx) => {
      await ctx.db.patch(result.keyId, { lastUsedAt: overrides.lastUsedAt });
    });
  }

  return result;
}

async function revokeKey(
  t: ReturnType<typeof initConvexTest>,
  keyId: Id<"apiKeys">,
  now?: number,
) {
  return t.mutation(api.lib.invalidate, {
    keyId,
    now: now ?? Date.now(),
    logLevel: "none",
  });
}

async function getKey(t: ReturnType<typeof initConvexTest>, keyId: Id<"apiKeys">) {
  return t.query(api.lib.getKey, { keyId, now: Date.now() });
}

async function listKeys(t: ReturnType<typeof initConvexTest>) {
  return t.query(api.lib.listKeys, {
    namespace: "cleanup-ns",
    now: Date.now(),
    paginationOpts: { numItems: 50, cursor: null },
  });
}

const ONE_HOUR = 3_600_000;
const ONE_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// sweepExpired: marks active keys past absolute TTL as revoked
// ---------------------------------------------------------------------------

describe("sweepExpired", () => {
  test("does not sweep active keys with future expiry", async () => {
    const t = initConvexTest();
    await createKey(t, { tokenHash: "active_key" });

    const result = await t.mutation(internal.sweep.sweepExpired, {});

    expect(result.swept).toBe(0);
    expect(result.isDone).toBe(true);

    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(1);
    expect(keys.page[0].status).toBe("active");
  });

  test("sweeps time-expired keys to revoked", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, {
      tokenHash: "expired_key",
      expiresAt: past,
    });

    const result = await t.mutation(internal.sweep.sweepExpired, {});

    expect(result.swept).toBe(1);
    expect(result.isDone).toBe(true);

    const key = await getKey(t, created.keyId);
    expect(key.ok).toBe(true);
    if (key.ok) {
      expect(key.status).toBe("revoked");
      expect(key.revocationReason).toBe("expired");
    }
  });

  test("records audit event on sweep", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, {
      tokenHash: "audit_key",
      expiresAt: past,
    });

    await t.mutation(internal.sweep.sweepExpired, {});

    const events = await t.query(api.lib.listKeyEvents, {
      keyId: created.keyId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const types = events.page.map((e: { type: string }) => e.type);
    expect(types).toContain("revoked");
  });

  test("does not re-sweep already-revoked keys", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    await createKey(t, {
      tokenHash: "no_resweep",
      expiresAt: past,
    });

    const first = await t.mutation(internal.sweep.sweepExpired, {});
    expect(first.swept).toBe(1);

    const second = await t.mutation(internal.sweep.sweepExpired, {});
    expect(second.swept).toBe(0);
  });

  test("does not sweep idle-expired keys", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    await createKey(t, {
      tokenHash: "idle_only",
      maxIdleMs: ONE_HOUR,
      lastUsedAt: past,
    });

    const result = await t.mutation(internal.sweep.sweepExpired, {});
    expect(result.swept).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sweepIdleExpired: marks active keys past idle timeout as revoked
// ---------------------------------------------------------------------------

describe("sweepIdleExpired", () => {
  test("does not sweep active keys with future idle expiry", async () => {
    const t = initConvexTest();
    await createKey(t, { tokenHash: "active_idle", maxIdleMs: ONE_HOUR });

    const result = await t.mutation(internal.sweep.sweepIdleExpired, {});

    expect(result.swept).toBe(0);
    expect(result.isDone).toBe(true);
  });

  test("sweeps idle-expired keys to revoked", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, {
      tokenHash: "idle_key",
      maxIdleMs: ONE_HOUR,
      lastUsedAt: past,
    });

    const result = await t.mutation(internal.sweep.sweepIdleExpired, {});

    expect(result.swept).toBe(1);
    expect(result.isDone).toBe(true);

    const key = await getKey(t, created.keyId);
    expect(key.ok).toBe(true);
    if (key.ok) {
      expect(key.status).toBe("revoked");
      expect(key.revocationReason).toBe("idle_timeout");
    }
  });

  test("does not re-sweep already-revoked keys", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    await createKey(t, {
      tokenHash: "idle_no_resweep",
      maxIdleMs: ONE_HOUR,
      lastUsedAt: past,
    });

    const first = await t.mutation(internal.sweep.sweepIdleExpired, {});
    expect(first.swept).toBe(1);

    const second = await t.mutation(internal.sweep.sweepIdleExpired, {});
    expect(second.swept).toBe(0);
  });

  test("does not sweep time-expired keys", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    await createKey(t, {
      tokenHash: "expired_only",
      expiresAt: past,
    });

    const result = await t.mutation(internal.sweep.sweepIdleExpired, {});
    expect(result.swept).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cleanup (public): hard-deletes revoked keys past retention
// ---------------------------------------------------------------------------

describe("cleanup", () => {
  test("throws for non-positive retentionMs", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.cleanup.cleanupExpired, { retentionMs: 0 }),
    ).rejects.toThrow("retentionMs must be a positive finite number");

    await expect(
      t.mutation(api.cleanup.cleanupExpired, { retentionMs: -1000 }),
    ).rejects.toThrow("retentionMs must be a positive finite number");
  });

  test("returns zero counts when no keys exist", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_DAY,
    });

    expect(result).toEqual({ deleted: 0, isDone: true });
  });

  test("does not delete active (non-revoked) keys", async () => {
    const t = initConvexTest();
    await createKey(t, { tokenHash: "active_key" });

    const result = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_HOUR,
    });

    expect(result.deleted).toBe(0);
    expect(result.isDone).toBe(true);

    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(1);
  });

  test("deletes revoked keys past retention", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, { tokenHash: "revoked_key" });
    await revokeKey(t, created.keyId, past);

    const result = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_HOUR,
    });

    expect(result.deleted).toBe(1);
    expect(result.isDone).toBe(true);

    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(0);
  });

  test("does not delete revoked keys still within retention window", async () => {
    const t = initConvexTest();

    const created = await createKey(t, { tokenHash: "recent_revoked" });
    await revokeKey(t, created.keyId);

    const result = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_DAY * 30,
    });

    expect(result.deleted).toBe(0);
    expect(result.isDone).toBe(true);

    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(1);
  });

  test("deletes associated audit events alongside key", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, { tokenHash: "events_key" });
    await revokeKey(t, created.keyId, past);

    const eventsBefore = await t.query(api.lib.listKeyEvents, {
      keyId: created.keyId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(eventsBefore.page.length).toBeGreaterThan(0);

    await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_HOUR,
    });

    const eventsAfter = await t.query(api.lib.listKeyEvents, {
      keyId: created.keyId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(eventsAfter.page).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: sweep then cleanup
// ---------------------------------------------------------------------------

describe("sweep + cleanup lifecycle", () => {
  test("expired key is swept then retained until cleanup window passes", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    const created = await createKey(t, {
      tokenHash: "lifecycle_key",
      expiresAt: past,
    });

    // Sweep marks it as revoked
    const sweep = await t.mutation(internal.sweep.sweepExpired, {});
    expect(sweep.swept).toBe(1);

    const key = await getKey(t, created.keyId);
    expect(key.ok).toBe(true);
    if (key.ok) {
      expect(key.status).toBe("revoked");
    }

    // Cleanup with large retention — key was just revoked, not past retention
    const cleanup = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_DAY * 365,
    });
    expect(cleanup.deleted).toBe(0);

    // Key still exists
    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(1);
  });

  test("mixed: both sweeps mark their keys, cleanup deletes old revoked", async () => {
    const t = initConvexTest();
    const past = Date.now() - ONE_DAY * 2;

    // Expired key — will be swept by sweepExpired
    await createKey(t, {
      tokenHash: "mix_expired",
      expiresAt: past,
    });

    // Idle key — will be swept by sweepIdleExpired
    await createKey(t, {
      tokenHash: "mix_idle",
      maxIdleMs: ONE_HOUR,
      lastUsedAt: past,
    });

    // Manually revoked key — already revoked, will be deleted by cleanup
    const revokable = await createKey(t, { tokenHash: "mix_revoked" });
    await revokeKey(t, revokable.keyId, past);

    // Run both sweeps
    const expiredSweep = await t.mutation(internal.sweep.sweepExpired, {});
    expect(expiredSweep.swept).toBe(1);

    const idleSweep = await t.mutation(internal.sweep.sweepIdleExpired, {});
    expect(idleSweep.swept).toBe(1);

    // Cleanup — only the manually revoked key (revokedAt=past) is old enough
    const cleanup = await t.mutation(api.cleanup.cleanupExpired, {
      retentionMs: ONE_HOUR,
    });
    expect(cleanup.deleted).toBe(1);
    expect(cleanup.isDone).toBe(true);

    // Two swept keys remain (revoked but within retention)
    const keys = await listKeys(t);
    expect(keys.page).toHaveLength(2);
  });
});
