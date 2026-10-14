import { expect, test, type Page } from "@playwright/test";

import { asReturningVisitor } from "./returning-visitor";

// The loading screen has its own spec; here the page is tested without it.
test.beforeEach(({ context, baseURL }) => asReturningVisitor(context, baseURL));

/** On small viewports the primary navigation sits behind the menu button. */
async function openMenuIfCollapsed(page: Page) {
  // The bar arrives with the page's language, a moment after the document does.
  await page.getByRole("banner").waitFor();
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
}

test.describe("public landing page", () => {
  test("renders the brand, headline, and SEO metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Sermon Tracker — Capture. Develop. Preach.");
    await expect(
      page.getByRole("heading", { level: 1, name: "From First Thought to Finished Sermon." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /outline them/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://sermontracker.com",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
  });

  test("shares one card: a 1200 × 630 image, the same for Open Graph and X", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const meta = (key: string) =>
      page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");

    expect(await meta("og:type")).toBe("website");
    expect(await meta("og:url")).toBe("https://sermontracker.com");
    expect(await meta("og:site_name")).toBe("Sermon Tracker");
    expect(await meta("og:title")).toBeTruthy();
    expect(await meta("og:description")).toBeTruthy();
    expect(await meta("og:image:width")).toBe("1200");
    expect(await meta("og:image:height")).toBe("630");
    expect(await meta("og:image:type")).toBe("image/png");
    expect(await meta("og:image:alt")).toContain("Sermon Tracker");
    expect(await meta("twitter:card")).toBe("summary_large_image");
    expect(await meta("twitter:title")).toBeTruthy();
    expect(await meta("twitter:description")).toBeTruthy();

    // Absolute, on the production origin, and the same image for both.
    const image = (await meta("og:image")) ?? "";
    expect(image).toMatch(/^https:\/\/sermontracker\.com\/opengraph-image\.png/);
    expect(await meta("twitter:image")).toBe(image);

    // Served here as it will be there: a PNG, publicly, with no session.
    const response = await request.get(new URL(image).pathname + new URL(image).search);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const bytes = await response.body();
    // A PNG's own header gives its size: width and height at bytes 16 and 20.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  test("does not overflow horizontally", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("shows the dashboard for the device: a window on a wide screen, a phone on a narrow one", async ({
    page,
  }) => {
    await page.goto("/");
    const wide = page.viewportSize()!.width >= 768;
    await expect(page.locator('[data-hero="window"]')).toBeVisible({ visible: wide });
    await expect(page.locator('[data-hero="phone"]')).toBeVisible({ visible: !wide });
    // Whichever is shown is described once, and holds nothing to tab to.
    await expect(page.locator("figure [aria-hidden] :is(a, button, input)")).toHaveCount(0);
    await expect(page.getByText(/The Sermon Tracker dashboard on a/)).toHaveCount(2);
  });

  test("its screens stay inside the page down to the footer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("section links lead to their sections", async ({ page }) => {
    await page.goto("/");
    for (const [name, id] of [
      ["Features", "features"],
      ["How It Works", "how-it-works"],
      ["Mobile App", "mobile-app"],
    ]) {
      await openMenuIfCollapsed(page);
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });

  test("sections arrive as they are scrolled to, and stay", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reveal", "on");
    const closing = page.locator("#access .reveal");
    await expect(closing).not.toHaveAttribute("data-shown");
    await page.locator("#access").scrollIntoViewIfNeeded();
    await expect(closing).toHaveAttribute("data-shown");
    await expect(closing).toHaveCSS("opacity", "1");
  });

  test("with reduced motion every section is simply there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const hidden = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll(".reveal")).filter(
          (element) => getComputedStyle(element).opacity !== "1",
        ).length,
    );
    expect(hidden).toBe(0);
    await expect(page.locator(".reveal")).not.toHaveCount(0);
  });

  test("is written in Spanish for a visitor who reads Spanish", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: "es-MX" });
    await asReturningVisitor(context, baseURL);
    const page = await context.newPage();
    await page.goto("/");
    // Spanish is the administrator's switch, read from the database: with none, the page is English.
    const spanish = await expect(page.locator("html"))
      .toHaveAttribute("lang", "es", { timeout: 5000 })
      .then(
        () => true,
        () => false,
      );
    test.skip(!spanish, "Spanish is switched off or no database is configured");
    await expect(
      page.getByRole("heading", { level: 1, name: "Del primer pensamiento al sermón terminado." }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });

  test("header sign-in leads to the sign-in page", async ({ page }) => {
    await page.goto("/");
    await openMenuIfCollapsed(page);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Sign In" })
      .click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
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
    await expect(nav.getByRole("link", { name: "How It Works" })).toBeVisible();
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
    const themes = page.getByRole("radiogroup", { name: "Color theme" });
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

test("an address nothing answers to says so, and offers the way home", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to home page" })).toHaveAttribute("href", "/");
});

test("robots.txt keeps application routes out of search", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Sitemap: https://sermontracker.com/sitemap.xml");
});
