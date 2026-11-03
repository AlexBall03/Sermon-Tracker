import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Advanced appearance (A4.2A) in a real browser, on /lab/editor/v4 ("When
 * Idols Fall": main points, subpoints at depth 2, two at depth 3):
 *
 *   - a level's style reaches its depth only, previewed without changing the
 *     document, applied in one undo step;
 *   - the CSS order: a level beats its type, a single point's own appearance
 *     beats its level, a point with a named style keeps that style;
 *   - a number's look (size, color, hidden, not hanging) changes no label,
 *     and the numbering changes no text;
 *   - numbering and appearance edited together are one transaction, one undo;
 *   - an unreadable layout is never replaced: Numbering refuses to edit it;
 *   - on a phone, nothing scrolls sideways and Apply is in reach.
 *
 * Nothing is saved anywhere: the lab persists nothing.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

type Editor = import("@tiptap/core").Editor;

test.describe.configure({ mode: "serial" });

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
  await expect(point(page, "wif-2a1")).toBeVisible({ timeout: 30_000 });
}

const editorRoot = (page: Page) => page.getByTestId("sermon-editor");
const point = (page: Page, id: string) =>
  editorRoot(page).locator(`p[data-type="point"][data-id="${id}"]`);

/** Runs in the page with the workspace's editor (Tiptap keeps it on its element). */
const withEditor = <T>(page: Page, run: (editor: Editor) => T) =>
  page.evaluate((source) => {
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: Editor;
    };
    return new Function("editor", `return (${source})(editor)`)(element.editor) as T;
  }, run.toString());

const styleOf = (page: Page, id: string, prop: string, pseudo?: string) =>
  point(page, id).evaluate(
    (element, [name, after]) => getComputedStyle(element, after || null).getPropertyValue(name),
    [prop, pseudo ?? ""] as const,
  );

/** A length in points, from a computed pixel length (Chrome rounds to four places). */
const pointsOf = async (page: Page, id: string, prop: string, pseudo?: string) =>
  Math.round(((parseFloat(await styleOf(page, id, prop, pseudo)) * 3) / 4) * 100) / 100;

const docState = (page: Page) =>
  withEditor(page, (editor) => ({
    styles: editor.state.doc.attrs.styles,
    layout: editor.state.doc.attrs.layout,
  }));

async function openSettings(page: Page) {
  await page.getByTestId("outline-settings-open").click();
  await expect(page.getByTestId("outline-settings")).toBeVisible();
}

const dialog = (page: Page) => page.getByTestId("outline-settings");

async function chooseLevel(page: Page, label: RegExp) {
  await dialog(page).getByText("Levels", { exact: true }).click();
  await dialog(page).getByRole("combobox", { name: "Outline level" }).click();
  await page.getByRole("option", { name: label }).click();
}

async function setNumber(page: Page, name: string, value: string) {
  const field = dialog(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Tab");
}

async function undo(page: Page) {
  await withEditor(page, (editor) => editor.commands.undo());
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!email || !development, "Needs the development Clerk instance and a test user.");
  await clerkSetup({ publishableKey });
  test.skip(info.project.name !== "desktop" && !info.title.includes("phone"), "Desktop only.");
  await openV4(page);
});

test("a level's style reaches its depth only, as a preview, then in one undo step", async ({
  page,
}) => {
  const before = await docState(page);
  const sub = await styleOf(page, "wif-2a", "font-size");
  const deep = await styleOf(page, "wif-2a1", "font-size");
  const main = await styleOf(page, "wif-2", "font-size");
  expect(sub).toBe(deep);

  await openSettings(page);
  await chooseLevel(page, /^Level 3/);
  await setNumber(page, "Size (pt)", "15");
  // The preview is view state: the outline shows it, the document does not change.
  await expect.poll(() => styleOf(page, "wif-2a1", "font-size")).toBe("20px");
  expect(await styleOf(page, "wif-2a", "font-size")).toBe(sub);
  expect(await styleOf(page, "wif-2", "font-size")).toBe(main);
  expect(await docState(page)).toEqual(before);

  await dialog(page).getByRole("button", { name: "Apply" }).click();
  const applied = await docState(page);
  expect(applied.styles).toMatchObject({ levels: { "3": { fontSize: 15 } } });
  expect(applied.layout).toEqual(before.layout);
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await docState(page)).toEqual(before);
  await expect.poll(() => styleOf(page, "wif-2a1", "font-size")).toBe(deep);
});

test("the CSS order: level over type, a single point over its level, a named style over both", async ({
  page,
}) => {
  await withEditor(page, (editor) => {
    editor.commands.applyDocumentStyles({
      version: 1,
      components: { subpoint: { fontSize: 11, italic: true } },
      levels: { "3": { fontSize: 16 } },
    });
  });
  // The level wins over its type where it sets something, and inherits the rest.
  await expect.poll(() => pointsOf(page, "wif-2a1", "font-size")).toBe(16);
  expect(await styleOf(page, "wif-2a1", "font-style")).toBe("italic");
  expect(await pointsOf(page, "wif-2a", "font-size")).toBe(11);

  // A single point's own appearance wins over its level.
  await withEditor(page, (editor) => {
    let at = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.attrs.id === "wif-2a1") at = offset;
    });
    editor.commands.setComponentAppearance(at, { fontSize: 9 });
  });
  await expect.poll(() => pointsOf(page, "wif-2a1", "font-size")).toBe(9);
  expect(await pointsOf(page, "wif-2a2", "font-size")).toBe(16);

  // A point given a named style looks like that style, whatever its level says.
  await withEditor(page, (editor) => {
    let at = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.attrs.id === "wif-2a2") at = offset;
    });
    editor.view.dispatch(editor.state.tr.setNodeAttribute(at, "styleName", "heading1"));
  });
  const heading = await withEditor(page, (editor) => {
    const element = editor.view.dom.querySelector("h1") ?? null;
    return element ? getComputedStyle(element).fontSize : null;
  });
  const named = await styleOf(page, "wif-2a2", "font-size");
  expect(Math.round((parseFloat(named) * 3) / 4)).not.toBe(16);
  if (heading) expect(named).toBe(heading);
});

