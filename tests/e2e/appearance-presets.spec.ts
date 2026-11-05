import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Personal appearance presets (A4.2C) with their real persistence, signed in
 * to the development Clerk instance and database (which must have migration
 * 0021 applied), with conversion on:
 *
 *   1. On a first outline: preview Minimal and a level size, save that
 *      preview as a preset; the outline itself is unchanged (no save).
 *   2. On a second outline: preview the preset, Apply (one revision), Undo
 *      (back exactly), Redo, and reload.
 *   3. In Settings: make it the default; a third, new outline starts with it,
 *      and its document names no preset.
 *   4. Delete the preset (the default goes back to Balanced); the outlines
 *      made with it keep their appearance.
 *
 * Everything the run makes is removed at the end.
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
  // Captured from the library, where the capture button always is.
  await page.goto("/library/sermon-ideas");
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

/**
 * The account as this spec needs it, whatever an earlier run left: Balanced as
 * the default, and no sermon or preset of this spec's (named "A4.2C …").
 */
async function cleanUp(page: Page) {
  await page.goto("/settings/appearance");
  const balanced = page.getByTestId("default-preset").getByRole("radio", { name: /Balanced/ });
  if (!(await balanced.isChecked())) {
    await balanced.click();
    await expect(page.getByText("Default appearance saved.")).toBeVisible();
  }
  const leftover = page.locator('li[data-preset-name^="A4.2C "]');
  while ((await leftover.count()) > 0) {
    const name = (await leftover.first().getAttribute("data-preset-name")) ?? "";
    await page.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete preset" }).click();
    await expect(page.locator(`li[data-preset-name="${name}"]`)).toHaveCount(0);
  }
  for (;;) {
    await page.goto(`/library/sermon-ideas?q=${encodeURIComponent("A4.2C presets")}&archived=all`);
    const link = page.getByRole("link", { name: /^A4.2C presets / });
    await link.or(page.locator("#empty-heading")).first().waitFor();
    if ((await link.count()) === 0) return;
    await removeSermon(page, (await link.first().textContent())?.trim() ?? "");
  }
}

async function newOutline(page: Page, title: string) {
  const sermonId = await makeSermon(page, title);
  await page.goto(`/outlines/new?sermon=${sermonId}`);
  await page.getByRole("button", { name: "Create outline" }).click();
  await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
  await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
  return page.url().split("/").pop()!;
}

type Served = { content: { attrs: Record<string, unknown> }; revision: number };
async function served(page: Page, outlineId: string): Promise<Served> {
  const answer = await page.request.get(`/api/sermon-documents/${outlineId}`);
  expect(answer.status()).toBe(200);
  return (await answer.json()) as Served;
}

async function saved(page: Page) {
  await expect(status(page)).toHaveAttribute("data-label", "saved", { timeout: 30_000 });
}

test.describe("personal presets, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Runs against the development Clerk instance only.");
  test.skip(!converting, "Needs conversion on (SERMON_DOCUMENT_CONVERSION unset or on).");

  test("save, apply, undo, default, new outline, delete", async ({ page }, info) => {
    test.skip(info.project.name.includes("mobile"), "Desktop: the full flow.");
    test.setTimeout(360_000);
    await clerkSetup({ publishableKey });
    await signIn(page);
    await cleanUp(page);
    const stamp = Date.now();
    const titles = [1, 2, 3].map((n) => `A4.2C presets ${stamp} ${n}`);
    const presetName = `A4.2C ${stamp}`;
    try {
      // 1. Save the previewed appearance from a first outline; the outline is not changed.
      const first = await newOutline(page, titles[0]);
      const firstBefore = await served(page, first);
      await page.getByTestId("outline-settings-open").click();
      await dialog(page)
        .getByRole("radio", { name: /Minimal/ })
        .check({ force: true });
      const save = dialog(page).getByTestId("save-preset");
      await save.getByRole("textbox", { name: "Preset name" }).fill(presetName);
      await save.getByRole("button", { name: "Save preset" }).click();
      await expect(save.getByText("Preset saved.")).toBeVisible();
      expect(await served(page, first)).toEqual(firstBefore);
      // Cancel throws the draft away; with nothing pending, the window then closes at once.
      await dialog(page).getByRole("button", { name: "Cancel" }).click();
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toBeHidden();
      expect(await served(page, first)).toEqual(firstBefore);

      // 2. Apply it on a second outline: one revision; Undo gives the document back exactly.
      const second = await newOutline(page, titles[1]);
      const secondBefore = await served(page, second);
      await page.getByTestId("outline-settings-open").click();
      await dialog(page)
        .getByRole("button", { name: `Preview ${presetName}` })
        .click();
      await expect(
        dialog(page).getByText(`Previewing “${presetName}”`, { exact: false }),
      ).toBeVisible();
      expect((await served(page, second)).revision).toBe(secondBefore.revision);
      await dialog(page).getByRole("button", { name: "Apply" }).click();
      await page.keyboard.press("Escape");
      await saved(page);
      const applied = await served(page, second);
      expect(applied.revision).toBe(secondBefore.revision + 1);
      expect(applied.content.attrs.styles).toMatchObject({ preset: "minimal" });
      await editor(page).focus();
      await page.keyboard.press("Control+z");
      await saved(page);
      expect((await served(page, second)).content).toEqual(secondBefore.content);
      await page.keyboard.press("Control+Shift+z");
      await saved(page);
      await page.reload();
      await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
      expect((await served(page, second)).content.attrs.styles).toMatchObject({
        preset: "minimal",
      });

      // 3. Make it the default; a new outline starts with an independent copy.
      await page.goto("/settings/appearance");
      await page
        .getByTestId("default-preset")
        .getByRole("radio", { name: new RegExp(presetName) })
        .check();
      await expect(page.getByText("Default appearance saved.")).toBeVisible();
      const third = await newOutline(page, titles[2]);
      const started = await served(page, third);
      expect(started.revision).toBe(0);
      expect(started.content.attrs.styles).toMatchObject({ preset: "minimal" });

      // 4. Delete it: the default goes back to Balanced, the outlines keep their appearance.
      await page.goto("/settings/appearance");
      await page.getByRole("button", { name: `Actions for ${presetName}` }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete preset" }).click();
      await expect(
        page.getByText("Preset deleted. Your default appearance is now Balanced."),
      ).toBeVisible();
      expect(await served(page, third)).toEqual(started);
      expect((await served(page, second)).content.attrs.styles).toMatchObject({
        preset: "minimal",
      });
    } finally {
      for (const title of titles) await removeSermon(page, title);
      await cleanUp(page);
    }
  });

  test("My presets fits a phone", async ({ page }, info) => {
    test.skip(!info.project.name.includes("mobile"), "Phone layout only.");
    await clerkSetup({ publishableKey });
    await signIn(page);
    await page.goto("/settings/appearance");
    await expect(page.getByTestId("my-presets")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
