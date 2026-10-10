import { expect, test } from "@playwright/test";

/**
 * The loading screen and the progress bar, as a guest sees them. The splash
 * after signing in follows the same path (a signal from the proxy, read by
 * the page before it paints) and is covered by unit tests, since nothing here
 * signs in.
 */
test.describe("loading screen", () => {
  test("is shown on the first visit, then lifts and stays away", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const splash = page.getByRole("status", { name: "Loading Sermon Tracker" });
    await expect(splash).toBeVisible();
    await expect(splash).toContainText("Sermon Tracker");
    await expect(page.locator("html")).toHaveAttribute("data-splash", "on");

    // It lifts by itself, and the page is there beneath it.
    await expect(splash).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-splash");
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

  test("stays up long enough to be seen", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-splash", "on");
    const raisedAt = await page.evaluate(() => window.__splashAt ?? 0);
    await expect(html).toHaveAttribute("data-splash", "leaving");
    const leftAt = await page.evaluate(() => performance.now());
    // 1.8 seconds from the moment it went up; never cut short by a fast page.
    expect(leftAt - raisedAt).toBeGreaterThanOrEqual(1750);
    expect(leftAt - raisedAt).toBeLessThan(4000);
  });
});

test.describe("progress bar", () => {
  test("runs while a page loads and rests once it has", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const bar = page.locator("[data-nav-progress]");
    // It arrives from the server already running.
    await expect(bar).toHaveAttribute("data-state", /loading|done/);
    await expect(bar).toHaveAttribute("data-state", "idle");

    const box = await bar.boundingBox();
    expect(box?.y).toBe(0);
    expect(box?.height).toBe(1);
  });
});
