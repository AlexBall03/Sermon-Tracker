import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Advanced appearance (A4.2A) in the production editor, /outlines/[id], with
 * its real persistence: a sermon and outline made for this run (and deleted
 * after it), a level and the numbering applied together through Outline
 * Settings, then Undo, Redo, autosave, and a reload. After each step the
 * server's document (the authoritative GET route) says exactly what the
 * editor shows: one canonical document, its revision moving once per save.
 *
 * Development only: the development Clerk instance and database, with
 * conversion on (unset is on under `next dev`; the e2e server sets it).
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const converting = (process.env.SERMON_DOCUMENT_CONVERSION ?? "on") === "on";

test.describe.configure({ mode: "serial" });

const editor = (page: Page) => page.getByTestId("sermon-editor");
const status = (page: Page) => page.getByTestId("save-status");
const dialog = (page: Page) => page.getByTestId("outline-settings");

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

async function editorOpen(page: Page) {
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
}

async function saved(page: Page) {
  await expect(status(page)).toHaveAttribute("data-label", "saved", { timeout: 30_000 });
}

type Served = { content: { attrs: Record<string, unknown> }; revision: number };

/** The server's document, read through the authoritative route. */
async function served(page: Page, outlineId: string): Promise<Served> {
  const answer = await page.request.get(`/api/sermon-documents/${outlineId}`);
  expect(answer.status()).toBe(200);
  return (await answer.json()) as Served;
}

/** What the editor holds: its document's JSON. */
const shown = (page: Page) =>
  page.evaluate(() => {
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: { getJSON: () => { attrs: Record<string, unknown> } };
    };
    return element.editor.getJSON();
  });

test.describe("advanced appearance in the sermon editor, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Runs against the development Clerk instance only.");
  test.skip(!converting, "Needs conversion on (SERMON_DOCUMENT_CONVERSION unset or on).");

  test("a level and the numbering apply together, undo, redo, save, and reload exactly", async ({
    page,
  }, info) => {
    test.skip(info.project.name.includes("mobile"), "Desktop: the full Outline Settings flow.");
    test.setTimeout(240_000);
    await clerkSetup({ publishableKey });
    await signIn(page);
    const title = `A4.2A appearance ${Date.now()}`;
    try {
      const sermonId = await makeSermon(page, title);
      await page.goto(`/outlines/new?sermon=${sermonId}`);
      await page.getByRole("button", { name: "Create outline" }).click();
      await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
      const outlineId = page.url().split("/").pop()!;
      await editorOpen(page);

      // Two main points and a subpoint to number.
      await page.getByTestId("insert-menu").click();
      await page.getByTestId("insert-point").click();
      await page.keyboard.type("First point");
      await page.getByTestId("insert-menu").click();
      await page.getByTestId("insert-subpoint").click();
      await page.keyboard.type("A subpoint");
      await saved(page);
      const before = await served(page, outlineId);
      expect(before.content).toEqual(await shown(page));

      // One Apply: level 1's size and the numbering, together.
      await page.getByTestId("outline-settings-open").click();
      await dialog(page).getByText("Levels", { exact: true }).click();
      const size = dialog(page).getByRole("textbox", { name: "Size (pt)", exact: true });
      await size.fill("15");
      await size.press("Tab");
      await dialog(page).locator('[data-category="numbering"]').click();
      await dialog(page).getByText("Decimal", { exact: true }).click();
      // A preview writes nothing: the server's revision has not moved.
      expect((await served(page, outlineId)).revision).toBe(before.revision);
      await dialog(page).getByRole("button", { name: "Apply" }).click();
      await page.keyboard.press("Escape");
      await saved(page);
      const applied = await served(page, outlineId);
      expect(applied.revision).toBe(before.revision + 1);
      expect(applied.content.attrs.styles).toMatchObject({ levels: { "1": { fontSize: 15 } } });
      expect((applied.content.attrs.layout as { numbering: unknown }).numbering).toEqual({
        version: 1,
        preset: "decimal",
      });
      expect(applied.content).toEqual(await shown(page));

      // Undo: both parts, one step.
      await editor(page).focus();
      await page.keyboard.press("Control+z");
      await saved(page);
      const undone = await served(page, outlineId);
      expect(undone.revision).toBe(applied.revision + 1);
      expect(undone.content).toEqual(before.content);

      // Redo: both again, exactly the applied document.
      await page.keyboard.press("Control+Shift+z");
      await saved(page);
      const redone = await served(page, outlineId);
      expect(redone.revision).toBe(undone.revision + 1);
      expect(redone.content).toEqual(applied.content);

      // A reload opens what the server holds, drawn with its level and numbering.
      await page.reload();
      await editorOpen(page);
      expect(await shown(page)).toEqual(redone.content);
      await expect(editor(page).locator("p.lab-numbered").first()).toHaveAttribute(
        "data-label",
        "1.",
      );
      const pointSize = await editor(page)
        .locator('p[data-type="point"][data-depth="1"]:not([data-role])')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize);
      expect(Math.round((parseFloat(pointSize) * 3) / 4)).toBe(15);
      expect((await served(page, outlineId)).revision).toBe(redone.revision);
    } finally {
      await removeSermon(page, title);
    }
  });
});
