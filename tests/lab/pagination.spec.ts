import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { pdfLines, squeeze, type PdfLine } from "./pdf-text";

/*
 * Print Layout's feasibility (PS-1B.2B.1): PS-1B.1 §G.2's criteria P1–P11,
 * plus the owner's default layout, paper, and margins, on a development
 * server, signed in, as editor.spec.ts is. The lab saves nothing and reads no
 * account data; these tests change nothing on the server. Evidence is
 * printed as `LAB-MEASURE {json}` lines for the handoff.
 *
 * "Layout" coordinates are CSS pixels from the top of the first sheet,
 * before Print Layout's scaling: the paper's own pixels, 96 to the inch.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

const testSermon = "Print Layout test (long paragraph, Romans 8)";

// Each criterion gets its own result: one that fails does not stop the others.
test.describe.configure({ mode: "default" });

function report(name: string, values: Record<string, unknown>) {
  console.log(
    `LAB-MEASURE ${JSON.stringify({ name, project: test.info().project.name, ...values })}`,
  );
}

const desktopOnly = () =>
  test.skip(test.info().project.name !== "desktop", "Checked at desktop size.");

/** Helpers the page itself runs (`window.lab`). */
function installHelpers() {
  type Editor = import("@tiptap/core").Editor;
  const root = () =>
    document.querySelector('[data-testid="lab-editor"]') as HTMLElement & { editor: Editor };
  const geometry = () => {
    const element = root();
    const style = getComputedStyle(element);
    const px = (name: string) => Number.parseFloat(style.getPropertyValue(name));
    const box = element.getBoundingClientRect();
    return {
      box,
      scale: box.width / element.offsetWidth,
      mt: px("--mt"),
      ml: px("--ml"),
      contentH: px("--content-h"),
      stride: px("--page-h") + px("--desk"),
      pageW: px("--page-w"),
      pages: Number(element.querySelector<HTMLElement>(".lab-pages")?.dataset.pages ?? "0"),
      layout: element.dataset.layout,
    };
  };
  const toLayout = (clientY: number) => {
    const g = geometry();
    return (clientY - g.box.top) / g.scale;
  };
  /** The page a layout y is on, and whether it is inside that page's text area. */
  const bandOf = (y: number) => {
    const g = geometry();
    const page = Math.floor((y - g.mt) / g.stride);
    const into = y - g.mt - page * g.stride;
    return { page, inside: into >= -0.5 && into <= g.contentH + 0.5 };
  };
  const printed = (node: Node) => {
    const element = node.parentElement;
    return !element?.closest('.lab-pages, .lab-passage[data-print="hidden"]');
  };
  /** The text from a caret position on, as it reads on the page. */
  const textFrom = (node: Node, offset: number, length: number) => {
    const walker = document.createTreeWalker(root(), NodeFilter.SHOW_TEXT);
    let text = "";
    let current: Node | null;
    if (node.nodeType === Node.TEXT_NODE) {
      walker.currentNode = node;
      if (printed(node)) text = (node as Text).data.slice(offset);
    } else {
      const after = node.childNodes[offset] ?? node;
      walker.currentNode = after;
      if (after.nodeType === Node.TEXT_NODE && printed(after)) text = (after as Text).data;
    }
    while (text.replace(/\s+/g, "").length < length && (current = walker.nextNode())) {
      if (printed(current)) text += (current as Text).data;
    }
    return text.replace(/\s+/g, "").slice(0, length);
  };
  /** The element that scrolls the document (the workspace's desk), or the page. */
  const scroller = () => {
    for (let element = root().parentElement; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
        return element;
      }
    }
    return document.scrollingElement as HTMLElement;
  };
  /**
   * Scrolls so that layout y is in view (the browser answers "what is at this
   * point" only on screen), and returns its client y afterwards.
   */
  const reveal = (y: number) => {
    const g = geometry();
    const client = g.box.top + y * g.scale;
    scroller().scrollTop += client - window.innerHeight * 0.4;
    return geometry().box.top + y * geometry().scale;
  };
  const firstLines = () => {
    const lines: string[] = [];
    for (let page = 0; page < geometry().pages; page += 1) {
      const g = geometry();
      const top = g.mt + page * g.stride + 4;
      const y = reveal(top);
      const x = geometry().box.left + (g.ml + 1) * g.scale;
      const caret = document.caretPositionFromPoint(x, y);
      lines.push(caret ? textFrom(caret.offsetNode, caret.offset, 16) : "");
    }
    return lines;
  };
  const history = () => {
    const state = root().editor.state;
    const plugin = state.plugins.find((p) =>
      (p as unknown as { key: string }).key.startsWith("history$"),
    );
    const value = plugin?.getState(state) as { done: { eventCount: number } } | undefined;
    return value?.done.eventCount ?? -1;
  };
  const changes: boolean[] = [];
  let recording = false;
  const record = () => {
    changes.length = 0;
    if (recording) return;
    recording = true;
    root().editor.on("transaction", ({ transaction }) => changes.push(transaction.docChanged));
  };
  (window as unknown as { lab: unknown }).lab = {
    root,
    editor: () => root().editor,
    geometry,
    toLayout,
    bandOf,
    firstLines,
    reveal,
    json: () => JSON.stringify(root().editor.getJSON()),
    history,
    record,
    changes,
  };
}

