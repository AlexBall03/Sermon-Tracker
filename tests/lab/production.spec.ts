import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/*
 * PS-1A acceptance gate: the editor lab does not exist in a production build.
 * Run against `next build` + `next start` (playwright.lab.config.ts,
 * LAB_TARGET=production). Every /lab address must answer with an HTTP 404
 * status, to a guest and to a signed-in account alike, and must never show
 * the editor.
 */

const addresses = [
  "/lab",
  "/lab/",
  "/lab/editor",
  "/lab/editor/",
  "/lab/editor?fixture=stress",
  "/lab/persistence-probe",
  "/lab/anything/else",
];

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test("a guest gets 404 for every lab address", async ({ request }) => {
  for (const address of addresses) {
    // A trailing slash may be redirected first; where it ends must still be a 404.
    const response = await request.get(address);
    expect(response.status(), address).toBe(404);
    expect(await response.text(), address).not.toContain("lab-editor");
  }
});

test("a guest's browser shows no editor", async ({ page }) => {
  const response = await page.goto("/lab/editor");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("lab-editor")).toHaveCount(0);
});

test("the rest of the site still answers as before", async ({ request }) => {
  expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(200);
  expect((await request.get("/library", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
  expect((await request.get("/labs", { maxRedirects: 0 })).status()).toBe(404);
});

test.describe("signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run this.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in checks use the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("an active account gets 404 for every lab address too", async ({ page }) => {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    // Signed in: an application page answers.
    const dashboard = await page.goto("/dashboard");
    expect(dashboard?.status()).toBe(200);
    for (const address of addresses) {
      const response = await page.request.get(address);
      expect(response.status(), address).toBe(404);
    }
    const shown = await page.goto("/lab/editor");
    expect(shown?.status()).toBe(404);
    await expect(page.getByTestId("lab-editor")).toHaveCount(0);
  });
});
