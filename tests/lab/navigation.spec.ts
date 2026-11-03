import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * BUG-001 (A4.1): walk the lab documents with real arrow keys and
 * record, after every press, only positions, selection types, and the caret's
 * rectangle. Never text or document JSON.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

test.describe.configure({ mode: "serial" });

async function openLab(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
}

async function pick(page: Page, name: RegExp) {
  await page.getByRole("combobox", { name: "Document" }).click();
  await page.getByRole("option", { name }).click();
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true");
}

async function layout(page: Page, mode: "Regular" | "Print") {
  // The View menu's own command: a view-only transaction.
  await page.evaluate((print) => {
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: { commands: { setLayout: (layout: string) => boolean } };
    };
    element.editor.commands.setLayout(print ? "print" : "regular");
  }, mode === "Print");
  await expect(page.getByTestId("sermon-editor")).toHaveAttribute(
    "data-layout",
    mode === "Print" ? "print" : "regular",
  );
}

type Snap = {
  type: string;
  anchor: number;
  head: number;
  block: number;
  caret: { top: number; left: number } | null;
  first: boolean;
  last: boolean;
  prevented: boolean | null;
  transactions: number;
};

async function instrument(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __nav?: { prevented: boolean | null; transactions: number };
    };
    if (w.__nav) return;
    const nav = { prevented: null as boolean | null, transactions: 0 };
    w.__nav = nav;
    window.addEventListener("keydown", (event) => {
      nav.prevented = event.defaultPrevented;
    });
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: { on: (name: string, f: () => void) => void };
    };
    element.editor.on("transaction", () => {
      nav.transactions += 1;
    });
  });
}

function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const element = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: {
        state: {
          selection: {
            toJSON: () => { type: string };
            anchor: number;
            head: number;
            $head: { depth: number; index: (d: number) => number };
          };
        };
        view: { coordsAtPos: (pos: number) => { top: number; left: number; bottom: number } };
      };
    };
    const { selection } = element.editor.state;
    const shown = window.getSelection();
    let caret: { top: number; left: number } | null = null;
    if (shown && shown.rangeCount > 0) {
      const range = shown.getRangeAt(0).cloneRange();
      range.collapse(false);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const origin = element.getBoundingClientRect();
      if (rect && (rect.height > 0 || rect.top !== 0))
        caret = { top: rect.top - origin.top, left: rect.left - origin.left };
    }
    // The first and last rendered lines of the editor's own text.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        (node.parentElement?.closest('[contenteditable="false"]') ? 2 : 1) as number,
    });
    const r = document.createRange();
    let top = Infinity;
    let bottom = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node as Text).data.trim()) continue;
      r.selectNodeContents(node);
      for (const rect of Array.from(r.getClientRects())) {
        if (rect.height === 0) continue;
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }
    }
    const coords = element.editor.view.coordsAtPos(selection.head);
    const nav = (
      window as unknown as { __nav: { prevented: boolean | null; transactions: number } }
    ).__nav;
    return {
      type: selection.toJSON().type,
      anchor: selection.anchor,
      head: selection.head,
      block: selection.$head.depth > 0 ? selection.$head.index(0) : -1,
      caret,
      first: coords.top <= top + 2,
      last: coords.bottom >= bottom - 2,
      prevented: nav.prevented,
      transactions: nav.transactions,
    };
  });
}

const same = (a: Snap, b: Snap) =>
  a.type === b.type &&
  a.anchor === b.anchor &&
  a.head === b.head &&
  Math.abs((a.caret?.top ?? 0) - (b.caret?.top ?? 0)) < 1 &&
  Math.abs((a.caret?.left ?? 0) - (b.caret?.left ?? 0)) < 1;

/** Lets the browser's selectionchange reach ProseMirror (it is asynchronous) before reading. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 120))));

async function walk(page: Page, key: "ArrowDown" | "ArrowUp", limit: number) {
  const stalls: { before: Snap; after: Snap }[] = [];
  let before = await snap(page);
  const path: string[] = [before.type[0] + before.head + "@" + before.block];
  let index = 0;
  for (; index < limit; index += 1) {
    await page.keyboard.press(key);
    await settle(page);
    const after = await snap(page);
    path.push(after.type[0] + after.head + "@" + after.block);
    if (same(before, after)) {
      const atEdge = key === "ArrowDown" ? after.last : after.first;
      if (atEdge) break;
      stalls.push({ before, after });
      if (stalls.length > 5) break;
      // Try again: a genuine dead end repeats.
      await page.keyboard.press(key);
      await settle(page);
      const again = await snap(page);
      if (same(after, again)) break;
      before = again;
      continue;
    }
    before = after;
  }
  // Every step must go the key's way: a step back is the caret thrown elsewhere.
  const heads = path.map((step) => Number(step.slice(1).split("@")[0]));
  const backwards = heads.flatMap((head, i) =>
    i > 0 && (key === "ArrowDown" ? head < heads[i - 1] : head > heads[i - 1])
      ? [`${path[i - 1]}->${path[i]}`]
      : [],
  );
  return {
    path: path.join(" "),
    stalls,
    backwards,
    presses: index,
    end: { head: before.head, block: before.block, first: before.first, last: before.last },
  };
}

test.describe("BUG-001: the arrow keys walk the whole document", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  for (const fixture of [/When Idols Fall/, /Print Layout test/]) {
    for (const mode of ["Regular", "Print"] as const) {
      test(`walk ${fixture.source} in ${mode}`, async ({ page }) => {
        await openLab(page);
        await pick(page, fixture);
        await layout(page, mode);
        await instrument(page);
        await page.getByTestId("sermon-editor").locator("p").first().click();
        await page.keyboard.press("Control+Home");
        await settle(page);
        const down = await walk(page, "ArrowDown", 400);
        await page.keyboard.press("Control+End");
        await settle(page);
        const up = await walk(page, "ArrowUp", 400);
        console.log(`NAV ${fixture.source} ${mode} ${JSON.stringify({ down, up })}`);
        // Down reaches the last line and Up the first, with no stall and no step back.
        expect(down.backwards).toEqual([]);
        expect(down.stalls).toEqual([]);
        expect(down.end.last).toBe(true);
        expect(up.backwards).toEqual([]);
        expect(up.stalls).toEqual([]);
        expect(up.end.first).toBe(true);
      });
    }
  }
});
