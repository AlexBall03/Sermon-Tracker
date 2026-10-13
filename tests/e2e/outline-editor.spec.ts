import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The outline editor, signed in.
 *
 * It signs in as `library.spec.ts` does and needs the same account: see the
 * note at the top of that file. Without `E2E_CLERK_USER_EMAIL` every test here
 * is skipped, and says so.
 *
 * The journey works only with a sermon and an outline it makes itself, named
 * with a prefix unique to the run, in that account's own library in the
 * development database, and removes them when it finishes (deleting the
 * sermon deletes its outline).
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("outline editor, signed in", () => {
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

  test("build an outline, rearrange it, number it, and keep it through failures", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    // Unique to this run and this project, so two runs cannot see each other's records.
    const run = `e2e${Date.now().toString(36)}${testInfo.project.name}`;
    const sermon = `${run} outlined sermon`;

    /** The outline as it is drawn: each point's number and heading, indented by its level. */
    const drawn = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("li[data-entry-id]")].map((row) => {
          const label = row.querySelector("[data-label]")?.textContent ?? "";
          const title = row.querySelector<HTMLInputElement>('[data-field="title"]')?.value ?? "";
          return `${"  ".repeat(Number(row.dataset.depth))}${label} ${title}`.trimEnd();
        }),
      );
    const status = page.locator("[data-status]");
    const saved = () => expect(status).toHaveAttribute("data-status", "saved", { timeout: 20_000 });
    const heading = (label: string) => page.getByRole("textbox", { name: `Heading, ${label}` });
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    const menu = async (name: string, item: string) => {
      await page.getByRole("button", { name: `Actions for ${name}` }).click();
      await page.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
      await page.keyboard.press("Escape");
    };

    await signIn(page);

    try {
      // A sermon to outline: captured, then filed as one.
      await page
        .getByRole("button", { name: "Capture an idea" })
        .filter({ visible: true })
        .first()
        .click();
      const capture = page.getByRole("dialog", { name: "Capture an idea" });
      await capture.getByRole("textbox", { name: "Idea" }).fill(sermon);
      await capture.getByRole("button", { name: "Save idea" }).click();
      await expect(capture).toBeHidden();
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}`);
      await page.getByRole("link", { name: sermon, exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(sermon);
      const sermonId = page.url().split("?")[0].split("/").pop() ?? "";

      // Not a sermon yet: it is told why it cannot have an outline, and offered none.
      await page.goto(`/outlines/new?sermon=${sermonId}`);
      await expect(
        page.getByRole("heading", { name: "Only a sermon can have an outline" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to the idea" }).click();
      await page.getByRole("radio", { name: "Sermon" }).check({ force: true });
      await expect(page.getByText("Now filed as: Sermon idea.")).toBeVisible();

      // An address nothing of this account's answers to.
      await page.goto("/outlines/0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10");
      await expect(page.getByRole("heading", { name: "Outline not found" })).toBeVisible();
      await page.goto("/outlines/not-an-id");
      await expect(page.getByRole("heading", { name: "Outline not found" })).toBeVisible();

      // Opening the page makes nothing; the button does, and opens the editor.
      await page.goto(`/outlines/new?sermon=${sermonId}`);
      await expect(page.getByRole("heading", { level: 1, name: "New outline" })).toBeVisible();
      await page.getByRole("button", { name: "Create outline" }).click();
      await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1, name: "Outline" })).toBeVisible();
      const outlineAddress = page.url();
      await expect(page.getByText(sermon).filter({ visible: true })).toBeVisible();
      await saved();
      // Asking again goes to the one there is.
      await page.goto(`/outlines/new?sermon=${sermonId}`);
      await expect(page).toHaveURL(outlineAddress);

      // Three points from the keyboard, and one under the first.
      await page.getByRole("button", { name: "Add point" }).click();
      await expect(heading("I.")).toBeFocused();
      await page.keyboard.type("Grace");
      await page.keyboard.press("Enter");
      await expect(heading("II.")).toBeFocused();
      await page.keyboard.type("Peace");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Hope");
      await heading("I.").focus();
      await page.keyboard.press("Control+Enter");
      await expect(heading("A.")).toBeFocused();
      await page.keyboard.type("Unearned");
      await saved();
      await expect.poll(drawn).toEqual(["I. Grace", "  A. Unearned", "II. Peace", "III. Hope"]);

      // Notes on a point, and the optional sections.
      await heading("II.").focus();
      await page.getByRole("button", { name: "Add notes" }).filter({ visible: true }).click();
      await page.keyboard.type("Romans 5:1.");
      await page.getByRole("button", { name: "Add introduction" }).click();
      await page.keyboard.type("A question to open with");
      await page.getByRole("button", { name: "Add conclusion" }).click();
      await page.keyboard.type("The invitation");
      await saved();
      await expect(page.getByRole("button", { name: "Add introduction" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add conclusion" })).toHaveCount(0);

      // All of it was saved, in order.
      await page.reload();
      await expect.poll(drawn).toEqual(["I. Grace", "  A. Unearned", "II. Peace", "III. Hope"]);
      await expect(page.getByRole("textbox", { name: "Notes for II. Peace" })).toHaveValue(
        "Romans 5:1.",
      );
      await expect(page.getByRole("textbox", { name: "Introduction: Heading" })).toHaveValue(
        "A question to open with",
      );
      await expect(page.getByRole("textbox", { name: "Conclusion: Heading" })).toHaveValue(
        "The invitation",
      );
      await noOverflow();

      // Moved with the menu: a point with what is under it, renumbered.
      await menu("I. Grace", "Move down");
      await expect.poll(drawn).toEqual(["I. Peace", "II. Grace", "  A. Unearned", "III. Hope"]);
      // And from the keyboard: Hope goes in under Grace, then back out.
      await heading("III.").focus();
      await page.keyboard.press("Alt+Shift+ArrowRight");
      await expect.poll(drawn).toEqual(["I. Peace", "II. Grace", "  A. Unearned", "  B. Hope"]);
      await expect(heading("B.")).toBeFocused();
      await page.keyboard.press("Alt+Shift+ArrowLeft");
      await expect.poll(drawn).toEqual(["I. Peace", "II. Grace", "  A. Unearned", "III. Hope"]);
      await saved();

      // Dragged by its grip: Grace, with Unearned under it, to the top.
      const grip = page
        .locator("li[data-entry-id]", { has: heading("II.") })
        .locator("[data-grip]");
      const first = page.locator("li[data-entry-id]").first();
      const from = (await grip.boundingBox())!;
      const to = (await first.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 4 });
      await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 8 });
      await page.mouse.up();
      await expect.poll(drawn).toEqual(["I. Grace", "  A. Unearned", "II. Peace", "III. Hope"]);
      await saved();
      await page.reload();
      await expect.poll(drawn).toEqual(["I. Grace", "  A. Unearned", "II. Peace", "III. Hope"]);

      // Numbering: previewed, applied, and kept.
      await page.getByRole("button", { name: "Numbering" }).click();
      const numbering = page.getByRole("dialog", { name: "Numbering" });
      await numbering.getByRole("radio", { name: /^Decimal/ }).check({ force: true });
      await expect(numbering.getByRole("region", { name: "Preview" })).toContainText("1.1.1.");
      await noOverflow();
      await numbering.getByRole("button", { name: "Apply" }).click();
      await expect(numbering).toBeHidden();
      await expect.poll(drawn).toEqual(["1. Grace", "  1.1. Unearned", "2. Peace", "3. Hope"]);
      await saved();

      // A custom style, written level by level.
      await page.getByRole("button", { name: "Numbering" }).click();
      await numbering.getByRole("radio", { name: /^Custom/ }).check({ force: true });
      await numbering.getByRole("textbox", { name: "Level 1: Before" }).fill("Point ");
      await expect(numbering.getByRole("region", { name: "Preview" })).toContainText("Point 2.");
      await numbering.getByRole("button", { name: "Apply" }).click();
      await expect(numbering).toBeHidden();
      await expect.poll(async () => (await drawn())[0]).toBe("Point 1. Grace");
      await saved();
      await page.reload();
      await expect
        .poll(drawn)
        .toEqual(["Point 1. Grace", "  Point 1.1. Unearned", "Point 2. Peace", "Point 3. Hope"]);

      // Folded, and still folded after a reload: a preference of this browser.
      await page.getByRole("button", { name: "Collapse Point 1. Grace" }).click();
      await expect.poll(drawn).toHaveLength(3);
      await expect(page.getByText("1 point folded")).toBeVisible();
      await page.reload();
      await expect(page.getByText("1 point folded")).toBeVisible();
      await page.getByRole("button", { name: "Expand Point 1. Grace" }).click();
      await expect.poll(drawn).toHaveLength(4);

      // Light and dark, with nothing wider than the screen.
      await page.screenshot({ path: testInfo.outputPath("outline-light.png"), fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveClass(/dark/);
      await noOverflow();
      await page.screenshot({ path: testInfo.outputPath("outline-dark.png"), fullPage: true });
      await page.emulateMedia({ colorScheme: "light" });

      // A save that cannot reach the server: said, kept, and guarded.
      await page.route("**/outlines/**", (route) =>
        route.request().method() === "POST" ? route.abort() : route.continue(),
      );
      await heading("Point 3.").fill("Hope, unsaved");
      await expect(status).toHaveAttribute("data-status", "failed", { timeout: 20_000 });
      await expect(status).not.toContainText("Saved");
      await page.getByRole("link", { name: "Back to sermon" }).click();
      const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Stay on this page" }).click();
      await expect(page).toHaveURL(outlineAddress);
      await expect(heading("Point 3.")).toHaveValue("Hope, unsaved");
      await page.unroute("**/outlines/**");
      await page.getByRole("button", { name: "Try again" }).click();
      await saved();

      // Left a moment after typing, with no question: the save finishes all the same.
      await heading("Point 2.").fill("Peace with God");
      // The save goes on after the page is left. It is waited for here only so that the
      // reload below, which would cut a request off, does not race it.
      const saving = page.waitForResponse(
        (response) => response.request().method() === "POST" && response.ok(),
        { timeout: 20_000 },
      );
      await page.getByRole("link", { name: "Back to sermon" }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(sermon);
      await saving;
      await page.goto(outlineAddress);
      await expect(heading("Point 2.")).toHaveValue("Peace with God");
      await expect(heading("Point 3.")).toHaveValue("Hope, unsaved");

      // Deleting a point with one under it says so, and takes both.
      await page.getByRole("button", { name: "Actions for Point 1. Grace" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText("and the 1 point under it");
      await confirm.getByRole("button", { name: "Delete" }).click();
      await expect.poll(drawn).toEqual(["Point 1. Peace with God", "Point 2. Hope, unsaved"]);
      await saved();
    } finally {
      // The sermon goes, and its outline with it.
      await page.unroute("**/outlines/**").catch(() => {});
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}&archived=all`);
      const link = page.getByRole("link", { name: sermon, exact: true });
      // The results are streamed after the page: wait for them, or for none, before counting.
      await link.or(page.locator("#empty-heading")).first().waitFor();
      if ((await link.count()) > 0) {
        await link.click();
        await page.getByRole("button", { name: "Delete idea" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: /^Delete/ })
          .click();
        await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
      }
    }
  });
});
