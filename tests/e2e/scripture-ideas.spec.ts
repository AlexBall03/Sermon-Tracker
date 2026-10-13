import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * From the Bible to an idea and back, signed in. It needs what
 * `library.spec.ts` needs, and is skipped as that is without it:
 * `E2E_CLERK_USER_EMAIL` naming a user of the **development** Clerk instance
 * who has been admitted to the application. No password is involved, and a
 * production key is refused.
 *
 * It writes to that account, in the development database: one point idea,
 * titled with a prefix unique to the run, begun from 1 Chronicles 26:1–2 and
 * then given verse 4 as well. It deletes the idea when it finishes, and
 * touches no idea it did not make.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

// A chapter of gatekeepers' names: somewhere a test account is unlikely to have been reading.
const place = "/bible?book=13&chapter=26";

test.describe.configure({ mode: "serial" });

test.describe("Scripture and ideas, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  const verse = (page: Page, number: number) =>
    page.locator(`[data-reader-text] [data-verse="${number}"]`);
  const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selected Scripture" });
  const picker = (page: Page) => page.getByRole("dialog", { name: "Add to an idea" });

  async function signIn(page: Page) {
    // A public page that loads Clerk; the helper signs in from there.
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/dashboard");
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
  }

  async function openChapter(page: Page) {
    await page.goto(place);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 Chronicles 26");
    await expect(verse(page, 1)).toBeVisible();
  }

  /** Deletes the idea this run made, if it got as far as making it. */
  async function tidy(page: Page, title: string) {
    await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}`);
    const link = page.getByRole("link", { name: title });
    if (!(await link.isVisible())) return;
    await link.click();
    await page.getByRole("button", { name: "Delete idea" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^Delete/ })
      .click();
    await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
  }

  test("begin an idea from a passage, add to it, and go there and back", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const title = `E2E ${testInfo.project.name} ${Date.now()}`;

    await signIn(page);
    await openChapter(page);

    try {
      // A new point idea, begun from two verses. Nothing is saved until Save.
      await verse(page, 1).click();
      await verse(page, 2).click();
      await toolbar(page).getByRole("button", { name: "Add to an idea" }).click();
      await expect(picker(page)).toContainText("1 Chronicles 26:1–2");
      // The dialog is wholly inside the window, and nothing is pushed sideways.
      const size = page.viewportSize()!;
      const box = await picker(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );

      await picker(page).getByRole("button", { name: "New point idea" }).click();
      const capture = page.getByRole("dialog", { name: "Capture an idea" });
      await expect(capture.getByRole("radio", { name: "Point" })).toBeChecked();
      await expect(capture.getByRole("list", { name: "References" })).toContainText(
        "1 Chronicles 26:1–2",
      );
      await capture.getByRole("textbox", { name: "Idea" }).fill(title);
      await capture.getByRole("button", { name: "Save idea" }).click();
      await expect(capture).toBeHidden();
      // Still reading where the passage was chosen.
      await expect(page).toHaveURL(/\/bible\?book=13&chapter=26/);

      // An existing idea: found by name, among the point ideas, and given another verse.
      await toolbar(page).getByRole("button", { name: "Clear selection" }).click();
      await verse(page, 4).click();
      await toolbar(page).getByRole("button", { name: "Add to an idea" }).click();
      await picker(page).getByRole("searchbox", { name: "Search your ideas" }).fill(title);
      await picker(page).getByRole("radio", { name: "Points" }).check({ force: true });
      await picker(page)
        .getByRole("button", { name: `Add 1 Chronicles 26:4 to ${title}` })
        .click();
      await expect(picker(page)).toBeHidden();
      await expect(page.getByRole("status").filter({ hasText: title })).toBeVisible();

      // Asked again, it says the idea has it, and offers nothing to add.
      await toolbar(page).getByRole("button", { name: "Add to an idea" }).click();
      await picker(page).getByRole("searchbox", { name: "Search your ideas" }).fill(title);
      await expect(
        picker(page).getByRole("button", { name: `${title}: already has 1 Chronicles 26:4` }),
      ).toBeDisabled();
      await picker(page).getByRole("button", { name: "Close" }).click();

      // To the idea, which shows both references, closed until opened.
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}`);
      await page.getByRole("link", { name: title }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Point idea");
      const references = page.getByRole("list", { name: "References" });
      await expect(references.getByRole("listitem")).toHaveCount(2);
      const open = references.getByRole("button", {
        name: "1 Chronicles 26:1–2: show the passage",
      });
      await expect(open).toHaveAttribute("aria-expanded", "false");
      await open.click();
      await expect(references).toContainText("Meshelemiah");

      // From the idea to the passage: the chapter, the verses pointed out, and the way back.
      const ideaUrl = page.url();
      await page.getByRole("link", { name: "Open 1 Chronicles 26:1–2 in the Bible" }).click();
      await expect(page).toHaveURL(/\/bible\?book=13&chapter=26&verse=1&through=2&idea=/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 Chronicles 26");
      await expect(verse(page, 1)).toHaveAttribute("aria-current", "location");
      // Pointed out, and neither selected nor highlighted.
      await expect(verse(page, 1)).toHaveAttribute("aria-pressed", "false");
      await expect(toolbar(page)).toBeHidden();
      await page.getByRole("link", { name: `Back to ${title}` }).click();
      await expect(page).toHaveURL(ideaUrl.split("?")[0]);

      // The browser's own Back retraces the same steps.
      await page.goBack();
      await expect(page).toHaveURL(/\/bible\?book=13&chapter=26/);
      await page.goBack();
      await expect(page.getByRole("list", { name: "References" })).toBeVisible();
    } finally {
      await tidy(page, title);
    }
  });
});
