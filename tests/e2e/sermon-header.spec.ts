import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The sermon header, footer, and pages in the production editor (A4.3),
 * signed in, with conversion on: a new outline's page numbers, the title
 * edited in the header and saved on its own (revision-checked, against the
 * library too), the subtitle saved with the document, Header & Footer
 * applied and kept, and a read-only tab that cannot change the title.
 *
 * It signs in as `library.spec.ts` does and needs the same account. Each test
 * works only on a sermon it makes itself, named with a prefix unique to the
 * run, and deletes it at the end.
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

async function removeSermon(page: Page, prefix: string) {
  for (;;) {
    await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(prefix)}&archived=all`);
    const link = page.getByRole("link", { name: new RegExp(`^${prefix}`) }).first();
    await link.or(page.locator("#empty-heading")).first().waitFor();
    if ((await page.getByRole("link", { name: new RegExp(`^${prefix}`) }).count()) === 0) return;
    await link.click();
    await page.getByRole("button", { name: "Delete idea" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^Delete/ })
      .click();
    await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
  }
}

const editor = (page: Page) => page.getByTestId("sermon-editor");
const title = (page: Page) => page.getByTestId("sermon-header-title");
const titleStatus = (page: Page) => page.getByTestId("title-status");

async function editorOpen(page: Page) {
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
}

async function makeOutline(page: Page, sermonId: string) {
  await page.goto(`/outlines/new?sermon=${sermonId}`);
  await page.getByRole("button", { name: "Create outline" }).click();
  await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
  await editorOpen(page);
  return page.url();
}

async function saved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-label", "saved", {
    timeout: 30_000,
  });
}

async function rename(page: Page, next: string) {
  await title(page).click();
  await title(page).fill(next);
  await title(page).press("Enter");
}

test.describe("the sermon header, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Runs against the development Clerk instance only.");
  test.skip(!converting, "Needs conversion on (SERMON_DOCUMENT_CONVERSION unset or on).");

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("a new outline numbers its pages in bold at the right; the title and subtitle are saved and found again", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const prefix = `e2e${Date.now().toString(36)}${testInfo.project.name} header`;
    const first = `${prefix} sermon`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, first);
      const address = await makeOutline(page, sermonId);
      // The owner's default for a new outline: numbers on, right, bold; the title centred.
      await expect(editor(page)).toHaveAttribute("data-page-numbers", "right");
      await expect(editor(page)).toHaveAttribute("data-page-number-weight", "bold");
      await expect(page.getByTestId("sermon-header")).toHaveAttribute("data-align", "center");
      await expect(title(page)).toHaveValue(first);

      // The title: saved on its own, never with the document.
      const renamed = `${prefix} renamed in the editor`;
      await rename(page, renamed);
      await expect(titleStatus(page)).toHaveText("Title saved", { timeout: 15_000 });
      await expect(page.getByTestId("outline-sermon-title")).toHaveText(renamed);

      // The subtitle: one change of the document, saved by autosave.
      await page.getByTestId("sermon-header-add-subtitle").click();
      await page.getByTestId("sermon-header-subtitle").fill("Psalm 119:105");
      await page.getByTestId("sermon-header-subtitle").press("Enter");
      await saved(page);

      await page.reload();
      await editorOpen(page);
      await expect(title(page)).toHaveValue(renamed);
      await expect(page.getByTestId("sermon-header-subtitle")).toHaveValue("Psalm 119:105");

      // The library has the same title.
      await page.goto(`/library/${sermonId}`);
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(renamed);
      await page.goto(address);
      await editorOpen(page);
    } finally {
      await removeSermon(page, prefix);
    }
  });

  test("a title changed in two places is never written over: the library and the editor each refuse the stale one", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Two pages at once, at desktop size.");
    test.setTimeout(240_000);
    const prefix = `e2e${Date.now().toString(36)}${testInfo.project.name} stale`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, `${prefix} start`);
      const address = await makeOutline(page, sermonId);

      // The library page, opened before the editor renames the sermon.
      const library = await page.context().newPage();
      await library.goto(`/library/${sermonId}`);
      const idea = library.getByRole("textbox", { name: "Idea" });
      await expect(idea).toHaveValue(`${prefix} start`);

      await rename(page, `${prefix} from the editor`);
      await expect(titleStatus(page)).toHaveText("Title saved", { timeout: 15_000 });

      // The library's older draft is refused, kept, and saved over only when asked.
      await idea.fill(`${prefix} from the library`);
      await library.getByRole("button", { name: "Save changes" }).click();
      const conflict = library.getByTestId("idea-conflict");
      await expect(conflict).toContainText(`${prefix} from the editor`);
      await expect(idea).toHaveValue(`${prefix} from the library`);
      await conflict.getByRole("button", { name: "Save mine over it" }).click();
      await expect(library.getByText("Changes saved.")).toBeVisible();

      // Now the editor's own copy is stale: its next title is refused, never written over.
      await rename(page, `${prefix} editor again`);
      await expect(titleStatus(page)).toContainText("changed somewhere else", { timeout: 15_000 });
      await expect(title(page)).toHaveValue(`${prefix} editor again`);
      await titleStatus(page).getByRole("button", { name: "Use theirs" }).click();
      await expect(title(page)).toHaveValue(`${prefix} from the library`);
      await library.close();

      // Reloaded, the editor shows what the server holds.
      await page.goto(address);
      await editorOpen(page);
      await expect(title(page)).toHaveValue(`${prefix} from the library`);
    } finally {
      await removeSermon(page, prefix);
    }
  });

  test("Header & Footer is applied in one step, kept, and a read-only tab cannot change the title", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Outline Settings and two tabs at desktop size.",
    );
    test.setTimeout(240_000);
    const prefix = `e2e${Date.now().toString(36)}${testInfo.project.name} footer`;
    await signIn(page);
    try {
      const sermonId = await makeSermon(page, `${prefix} sermon`);
      const address = await makeOutline(page, sermonId);

      await page.getByTestId("outline-settings-open").click();
      const settings = page.getByRole("dialog", { name: "Outline Settings" });
      await settings.getByRole("button", { name: "Header & Footer" }).click();
      await settings.getByRole("radio", { name: "Left" }).first().check({ force: true });
      await settings.getByRole("switch", { name: /Header on later pages/ }).click();
      await settings.getByRole("switch", { name: "Bold page numbers" }).click();
      await settings.getByRole("button", { name: "Apply" }).click();
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await expect(page.getByTestId("sermon-header")).toHaveAttribute("data-align", "left");
      await expect(editor(page)).toHaveAttribute("data-running-header", "on");
      await expect(editor(page)).toHaveAttribute("data-page-number-weight", "normal");
      await saved(page);

      await page.reload();
      await editorOpen(page);
      await expect(page.getByTestId("sermon-header")).toHaveAttribute("data-align", "left");
      await expect(editor(page)).toHaveAttribute("data-running-header", "on");

      // A second tab is read-only: it has no header to change the title in.
      const second = await page.context().newPage();
      await second.goto(address);
      await expect(second.getByTestId("outline-read-only")).toBeVisible({ timeout: 30_000 });
      await expect(second.getByTestId("sermon-header-title")).toHaveCount(0);
      await second.close();
    } finally {
      await removeSermon(page, prefix);
    }
  });
});
