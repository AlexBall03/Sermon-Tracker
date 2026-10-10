import { defineConfig, devices } from "@playwright/test";

// The signed-in spec (tests/e2e/library.spec.ts) reads the development Clerk keys
// and E2E_CLERK_USER_EMAIL from the same file the application does. A machine
// without one (CI, a fresh clone) simply runs the guest specs.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: nothing to load.
}

// A dedicated port keeps e2e runs clear of a dev server on 3000.
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Playwright starts the production server and stops it when the run ends.
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
