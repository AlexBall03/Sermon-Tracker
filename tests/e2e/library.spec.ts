import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The library, signed in. Everything else in this folder is a guest's view.
 *
 * It needs an account to sign in as, which the repository cannot hold. Set
 * `E2E_CLERK_USER_EMAIL` (in `.env.local`, or the environment) to the email
 * address of a user who exists in the **development** Clerk instance and has
 * been admitted to the application. Without it every test here is skipped,
 * and says so.
 *
 * No password is involved: Clerk's testing helper asks the Backend API, with
 * the development secret key already in `.env.local`, for a one-time sign-in
 * ticket. `clerkSetup` refuses a production secret key, and the check below
 * refuses a production publishable key before anything is attempted.
 *
 * The test works only with ideas and tags it creates itself, named with a
 * prefix unique to the run, in that account's own library in the development
 * database, and removes them when it finishes.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("library, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  async function signIn(page: Page) {
    // A public page that loads Clerk; the helper signs in from there.
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
  }

  async function capture(page: Page, title: string) {
    await page
      .getByRole("button", { name: "Capture an idea" })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Capture an idea" });
    await dialog.getByRole("textbox", { name: "Idea" }).fill(title);
    await dialog.getByRole("button", { name: "Save idea" }).click();
    await expect(dialog).toBeHidden();
  }

  async function createTag(page: Page, name: string) {
    const dialog = page.getByRole("dialog", { name: "Manage tags" });
    await dialog.getByRole("textbox", { name: "New tag" }).fill(name);
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByRole("list", { name: "Your tags" })).toContainText(name);
  }

  async function tagIdea(page: Page, title: string, tags: string[]) {
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(title);
    await page.getByRole("button", { name: /^Add/ }).click();
    for (const tag of tags) {
      await page.getByRole("textbox", { name: "Find or create a tag" }).fill(tag);
      await page
        .getByRole("list", { name: "Your tags" })
        .getByRole("button", { name: tag })
        .click();
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();
  }

  const results = (page: Page) => page.getByRole("list", { name: "Your ideas" }).locator("> li");

  test("search, filter, switch view, open an idea, and come back to the same place", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    // Unique to this run and this project, so two runs cannot see each other's ideas.
    const run = `e2e${Date.now().toString(36)}${testInfo.project.name}`;
    const alpha = `${run} alpha grace`;
    const beta = `${run} beta mercy`;
    const faith = `${run} faith`;
    const prayer = `${run} prayer`;

    await signIn(page);

    try {
      // Tags are made in the library's own dialog.
      await capture(page, alpha);
      await capture(page, beta);
      await page.getByRole("button", { name: "Manage tags" }).click();
      await createTag(page, faith);
      await createTag(page, prayer);
      // A name already taken is refused, and what was typed stays.
      const manager = page.getByRole("dialog", { name: "Manage tags" });
      await manager.getByRole("textbox", { name: "New tag" }).fill(faith.toUpperCase());
      await manager.getByRole("button", { name: "Create" }).click();
      await expect(manager.getByText("You already have a tag with that name.")).toBeVisible();
      await expect(manager.getByRole("textbox", { name: "New tag" })).toHaveValue(
        faith.toUpperCase(),
      );
      await page.keyboard.press("Escape");
      await expect(manager).toBeHidden();

      // Search is the database's, and lives in the address.
      const search = page.getByRole("searchbox", { name: "Search ideas" });
      await search.fill(run);
      await expect(page).toHaveURL(new RegExp(`[?&]q=${run}`));
      await expect(results(page)).toHaveCount(2);
      await expect(page.getByText("2 matching ideas")).toBeVisible();

      // Alpha gets both tags and beta one, each saved with the idea.
      await tagIdea(page, alpha, [faith, prayer]);
      await page.getByRole("link", { name: "Library", exact: true }).first().click();
      await expect(search).toHaveValue(run);
      await tagIdea(page, beta, [faith]);
      await page.getByRole("link", { name: "Library", exact: true }).first().click();
      await expect(results(page)).toHaveCount(2);

      // Changing something else leaves an idea's tags as they were.
      await page.getByRole("link", { name: alpha }).click();
      await page.getByRole("textbox", { name: "Notes" }).fill("A note added later.");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Changes saved.")).toBeVisible();
      await page.reload();
      await expect(page.getByRole("list", { name: "Tags" })).toContainText(faith);
      await expect(page.getByRole("list", { name: "Tags" })).toContainText(prayer);
      await page.getByRole("link", { name: "Library", exact: true }).first().click();

      // Several filters at once; any tag, then all tags.
      await page.getByRole("button", { name: /^Filters/ }).click();
      const filters = page.getByRole("region", { name: "Filters" });
      await filters.getByRole("button", { name: "Undecided" }).click();
      await filters.getByRole("button", { name: "Sermon idea" }).click();
      await expect(page).toHaveURL(/kind=sermon&kind=undecided/);
      await expect(results(page)).toHaveCount(2);
      await filters.getByRole("button", { name: new RegExp(`^${faith}`) }).click();
      await filters.getByRole("button", { name: new RegExp(`^${prayer}`) }).click();
      await expect(results(page)).toHaveCount(2);
      await filters.getByText("All", { exact: true }).click();
      await expect(page).toHaveURL(/tag_mode=all/);
      await expect(results(page)).toHaveCount(1);
      await expect(results(page)).toContainText(alpha);
      await expect(page.getByText("Matching all tags")).toBeVisible();

      // The view is remembered by the browser and is not part of the address.
      const address = page.url();
      await page.getByRole("radio", { name: "List view" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-library-view", "list");
      expect(page.url()).toBe(address);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-library-view", "list");
      await expect(page.getByRole("radio", { name: "List view" })).toBeChecked();
      await expect(results(page)).toHaveCount(1);

      // Into the idea and back: the same search, filters, and mode.
      await page.getByRole("link", { name: alpha }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(alpha);
      await page.getByRole("link", { name: "Library", exact: true }).first().click();
      await expect(page).toHaveURL(address);
      await expect(search).toHaveValue(run);
      await expect(results(page)).toHaveCount(1);
      // And the browser's own Back does the same.
      await page.getByRole("link", { name: alpha }).click();
      await page.goBack();
      await expect(page).toHaveURL(address);

      // Removing a filter chip widens the results again.
      await page.getByRole("button", { name: `Remove filter: Tag ${prayer}` }).click();
      await expect(results(page)).toHaveCount(2);
      await page.getByRole("button", { name: "Clear filters" }).first().click();
      await expect(page).toHaveURL(new RegExp(`/library\\?q=${run}$`));

      // A page past the end lands on the last page instead of failing.
      await page.goto(`/library?q=${run}&page=999`);
      await expect(results(page)).toHaveCount(2);

      // Nothing matches: the library is not called empty, and the search can be cleared.
      await search.fill(`${run} nothing-has-this`);
      await expect(page.getByRole("heading", { name: "No ideas match your search" })).toBeVisible();
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(search).toHaveValue("");
    } finally {
      // Remove what this run made, whatever happened above.
      for (const title of [alpha, beta]) {
        await page.goto(`/library?q=${encodeURIComponent(title)}`);
        const link = page.getByRole("link", { name: title });
        if ((await link.count()) === 0) continue;
        await link.click();
        await page.getByRole("button", { name: "Delete idea" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: /^Delete/ })
          .click();
        await expect(page).toHaveURL(/\/library(\?|$)/);
      }
      await page.goto("/library");
      const manage = page.getByRole("button", { name: "Manage tags" });
      if ((await manage.count()) > 0) {
        await manage.click();
        const dialog = page.getByRole("dialog", { name: "Manage tags" });
        for (const name of [faith, prayer]) {
          const remove = dialog.getByRole("button", { name: `Delete ${name}` });
          if ((await remove.count()) === 0) continue;
          await remove.click();
          const confirm = page.getByRole("alertdialog");
          // Deleting a tag never deletes an idea, and the dialog says so.
          await expect(confirm).toContainText(/kept|No idea has this tag/);
          await confirm.getByRole("button", { name: "Delete tag" }).click();
          await expect(remove).toHaveCount(0);
        }
      }
    }
  });
});
