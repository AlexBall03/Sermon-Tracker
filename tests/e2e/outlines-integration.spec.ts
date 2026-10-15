import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Outlines among the rest of the application, signed in: the overview and the
 * way to it, an outline for a sermon captured on the spot, a saved point
 * placed in it, passages on an entry and the way to the Bible and back, the
 * sermon's page and card, and what outline work does to the sermon.
 *
 * It signs in as `library.spec.ts` does and needs the same account: see the
 * note at the top of that file. Without `E2E_CLERK_USER_EMAIL` every test here
 * is skipped, and says so.
 *
 * The journey works only with a sermon, a point, and an outline it makes
 * itself, named with a prefix unique to the run, in that account's own library
 * in the development database, and removes them when it finishes.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("outlines with sermons, the library, and the Bible, signed in", () => {
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
    await page.goto("/library/sermon-ideas");
    await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
  }

  test("from the navigation to an outline with a saved point and passages, and back to the sermon", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    // Unique to this run and this project, so two runs cannot see each other's records.
    const run = `e2e${Date.now().toString(36)}${testInfo.project.name}`;
    const sermon = `${run} integrated sermon`;
    const point = `${run} saved point`;

    const status = page.locator("[data-status]");
    const saved = () => expect(status).toHaveAttribute("data-status", "saved", { timeout: 20_000 });
    const heading = (label: string) => page.getByRole("textbox", { name: `Heading, ${label}` });
    const entry = (label: string) =>
      page.locator("li[data-entry-id]").filter({ has: heading(label) });
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    /** An entry selected, as a click in its heading does: open in its card, with its options. */
    const select = async (label: string) => {
      await heading(label).click();
      return entry(label).getByRole("toolbar");
    };
    const capture = page.getByRole("dialog", { name: "Capture an idea" });
    /**
     * How many ideas with this title a library address lists. The results are
     * streamed after the page itself, so it waits for them, or for the page to
     * say there are none, before it counts.
     */
    const found = async (address: string, title: string) => {
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible({
        timeout: 15_000,
      });
      const link = page.getByRole("link", { name: title, exact: true });
      await link.or(page.locator("#empty-heading")).first().waitFor();
      return link.count();
    };
    /** Whether the sermon of this run is listed for a library query. */
    const listed = (query: string) =>
      found(`/library/sermon-ideas?q=${encodeURIComponent(run)}${query}`, sermon);
    async function remove(title: string) {
      const address = `/library/sermon-ideas?q=${encodeURIComponent(title)}&archived=all`;
      if ((await found(address, title)) === 0) return;
      await page.getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("button", { name: "Delete idea" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^Delete/ })
        .click();
      await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/, { timeout: 15_000 });
    }

    await signIn(page);

    try {
      // A saved point to reuse, with notes and a passage of its own.
      await page
        .getByRole("button", { name: "Capture an idea" })
        .filter({ visible: true })
        .first()
        .click();
      await capture.getByRole("textbox", { name: "Idea" }).fill(point);
      // The radio itself is not drawn; its label is what a finger presses.
      await capture
        .locator("label")
        .filter({ hasText: /^Point$/ })
        .click();
      await expect(capture.getByRole("radio", { name: "Point" })).toBeChecked();
      await capture.getByRole("textbox", { name: "Scripture" }).fill("John 3:16");
      await capture.getByRole("textbox", { name: "Scripture" }).press("Enter");
      await capture.getByRole("button", { name: "More details" }).click();
      await capture.getByRole("textbox", { name: "Notes" }).fill("The point's own notes.");
      await capture.getByRole("button", { name: "Save idea" }).click();
      await expect(capture).toBeHidden();

      // Outlines is a destination of its own, in the bar and in the tab bar.
      await page
        .getByRole("link", { name: "Outlines", exact: true })
        .filter({ visible: true })
        .click();
      await expect(page).toHaveURL(/\/outlines$/);
      await expect(page.getByRole("heading", { level: 1, name: "Outlines" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Outlines", exact: true }).filter({ visible: true }),
      ).toHaveAttribute("aria-current", "page");
      await noOverflow();

      // An outline for a sermon that does not exist yet: the sermon is captured first.
      await page.getByRole("button", { name: "Create Outline" }).first().click();
      const picker = page.getByRole("dialog", { name: "Create an outline" });
      await expect(picker).toBeVisible();
      await noOverflow();
      await picker.getByRole("button", { name: "New sermon idea" }).click();
      await expect(capture.getByRole("radio", { name: "Sermon" })).toBeChecked();
      await capture.getByRole("textbox", { name: "Idea" }).fill(sermon);
      await capture.getByRole("button", { name: "Save idea" }).click();
      // Saved, given its outline, and opened in the editor, in one go.
      await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      const outlineAddress = page.url();
      const outlineId = outlineAddress.split("/").pop() ?? "";
      await expect(page.getByRole("heading", { level: 1, name: "Outline" })).toBeVisible();
      await expect(page.getByRole("link", { name: sermon, exact: true })).toBeVisible();
      await saved();

      // An empty outline is not yet work on the sermon: it was never developed.
      expect(await listed("&revisit=never")).toBe(1);

      // Choosing the same sermon again opens the outline it has, and makes no second.
      await page.goto("/outlines");
      await page.getByRole("button", { name: "Create Outline" }).first().click();
      await picker.getByRole("searchbox", { name: "Find a sermon" }).fill(run);
      const again = picker.getByRole("button", { name: `${sermon}: open its outline` });
      await expect(again).toContainText("Has an outline");
      await again.click();
      await expect(page).toHaveURL(outlineAddress);

      // A copy of the saved point: its heading, its notes, and its passage.
      await page.getByRole("button", { name: "Add from Saved Point" }).click();
      const points = page.getByRole("dialog", { name: "Add from a saved point" });
      await points.getByRole("searchbox", { name: "Find a point" }).fill(run);
      await points.getByRole("button", { name: `Add ${point}` }).click();
      await expect(points.getByText(`Added “${point}”.`)).toBeVisible();
      await noOverflow();
      await points.getByRole("button", { name: "Done" }).click();
      await expect(points).toBeHidden();
      await expect(heading("I.")).toHaveValue(point);
      await expect(entry("I.").getByRole("textbox", { name: /^Notes for/ })).toHaveValue(
        "The point's own notes.",
      );
      await expect(entry("I.").getByRole("list", { name: /^Passages for/ })).toContainText(
        "John 3:16",
      );
      await expect(entry("I.").getByRole("link", { name: /open the saved point/ })).toBeVisible();
      await saved();

      // The copy is edited apart from the point.
      await heading("I.").fill("Reworded in the outline");
      await heading("I.").blur();
      await saved();

      // A point of the outline's own, with passages added in place.
      await page.getByRole("button", { name: "Add point", exact: true }).click();
      await expect(heading("II.")).toBeFocused();
      await page.keyboard.type("The shepherd");
      await (await select("II.")).getByRole("button", { name: "Add passage" }).click();
      const passages = entry("II.").getByRole("textbox", { name: "Passages" });
      await passages.fill("Psalm 23");
      await passages.press("Enter");
      await passages.fill("Psalm 119");
      await passages.press("Enter");
      await expect(entry("II.").getByRole("list", { name: "References" })).toContainText(
        "Psalm 119",
      );
      await saved();

      // Read without leaving: a short passage whole, a long one bounded, with the way to the rest.
      await entry("II.").getByRole("button", { name: "Psalm 23: show the passage" }).click();
      await expect(entry("II.").locator('[data-verse="6"]')).toBeVisible();
      await entry("II.").getByRole("button", { name: "Psalm 119: show the passage" }).click();
      const more = entry("II.").getByRole("button", { name: "Read 164 more verses" });
      await expect(more).toBeVisible();
      await expect(entry("II.").locator('[data-verse="13"]')).toHaveCount(0);
      await noOverflow();
      await more.click();
      const panel = page.getByRole("dialog", { name: "Scripture" });
      await expect(panel.locator('[data-verse="176"]')).toBeAttached();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();

      // To the Bible, with the passage pointed out, and back to this outline.
      await entry("II.").getByRole("link", { name: "Open Psalm 23 in the Bible" }).click();
      await expect(page).toHaveURL(new RegExp(`/bible\\?book=19&chapter=23&outline=${outlineId}$`));
      const back = page.getByRole("link", { name: /^Back to the outline of/ });
      await expect(back).toContainText(sermon);
      await back.click();
      await expect(page).toHaveURL(outlineAddress);

      // Everything was saved: it is all there after a reload.
      await page.reload();
      await expect(heading("I.")).toHaveValue("Reworded in the outline");
      await expect(heading("II.")).toHaveValue("The shepherd");
      await expect(entry("II.").getByRole("list", { name: /^Passages for/ })).toContainText(
        "Psalm 23",
      );
      await expect(entry("I.").getByRole("link", { name: /open the saved point/ })).toBeVisible();

      // Removing a passage is saved like any other change.
      await select("II.");
      await entry("II.").getByRole("button", { name: "Remove Psalm 119" }).click();
      await saved();

      // From the outline to its sermon, which now offers to open it.
      await page.getByRole("link", { name: sermon, exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(sermon);
      const sermonAddress = page.url().split("?")[0];
      await expect(page.getByRole("link", { name: "Open Outline" })).toHaveAttribute(
        "href",
        `/outlines/${outlineId}`,
      );
      await noOverflow();

      // Outline work is development: the sermon is no longer "never developed".
      expect(await listed("&revisit=never")).toBe(0);
      // And its card leads to the outline.
      expect(await listed("")).toBe(1);
      await expect(
        page.getByRole("link", { name: `Open the outline of ${sermon}` }).first(),
      ).toHaveAttribute("href", `/outlines/${outlineId}`);

      // The overview lists it, finds it by its sermon's title, and says how much it holds.
      await page.goto(`/outlines?q=${encodeURIComponent(run)}`);
      const card = page.getByRole("listitem").filter({ hasText: sermon });
      await expect(card).toContainText("2 entries");
      await noOverflow();
      await page.goto(`/outlines?q=${encodeURIComponent(`${run} nothing like it`)}`);
      await expect(
        page.getByRole("heading", { name: "No outlines match your search" }),
      ).toBeVisible();

      // The saved point is exactly as it was, and deleting it keeps the copy.
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(point)}`);
      await page.getByRole("link", { name: point, exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(point);
      await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue(
        "The point's own notes.",
      );
      // Placing it related it to nothing.
      await expect(page.getByText("This point is not related to any sermon yet.")).toBeVisible();
      await remove(point);
      await page.goto(outlineAddress);
      await expect(heading("I.")).toHaveValue("Reworded in the outline");
      await expect(entry("I.").getByRole("list", { name: /^Passages for/ })).toContainText(
        "John 3:16",
      );
      await expect(entry("I.").getByRole("link", { name: /open the saved point/ })).toHaveCount(0);

      // Deleting the sermon says its outline goes too, and takes it.
      await page.goto(sermonAddress);
      await page.getByRole("button", { name: "Delete idea" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText("and its outline, with every point in it");
      await confirm.getByRole("button", { name: /^Delete/ }).click();
      await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
      await page.goto(outlineAddress);
      await expect(page.getByRole("heading", { name: "Outline not found" })).toBeVisible();
    } finally {
      await remove(sermon);
      await remove(point);
    }
  });
});
