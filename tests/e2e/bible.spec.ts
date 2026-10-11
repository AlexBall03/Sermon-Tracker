import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Bible reader, signed in. It needs what `library.spec.ts` needs, and is
 * skipped as that is without it: `E2E_CLERK_USER_EMAIL` naming a user of the
 * **development** Clerk instance who has been admitted to the application.
 * No password is involved, and a production key is refused.
 *
 * It reads only shared Bible text and writes nothing to the database. The one
 * thing it leaves behind is in the test browser's own storage, which goes
 * with the browser.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("Bible reader, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  const heading = (page: Page) => page.getByRole("heading", { level: 1 });
  const verse = (page: Page, number: number) => page.locator(`[data-verse="${number}"]`);
  const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selected Scripture" });

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

  /** The navigation: the sidebar where the window is wide, a sheet where it is not. */
  async function navigation(page: Page, mobile: boolean) {
    if (!mobile) return page.getByRole("complementary", { name: "Bible navigation" });
    const sheet = page.getByRole("dialog", { name: "Bible" });
    if (!(await sheet.isVisible())) {
      await page.getByRole("button", { name: "Browse and search the Bible" }).click();
    }
    await expect(sheet).toBeVisible();
    return sheet;
  }

  test("read, select, copy, search, move about, and come back to the same place", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    const mobile = testInfo.project.name === "mobile";
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

    await signIn(page);

    // Open the Bible from the application's own navigation: nothing remembered yet, so Genesis 1.
    await page.getByRole("link", { name: "Bible", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/bible\?book=1&chapter=1$/);
    await expect(heading(page)).toHaveText("Genesis 1");
    await expect(verse(page, 1)).toContainText("In the beginning God created");
    await expect(page.getByRole("button", { name: "Previous chapter" })).toBeDisabled();

    // To John 3, by book and chapter.
    let nav = await navigation(page, mobile);
    await nav.getByRole("button", { name: "John", exact: true }).click();
    await nav.getByRole("button", { name: "John 3", exact: true }).click();
    await expect(page).toHaveURL(/\/bible\?book=43&chapter=3$/);
    await expect(heading(page)).toHaveText("John 3");
    if (mobile) await expect(page.getByRole("dialog", { name: "Bible" })).toBeHidden();

    // Nothing is selected until a verse is chosen.
    await expect(toolbar(page)).toBeHidden();
    await verse(page, 16).click();
    await expect(verse(page, 16)).toHaveAttribute("aria-pressed", "true");
    await expect(toolbar(page)).toContainText("John 3:16");

    // Verses that are apart stay apart.
    for (const number of [3, 5, 6, 8]) await verse(page, number).click();
    await verse(page, 16).click();
    await expect(toolbar(page)).toContainText("John 3:3, 5–6, 8");
    // The toolbar is wholly inside the window.
    const box = await toolbar(page).boundingBox();
    const size = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);

    await toolbar(page).getByRole("button", { name: "Copy reference" }).click();
    expect(await clipboard()).toBe("John 3:3, 5–6, 8");
    await toolbar(page).getByRole("button", { name: "Copy text" }).click();
    const text = await clipboard();
    expect(text).toMatch(/^John 3:3, 5–6, 8 \(KJV\)\r?\n3 Jesus answered and said unto him/);
    // Dots stand where verses were passed over, and those verses are not there.
    expect(text.split(/\r?\n/).filter((line) => line === "...")).toHaveLength(2);
    expect(text).not.toMatch(/\n4 /);
    expect(text).not.toMatch(/\n7 /);
    await toolbar(page).getByRole("button", { name: "Clear selection" }).click();
    await expect(toolbar(page)).toBeHidden();

    // The keyboard's copy takes the verse text, and the selection is done with.
    await verse(page, 16).click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect(toolbar(page)).toBeHidden();
    expect(await clipboard()).toMatch(/^John 3:16 \(KJV\)\r?\n16 For God so loved the world/);

    // Straight to a verse of this chapter.
    await page.getByRole("button", { name: "Go to verse" }).click();
    await page.getByRole("button", { name: "Verse 30", exact: true }).click();
    await expect(page).toHaveURL(/\/bible\?book=43&chapter=3&verse=30$/);
    await expect(verse(page, 30)).toBeInViewport();
    // Lit for a moment, to be found.
    await expect(verse(page, 30)).toHaveAttribute("data-found", "");
    await expect(verse(page, 30)).toHaveAttribute("aria-pressed", "false");

    // Search the text, and open a result at its verse.
    nav = await navigation(page, mobile);
    const box2 = nav.getByRole("searchbox");
    await box2.fill('"living water"');
    await box2.press("Enter");
    const results = nav.getByRole("region", { name: "Search results" });
    await expect(results).toContainText("John 4:10");
    await results.getByRole("button", { name: /John 4:10/ }).click();
    await expect(page).toHaveURL(/\/bible\?book=43&chapter=4&verse=10$/);
    await expect(heading(page)).toHaveText("John 4");
    await expect(verse(page, 10)).toHaveAttribute("aria-current", "location");
    await expect(verse(page, 10)).toBeInViewport();
    // Gone to, not selected.
    await expect(toolbar(page)).toBeHidden();

    // Searching for nothing returns to the books.
    nav = await navigation(page, mobile);
    await nav.getByRole("searchbox").fill("");
    await nav.getByRole("searchbox").press("Enter");
    await expect(nav.getByRole("navigation", { name: "Books of the Bible" })).toBeVisible();
    await expect(nav.getByRole("region", { name: "Search results" })).toBeHidden();

    // A typed reference goes straight there.
    nav = await navigation(page, mobile);
    await nav.getByRole("searchbox").fill("Romans 8:28");
    await nav.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/\/bible\?book=45&chapter=8&verse=28$/);
    await expect(verse(page, 28)).toContainText("all things work together for good");

    // Chapter by chapter, and the browser's own Back and Forward.
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(heading(page)).toHaveText("Romans 9");
    await page.getByRole("button", { name: "Previous chapter" }).click();
    await expect(page).toHaveURL(/\/bible\?book=45&chapter=8$/);
    await page.goBack();
    await expect(heading(page)).toHaveText("Romans 9");
    await page.goForward();
    await expect(heading(page)).toHaveText("Romans 8");

    // A reload keeps the place, and so does coming back to the bare address.
    await page.reload();
    await expect(heading(page)).toHaveText("Romans 8");
    await page.goto("/bible");
    await expect(page).toHaveURL(/\/bible\?book=45&chapter=8$/);
    await expect(heading(page)).toHaveText("Romans 8");

    // A link to a place wins over what is remembered.
    await page.goto("/bible?book=19&chapter=3&verse=2");
    await expect(heading(page)).toHaveText("Psalm 3");
    await expect(verse(page, 2)).toHaveAttribute("aria-current", "location");
    // The psalm's title stands above verse 1 and is not one of its verses.
    await expect(page.locator("[data-superscription]")).toHaveText(
      "A Psalm of David, when he fled from Absalom his son.",
    );
    await expect(verse(page, 1)).toContainText("LORD, how are they increased");
    await expect(page.locator("[data-verse]")).toHaveCount(8);

    // Nonsense in the address is somewhere safe, never an error.
    await page.goto("/bible?book=43&chapter=999&verse=abc");
    await expect(page).toHaveURL(/\/bible\?book=43&chapter=1$/);
    await expect(heading(page)).toHaveText("John 1");

    // Nothing is wider than the window.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test("the navigation is put away and remembered where the window is wide; a sheet where it is not", async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    await signIn(page);
    await page.goto("/bible?book=43&chapter=3");
    await expect(heading(page)).toHaveText("John 3");

    if (mobile) {
      const sidebar = page.getByRole("complementary", { name: "Bible navigation" });
      await expect(sidebar).toBeHidden();
      const opener = page.getByRole("button", { name: "Browse and search the Bible" });
      await opener.click();
      const sheet = page.getByRole("dialog", { name: "Bible" });
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(opener).toBeFocused();
      return;
    }

    const sidebar = page.getByRole("complementary", { name: "Bible navigation" });
    await expect(sidebar).toBeVisible();
    // One handle on the sidebar's edge puts it away and brings it back.
    await page.getByRole("button", { name: "Hide navigation" }).click();
    await expect(sidebar).toBeHidden();
    await page.reload();
    await expect(heading(page)).toHaveText("John 3");
    await expect(sidebar).toBeHidden();
    const bring = page.getByRole("button", { name: "Show navigation" });
    await expect(bring).toHaveAttribute("aria-expanded", "false");
    // By keyboard, as a sighted keyboard user would.
    await bring.focus();
    await page.keyboard.press("Enter");
    await expect(sidebar).toBeVisible();
  });
});
