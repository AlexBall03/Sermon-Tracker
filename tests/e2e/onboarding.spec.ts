import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { asNewAccount } from "./onboarding-account";

/**
 * Account setup, signed in: a new account's first sign-in, and an account
 * that owes no setup going through the steps again from Settings.
 *
 * It uses the same development account as the other signed-in specs (see the
 * note at the top of library.spec.ts); without `E2E_CLERK_USER_EMAIL` every
 * test here is skipped. That account owes no setup, so for the length of this
 * spec it is made one that does, and put back exactly as it was afterwards
 * (onboarding-account.ts, which refuses any database but development's).
 *
 * While this runs, the account is sent to setup from every page, so every
 * other signed-in spec would fail. Run it by itself and one test at a time:
 *
 *   npx playwright test onboarding --workers=1
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("account setup, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  let restore: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
    restore = await asNewAccount(email ?? "");
  });

  test.afterAll(async () => {
    await restore?.();
  });

  const run = `E2E ${Date.now().toString(36)}`;
  const church = `${run} Church`;

  const step = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });
  // After a link, the page that was left is kept in the document, hidden, with fields of the same name.
  const field = (page: Page, name: string) => page.getByLabel(name).filter({ visible: true });
  const attendance = (page: Page) =>
    page.getByRole("switch", { name: "I attend preaching class" }).filter({ visible: true });
  const fits = async (page: Page) =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

  async function signIn(page: Page) {
    // A public page that loads Clerk; the helper signs in from there.
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
  }

  async function afterSplash(page: Page) {
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
  }

  test("a new account is taken through setup before anything else", async ({ page }) => {
    await signIn(page);

    // The dashboard, and any other page asked for directly, lead to setup.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
    await afterSplash(page);
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    for (const address of ["/library/sermon-ideas", "/outlines", "/bible", "/settings", "/admin"]) {
      await page.goto(address);
      await expect(page).toHaveURL(/\/onboarding$/);
    }
    // And what the pages read from is closed too.
    expect((await page.request.get("/api/ideas/search?q=a")).status()).toBe(401);
    await expect(page.getByRole("link", { name: "Exit setup" })).toHaveCount(0);
    await fits(page);

    // Welcome asks for nothing.
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(step(page, "Your church and ministry")).toBeVisible();
    await fits(page);

    await field(page, "Church name (optional)").fill(church);
    await field(page, "Ministry role (optional)").fill("Preaching student");
    await attendance(page).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(step(page, "Your preferences")).toBeVisible();
    await fits(page);

    // Closing the browser here loses nothing: the step and what was saved are found again.
    await page.reload();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await expect(step(page, "Your preferences")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(field(page, "Church name (optional)")).toHaveValue(church);
    await expect(field(page, "Ministry role (optional)")).toHaveValue("Preaching student");
    await expect(attendance(page)).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(step(page, "Your preferences")).toBeVisible();

    // The theme is the browser's own.
    const appearance = page.getByRole("group", { name: "Appearance" });
    await appearance.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await appearance.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Where Spanish is on offer, choosing it rewrites the wizard at once, and back again.
    const language = page.getByRole("group", { name: "Interface language" });
    if (await language.isVisible()) {
      await language.getByText("Español", { exact: true }).click();
      await expect(step(page, "Tus preferencias")).toBeVisible();
      await expect(page.getByText("Paso 3 de 4")).toBeVisible();
      await page
        .getByRole("group", { name: "Idioma de la interfaz" })
        .getByText("English", { exact: true })
        .click();
      await expect(step(page, "Your preferences")).toBeVisible();
    }

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(step(page, "You are all set")).toBeVisible();
    await fits(page);

    // Still held to setup until the last button is pressed.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText("Step 4 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Open Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The dashboard invites the new account to take the tour, and starts nothing by itself.
    const invitation = page.getByRole("region", { name: "Take a quick tour" });
    await expect(invitation).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await fits(page);
    // Maybe Later is kept: a reload does not ask again.
    await invitation.getByRole("button", { name: "Maybe Later" }).click();
    await expect(invitation).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Take a quick tour" })).toHaveCount(0);

    // The application is open, and what setup saved is in Settings.
    await page.goto("/library/sermon-ideas");
    await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
    await page.goto("/settings");
    await expect(field(page, "Church name (optional)")).toHaveValue(church);
    await expect(attendance(page)).toBeChecked();
  });

  test("an account that finished can go through the steps again and leave", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await afterSplash(page);
    await page.getByRole("link", { name: "Run Account Setup" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await fits(page);

    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(field(page, "Church name (optional)")).toHaveValue(church);
    await field(page, "Ministry role (optional)").fill("Evangelist");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(step(page, "Your preferences")).toBeVisible();

    // Leaving part-way keeps what was deliberately saved, and takes nothing away.
    await page.getByRole("link", { name: "Exit setup" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(field(page, "Ministry role (optional)")).toHaveValue("Evangelist");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/onboarding");
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.goto("/library/sermon-ideas");
    await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
    // Going through setup again does not bring the tour's invitation back.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Take a quick tour" })).toHaveCount(0);
  });
});
