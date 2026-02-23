import { describe, expect, test, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { ApiKeys } from "../index.js";
import { components, initConvexTest } from "./setup.test.js";
import type { OnInvalidateHookPayload } from "../types.js";
import type { RunMutationCtx, RunQueryCtx } from "../types.js";

describe("hooks", () => {
  test("runs onInvalidate hook after invalidate and refresh", async () => {
    const t = initConvexTest();
    const hookRef = {} as unknown as FunctionReference<
      "mutation",
      "internal",
      { event: OnInvalidateHookPayload },
      null
    >;
    const hookCalls: Array<OnInvalidateHookPayload> = [];

    const client = new ApiKeys<{ namespace: string }>(
      components.apiKeys,
      {},
    ).withHooks({ onInvalidate: hookRef });

    const mutationCtx: RunMutationCtx = {
      runMutation: (mutation, args) => {
        if (mutation === hookRef) {
          hookCalls.push(args.event);
          return Promise.resolve(null) as never;
        }
        return t.mutation(mutation, args);
      },
    };

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "hook target",
    });

    await client.invalidate(mutationCtx, {
      keyId: created.keyId,
      reason: "manual",
    });

    const created2 = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "hook rotate",
    });
    await client.refresh(mutationCtx, {
      keyId: created2.keyId,
      reason: "rotate",
    });

    expect(hookCalls.some((call) => call.trigger === "invalidate")).toBe(true);
    expect(hookCalls.some((call) => call.trigger === "refresh")).toBe(true);
  });

  test("client without onInvalidate does not fire hooks", async () => {
    const t = initConvexTest();
    const hookRef = {} as unknown as FunctionReference<
      "mutation",
      "internal",
      { event: OnInvalidateHookPayload },
      null
    >;
    const hookCalls: Array<OnInvalidateHookPayload> = [];

    const baseClient = new ApiKeys<{ namespace: string }>(
      components.apiKeys,
      {},
    );
    const hookedClient = new ApiKeys<{ namespace: string }>(
      components.apiKeys,
      {},
    ).withHooks({ onInvalidate: hookRef });

    const mutationCtx: RunMutationCtx = {
      runMutation: (mutation, args) => {
        if (mutation === hookRef) {
          hookCalls.push(args.event);
          return Promise.resolve(null) as never;
        }
        return t.mutation(mutation, args);
      },
    };

    const createdByBase = await baseClient.create(mutationCtx, {
      namespace: "team_alpha",
      name: "base client key",
    });
    await baseClient.invalidate(mutationCtx, {
      keyId: createdByBase.keyId,
      reason: "base",
    });
    expect(hookCalls).toHaveLength(0);

    const createdByHooked = await hookedClient.create(mutationCtx, {
      namespace: "team_alpha",
      name: "hooked client key",
    });
    await hookedClient.invalidate(mutationCtx, {
      keyId: createdByHooked.keyId,
      reason: "hooked",
    });
    expect(hookCalls.some((call) => call.trigger === "invalidate")).toBe(true);
  });

  test("swallows onInvalidate hook failures", async () => {
    const t = initConvexTest();
    const hookRef = {} as unknown as FunctionReference<
      "mutation",
      "internal",
      { event: OnInvalidateHookPayload },
      null
    >;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new ApiKeys<{ namespace: string }>(
      components.apiKeys,
      {},
    ).withHooks({ onInvalidate: hookRef });

    const mutationCtx: RunMutationCtx = {
      runMutation: (mutation, args) => {
        if (mutation === hookRef) {
          throw new Error("hook boom");
        }
        return t.mutation(mutation, args);
      },
    };
    const queryCtx: RunQueryCtx = {
      runQuery: (query, args) => t.query(query, args),
    };

    const created = await client.create(mutationCtx, {
      namespace: "team_alpha",
      name: "hook failure",
    });
    const result = await client.invalidate(mutationCtx, {
      keyId: created.keyId,
      reason: "manual",
    });

    expect(result.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith("[api-keys:system]", {
      message: "onInvalidate hook failed",
    });
    warnSpy.mockRestore();

    const validate = await client.validate(queryCtx, { token: created.token });
    expect(validate).toEqual({ ok: false, reason: "revoked" });
  });
});
