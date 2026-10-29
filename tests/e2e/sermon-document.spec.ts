import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The production sermon editor (A3), signed in, on a production build with
 * conversion on: a sermon's outline is converted as it is opened, edited in
 * `SermonWorkspace`, saved through its editor session, and found again.
 *
 * It signs in as `library.spec.ts` does and needs the same account (see the
 * note there). Each test works only on a sermon it makes itself, named with a
 * prefix unique to the run, and deletes it at the end (its outline and
 * document go with it).
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const converting = (process.env.SERMON_DOCUMENT_CONVERSION ?? "on") === "on";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/library/sermon-ideas");
  await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 15_000 });
}

/** A sermon of this run's, filed as one; its ID. */
async function makeSermon(page: Page, title: string) {
  await page
    .getByRole("button", { name: "Capture an idea" })
    .filter({ visible: true })
    .first()
    .click();
  const capture = page.getByRole("dialog", { name: "Capture an idea" });
  await capture.getByRole("textbox", { name: "Idea" }).fill(title);
  await capture.getByRole("button", { name: "Save idea" }).click();
  await expect(capture).toBeHidden();
  await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(title);
  const id = page.url().split("?")[0].split("/").pop() ?? "";
  await page.getByRole("radio", { name: "Sermon" }).check({ force: true });
  await expect(page.getByText("Now filed as: Sermon idea.")).toBeVisible();
  return id;
}

