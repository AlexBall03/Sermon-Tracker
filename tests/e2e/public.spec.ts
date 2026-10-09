import { expect, test } from "@playwright/test";

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

    await page.getByRole("button", { name: "Toggle colour theme" }).click();
    await expect(html).toHaveClass(/dark/);
    expect(await background()).not.toBe(lightBackground);

    await page.reload();
    await expect(html).toHaveClass(/dark/);
  });
});

test("robots.txt keeps application routes out of search", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Sitemap: https://sermontracker.com/sitemap.xml");
});
