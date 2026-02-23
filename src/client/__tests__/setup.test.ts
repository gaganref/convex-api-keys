/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
import {
  defineSchema,
  type GenericSchema,
  type SchemaDefinition,
  componentsGeneric,
} from "convex/server";
import type { ComponentApi } from "../../component/_generated/component.js";
import componentSchema from "../../component/schema.js";
import { register } from "../../test.js";

export const modules = import.meta.glob("../**/*.*s");
export const componentModules = import.meta.glob("../../component/**/*.ts");

export { componentSchema };

export const components = componentsGeneric() as unknown as {
  apiKeys: ComponentApi;
};

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema?: Schema) {
  const t = convexTest(schema ?? defineSchema({}), modules);
  register(t);
  return t;
}

test("setup", () => {});
