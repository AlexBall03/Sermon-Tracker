import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * The schema v4 prototype (/lab/editor/v4) in a real browser: only what
 * jsdom cannot establish. The unit tests (src/features/editor-lab/v4) check
 * the documents; these check the caret, real typing and native deletion,
 * arrow keys across blocks, the presentation, and Print Layout. Signed in
 * as editor.spec.ts is; nothing is created or changed on the server.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("schema v4", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
  await expect(editor(page).locator('[data-id="p-a"]')).toBeVisible({ timeout: 30_000 });
}

const editor = (page: Page) => page.getByTestId("lab-v4-editor");
const point = (page: Page, id: string) =>
  editor(page).locator(`p[data-type="point"][data-id="${id}"]`);
const paragraph = (page: Page, text: string | RegExp) =>
  editor(page).locator("p:not([data-type])", { hasText: text });

/** Where the browser's caret is: the point it is in (by ID) or the text of its paragraph. */
function caretBlock(page: Page) {
  return page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const block = element?.closest(".lab-editor > *");
    if (!block) return null;
    return block.getAttribute("data-type") === "point"
      ? `point:${block.getAttribute("data-id")}`
      : `text:${block.textContent}`;
  });
}

/** Every top-level block, as `caretBlock` names it, in document order. */
function blockOrder(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-testid="lab-v4-editor"] > :not([contenteditable="false"])'),
    ).map((block) =>
      block.getAttribute("data-type") === "point"
        ? `point:${block.getAttribute("data-id")}`
        : `text:${block.textContent}`,
    ),
  );
}

/** Whether keyboard focus is in the editor. */
function focusInEditor(page: Page) {
  return page.evaluate(() =>
    Boolean(document.activeElement?.closest('[data-testid="lab-v4-editor"]')),
  );
}

/** A place in a top-level block: a point (by ID) or a paragraph (by its text), and how far in. */
type Spot = [block: string, offset: number | "end"];

/**
 * Puts the selection (or, without `to`, the caret) in the editor and focuses
 * it, through the editor itself (Tiptap keeps itself on its element). The
 * PS-ER1 tests place it so rather than with a click and arrow keys: what
 * they test is the key pressed there, and keys pressed straight after a
 * click are sometimes lost in this lab, before any v4 code runs (it happens
 * on the commit before PS-ER1 too).
 */
async function place(page: Page, from: Spot, to?: Spot) {
  await page.evaluate(
    ([start, end]) => {
      type NodeLike = { textContent: string; attrs: { id?: string }; content: { size: number } };
      const element = document.querySelector('[data-testid="lab-v4-editor"]') as HTMLElement & {
        editor: {
          state: { doc: { forEach: (f: (n: NodeLike, pos: number) => void) => void } };
          commands: {
            focus: () => void;
            setTextSelection: (range: number | { from: number; to: number }) => void;
          };
        };
      };
      const find = ([name, offset]: Spot) => {
        let found = -1;
        element.editor.state.doc.forEach((node, pos) => {
          if (found < 0 && (node.attrs.id === name || node.textContent === name)) {
            found = pos + 1 + (offset === "end" ? node.content.size : offset);
          }
        });
        if (found < 0) throw new Error(`no block ${name}`);
        return found;
      };
      element.editor.commands.focus();
      element.editor.commands.setTextSelection(
        end ? { from: find(start), to: find(end) } : find(start),
      );
    },
    [from, to] as const,
  );
}

/** Selects from "Body of A" after "Body" into Subpoint B's heading after "Subpoint ". */
const selectIntoB = (page: Page) => place(page, ["Body of A", 4], ["p-b", "Subpoint ".length]);

/** Clicks at the very end (or start) of a block's text. */
async function clickEdge(page: Page, target: ReturnType<typeof point>, edge: "start" | "end") {
  await target.click();
  await page.keyboard.press(edge === "end" ? "End" : "Home");
}

