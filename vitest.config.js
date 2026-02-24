import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["src/**/*.test.{ts,tsx}", "example/**/*.test.{ts,tsx}"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});
