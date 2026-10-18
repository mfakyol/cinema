import { defineConfig } from "vitest/config";
import { TEST_ENV } from "./tests/test-env.js";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: TEST_ENV,
    globalSetup: "./tests/global-setup.ts",
    setupFiles: ["./tests/setup.ts"],
    // All files share one database and truncate it between tests.
    fileParallelism: false,
  },
});
