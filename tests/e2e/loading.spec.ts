import { expect, test, type Page } from "@playwright/test";

/**
 * The loading screen and the progress bar, as a guest sees them. The splash
 * after signing in follows the same path (a signal from the proxy, read by
 * the page before it paints) and is covered by unit tests, since nothing here
 * signs in.
 *
 * Both wait for the page's `load` event, and how long that takes depends on
 * how busy the machine is: with every worker loading the landing page at once
 * it can be several seconds. So nothing here is timed against the clock on
 * the wall. What is checked is the order of events and the gaps between them,
 * measured inside the page, and the waits allow for a slow load up to the
 * point where the splash and the bar give up by design (8 and 15 seconds).
 */
const settles = { timeout: 20_000 };

type SplashLog = [state: string | null, at: number][];
declare global {
  interface Window {
    __splashLog?: SplashLog;
  }
}

/**
 * Notes, inside the page, the moment of every change to the splash's state.
 * "leaving" lasts under half a second, so a test that polled for it from
 * outside could look away and miss it; this cannot.
 */
async function recordSplash(page: Page) {
  await page.addInitScript(() => {
    const log: SplashLog = [];
    window.__splashLog = log;
    new MutationObserver(() => {
      log.push([document.documentElement.dataset.splash ?? null, performance.now()]);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-splash"] });
  });
}

test.describe("loading screen", () => {
  test("is shown on the first visit, then lifts and stays away", async ({ page }) => {
    await recordSplash(page);
    await page.goto("/", { waitUntil: "commit" });
    const html = page.locator("html");
    const splash = page.getByRole("status", { name: "Loading Sermon Tracker" });

    // It went up, and it lifts by itself. Read from the page's own record, so a
    // busy machine that looks late still sees what happened.
    await expect
      .poll(() => page.evaluate(() => window.__splashLog?.at(-1)?.[0]), settles)
      .toBeNull();
    expect(await page.evaluate(() => window.__splashLog?.[0]?.[0])).toBe("on");
    await expect(splash).toBeHidden();
    await expect(html).not.toHaveAttribute("data-splash");

    // "On" is what puts it on screen, over everything, with the name on it.
    await html.evaluate((root) => (root.dataset.splash = "on"));
    await expect(splash).toBeVisible();
    await expect(splash).toContainText("Sermon Tracker");
    await html.evaluate((root) => delete root.dataset.splash);
    await expect(splash).toBeHidden();

    // The page is there beneath it.
    await expect(
      page.getByRole("heading", { level: 1, name: "Capture. Develop. Preach." }),
    ).toBeVisible();

    // The signal was used once and is gone.
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "st_splash")).toBeUndefined();
    expect(cookies.find((cookie) => cookie.name === "st_seen")).toMatchObject({
      value: "guest",
      httpOnly: true,
    });

    // A reload, and a visit to another page, show no splash.
    await page.reload({ waitUntil: "commit" });
    await expect(page.locator("html")).not.toHaveAttribute("data-splash");
    await expect(splash).toBeHidden();
    await page.goto("/sign-in", { waitUntil: "commit" });
    await expect(splash).toBeHidden();
  });

  test("stays up long enough to be seen, and no longer than it needs", async ({ page }) => {
    await recordSplash(page);
    await page.goto("/", { waitUntil: "commit" });
    // Wait for the whole sequence to have happened, however long the page takes to load.
    // The record is read afterwards, so nothing depends on looking at the right moment.
    await expect
      .poll(() => page.evaluate(() => window.__splashLog?.at(-1)?.[0]), settles)
      .toBeNull();

    const { log, raisedAt, loadedAt } = await page.evaluate(() => ({
      log: window.__splashLog ?? [],
      raisedAt: window.__splashAt ?? 0,
      loadedAt:
        (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
          ?.loadEventStart ?? 0,
    }));
    // Up, then fading, then gone: once each, in that order.
    expect(log.map(([state]) => state)).toEqual(["on", "leaving", null]);
    const leftAt = log[1][1];
    const goneAt = log[2][1];

    // 1.8 seconds from the moment it went up; never cut short by a fast page.
    expect(leftAt - raisedAt).toBeGreaterThanOrEqual(1750);
    // It goes as soon as both that minimum and the page's load allow, not later.
    expect(loadedAt).toBeGreaterThan(0);
    expect(leftAt - Math.max(raisedAt + 1800, loadedAt)).toBeLessThan(1500);
    // The fade is 0.45 seconds.
    expect(goneAt - leftAt).toBeGreaterThanOrEqual(400);
    expect(goneAt - leftAt).toBeLessThan(1950);
  });
});

test.describe("progress bar", () => {
  test("runs while a page loads and rests once it has", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const bar = page.locator("[data-nav-progress]");
    // It arrives from the server already running.
    await expect(bar).toHaveAttribute("data-state", /loading|done/);
    await expect(bar).toHaveAttribute("data-state", "idle", settles);

    const box = await bar.boundingBox();
    expect(box?.y).toBe(0);
    expect(box?.height).toBe(1);
  });
});
