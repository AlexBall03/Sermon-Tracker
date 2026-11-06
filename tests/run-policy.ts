import { devices } from "@playwright/test";

/*
 * What every Playwright configuration shares about running (docs/TESTING.md):
 * how many browsers at once, where each run's artifacts go, and which browser
 * engine draws the desktop project. The verification coordinator sets these
 * through the environment; a run without it gets the defaults.
 */

/** Workers: PW_WORKERS, or the configuration's own default. */
export function workers(fallback: number) {
  const n = Number(process.env.PW_WORKERS);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Artifacts: PW_OUTPUT_DIR, or a folder of the configuration's own, never one shared. */
export function outputDir(name: string) {
  return process.env.PW_OUTPUT_DIR ?? `test-results/${name}`;
}

/**
 * The desktop project's device: Chrome, or Firefox or WebKit when PW_BROWSER
 * names one, for a screen check. The project keeps its name, so the specs'
 * own choices of what runs at desktop size still hold. The phone project is
 * always Chromium (Playwright emulates a phone only there).
 */
export function desktopDevice() {
  const engine = process.env.PW_BROWSER;
  if (engine === "firefox") return devices["Desktop Firefox"];
  if (engine === "webkit") return devices["Desktop Safari"];
  if (engine && engine !== "chromium") throw new Error(`PW_BROWSER: unknown browser ${engine}`);
  return devices["Desktop Chrome"];
}