test("a number's look changes no label; the numbering changes no text", async ({ page }) => {
  const labels = () =>
    editorRoot(page)
      .locator("p.lab-numbered")
      .evaluateAll((all) => all.map((element) => element.getAttribute("data-label")));
  const text = () => withEditor(page, (editor) => editor.state.doc.textContent);
  const before = { labels: await labels(), text: await text() };
  const heading = await styleOf(page, "wif-1", "font-size");

  await withEditor(page, (editor) =>
    editor.commands.applyDocumentStyles({
      version: 1,
      levels: { "1": { markerSize: 18, notationColor: "red" }, "2": { markerVisible: false } },
    }),
  );
  await expect.poll(() => styleOf(page, "wif-1", "font-size", "::before")).toBe("24px");
  expect(await styleOf(page, "wif-1", "font-size")).toBe(heading);
  expect(await styleOf(page, "wif-2a", "content", "::before")).toBe("none");
  expect(await styleOf(page, "wif-2a1", "content", "::before")).not.toBe("none");
  expect(await labels()).toEqual(before.labels);
  expect(await text()).toBe(before.text);

  // Not hanging: the number sits in the line, the words follow it.
  await withEditor(page, (editor) =>
    editor.commands.applyDocumentStyles({ version: 1, levels: { "3": { hanging: false } } }),
  );
  await expect.poll(() => styleOf(page, "wif-2a1", "min-width", "::before")).toBe("0px");
});

test("numbering and appearance applied together are one transaction and one undo", async ({
  page,
}) => {
  const before = await docState(page);
  const text = await withEditor(page, (editor) => editor.state.doc.textContent);
  await openSettings(page);
  await chooseLevel(page, /^Level 2/);
  await setNumber(page, "Size (pt)", "14");
  await dialog(page).locator('[data-category="numbering"]').click();
  await dialog(page).getByText("Decimal", { exact: true }).click();
  // Previewed in the outline, not written.
  await expect(point(page, "wif-2a")).toHaveAttribute("data-label", "2.1.");
  expect(await docState(page)).toEqual(before);
  // The draft survives moving between categories.
  await dialog(page).locator('[data-category="appearance"]').click();
  await expect(dialog(page).getByRole("textbox", { name: "Size (pt)", exact: true })).toHaveValue(
    "14",
  );
  await expect(dialog(page).getByRole("status")).toContainText("numbering");

  await dialog(page).getByRole("button", { name: "Apply" }).click();
  const applied = await docState(page);
  expect(applied.styles).toMatchObject({ levels: { "2": { fontSize: 14 } } });
  expect((applied.layout as { numbering: unknown }).numbering).toEqual({
    version: 1,
    preset: "decimal",
  });
  expect(await withEditor(page, (editor) => editor.state.doc.textContent)).toBe(text);
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await docState(page)).toEqual(before);
  await expect(point(page, "wif-2a")).not.toHaveAttribute("data-label", "2.1.");
});

test("an unreadable layout is never replaced: Numbering refuses to edit it", async ({ page }) => {
  await withEditor(page, (editor) =>
    editor.view.dispatch(editor.state.tr.setDocAttribute("layout", { version: 99, odd: true })),
  );
  const before = await docState(page);
  await openSettings(page);
  await dialog(page).locator('[data-category="numbering"]').click();
  await expect(dialog(page).getByTestId("numbering-unreadable")).toBeVisible();
  await dialog(page).locator('[data-category="appearance"]').click();
  await chooseLevel(page, /^Level 2/);
  await setNumber(page, "Size (pt)", "14");
  await dialog(page).getByRole("button", { name: "Apply" }).click();
  // Appearance applies; the layout is exactly as stored.
  expect((await docState(page)).layout).toEqual(before.layout);
});

test("on a phone nothing scrolls sideways and Apply is in reach", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "The phone project.");
  await openSettings(page);
  for (const step of ["levels", "numbering"] as const) {
    if (step === "levels") await chooseLevel(page, /^Level 3/);
    else await dialog(page).locator('[data-category="numbering"]').click();
    const overflow = await page.evaluate(() => ({
      page: document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth,
      dialog: (() => {
        const element = document.querySelector('[data-testid="outline-settings"]') as HTMLElement;
        return element.scrollWidth - element.clientWidth;
      })(),
    }));
    expect(overflow.page, step).toBeLessThanOrEqual(0);
    expect(overflow.dialog, step).toBeLessThanOrEqual(0);
    await expect(dialog(page).getByRole("button", { name: "Apply" })).toBeInViewport();
    await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeInViewport();
  }
});
