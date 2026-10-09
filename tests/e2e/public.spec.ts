import { expect, test, type Page } from "@playwright/test";

/** On small viewports the primary navigation sits behind the menu button. */
async function openMenuIfCollapsed(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
}

test.describe("public landing page", () => {
  test("renders the brand, tagline, and SEO metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Sermon Tracker/);
    await expect(page.getByRole("heading", { level: 1, name: "Sermon Tracker" })).toBeVisible();
    await expect(page.getByText("Capture. Develop. Preach.").first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://sermontracker.com",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
  });

  test("does not overflow horizontally", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("header sign-in leads to the interim sign-in page", async ({ page }) => {
    await page.goto("/");
    await openMenuIfCollapsed(page);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Sign in" })
      .click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign-in is not open yet" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("input")).toHaveCount(0);
  });

  test("skip link is the first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
  });

  test("header is a full-width fixed bar that does not cover the heading", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    const bar = (await header.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bar.x).toBe(0);
    expect(bar.y).toBe(0);
    expect(bar.width).toBe(viewport.width);

    const heading = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(bar.height);

    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect((await header.boundingBox())!.y).toBe(0);
  });

  test("mobile menu opens, closes with Escape, and returns focus", async ({ page }) => {
    await page.goto("/");
    const open = page.getByRole("button", { name: "Open menu" });
    test.skip(!(await open.isVisible()), "desktop shows the navigation inline");

    await open.click();
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "How it works" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav).toHaveCount(0);
    await expect(open).toBeFocused();
  });
});

test.describe("theme", () => {
  test("follows the system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("toggle switches theme and the choice persists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lightBackground = await background();

    await openMenuIfCollapsed(page);
    const themes = page.getByRole("radiogroup", { name: "Colour theme" });
    // No stored choice yet: the option matching the system preference is selected.
    await expect(themes.getByRole("radio", { name: "Light" })).toBeChecked();
    await expect(themes.getByRole("radio")).toHaveCount(2);

    await themes.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/dark/);
    expect(await background()).not.toBe(lightBackground);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // A manual choice wins over the system preference in both directions.
    await openMenuIfCollapsed(page);
    await themes.getByRole("radio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test("robots.txt keeps application routes out of search", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Sitemap: https://sermontracker.com/sitemap.xml");
});
