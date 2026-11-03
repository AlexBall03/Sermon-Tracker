import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * BUG-001 follow-up (A4.1): with a passage selected that has passages on both
 * sides, Chrome keeps its own (hidden) selection elsewhere. Every key, IME
 * composition, clipboard action, and focus change from there must act at the
 * passage or nowhere: never at the document's start, never on another block.
 * Records only positions, node type names, and in-page comparisons.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;

test.describe.configure({ mode: "serial" });

type Outcome = {
  drawn: boolean;
  /** Blocks before the passage's neighbour and after the next one are untouched. */
  local: boolean;
  docChanged: boolean;
  selection: { type: string; from: number };
  /** The selection is at the document's first text position. */
  atStart: boolean;
};

async function openFixture(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
  await page.getByRole("combobox", { name: "Document" }).click();
  await page.getByRole("option", { name: /Print Layout test/ }).click();
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => {
    type Editor = {
      state: { doc: unknown };
      commands: { setLayout: (layout: string) => boolean };
    };
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: Editor;
    };
    element.editor.commands.setLayout("regular");
    (window as unknown as { __original: unknown }).__original = element.editor.state.doc;
  });
}

/** Puts the caret at the end of the text before three passages in a row; returns the middle one's index. */
function caretBeforeRun(page: Page): Promise<number> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
    const doc = editor.state.doc;
    let pos = 0;
    for (let i = 0; i + 2 < doc.childCount; i += 1) {
      const run = [0, 1, 2].every((k) => doc.child(i + k).type.name === "scripturePassage");
      if (run && i > 0 && doc.child(i - 1).isTextblock) {
        editor.commands.focus();
        editor.commands.setTextSelection(pos - 1);
        return i + 1;
      }
      pos += doc.child(i).nodeSize;
    }
    throw new Error("no run of three passages after a text block");
  });
}

/** Arrows down onto the middle passage of the run, as the person would. */
async function selectMiddle(page: Page) {
  const middle = await caretBeforeRun(page);
  for (let press = 0; press < 6; press += 1) {
    const at = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { state } = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
      const json = state.selection.toJSON();
      return json.type === "node" ? state.doc.resolve(json.anchor).index(0) : -1;
    });
    if (at === middle) return middle;
    await page.keyboard.press("ArrowDown");
    await settle(page);
  }
  throw new Error("the arrows did not reach the middle passage");
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 150))));

/** `after`: how many blocks after the passage the action may reach. */
function outcome(page: Page, middle: number, after: number): Promise<Outcome> {
  return page.evaluate(
    ([middle, after]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editor = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const original = (window as any).__original;
      const doc = editor.state.doc;
      let local = true;
      for (let i = 0; i < middle - 1; i += 1)
        if (!doc.child(i).eq(original.child(i))) local = false;
      const tail = original.childCount - (middle + 1 + after);
      for (let k = 1; k <= tail; k += 1)
        if (!doc.child(doc.childCount - k).eq(original.child(original.childCount - k)))
          local = false;
      // What is drawn says what the document says: no text the browser typed is left on the page.
      let drawn = true;
      let pos = 0;
      for (let i = 0; i < middle - 1; i += 1) {
        const dom = editor.view.nodeDOM(pos);
        if (dom && dom.textContent !== doc.child(i).textContent && doc.child(i).isTextblock)
          drawn = false;
        pos += doc.child(i).nodeSize;
      }
      const json = editor.state.selection.toJSON();
      return {
        drawn,
        local,
        docChanged: !doc.eq(original),
        selection: { type: json.type, from: editor.state.selection.from },
        atStart: editor.state.selection.from <= 2,
      };
    },
    [middle, after] as const,
  );
}

/** Undoes until the document is the original again. */
async function restore(page: Page) {
  for (let press = 0; press < 6; press += 1) {
    const same = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editor = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return editor.state.doc.eq((window as any).__original);
    });
    if (same) return;
    await page.keyboard.press("Control+z");
    await settle(page);
  }
  throw new Error("undo did not bring the document back");
}

type Action = {
  name: string;
  run: (page: Page) => Promise<void>;
  edits: boolean;
  /** Blocks after the passage it may change; 1 unless said. */
  after?: number;
};

const press = (key: string) => async (page: Page) => {
  await page.keyboard.press(key);
};

const actions: Action[] = [
  { name: "type a letter", run: press("x"), edits: true },
  { name: "Enter", run: press("Enter"), edits: true },
  { name: "Backspace", run: press("Backspace"), edits: true },
  { name: "Delete", run: press("Delete"), edits: true },
  {
    name: "IME composition",
    edits: true,
    // ProseMirror deletes a selected block when a composition starts and types
    // in the next text block, after the run (its rule for any selected block).
    after: 2,
    run: async (page) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.imeSetComposition", { text: "´", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: "á" });
      await cdp.detach();
    },
  },
  {
    name: "copy then paste",
    edits: true,
    run: async (page) => {
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Control+v");
    },
  },
  { name: "Shift+ArrowDown", run: press("Shift+ArrowDown"), edits: false },
  { name: "Shift+ArrowUp", run: press("Shift+ArrowUp"), edits: false },
  { name: "PageDown", run: press("PageDown"), edits: false },
  { name: "PageUp", run: press("PageUp"), edits: false },
  { name: "Home", run: press("Home"), edits: false },
  { name: "End", run: press("End"), edits: false },
  {
    name: "focus away and back",
    edits: false,
    run: async (page) => {
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const editor = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
        editor.view.dom.blur();
      });
      await settle(page);
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const editor = (document.querySelector('[data-testid="sermon-editor"]') as any).editor;
        editor.view.focus();
      });
    },
  },
];

test.describe("BUG-001: a selected passage the browser cannot hold", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "" });
  });

  test("every action acts at the passage or nowhere", async ({ page }) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    await openFixture(page);
    const results: string[] = [];
    for (const action of actions) {
      const middle = await selectMiddle(page);
      await action.run(page);
      await settle(page);
      const result = await outcome(page, middle, action.after ?? 1);
      results.push(`${action.name}: ${JSON.stringify(result)}`);
      if (!result.drawn) problems.push(`${action.name} left text on the page the document lacks`);
      if (!result.local) problems.push(`${action.name} changed another block`);
      if (result.atStart) problems.push(`${action.name} sent the caret to the start`);
      if (!action.edits && result.docChanged) problems.push(`${action.name} changed the document`);
      await restore(page);
    }
    console.log("HELD\n" + results.join("\n"));
    expect(problems).toEqual([]);
  });
});
