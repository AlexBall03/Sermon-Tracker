import { defineConfig, devices } from "@playwright/test";

/*
 * The editor lab's end-to-end tests (PS-1A), apart from the main suite, whose
 * configuration (playwright.config.ts) is unchanged and does not see them:
 * they live in tests/lab, outside its tests/e2e.
 *
 *   npm run test:e2e:lab        playwright.lab.config.ts: the lab (and, since
 *                               PS-1B.2B.1, its Print Layout) on a
 *                               development server (port 3200, or an
 *                               existing one named by LAB_BASE_URL), signed
 *                               in, at desktop and phone sizes
 *   npm run test:e2e:lab:prod   playwright.lab-prod.config.ts: a local
 *                               production build (port 3300), proving every
 *                               /lab address is a 404
 *
 * The production build runs `next build` directly, never `npm run build`, and
 * the development server is `next dev`, never `npm run dev`: no test run
 * migrates a database. Signed-in tests use the development Clerk instance only
 * (see tests/e2e/library.spec.ts). The verification coordinator
 * (docs/TESTING.md) starts the servers itself and names them in LAB_BASE_URL
 * and E2E_BASE_URL.
 */
import { desktopDevice, outputDir } from "../run-policy";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the signed-in tests skip themselves.
}

export function labConfig({ production }: { production: boolean }) {
  const port = production ? 3300 : 3200;
  // Next runs one development server per folder; one already running can be named instead.
  const existing = production ? process.env.E2E_BASE_URL : process.env.LAB_BASE_URL;
  const baseURL = existing ?? `http://localhost:${port}`;

  return defineConfig({
    testMatch: production
      ? "production.spec.ts"
      : /(editor|pagination|typography|v4|navigation|persistence-probe|preset-parity|appearance-levels|print-workspace|header-footer|print-color)\.spec\.ts$/,
    // One development server and one browser: the lab's pages are heavy, and its
    // specs share the signed-in test account.
    fullyParallel: false,
    workers: 1,
    outputDir: outputDir(production ? "lab-prod" : "lab"),
    forbidOnly: !!process.env.CI,
    reporter: "list",
    timeout: 90_000,
    use: { baseURL, trace: "retain-on-failure" },
    projects: production
      ? [{ name: "production", use: { ...devices["Desktop Chrome"] } }]
      : [
          { name: "desktop", use: { ...desktopDevice() } },
          { name: "mobile", use: { ...devices["Pixel 7"] } },
        ],
    webServer: existing
      ? undefined
      : production
        ? {
            command: `npx next build && npx next start --port ${port}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 600_000,
          }
        : {
            command: `npx next dev --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 240_000,
          },
  });
}