async function removeSermon(page: Page, title: string) {
  await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}&archived=all`);
  const link = page.getByRole("link", { name: title, exact: true });
  await link.or(page.locator("#empty-heading")).first().waitFor();
  if ((await link.count()) === 0) return;
  await link.click();
  await page.getByRole("button", { name: "Delete idea" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^Delete/ })
    .click();
  await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
}

/** Gives the sermon its outline through the existing flow; the outline's address. */
async function makeOutline(page: Page, sermonId: string) {
  await page.goto(`/outlines/new?sermon=${sermonId}`);
  await page.getByRole("button", { name: "Create outline" }).click();
  await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
  await editorOpen(page);
  return page.url();
}

const editor = (page: Page) => page.getByTestId("sermon-editor");
const status = (page: Page) => page.getByTestId("save-status");

async function editorOpen(page: Page) {
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
}

async function saved(page: Page) {
  await expect(status(page)).toHaveAttribute("data-label", "saved", { timeout: 30_000 });
}

/** Types at the end of the document. */
async function typeAtEnd(page: Page, words: string) {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(words);
}

async function insert(page: Page, component: string) {
  await page.getByTestId("insert-menu").click();
  await page.getByTestId(`insert-${component}`).click();
  // Typed straight after, as a person does: nothing waits for the menu to finish closing.
}

test.describe("the sermon editor, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Runs against the development Clerk instance only.");
  test.skip(!converting, "Needs conversion on (SERMON_DOCUMENT_CONVERSION unset or on).");

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("a new outline is converted, written in with every component, saved, and found again", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} document sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, title);
      const address = await makeOutline(page, sermonId);
      // The sermon's own title, read only, and nothing saved for opening it.
      await expect(page.getByTestId("outline-sermon-title")).toHaveText(title);
      await expect(status(page)).toHaveAttribute("data-label", "unchanged");

      // Freeform first: writing with no structure at all.
      await typeAtEnd(page, "Opening thoughts on grace");
      await saved(page);

      // Each component through the Insert menu.
      await insert(page, "introduction");
      await page.keyboard.type("Why grace matters");
      await insert(page, "point");
      await page.keyboard.type("Grace is unearned");
      await insert(page, "subpoint");
      await page.keyboard.type("Not by works");
      await insert(page, "note");
      await page.keyboard.type("Pause and ask");
      await insert(page, "script");
      await page.keyboard.type("Say this as written");
      await insert(page, "scripture");
      const dialog = page.getByTestId("insert-scripture-dialog");
      await dialog.getByRole("textbox", { name: "Reference" }).fill("John 3:16");
      await dialog.getByTestId("insert-scripture-submit").click();
      await expect(dialog).toBeHidden();
      await insert(page, "conclusion");
      await page.keyboard.type("Go in grace");
      await saved(page);

      // An outline-wide preset, applied through Outline Settings.
      await page.getByTestId("outline-settings-open").click();
      await page.getByRole("radio", { name: /Expressive/ }).check({ force: true });
      await page.getByRole("button", { name: "Apply" }).click();
      await page.keyboard.press("Escape");
      await saved(page);

      // Found again, exactly: a new page reads it from the server.
      await page.goto(address);
      await editorOpen(page);
      const surface = editor(page);
      await expect(surface).toContainText("Opening thoughts on grace");
      await expect(surface.locator('[data-role="introduction"]')).toContainText(
        "Why grace matters",
      );
      await expect(surface.locator('[data-role="conclusion"]')).toContainText("Go in grace");
      await expect(surface.locator('[data-type="preacher-note"]')).toContainText("Pause and ask");
      await expect(surface.locator('[data-type="script"]')).toContainText("Say this as written");
      await expect(surface.locator('[data-type="scripture-passage"]')).toHaveCount(1);
      await expect(surface).toContainText("Not by works");
      await expect(surface).toContainText("Grace is unearned");
      // One point for each choice, whatever was typed straight after it (A3 found a space
      // reaching a closing menu choose its item again).
      await expect(surface.locator('[data-type="point"]')).toHaveCount(4);
      await expect(surface).toHaveAttribute("data-preset", "expressive");
      await expect(status(page)).toHaveAttribute("data-label", "unchanged");

      // Saving develops the sermon: it heads Continue Working on the dashboard.
      await page.goto("/dashboard");
      await expect(page.getByText(title).first()).toBeVisible();
    } finally {
      await removeSermon(page, title);
    }
  });

  test("another tab is read only until Edit here, and the handover keeps every word", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} tabs sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, title);
      const address = await makeOutline(page, sermonId);
      await typeAtEnd(page, "Written in the first tab");

      const second = await context.newPage();
      await second.goto(address);
      await expect(second.getByTestId("outline-read-only")).toBeVisible({ timeout: 30_000 });
      await expect(second.getByTestId("sermon-editor")).toHaveCount(0);

      await second.getByTestId("edit-here").click();
      await editorOpen(second);
      await expect(editor(second)).toContainText("Written in the first tab");
      // The first tab stopped editing, and says another tab has it.
      await expect(page.getByTestId("outline-read-only")).toBeVisible({ timeout: 30_000 });

      await typeAtEnd(second, " and the second");
      await saved(second);
      await second.close();
    } finally {
      await removeSermon(page, title);
    }
  });

  test("words written offline are recovered after the tab closes, then saved", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} recovery sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, title);
      const address = await makeOutline(page, sermonId);
      await typeAtEnd(page, "Saved first");
      await saved(page);

      await context.setOffline(true);
      await typeAtEnd(page, " then written offline");
      await expect(status(page)).toHaveAttribute("data-label", "offline", { timeout: 15_000 });
      await page.close();
      await context.setOffline(false);

      const back = await context.newPage();
      await back.goto(address);
      await expect(back.getByTestId("recovery-view")).toBeVisible({ timeout: 30_000 });
      await expect(back.getByTestId("sermon-editor")).toHaveCount(0);
      await expect(back.getByTestId("recovery-preview-recovered")).toContainText("written offline");
      await back.getByText("Saved on the server").click();
      await expect(back.getByTestId("recovery-preview-server")).toContainText("Saved first");
      await expect(back.getByTestId("recovery-preview-server")).not.toContainText(
        "written offline",
      );

      await back.getByTestId("recovery-restore").click();
      await editorOpen(back);
      await expect(editor(back)).toContainText("then written offline");
      await saved(back);

      // Opened again: no recovery left, the words on the server.
      await back.goto(address);
      await editorOpen(back);
      await expect(editor(back)).toContainText("then written offline");
      await removeSermon(back, title);
    } finally {
      const cleanup = context.pages()[0] ?? (await context.newPage());
      await removeSermon(cleanup, title);
    }
  });

  test("a save made elsewhere meanwhile is a conflict that keeps both, never an overwrite", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} conflict sermon`;
    await signIn(page);
    let other: BrowserContext | null = null;
    try {
      const sermonId = await makeSermon(page, title);
      const address = await makeOutline(page, sermonId);

      // Another browser profile: its own device, its own lock.
      other = await browser.newContext();
      const elsewhere = await other.newPage();
      await signIn(elsewhere);
      await elsewhere.goto(address);
      await editorOpen(elsewhere);

      await typeAtEnd(elsewhere, "Saved from elsewhere");
      await saved(elsewhere);
      await typeAtEnd(page, "Written here");
      await expect(status(page)).toHaveAttribute("data-label", "conflict", { timeout: 30_000 });

      await page.getByTestId("save-action").click();
      await expect(page.getByTestId("recovery-view")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("recovery-preview-recovered")).toContainText("Written here");
      await page.getByText("Saved on the server").click();
      await expect(page.getByTestId("recovery-preview-server")).toContainText(
        "Saved from elsewhere",
      );

      // The person keeps their own: it is saved against what the server holds now.
      await page.getByTestId("recovery-restore").click();
      await editorOpen(page);
      await saved(page);
    } finally {
      await other?.close();
      await removeSermon(page, title);
    }
  });

  test("Back and Forward after saving, and words not yet kept are still guarded", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} history sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, title);
      await makeOutline(page, sermonId);
      // Opened from another page: the sermon's.
      const sermonPage = `/library/${sermonId}`;
      await page.goto(sermonPage);
      await page
        .getByRole("link", { name: /Open Outline|Open the outline of/ })
        .first()
        .click();
      await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
      const outlinePage = page.url();
      await editorOpen(page);
      const entries = await page.evaluate(() => history.length);

      // Edits saved one after another leave at most the one entry the guard borrows.
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await typeAtEnd(page, ` cycle ${cycle}`);
        await saved(page);
        // The guard's entry is taken away once saved (it answers within a second).
        await expect
          .poll(() => page.evaluate(() => "__leaveGuard" in ((history.state as object) ?? {})))
          .toBe(false);
        expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(entries + 1);
      }

      // Words not yet kept on the device: Back is held, and the person is asked.
      await typeAtEnd(page, " not yet kept");
      await page.evaluate(() => history.back());
      const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Stay on this page" }).click();
      await expect(page).toHaveURL(outlinePage);
      // And a link: held the same way.
      await typeAtEnd(page, " still not kept");
      await page.getByRole("link", { name: "Back to sermon" }).click();
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Stay on this page" }).click();
      await expect(page).toHaveURL(outlinePage);
      await saved(page);

      // Saved: one Back reaches the sermon's page, and Forward comes back to the outline.
      await expect
        .poll(() => page.evaluate(() => "__leaveGuard" in ((history.state as object) ?? {})))
        .toBe(false);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${sermonPage}$`));
      await page.goForward();
      await expect(page).toHaveURL(outlinePage);
      await editorOpen(page);
      await expect(editor(page)).toContainText("still not kept");
      // The editor closing (its own way back) is the only navigation: nothing moves after it.
      await page.getByRole("link", { name: "Back to sermon" }).click();
      await expect(page).toHaveURL(new RegExp(`${sermonPage}$`));
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(new RegExp(`${sermonPage}$`));
    } finally {
      await removeSermon(page, title);
    }
  });

  test("a settings form's guard leaves no entry behind once it has nothing to lose", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings");
    await page.goto("/settings/profile");
    const church = page.getByRole("textbox", { name: "Church name (optional)" });
    const original = await church.inputValue();
    // Unsaved: Back is held.
    await church.fill(`${original} (unsaved review)`);
    await page.evaluate(() => history.back());
    const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect(leave).toBeVisible();
    await leave.getByRole("button", { name: "Stay on this page" }).click();
    // Back to what is saved: nothing to lose, and one Back leaves (nothing was saved).
    await church.fill(original);
    await expect
      .poll(() => page.evaluate(() => "__leaveGuard" in ((history.state as object) ?? {})))
      .toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("an outline that is not the account's is not found", async ({ page }) => {
    await signIn(page);
    await page.goto("/outlines/0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10");
    await expect(page.getByRole("heading", { name: "Outline not found" })).toBeVisible();
    const response = await page.request.get(
      "/api/sermon-documents/0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10",
    );
    expect(response.status()).toBe(404);
  });

  test("on a phone: Regular layout, the Insert menu, and saving", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "The phone's own journey.");
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} phone sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, title);
      await makeOutline(page, sermonId);
      await expect(page.locator(".lab-scaler")).toHaveAttribute("data-layout", "regular");
      await expect(page.getByTestId("insert-menu")).toBeVisible();
      await typeAtEnd(page, "From the phone");
      await insert(page, "point");
      await page.keyboard.type("A point on the phone");
      await saved(page);
      // Nothing scrolls sideways.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    } finally {
      await removeSermon(page, title);
    }
  });
});
