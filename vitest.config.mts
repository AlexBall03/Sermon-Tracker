import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside a React Server Components build.
      "server-only": fileURLToPath(new URL("./vitest.server-only.ts", import.meta.url)),
    },
  },
  test: {
    // A worker can reach about 1.3 GB (a jsdom file with in-memory databases), so the
    // default is two, never one per CPU. Whole runs go through the coordinator
    // (`npm run verify:unit`, docs/TESTING.md), which sets this from free memory.
    pool: "forks",
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Database tests start an in-memory PostgreSQL per test; allow for a busy machine.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
