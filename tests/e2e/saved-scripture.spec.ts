import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Favorites and highlights, signed in: in the Bible reader, and in the
 * library's Saved Scripture section. It needs what `library.spec.ts` needs,
 * and is skipped as that is without it: `E2E_CLERK_USER_EMAIL` naming a user
 * of the **development** Clerk instance who has been admitted to the
 * application. No password is involved, and a production key is refused.
 *
 * It writes to that account, in the development database: highlights on the
 * first verses of 1 Chronicles 26, and one favorite of them, labelled with a
 * prefix unique to the run. It takes all of it away again when it finishes.
 * If the account already has marks on those verses, the test leaves them
 * alone and is skipped: it never changes what it did not make.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

// A chapter of gatekeepers' names: somewhere a test account is unlikely to have been reading.
const place = "/bible?book=13&chapter=26";
const passage = "1 Chronicles 26:1–2";

test.describe.configure({ mode: "serial" });

test.describe("saved Scripture, signed in", () => {
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
  const picker = (page: Page) => page.getByRole("group", { name: "Highlight color" });

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

  /** The chapter, with the account's marks arrived. */
  async function openChapter(page: Page) {
    const marks = page.waitForResponse((response) => response.url().endsWith("/marks"));
    await page.goto(place);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 Chronicles 26");
    await expect(verse(page, 1)).toBeVisible();
    await marks;
  }

  async function select(page: Page, numbers: number[]) {
    if (await toolbar(page).isVisible()) {
      await toolbar(page).getByRole("button", { name: "Clear selection" }).click();
    }
    for (const number of numbers) await verse(page, number).click();
    await expect(toolbar(page)).toBeVisible();
  }

  async function highlight(page: Page, numbers: number[], color: string | null) {
    await select(page, numbers);
    await toolbar(page)
      .getByRole("button", { name: /^Highlight/ })
      .click();
    if (color) await picker(page).getByRole("button", { name: color }).click();
    else await page.getByRole("button", { name: "Remove highlight" }).click();
  }

  /** Takes away whatever this run may have left: the highlights, then the favorite. */
  async function tidy(page: Page, label: string) {
    await openChapter(page);
    for (const number of [1, 2]) {
      if ((await verse(page, number).getAttribute("data-highlight")) !== null) {
        const saved = page.waitForResponse((response) => response.request().method() === "POST");
        await highlight(page, [number], null);
        await saved;
      }
    }
    await page.goto(`/library/scripture?q=${encodeURIComponent(label)}`);
    const remove = page.getByRole("button", { name: `Remove ${label}` });
    if (await remove.isVisible()) {
      await remove.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
      await expect(remove).toBeHidden();
    }
  }

  test("highlight, favorite, find it in the library, and take it all away again", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const label = `E2E ${testInfo.project.name} ${Date.now()}`;

    await signIn(page);
    await openChapter(page);

    // Never touch marks the account already had here.
    const marked = await page
      .locator(
        '[data-reader-text] [data-verse="1"][data-highlight], [data-reader-text] [data-verse="1"][data-favorite], [data-reader-text] [data-verse="2"][data-highlight], [data-reader-text] [data-verse="2"][data-favorite]',
      )
      .count();
    test.skip(marked > 0, "The test account already has marks on 1 Chronicles 26:1–2.");

    try {
      // Nothing is offered until something is selected.
      await expect(toolbar(page)).toBeHidden();

      // Two verses, one color, one action.
      await highlight(page, [1, 2], "Green");
      await expect(verse(page, 1)).toHaveAttribute("data-highlight", "green");
      await expect(verse(page, 2)).toHaveAttribute("data-highlight", "green");
      await expect(verse(page, 3)).not.toHaveAttribute("data-highlight", /.+/);
      // Selected and highlighted at once, and the toolbar is wholly inside the window.
      await expect(verse(page, 1)).toHaveAttribute("aria-pressed", "true");
      const box = await toolbar(page).boundingBox();
      const size = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );

      // It is kept: a reload brings it back, and so does another chapter and a return.
      await openChapter(page);
      await expect(verse(page, 1)).toHaveAttribute("data-highlight", "green");
      await page.getByRole("button", { name: "Next chapter" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 Chronicles 27");
      await page.getByRole("button", { name: "Previous chapter" }).click();
      await expect(verse(page, 2)).toHaveAttribute("data-highlight", "green");

      // One color to a verse: blue replaces green on verse 2 alone.
      await highlight(page, [2], "Blue");
      await expect(verse(page, 2)).toHaveAttribute("data-highlight", "blue");
      await expect(verse(page, 1)).toHaveAttribute("data-highlight", "green");

      // A mixed selection says so.
      await select(page, [1, 2]);
      await toolbar(page).getByRole("button", { name: "Highlight: mixed" }).click();
      await expect(page.getByText(/These verses are green and blue/)).toBeVisible();
      await page.keyboard.press("Escape");

      // Save the two verses as one favorite, with one click.
      await toolbar(page).getByRole("button", { name: "Add to favorites" }).click();
      await expect(page.getByText(`Saved ${passage}.`)).toBeVisible();
      await expect(verse(page, 1)).toHaveAttribute("data-favorite", "");
      await expect(verse(page, 2)).toHaveAttribute("data-favorite", "");

      // The same selection is not saved twice: the button opens the one there is.
      await toolbar(page).getByRole("button", { name: "Saved. Manage this favorite" }).click();
      const editor = page.getByRole("dialog", { name: "Saved passage" });
      await expect(editor.getByRole("textbox", { name: "Passage" })).toHaveValue(passage);
      await editor.getByRole("textbox", { name: /^Label/ }).fill(label);
      await editor.getByRole("textbox", { name: /^Notes/ }).fill("Written by the end-to-end test.");
      await editor.getByRole("button", { name: "Save" }).click();
      await expect(editor).toBeHidden();

      // The library holds it, in a section of its own that is not in the main navigation.
      await page
        .getByRole("link", { name: "Library", exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Saved Scripture" })).toHaveCount(1);
      await page
        .getByRole("navigation", { name: "Library sections" })
        .getByRole("link", { name: "Saved Scripture" })
        .click();
      await expect(page).toHaveURL(/\/library\/scripture$/);

      // Found by its label, by its reference, and by its book; the address says what was asked.
      const results = page.getByRole("list", { name: "Your saved Scripture" });
      await page.getByRole("searchbox", { name: "Search saved Scripture" }).fill(label);
      await expect(page).toHaveURL(/\/library\/scripture\?q=E2E/);
      await expect(results.getByRole("listitem")).toHaveCount(1);
      const card = results.getByRole("listitem").first();
      await expect(card).toContainText(label);
      await expect(card).toContainText("Written by the end-to-end test.");
      await expect(card).toContainText("Green, Blue");
      await expect(card.getByRole("link", { name: new RegExp(passage) })).toHaveAttribute(
        "href",
        "/bible?book=13&chapter=26&verse=1",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );

      // A color the passage does not have filters it out; Back brings it back.
      await page
        .getByRole("group", { name: "Highlight color" })
        .getByRole("button", { name: "Red" })
        .click();
      await expect(page).toHaveURL(/color=red/);
      await expect(
        page.getByRole("heading", { name: "No passages match these filters" }),
      ).toBeVisible();
      await page.goBack();
      await expect(results.getByRole("listitem")).toHaveCount(1);

      // Change the passage it holds, from the library.
      await card.getByRole("button", { name: `Edit ${label}` }).click();
      await editor.getByRole("textbox", { name: "Passage" }).fill("1 Chronicles 26:1");
      await editor.getByRole("button", { name: "Save" }).click();
      await expect(editor).toBeHidden();
      await expect(card).toContainText("1 Chronicles 26:1");
      await expect(card).not.toContainText(passage);

      // Remove it, after being asked. The highlights are not its to take.
      await card.getByRole("button", { name: `Remove ${label}` }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText("Highlights on these verses stay");
      await confirm.getByRole("button", { name: "Remove" }).click();
      await expect(
        page.getByRole("heading", { name: /No passages match|No Scripture saved/ }),
      ).toBeVisible();

      await openChapter(page);
      await expect(verse(page, 1)).not.toHaveAttribute("data-favorite", "");
      await expect(verse(page, 1)).toHaveAttribute("data-highlight", "green");
      await expect(verse(page, 2)).toHaveAttribute("data-highlight", "blue");

      // And a highlight is removed without a trace.
      await highlight(page, [1, 2], null);
      await expect(verse(page, 1)).not.toHaveAttribute("data-highlight", /.+/);
      await expect(verse(page, 2)).not.toHaveAttribute("data-highlight", /.+/);
    } finally {
      await tidy(page, label).catch(() => {});
    }
  });
});