type Lab = {
  root(): HTMLElement;
  editor(): import("@tiptap/core").Editor;
  geometry(): {
    box: DOMRect;
    scale: number;
    mt: number;
    ml: number;
    contentH: number;
    stride: number;
    pageW: number;
    pages: number;
    layout: string | undefined;
  };
  toLayout(clientY: number): number;
  bandOf(y: number): { page: number; inside: boolean };
  firstLines(): string[];
  reveal(y: number): number;
  json(): string;
  history(): number;
  record(): void;
  changes: boolean[];
};
declare global {
  interface Window {
    lab: Lab;
  }
}

async function openLab(page: Page, storage: Record<string, string> = {}) {
  await page.addInitScript(installHelpers);
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  if (Object.keys(storage).length > 0) {
    await page.evaluate((values) => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, storage);
  }
  await page.goto("/lab/editor");
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 60_000 });
  await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const editor = (page: Page) => page.getByTestId("lab-editor");

/**
 * Chooses a radio option the way a click does. The workspace's controls can
 * be scrolled out of view (a phone's toolbar scrolls sideways), where a
 * forced click misses.
 */
async function pick(page: Page, name: string) {
  await page
    .getByRole("radio", { name, exact: true })
    .evaluate((input: HTMLInputElement) => input.click());
}

async function layout(page: Page, mode: "Regular" | "Print") {
  await pick(page, mode);
  await expect(editor(page)).toHaveAttribute("data-layout", mode.toLowerCase());
}

/** Opens the test sermon in Print Layout with Romans 8 loaded. */
async function openTestSermon(page: Page) {
  await openLab(page);
  await choose(page, "Document", testSermon);
  await layout(page, "Print");
  await expect(
    editor(page).locator('.lab-passage[data-id="pl-3-p1"] .lab-passage-text'),
  ).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await settled(page);
}

/** Waits until pagination has run and nothing changed for a few frames. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let last = "";
    for (let stable = 0, tries = 0; stable < 4 && tries < 300; tries += 1) {
      await frame();
      const g = window.lab.geometry();
      const now = `${g.box.height}|${g.pages}|${g.scale}`;
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
  });
}

const screenPages = async (page: Page) => {
  await settled(page);
  return page.evaluate(() => ({
    pages: window.lab.geometry().pages,
    firstLines: window.lab.firstLines(),
  }));
};

/** The text lines inside each page's text area, by page. */
function bodyLines(lines: PdfLine[], pageHeight: number, top: number, textHeight: number) {
  const pages: string[][] = [];
  for (const line of lines) {
    const into = line.y - line.page * pageHeight;
    if (into < top || into > top + textHeight + 6) continue;
    (pages[line.page] ??= []).push(squeeze(line.text));
  }
  return pages;
}

/**
 * Whether each screen page starts where a printed page does: exactly (its
 * first line), or within one line (the printed page's second line, or the
 * last line of the page before it).
 */
function compare(screen: string[], printed: string[][]) {
  return screen.map((snippet, index) => {
    const here = printed[index] ?? [];
    const before = printed[index - 1] ?? [];
    const probe = snippet.slice(0, 12);
    const first = here[0] ?? "";
    // The same first line: it holds the screen's first words, or is their start (a short line).
    const exact =
      probe.length > 0 &&
      first.length > 0 &&
      (first.includes(probe) || probe.startsWith(first.slice(0, 12)));
    const withinOne =
      exact ||
      (probe.length > 0 &&
        ((here[1] ?? "").includes(probe) || (before[before.length - 1] ?? "").includes(probe)));
    return { page: index + 1, snippet, printed: (here[0] ?? "").slice(0, 30), exact, withinOne };
  });
}

/** Prints the page to PDF as Chrome prints it, and reads its lines. */
async function printLines(page: Page, pageHeight: number) {
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return { bytes: pdf.length, lines: pdfLines(pdf, pageHeight) };
}

