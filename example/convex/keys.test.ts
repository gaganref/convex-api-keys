/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("keys", () => {
  test("createKey creates a key and listKeys returns it", async () => {
    const t = initConvexTest();

    const created = await t.mutation(api.keys.createKey, {
      workspace: "acme",
      environment: "production",
      name: "Backend Server",
      permissions: ["events:write", "reports:read"],
      ttlDays: null,
      idleTimeoutMs: null,
    });

    expect(created.keyId).toBeTypeOf("string");
    expect(created.token).toMatch(/^sk_/);

    const listed = await t.query(api.keys.listKeys, {
      workspace: "acme",
      environment: "production",
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
    });

    const row = listed.page.find((entry) => entry.keyId === created.keyId);
    expect(row).toBeDefined();
    expect(row?.name).toBe("Backend Server");
    expect(row?.status).toBe("active");
    expect(row?.permissions).toEqual(["events:write", "reports:read"]);
  });

  test("revokeKey revokes active key and records revoked event", async () => {
    const t = initConvexTest();

    const created = await t.mutation(api.keys.createKey, {
      workspace: "acme",
      environment: "testing",
      name: "Worker",
      permissions: ["events:write"],
      ttlDays: null,
      idleTimeoutMs: null,
    });

    const revoked = await t.mutation(api.keys.revokeKey, {
      workspace: "acme",
      environment: "testing",
      keyId: created.keyId,
      reason: "manual_revoke",
    });

    expect(revoked.ok).toBe(true);

    const keys = await t.query(api.keys.listKeys, {
      workspace: "acme",
      environment: "testing",
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
    });
    expect(
      keys.page.find((entry) => entry.keyId === created.keyId)?.status,
    ).toBe("revoked");

    const events = await t.query(api.keys.listKeyEvents, {
      workspace: "acme",
      environment: "testing",
      keyId: created.keyId,
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
    });
    expect(events.page.some((event) => event.type === "revoked")).toBe(true);
  });

  test("rotateKey returns new token and revokes old key", async () => {
    const t = initConvexTest();

    const created = await t.mutation(api.keys.createKey, {
      workspace: "acme",
      environment: "production",
      name: "Edge Processor",
      permissions: ["events:write"],
      ttlDays: null,
      idleTimeoutMs: null,
    });

    const rotated = await t.mutation(api.keys.rotateKey, {
      workspace: "acme",
      environment: "production",
      keyId: created.keyId,
      reason: "scheduled_rotation",
    });

    expect(rotated.ok).toBe(true);
    if (!rotated.ok) {
      return;
    }

    expect(rotated.keyId).not.toBe(created.keyId);
    expect(rotated.replacedKeyId).toBe(created.keyId);
    expect(rotated.token).toMatch(/^sk_/);

    const keys = await t.query(api.keys.listKeys, {
      workspace: "acme",
      environment: "production",
      paginationOpts: {
        numItems: 50,
        cursor: null,
      },
    });

    const oldKey = keys.page.find((entry) => entry.keyId === created.keyId);
    const newKey = keys.page.find((entry) => entry.keyId === rotated.keyId);
    expect(oldKey?.status).toBe("revoked");
    expect(newKey?.status).toBe("active");
  });

  test("revokeKey returns revoked when key already revoked", async () => {
    const t = initConvexTest();

    const created = await t.mutation(api.keys.createKey, {
      workspace: "acme",
      environment: "testing",
      name: "Already Revoked",
      permissions: ["reports:read"],
      ttlDays: null,
      idleTimeoutMs: null,
    });

    await t.mutation(api.keys.revokeKey, {
      workspace: "acme",
      environment: "testing",
      keyId: created.keyId,
      reason: "first_revoke",
    });

    const second = await t.mutation(api.keys.revokeKey, {
      workspace: "acme",
      environment: "testing",
      keyId: created.keyId,
      reason: "second_revoke",
    });

    expect(second).toEqual({ ok: false, reason: "revoked" });
  });
});