test.describe("schema v4 prototype, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Tested against the development Clerk instance only.");
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Checked at desktop size.");
  });

  test("Enter at a heading's end writes in a new paragraph that belongs to the point", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-a"), "end");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Typed under A");
    await expect(paragraph(page, "Typed under A")).toHaveAttribute("data-depth", "2");
    const row = page.getByTestId("lab-v4-structure").locator("tr", { hasText: "Typed under A" });
    await expect(row).toContainText("Subpoint A");
  });

  test("Enter in a heading's middle splits it; the original keeps its ID and the caret is on it", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-b"), "start");
    for (let index = 0; index < "Subpoint".length; index += 1)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(point(page, "p-b")).toHaveText(" B");
    await expect(
      editor(page).locator('p[data-type="point"]', { hasText: /^Subpoint$/ }),
    ).toHaveCount(1);
    expect(await caretBlock(page)).toBe("point:p-b");
    await page.keyboard.type("X");
    await expect(point(page, "p-b")).toHaveText("X B");
  });

  test("Backspace deletes characters natively, and at a heading's start turns the point into writing", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-b"), "end");
    await page.keyboard.press("Backspace");
    await expect(point(page, "p-b")).toHaveText("Subpoint ");
    // History joins adjacent changes made within 500 ms into one undo step; these are two.
    await page.waitForTimeout(600);
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    await expect(point(page, "p-b")).toHaveCount(0);
    await expect(paragraph(page, "Subpoint")).toHaveAttribute("data-depth", "1");
    await expect(page.getByTestId("lab-v4-notice")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(point(page, "p-b")).toHaveText("Subpoint ");
  });

  test("Delete before a point moves into its heading; arrows cross blocks without stopping between them", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, paragraph(page, "Belongs to I") as ReturnType<typeof point>, "end");
    await page.keyboard.press("Delete");
    expect(await caretBlock(page)).toBe("point:p-b");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    expect(await caretBlock(page)).toBe("text:Body of B");
    await page.keyboard.press("ArrowDown");
    expect(await caretBlock(page)).toBe("point:p-ii");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await caretBlock(page)).toBe("point:p-b");
  });

  test("typing over a selection from writing into a heading keeps the point", async ({ page }) => {
    await openV4(page);
    await paragraph(page, "Body of A").click();
    await page.keyboard.press("Home");
    for (let index = 0; index < 4; index += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let index = 0; index < "Subpoint ".length; index += 1)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
    await page.keyboard.type("!");
    await expect(paragraph(page, "Body!")).toHaveCount(1);
    await expect(point(page, "p-b")).toHaveText("B");
  });

  /* PS-ER1: interaction hardening, where only a browser can tell. */

  test("Ctrl+Backspace at a heading's start turns the point into writing, as Backspace does", async ({
    page,
  }) => {
    await openV4(page);
    await place(page, ["p-b", 0]);
    await page.keyboard.press("Control+Backspace");
    await expect(point(page, "p-b")).toHaveCount(0);
    await expect(paragraph(page, "Subpoint B")).toHaveAttribute("data-depth", "1");
    await page.keyboard.press("Control+z");
    await expect(point(page, "p-b")).toHaveText("Subpoint B");
  });

  test("Enter over a selection from writing into a heading deletes it and keeps the point", async ({
    page,
  }) => {
    await openV4(page);
    await selectIntoB(page);
    await page.keyboard.press("Enter");
    await expect(paragraph(page, /^Body$/)).toHaveText("Body");
    await expect(point(page, "p-b")).toHaveText("B");
    expect(await caretBlock(page)).toBe("point:p-b");
  });

  test("Tab with nothing to indent moves focus on, and Shift+Tab comes back", async ({ page }) => {
    await openV4(page);
    await place(page, ["p-a", "end"]);
    const before = await editor(page).innerHTML();
    await page.keyboard.press("Tab");
    expect(await focusInEditor(page)).toBe(false);
    expect(await editor(page).innerHTML()).toBe(before);
    await page.keyboard.press("Shift+Tab");
    expect(await focusInEditor(page)).toBe(true);
  });

  test("Shift+Tab moves a subpoint out with its writing, after its parent's own", async ({
    page,
  }) => {
    await openV4(page);
    await place(page, ["p-a", "end"]);
    await page.keyboard.press("Shift+Tab");
    expect(await focusInEditor(page)).toBe(true);
    expect(await blockOrder(page)).toEqual([
      "point:p-i",
      "text:Belongs to I",
      "point:p-b",
      "text:Body of B",
      "point:p-a",
      "text:Body of A",
      "point:p-ii",
    ]);
    await expect(point(page, "p-a")).toHaveAttribute("data-depth", "1");
  });

  test("cutting a selection from writing into a heading keeps the point, and the cut pastes back", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openV4(page);
    await selectIntoB(page);
    await page.keyboard.press("Control+x");
    await expect(point(page, "p-b")).toHaveText("B");
    await expect(paragraph(page, /^Body$/)).toHaveText("Body");
    await place(page, ["p-ii", "end"]);
    await page.keyboard.press("Control+v");
    await expect(editor(page)).toContainText("Belongs to I");
  });

  // Dragging text is not checked here: Playwright starts a drag in the editor but delivers no drop
  // (mouse or dragTo). The drop itself is unit-tested (`dropTransaction`, interaction.test.ts).

  test("a deletion the browser makes on its own never merges a heading into writing", async ({
    page,
  }) => {
    await openV4(page);
    await place(page, ["Belongs to I", "end"]);
    // execCommand edits as a context menu or a virtual keyboard does: no key the editor sees.
    await page.evaluate(() => document.execCommand("forwardDelete"));
    await expect(point(page, "p-b")).toHaveText("Subpoint B");
    await expect(paragraph(page, "Belongs to I")).toHaveText("Belongs to I");
    await expect(page.getByTestId("lab-v4-notice")).toBeVisible();
  });

  test("an IME composition over a selection from writing into a heading", async ({ page }) => {
    await openV4(page);
    const client = await page.context().newCDPSession(page);
    // A composition at a caret inside a heading, as a baseline.
    await place(page, ["p-ii", "end"]);
    await client.send("Input.imeSetComposition", {
      text: "か",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await client.send("Input.insertText", { text: "か" });
    await expect(point(page, "p-ii")).toHaveText("Main Point IIか");
    // Over a selection that crosses into a heading.
    await selectIntoB(page);
    await client.send("Input.imeSetComposition", {
      text: "あ",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await client.send("Input.insertText", { text: "あ" });
    console.log(`LAB-IME ${JSON.stringify(await blockOrder(page))}`);
    await expect(point(page, "p-b")).toHaveText("B");
    await expect(paragraph(page, "Bodyあ")).toHaveCount(1);
  });

  test("presentation changes indentation only; Print Layout paginates and stays editable", async ({
    page,
  }) => {
    await openV4(page);
    const body = paragraph(page, "Body of A");
    const indent = () => body.evaluate((element) => getComputedStyle(element).paddingLeft);
    expect(await indent()).not.toBe("0px");
    await page.getByRole("radio", { name: "Manuscript" }).check({ force: true });
    expect(await indent()).toBe("0px");
    await expect(body).toHaveAttribute("data-depth", "2");
    await page.getByRole("radio", { name: "Outline" }).check({ force: true });

    await page.getByRole("combobox", { name: "Document" }).click();
    await page.getByRole("option", { name: /Print Layout test/ }).click();
    await page.getByRole("radio", { name: "Print" }).check({ force: true });
    await expect(editor(page)).toHaveAttribute("data-layout", "print");
    const gaps = await editor(page).locator(".lab-page-gap").count();
    expect(gaps).toBeGreaterThan(0);
    const first = editor(page).locator('p[data-type="point"]').first();
    await clickEdge(page, first, "end");
    await page.keyboard.type(" typed in print");
    await expect(first).toContainText("typed in print");
    console.log(`LAB-MEASURE ${JSON.stringify({ name: "v4-print", gaps })}`);
  });
});