test.describe("Print Layout, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "The lab is tested against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("opens in the default layout for the device, and keeps a chosen default", async ({
    page,
  }) => {
    await openLab(page);
    const desktop = test.info().project.name === "desktop";
    // Automatic: Print on a desktop, Regular on a phone.
    await expect(editor(page)).toHaveAttribute("data-layout", desktop ? "print" : "regular");
    // Opening the editor made no document change and no history.
    expect(await page.evaluate(() => window.lab.history())).toBe(0);

    // A chosen default holds for the next document opened, on this device.
    const other = desktop ? "Regular" : "Print";
    await choose(page, "Default layout", other);
    await page.reload();
    await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
      timeout: 60_000,
    });
    await expect(editor(page)).toHaveAttribute("data-layout", other.toLowerCase());

    // Switching in the editor is this tab's, and never changes the default.
    await layout(page, desktop ? "Print" : "Regular");
    await expect(page.getByRole("combobox", { name: "Default layout" })).toContainText(other);
    await page.reload();
    await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
      timeout: 60_000,
    });
    await expect(editor(page)).toHaveAttribute("data-layout", desktop ? "print" : "regular");
    report("default-layout", { automatic: desktop ? "print" : "regular", chosen: other });
  });

  test("P2 and P1: a long paragraph flows over pages where a print of the same content breaks", async ({
    page,
  }) => {
    desktopOnly();
    test.setTimeout(180_000);
    await openTestSermon(page);

    // P2: every line of the paragraph is inside a page's text area; none hidden or repeated.
    const p2 = await page.evaluate(() => {
      const paragraph = document.querySelector(
        '[data-id="pl-1"] > p:not([data-type])',
      ) as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const tops = new Map<number, { top: number; bottom: number }>();
      for (const rect of range.getClientRects()) {
        const top = Math.round(window.lab.toLayout(rect.top));
        const bottom = window.lab.toLayout(rect.bottom);
        const known = tops.get(top);
        tops.set(top, { top, bottom: Math.max(bottom, known?.bottom ?? bottom) });
      }
      const lines = [...tops.values()].sort((a, b) => a.top - b.top);
      const bands = lines.map((line) => ({
        start: window.lab.bandOf(line.top + 0.5),
        end: window.lab.bandOf(line.bottom - 0.5),
      }));
      // The same node, read from the document: the text the editor holds.
      const editor = window.lab.editor();
      let held = "";
      editor.state.doc.descendants((node) => {
        if (node.attrs.id === "pl-1") {
          held = node.child(1).textContent;
          return false;
        }
        return true;
      });
      const shown = paragraph.textContent ?? "";
      const numbers = [...shown.matchAll(/Long (\d+):/g)].map((match) => Number(match[1]));
      return {
        lines: lines.length,
        pages: [...new Set(bands.map((band) => band.start.page))],
        everyLineInside: bands.every(
          (band) => band.start.inside && band.end.inside && band.start.page === band.end.page,
        ),
        sameText: shown === held,
        sentencesInOrder: numbers.every((n, index) => n === index + 1) && numbers.length === 48,
      };
    });
    report("P2", p2);
    expect(p2.pages.length).toBeGreaterThanOrEqual(2);
    expect(p2.everyLineInside).toBe(true);
    expect(p2.sameText).toBe(true);
    expect(p2.sentencesInOrder).toBe(true);

    // P1: the browser's own pagination of the same content (Regular Layout,
    // printed on Letter with one-inch margins) is the reference.
    const screen = await screenPages(page);
    await layout(page, "Regular");
    await page.getByRole("button", { name: "Expand passages in Regular" }).click();
    await page.addStyleTag({
      content: `@media print {
        @page { size: 8.5in 11in; margin: 1in; }
        body:has(.lab-editor) :not(:has(.lab-editor), .lab-editor, .lab-editor *) { display: none !important; }
        body:has(.lab-editor) :has(.lab-editor) { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important; width: auto !important; max-width: none !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
        .lab-editor { width: 624px !important; max-width: none !important; margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
        .lab-editor > .lab-page-break { break-after: page; margin: 0; border: 0; height: 0; }
        .lab-point .lab-point { padding-left: 1.25rem !important; }
        .lab-passage[data-print="reference"] .lab-passage-text, .lab-passage[data-print="hidden"] { display: none !important; }
      }`,
    });
    // With @page margins Chrome places text in one column of text areas, 864 px each,
    // measured from inside the margin: a page is 864 px of that column.
    const reference = await printLines(page, 864);
    const printed = bodyLines(reference.lines, 864, 0, 864);
    const result = compare(screen.firstLines, printed);
    const raw = reference.lines
      .filter((line, index, all) => index === 0 || all[index - 1].page !== line.page)
      .map((line) => ({ page: line.page, y: Math.round(line.y), text: line.text.slice(0, 30) }));
    report("P1", {
      referenceStarts: raw,
      referenceLinesPerPage: printed.map((lines) => lines.length),
      screenPages: screen.pages,
      referencePages: printed.length,
      pdfBytes: reference.bytes,
      pages: result,
    });
    expect(screen.pages).toBe(printed.length);
    for (const row of result) expect(row, `page ${row.page}`).toMatchObject({ withinOne: true });
  });

  test("P11: printing Print Layout breaks where the screen does (Letter and A4)", async ({
    page,
  }) => {
    desktopOnly();
    test.setTimeout(180_000);
    await openTestSermon(page);
    for (const paper of [
      { name: "Letter (8.5 × 11 in)", height: 1056 },
      { name: "A4 (210 × 297 mm)", height: (297 * 96) / 25.4 },
    ]) {
      await choose(page, "Paper", paper.name);
      await settled(page);
      const screen = await screenPages(page);
      const geometry = await page.evaluate(() => {
        const g = window.lab.geometry();
        return { mt: g.mt, contentH: g.contentH };
      });
      const print = await printLines(page, paper.height);
      const printed = bodyLines(print.lines, paper.height, geometry.mt, geometry.contentH);
      const result = compare(screen.firstLines, printed);
      report("P11", {
        paper: paper.name,
        printedLinesPerPage: printed.map((lines) => lines.length),
        screenPages: screen.pages,
        printedPages: printed.length,
        pdfBytes: print.bytes,
        pages: result,
      });
      expect(printed.length).toBe(screen.pages);
      for (const row of result)
        expect(row, `${paper.name} page ${row.page}`).toMatchObject({ exact: true });
    }
    await choose(page, "Paper", "Letter (8.5 × 11 in)");

    // In dark mode too, a page prints in ink on paper: dark text, no dark band.
    await page.emulateMedia({ media: "print" });
    const ink = await page.evaluate(() => {
      const root = window.lab.root();
      const html = document.documentElement;
      const wasDark = html.classList.contains("dark");
      html.classList.add("dark");
      const read = {
        dark: document.documentElement.classList.contains("dark"),
        text: getComputedStyle(root).color,
        pageEdge: getComputedStyle(root.querySelector(".lab-page-end")!).backgroundColor,
      };
      if (!wasDark) html.classList.remove("dark");
      return read;
    });
    await page.emulateMedia({ media: "screen" });
    report("P11-ink", ink);
    expect(ink.text).toBe("rgb(23, 24, 27)");
    expect(ink.pageEdge).toBe("rgba(0, 0, 0, 0)");
  });

  test("P3: the caret, typing, and arrow keys across a page gap", async ({ page }) => {
    test.setTimeout(120_000);
    await openTestSermon(page);
    const before = await page.evaluate(() => window.lab.json());

    /**
     * Where the caret is drawn (the browser's own caret: the selection's
     * rectangle), its page, whether that is inside the text area, and whether
     * ProseMirror places the same position there. At a line that wraps, the
     * end of one line and the start of the next are one position, so either
     * of ProseMirror's two sides may be the one drawn.
     */
    const caret = () =>
      page.evaluate(() => {
        const editor = window.lab.editor();
        const head = editor.state.selection.head;
        const range = getSelection()!.getRangeAt(0).cloneRange();
        range.collapse(false);
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        const band = window.lab.bandOf(window.lab.toLayout((rect.top + rect.bottom) / 2));
        const near = (side: number) => {
          const coords = editor.view.coordsAtPos(head, side);
          return Math.abs(rect.top - coords.top) < 3 && Math.abs(rect.left - coords.left) < 3;
        };
        return { head, ...band, domAgrees: near(-1) || near(1) };
      });

    // The last line of the long paragraph's first page, and the line after the gap.
    const lineEnds = await page.evaluate(() => {
      const paragraph = document.querySelector(
        '[data-id="pl-1"] > p:not([data-type])',
      ) as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const rects = [...range.getClientRects()];
      const firstPage = window.lab.bandOf(window.lab.toLayout(rects[0].top + 1)).page;
      const last = rects.filter(
        (rect) => window.lab.bandOf(window.lab.toLayout(rect.top + 1)).page === firstPage,
      );
      // Bring the line on screen, then read where it is now.
      const index = rects.indexOf(last[last.length - 1]);
      window.lab.reveal(window.lab.toLayout(rects[index].top));
      const end = [...range.getClientRects()][index];
      return { x: end.right - 2, y: (end.top + end.bottom) / 2, page: firstPage };
    });
    await editor(page).page().mouse.click(lineEnds.x, lineEnds.y);
    await page.keyboard.press("End");
    const atEnd = await caret();
    expect(atEnd).toMatchObject({ page: lineEnds.page, inside: true, domAgrees: true });

    await page.keyboard.press("ArrowDown");
    const down = await caret();
    expect(down).toMatchObject({ page: lineEnds.page + 1, inside: true, domAgrees: true });
    await page.keyboard.press("ArrowUp");
    const up = await caret();
    expect(up).toMatchObject({ page: lineEnds.page, inside: true, domAgrees: true });

    // Typing at the bottom of a page: the words go where the caret is, and the caret follows them over the gap.
    await page.keyboard.press("End");
    const typed = " Typed at the bottom of the page until the line runs over the gap.";
    await page.keyboard.type(typed, { delay: 10 });
    await settled(page);
    const after = await caret();
    const landed = await page.evaluate(
      ({ head, length }) => window.lab.editor().state.doc.textBetween(head - length, head),
      { head: after.head, length: typed.length },
    );
    expect(landed).toBe(typed);
    expect(after).toMatchObject({ inside: true, domAgrees: true });

    // A click in the gap between pages never sends the caret to the top of the document.
    const gap = page.locator(".lab-page-gap").first();
    const box = (await gap.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const clicked = await caret();
    expect(clicked.head).toBeGreaterThan(10);
    expect(clicked.inside).toBe(true);

    report("P3", { atEnd, down, up, afterTyping: after, gapClick: clicked });

    // Everything typed is undone exactly.
    for (let i = 0; i < 10 && (await page.evaluate(() => window.lab.json())) !== before; i += 1) {
      await page.keyboard.press("ControlOrMeta+z");
    }
    expect(await page.evaluate(() => window.lab.json())).toBe(before);
  });

  test("P4: selecting and copying across pages copies what was selected", async ({ page }) => {
    desktopOnly();
    await openTestSermon(page);
    const points = await page.evaluate(() => {
      const paragraph = document.querySelector(
        '[data-id="pl-1"] > p:not([data-type])',
      ) as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const rects = [...range.getClientRects()];
      const firstPage = window.lab.bandOf(window.lab.toLayout(rects[0].top + 1)).page;
      const on = (page: number) =>
        rects.filter((rect) => window.lab.bandOf(window.lab.toLayout(rect.top + 1)).page === page);
      const ia = rects.indexOf(on(firstPage).at(-3)!);
      const ib = rects.indexOf(on(firstPage + 1)[2]);
      // Both ends on screen at once: the first a little above the middle, the second below it.
      window.lab.reveal(window.lab.toLayout(rects[ia].top));
      const now = [...range.getClientRects()];
      const a = now[ia];
      const b = now[ib];
      return {
        from: { x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2 },
        to: { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 },
      };
    });
    // A drag from page 1 to page 2, across the gap, as a person selects.
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
    await page.mouse.up();
    const copied = await page.evaluate(() => {
      const transfer = new DataTransfer();
      window.lab
        .root()
        .dispatchEvent(
          new ClipboardEvent("copy", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      const { from, to } = window.lab.editor().state.selection;
      return {
        clipboard: transfer.getData("text/plain"),
        selection: getSelection()!.toString(),
        document: window.lab.editor().state.doc.textBetween(from, to, "\n"),
      };
    });
    report("P4", { characters: copied.clipboard.length, clipboard: copied.clipboard.slice(0, 80) });
    expect(copied.clipboard.length).toBeGreaterThan(100);
    expect(copied.clipboard).toBe(copied.document);
    expect(copied.selection.replace(/\s+/g, " ")).toBe(copied.document.replace(/\s+/g, " "));
  });

  test("P5: undo and redo of an edit that changes the pages", async ({ page }) => {
    desktopOnly();
    await openTestSermon(page);
    const before = {
      json: await page.evaluate(() => window.lab.json()),
      ...(await screenPages(page)),
    };
    await editor(page).locator('[data-id="pl-intro"] > p:not([data-type])').first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(
      " An added passage of several lines, long enough to move every page break after it further down the document.".repeat(
        3,
      ),
    );
    const changed = {
      json: await page.evaluate(() => window.lab.json()),
      ...(await screenPages(page)),
    };
    expect(changed.firstLines).not.toEqual(before.firstLines);
    for (
      let i = 0;
      i < 10 && (await page.evaluate(() => window.lab.json())) !== before.json;
      i += 1
    ) {
      await page.keyboard.press("ControlOrMeta+z");
    }
    const undone = {
      json: await page.evaluate(() => window.lab.json()),
      ...(await screenPages(page)),
    };
    expect(undone.json).toBe(before.json);
    expect(undone.firstLines).toEqual(before.firstLines);
    for (
      let i = 0;
      i < 10 && (await page.evaluate(() => window.lab.json())) !== changed.json;
      i += 1
    ) {
      await page.keyboard.press("ControlOrMeta+Shift+z");
    }
    const redone = {
      json: await page.evaluate(() => window.lab.json()),
      ...(await screenPages(page)),
    };
    expect(redone.json).toBe(changed.json);
    expect(redone.firstLines).toEqual(changed.firstLines);
    report("P5", {
      before: before.firstLines,
      changed: changed.firstLines,
      undoneMatches: true,
      redoneMatches: true,
    });
  });

  test("P6: moving a point across a page, and editing nested points near a break", async ({
    page,
  }) => {
    desktopOnly();
    await openTestSermon(page);
    // Two neighbouring subpoints on different pages.
    const pair = await page.evaluate(() => {
      const pageOf = (id: string) => {
        const title = document.querySelector(`[data-id="${id}"] > [data-type="point-title"]`)!;
        return window.lab.bandOf(window.lab.toLayout(title.getBoundingClientRect().top + 2)).page;
      };
      for (let index = 1; index < 6; index += 1) {
        const a = `pl-2-${index}`;
        const b = `pl-2-${index + 1}`;
        const later = document.querySelector(`[data-id="${b}"]`)!;
        const first = document.querySelector(`[data-id="${a}"]`)!;
        const spans =
          window.lab.bandOf(window.lab.toLayout(first.getBoundingClientRect().top + 2)).page !==
          window.lab.bandOf(window.lab.toLayout(later.getBoundingClientRect().bottom - 2)).page;
        if (spans) return { a, b, pageA: pageOf(a), pageB: pageOf(b) };
      }
      return null;
    });
    expect(pair).not.toBeNull();
    const before = await page.evaluate(() => window.lab.json());
    const labelA = await editor(page)
      .locator(`[data-id="${pair!.a}"] > [data-type="point-title"]`)
      .getAttribute("data-label");
    await editor(page).locator(`[data-id="${pair!.b}"] > [data-type="point-title"]`).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await settled(page);
    const expected = await page.evaluate(
      ({ json, a, b }) => {
        const doc = JSON.parse(json);
        const visit = (node: { attrs?: { id?: string }; content?: unknown[] }): boolean => {
          const content = node.content as { attrs?: { id?: string } }[] | undefined;
          if (!content) return false;
          const i = content.findIndex((child) => child.attrs?.id === a);
          const j = content.findIndex((child) => child.attrs?.id === b);
          if (i >= 0 && j >= 0) {
            [content[i], content[j]] = [content[j], content[i]];
            return true;
          }
          return content.some((child) => visit(child as typeof node));
        };
        visit(doc);
        return JSON.stringify(doc);
      },
      { json: before, a: pair!.a, b: pair!.b },
    );
    expect(await page.evaluate(() => window.lab.json())).toBe(expected);
    await expect(
      editor(page).locator(`[data-id="${pair!.b}"] > [data-type="point-title"]`),
    ).toHaveAttribute("data-label", labelA!);

    // Edit a nested title next to the break; the caret stays on a page.
    await editor(page).locator(`[data-id="${pair!.a}a"] > [data-type="point-title"]`).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" (edited near the break)");
    await settled(page);
    const nested = await page.evaluate((id) => {
      const editor = window.lab.editor();
      const coords = editor.view.coordsAtPos(editor.state.selection.head);
      const title = document.querySelector(`[data-id="${id}"] > [data-type="point-title"]`)!;
      return {
        text: title.textContent,
        ...window.lab.bandOf(window.lab.toLayout((coords.top + coords.bottom) / 2)),
      };
    }, `${pair!.a}a`);
    expect(nested.text).toContain("(edited near the break)");
    expect(nested.inside).toBe(true);
    report("P6", { pair, labelMoved: labelA, nested });
  });

  test("P7: Romans 8 takes its full printed height whatever its expansion", async ({ page }) => {
    desktopOnly();
    await openTestSermon(page);
    const measure = () =>
      page.evaluate(() => {
        const passage = document.querySelector('[data-id="pl-3-p1"]') as HTMLElement;
        const rect = passage.getBoundingClientRect();
        return {
          top: Math.round(window.lab.toLayout(rect.top)),
          height: Math.round(rect.height / window.lab.geometry().scale),
          verses: passage.querySelectorAll(".lab-passage-text sup").length,
          expanded: passage.hasAttribute("data-expanded"),
          firstLines: window.lab.firstLines(),
        };
      });
    const collapsed = await measure();
    await layout(page, "Regular");
    const regularCollapsed = await page
      .locator('[data-id="pl-3-p1"] .lab-passage-text')
      .evaluate((element) => getComputedStyle(element).display);
    await page.getByRole("button", { name: "Expand passages in Regular" }).click();
    await layout(page, "Print");
    await settled(page);
    const expanded = await measure();
    report("P7", { collapsed, expanded, regularCollapsed });
    expect(regularCollapsed).toBe("none");
    expect(collapsed.expanded).toBe(false);
    expect(expanded.expanded).toBe(true);
    expect(collapsed.verses).toBe(39);
    expect(expanded).toMatchObject({
      top: collapsed.top,
      height: collapsed.height,
      firstLines: collapsed.firstLines,
    });
  });

  test("P8: paginating, switching, paper, margins, and resizing change nothing in the document", async ({
    page,
  }) => {
    desktopOnly();
    test.setTimeout(120_000);
    await openTestSermon(page);
    await page.evaluate(() => window.lab.record());
    const before = await page.evaluate(() => ({
      json: window.lab.json(),
      history: window.lab.history(),
    }));
    const pagesBefore = await screenPages(page);

    await layout(page, "Regular");
    await layout(page, "Print");
    await choose(page, "Paper", "A4 (210 × 297 mm)");
    await settled(page);
    await choose(page, "Paper", "Letter (8.5 × 11 in)");
    await page.getByTestId("lab-margin-right").focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
    await settled(page);
    const narrower = await screenPages(page);
    await page.getByRole("button", { name: "Reset margins" }).click();
    for (const width of [900, 412, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await settled(page);
    }
    await page.getByRole("button", { name: "Expand passages in Regular" }).click();
    await page.getByRole("button", { name: "Collapse passages in Regular" }).click();
    const after = await page.evaluate(() => ({
      json: window.lab.json(),
      history: window.lab.history(),
      changes: [...window.lab.changes],
    }));
    const pagesAfter = await screenPages(page);
    report("P8", {
      transactions: after.changes.length,
      docChanged: after.changes.filter(Boolean).length,
      historyBefore: before.history,
      historyAfter: after.history,
      pagesBefore: pagesBefore.pages,
      pagesWithNarrowerText: narrower.pages,
    });
    expect(after.changes.length).toBeGreaterThan(0);
    expect(after.changes.filter(Boolean)).toHaveLength(0);
    expect(after.json).toBe(before.json);
    expect(after.history).toBe(before.history);
    expect(narrower.pages).toBeGreaterThan(pagesBefore.pages);
    expect(pagesAfter.firstLines).toEqual(pagesBefore.firstLines);
  });

  test("pages do not depend on the window: the same breaks at every width", async ({ page }) => {
    desktopOnly();
    await openTestSermon(page);
    const results: { width: number; scale: number; firstLines: string[]; sideways: boolean }[] = [];
    for (const width of [1280, 1024, 700, 412]) {
      await page.setViewportSize({ width, height: 900 });
      await settled(page);
      const { firstLines } = await screenPages(page);
      const view = await page.evaluate(() => ({
        scale: window.lab.geometry().scale,
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      results.push({ width, ...view, firstLines });
    }
    report("scale", {
      results: results.map(({ width, scale, sideways }) => ({ width, scale, sideways })),
    });
    for (const result of results) {
      expect(result.firstLines).toEqual(results[0].firstLines);
      expect(result.sideways).toBe(false);
    }
    expect(results.at(-1)!.scale).toBeLessThan(0.6);
  });

  test("the side margins: a ruler at the paper's scale, dragged or keyed, remembered", async ({
    page,
  }) => {
    desktopOnly();
    await openTestSermon(page);
    const before = await page.evaluate(() => window.lab.json());
    const ruler = await page.evaluate(() => {
      const ruler = document.querySelector('[data-testid="lab-ruler"]') as HTMLElement;
      const scale = ruler.getBoundingClientRect().width / ruler.offsetWidth;
      const numbers = [...ruler.querySelectorAll("text")].map((text) => ({
        label: text.textContent,
        x: Number(text.getAttribute("x")),
      }));
      return { width: ruler.offsetWidth, scale, numbers };
    });
    // Letter is 816 px wide; inches are counted from the 1 in margin, 96 px apart.
    expect(ruler.width).toBe(816);
    expect(ruler.numbers.find((n) => n.label === "1" && n.x > 96)?.x).toBe(192);
    expect(ruler.numbers.find((n) => n.label === "6")?.x).toBe(672);

    // Drag the left margin half an inch to the right.
    const edge = page.getByTestId("lab-margin-left");
    const box = (await edge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 48 * ruler.scale, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(edge).toHaveAttribute("aria-valuenow", "1.5");
    await settled(page);
    expect(await page.evaluate(() => getComputedStyle(window.lab.root()).paddingLeft)).toBe(
      "144px",
    );

    // Keys: the right margin, an eighth of an inch a step.
    const right = page.getByTestId("lab-margin-right");
    await right.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(right).toHaveAttribute("aria-valuenow", "1.25");

    // Remembered for the next document, on reload.
    await page.reload();
    await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("lab-margin-left")).toHaveAttribute("aria-valuenow", "1.5");
    await expect(page.getByTestId("lab-margin-right")).toHaveAttribute("aria-valuenow", "1.25");
    await page.getByRole("button", { name: "Reset margins" }).click();
    await expect(page.getByTestId("lab-margin-left")).toHaveAttribute("aria-valuenow", "1");
    expect(before.length).toBeGreaterThan(0);
    report("margins", { ruler: { width: ruler.width, scale: ruler.scale } });
  });

  test("the caret between blocks (after the conclusion) takes no space and moves nothing", async ({
    page,
  }) => {
    desktopOnly();
    await openLab(page);
    await settled(page);
    const before = await page.evaluate(() => ({
      height: window.lab.root().offsetHeight,
      json: window.lab.json(),
    }));
    // The end of the conclusion, then one step on: the place after the last block.
    await editor(page).getByText("Take up the Book").click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(editor(page).locator(".ProseMirror-gapcursor")).toHaveCount(1);
    await settled(page);
    const after = await page.evaluate(() => ({
      height: window.lab.root().offsetHeight,
      json: window.lab.json(),
      box: (document.querySelector(".ProseMirror-gapcursor") as HTMLElement).offsetHeight,
    }));
    report("gap-cursor", {
      heightBefore: before.height,
      heightAfter: after.height,
      cursorHeight: after.box,
    });
    expect(after.height).toBe(before.height);
    expect(after.box).toBe(0);
    expect(after.json).toBe(before.json);
    // Typing there starts a new line after the conclusion.
    await page.keyboard.type("Benediction");
    await expect(editor(page).locator(":scope > p").last()).toHaveText("Benediction");
  });

  test("P10: page gaps are hidden from assistive technology and leave the reading order alone", async ({
    page,
  }) => {
    desktopOnly();
    await openLab(page);
    await choose(page, "Document", "Sections anywhere, page breaks");
    await layout(page, "Regular");
    const regular = await editor(page).ariaSnapshot();
    await layout(page, "Print");
    await settled(page);
    const print = await editor(page).ariaSnapshot();
    const gaps = await page.evaluate(() => {
      const pages = window.lab.root().querySelector(".lab-pages") as HTMLElement;
      return {
        hidden: pages.getAttribute("aria-hidden"),
        editable: pages.getAttribute("contenteditable"),
        pages: pages.dataset.pages,
      };
    });
    // Keyboard: Tab leaves the editor for the same place in both layouts.
    const next = async () => {
      await editor(page).locator("p").first().click();
      await page.keyboard.press("Tab");
      return page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40) ?? "");
    };
    const tabPrint = await next();
    await layout(page, "Regular");
    const tabRegular = await next();
    report("P10", { gaps, sameSnapshot: regular === print, tabPrint, tabRegular });
    expect(gaps).toMatchObject({ hidden: "true", editable: "false" });
    expect(print).toBe(regular);
    expect(tabPrint).toBe(tabRegular);
  });

  test("P9: typing on the 500-entry outline in Print Layout", async ({ page }) => {
    test.setTimeout(240_000);
    const phone = test.info().project.name === "mobile";
    await openLab(page);
    await choose(page, "Document", "500 entries (stress)");
    await expect(editor(page).locator('[data-type="outline-point"]')).toHaveCount(498);
    if (phone) {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    const typed = " — typed into a long outline";
    const run = async (mode: "Regular" | "Print") => {
      await layout(page, mode);
      await settled(page);
      await page.evaluate(() => {
        const slow: number[] = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) slow.push(entry.duration);
        }).observe({
          type: "event",
          durationThreshold: 16,
          buffered: false,
        } as PerformanceObserverInit);
        (window as unknown as { labSlow: number[] }).labSlow = slow;
      });
      await editor(page).locator('[data-id="s-30-1"] > [data-type="point-title"]').click();
      await page.keyboard.press("End");
      const started = Date.now();
      await page.keyboard.type(typed, { delay: 20 });
      const wall = Date.now() - started;
      await settled(page);
      const slow = await page.evaluate(() => (window as unknown as { labSlow: number[] }).labSlow);
      await pick(page, "Measure");
      await page.getByRole("button", { name: "Measure this document" }).click();
      const values: Record<string, string | null> = {};
      for (const cell of await page.locator("[data-measure]").all()) {
        values[(await cell.getAttribute("data-measure"))!] = await cell.getAttribute("data-value");
      }
      return {
        mode,
        typingWallMs: wall,
        eventsOver16ms: slow.length,
        slowestEventMs: slow.length ? Math.max(...slow) : 0,
        pages: values.pages,
        lastPaginationMs: values.pagination,
        slowestPaginationMs: values.paginationSlowest,
        paginationRuns: values.paginationRuns,
        renders: values.renders,
      };
    };
    const regular = await run("Regular");
    const print = await run("Print");
    report("P9", { cpuThrottle: phone ? 4 : 1, typedCharacters: typed.length, regular, print });
    // Recorded, not asserted against a number (§G.2: a person judges responsiveness).
    expect(print.typingWallMs).toBeGreaterThan(0);
  });
});
