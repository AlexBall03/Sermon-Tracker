import { defineConfig, devices } from "@playwright/test";

/*
 * Editor sessions in a real browser (A2.3B.3): tests/lab/editor-ownership.spec.ts.
 * No development server and no database: the spec bundles the session
 * modules itself and serves them, with a stand-in document server, on a
 * local origin. Run with `npm run test:e2e:ownership`.
 */
export default defineConfig({
  testDir: "./tests/lab",
  testMatch: "editor-ownership.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  timeout: 60_000,
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
