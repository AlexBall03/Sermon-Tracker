import { expect, test } from "@playwright/test";

import { asReturningVisitor } from "./returning-visitor";

// The loading screen has its own spec; here the page is tested without it.
test.beforeEach(({ context, baseURL }) => asReturningVisitor(context, baseURL));

/** Whether something comes true within a few seconds: for what depends on how the environment is set up. */
const within = (check: Promise<void>) =>
  check.then(
    () => true,
    () => false,
  );

/**
 * Guest behaviour only. These pass with or without Clerk keys in the build:
 * nothing here signs in, so they do not verify Clerk itself. Signed-in flows
 * are covered by mocked unit tests and the manual checklist in
 * docs/ENVIRONMENTS.md.
 */
test.describe("guests and application routes", () => {
  for (const path of [
    "/dashboard",
    "/admin",
    "/admin/anything",
    "/settings",
    "/library",
    "/library/00000000-0000-4000-8000-000000000000",
    "/library/sermon-ideas",
    "/library/saved-scripture",
    "/library/preaching-record",
    "/library/saved-scripture?q=grace&book=45&color=yellow",
    "/bible",
    "/bible?book=43&chapter=3&verse=16",
    "/bible?book=43&chapter=3&verse=16&through=18&idea=00000000-0000-4000-8000-000000000000",
  ]) {
    test(`${path} sends a guest to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in(\?|$)/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  }

  test("the landing page stays public", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "From First Thought to Finished Sermon." }),
    ).toBeVisible();
  });
});

test.describe("registration is by invitation", () => {
  test("there is no open sign-up form", async ({ page }) => {
    await page.goto("/accept-invitation");
    await expect(page.getByRole("heading", { name: "An invitation is required" })).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("the sign-in page says in words how to get back to the home page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the sign-in form is in Spanish for a visitor who reads Spanish", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale: "es-MX" });
    await asReturningVisitor(context, baseURL);
    const page = await context.newPage();
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /Back to home|Volver al inicio/ })).toBeVisible();
    // Spanish is the administrator's switch, and the form is Clerk's: both need a configured environment.
    const spanish = await within(
      expect(page.locator("html")).toHaveAttribute("lang", "es", { timeout: 5000 }),
    );
    const form = page.locator(".cl-signIn-root");
    const clerk = await within(expect(form).toBeVisible({ timeout: 10_000 }));
    test.skip(!spanish || !clerk, "Spanish or Clerk is not available here");
    await expect(page).toHaveTitle(/Iniciar sesión/);
    await expect(form.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
    await expect(form.getByRole("button", { name: /Continuar/ })).toBeVisible();
    await context.close();
  });

  test("the sign-in page does not link to registration", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /sign up|create account|register/i })).toHaveCount(
      0,
    );
  });
});

test.describe("access denied page", () => {
  test("renders in both themes without overflow", async ({ page }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/access-denied");
      await expect(page.getByRole("heading", { name: "You do not have access" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});

test("robots.txt keeps the new routes out of search", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  for (const path of ["/admin", "/accept-invitation", "/access-denied", "/sign-in", "/bible"]) {
    expect(body).toContain(`Disallow: ${path}`);
  }
});

test("the idea search answers a guest with nothing", async ({ request }) => {
  for (const path of ["/api/ideas/search", "/api/ideas/search?q=a&kind=sermon"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    // Refused outright or sent to sign in: either way, no idea is named.
    expect([401, 302, 303, 307, 308, 404]).toContain(response.status());
    expect(await response.text()).not.toContain('"items"');
  }
});
