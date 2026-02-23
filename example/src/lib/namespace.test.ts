import { describe, expect, test } from "vitest";
import { parseNamespace, toNamespace } from "./namespace";

describe("namespace helpers", () => {
  test("toNamespace composes workspace and environment", () => {
    expect(toNamespace("acme", "production")).toBe("acme:production");
    expect(toNamespace("acme", "testing")).toBe("acme:testing");
  });

  test("parseNamespace returns workspace and environment", () => {
    expect(parseNamespace("acme:production")).toEqual({
      workspace: "acme",
      environment: "production",
    });
  });

  test("parseNamespace rejects invalid format", () => {
    expect(parseNamespace("production")).toBeNull();
    expect(parseNamespace("acme:staging")).toBeNull();
  });
});
