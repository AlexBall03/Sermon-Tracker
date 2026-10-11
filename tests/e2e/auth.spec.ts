import { expect, test } from "@playwright/test";

import { asReturningVisitor } from "./returning-visitor";

// The loading screen has its own spec; here the page is tested without it.
test.beforeEach(({ context, baseURL }) => asReturningVisitor(context, baseURL));

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
    "/bible",
    "/bible?book=43&chapter=3&verse=16",
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
      page.getByRole("heading", { level: 1, name: "Capture. Develop. Preach." }),
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
