import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * The dashboard, signed in, at a desktop's width and a phone's: that it is the
 * workspace (its sections, or the one invitation for an account with
 * nothing), that its figures are numbers, that nothing runs off the side, and
 * that its actions open the shared forms and make nothing by being opened.
 *
 * It signs in as `library.spec.ts` does and needs the same account: see the
 * note at the top of that file. Without `E2E_CLERK_USER_EMAIL` it is skipped,
 * and says so. It reads only: it saves, records, and creates nothing, so it
 * holds whatever that account has in the development database.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe("the dashboard, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("is the workspace, fits the screen, and opens its forms without making anything", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    // A public page that loads Clerk; the helper signs in from there.
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome back/ })).toBeVisible();
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });

    const main = page.getByRole("main");
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

    // The old welcome screen's explainer is gone.
    await expect(main.getByText("How your workspace works")).toHaveCount(0);

    // Four figures, each a number: none is a sentence, and none is missing.
    const glance = main.getByRole("region", { name: "At a Glance" });
    for (const label of ["Sermon Ideas", "Point Ideas", "In Development", "Times Preached"]) {
      await expect(glance.getByText(label, { exact: true })).toBeVisible();
    }
    const figures = await glance.locator("dd").allTextContents();
    expect(figures).toHaveLength(4);
    for (const figure of figures) expect(figure).toMatch(/^\d+$/);
    await noOverflow();
    await testInfo.attach("dashboard", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    const invitation = main.getByRole("heading", { name: "Start with an idea" });
    if (await invitation.isVisible()) {
      // An account with nothing: the one invitation, and no empty panels.
      await expect(main.getByRole("button", { name: "Capture an idea" })).toBeVisible();
      await expect(main.getByRole("region", { name: "Continue Working" })).toHaveCount(0);
      return;
    }

    // Recording: the shared form, the sermon still to be chosen, and the dashboard still the page.
    const recordForm = page.getByRole("dialog", { name: "Record preaching" });
    await main.getByRole("button", { name: /^Record preaching/ }).click();
    await expect(recordForm.getByRole("searchbox", { name: "Sermon" })).toBeVisible();
    await noOverflow();
    await page.keyboard.press("Escape");
    await expect(recordForm).toBeHidden();

    // An outline: the overview's own picker. Leaving it makes none.
    const picker = page.getByRole("dialog", { name: "Create an outline" });
    await main.getByRole("button", { name: "Start or open outline" }).click();
    await expect(picker.getByRole("searchbox", { name: "Find a sermon" })).toBeVisible();
    await noOverflow();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);

    // A way on from each section that is shown.
    for (const [region, link] of [
      ["Revisit an Idea", /Open Sermon Ideas|See all that need attention/],
      ["Recent Ideas", /Open Sermon Ideas/],
      ["Recent Preaching", /Open Preaching Record/],
    ] as const) {
      const section = main.getByRole("region", { name: region });
      if (await section.count())
        await expect(section.getByRole("link", { name: link })).toBeVisible();
    }
    await expect(main.getByRole("region", { name: "Continue Working" })).toBeVisible();
  });
});
