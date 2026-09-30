// vitest.config.ts — V19 (Step 2): unit tests for the pure logic in lib/.
//
// Node environment on purpose: these tests cover date / PR / badge rules that
// must not depend on React Native. The "@/" alias mirrors tsconfig's paths so
// tests can import modules the same way app code does.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
