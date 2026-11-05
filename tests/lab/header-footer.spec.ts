import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { pdfLines, squeeze } from "./pdf-text";

/*
 * A4.3 (UI.2C) in a real browser: the sermon header on the first page, the
 * running header, and the page numbers, on `/lab/editor/v4` (the same
 * `SermonWorkspace` as `/outlines/[id]`; the lab persists nothing).
 *
 * Geometry is measured, never assumed: every line of the sermon's text, the
 * header, and every page number and running header are rectangles in the
 * paper's own pixels (96 to the inch, before Print Layout's scaling), and
 * Chrome's own PDF (`page.pdf`, through `beforeprint` as a print does) is
 * read back for where the same text was printed.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "default" });

const longTitle =
  "When the Idols Fall: Learning to Trust the Living God Through Every Loss, Every Delay, and Every Unanswered Prayer";

function report(name: string, values: Record<string, unknown>) {
  console.log(
    `LAB-MEASURE ${JSON.stringify({ name, project: test.info().project.name, ...values })}`,
  );
}

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  // The sign-in page may still be sending the new session on (Firefox aborts a navigation made
  // meanwhile): let it settle, and go to the lab again if that first navigation was cut short.
  // Bounded: on a dev server Chromium's network is never idle (downloads in the background).
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.goto("/lab/editor/v4").catch(async (error: Error) => {
    if (!/NS_BINDING_ABORTED|net::ERR_ABORTED|interrupted/i.test(error.message)) throw error;
    await page.goto("/lab/editor/v4");
  });
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
}

/** Lets the paginator measure (a frame or two) after a change. */
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))),
      ),
  );

/** Everything measured on screen, in the paper's pixels from the top of the first sheet. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement;
    const style = getComputedStyle(root);
    const px = (name: string) => Number.parseFloat(style.getPropertyValue(name));
    const box = root.getBoundingClientRect();
    const scale = box.width / root.offsetWidth;
    const rect = (r: DOMRect) => ({
      top: (r.top - box.top) / scale,
      bottom: (r.bottom - box.top) / scale,
      left: (r.left - box.left) / scale,
      right: (r.right - box.left) / scale,
    });
    // Every line box of the sermon's own text (never the pages' copies).
    const lines: {
      top: number;
      bottom: number;
      left: number;
      right: number;
      text: string;
      where: string;
    }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(".lab-pages") || !(node as Text).data.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const each of Array.from(range.getClientRects())) {
        if (each.height > 0)
          lines.push({
            ...rect(each),
            text: (node as Text).data.slice(0, 24),
            where: [
              parent.className,
              parent.parentElement?.className,
              getComputedStyle(parent).display,
              getComputedStyle(parent.parentElement!).display,
            ].join(" / "),
          });
      }
    }
    const shown = (element: Element) => getComputedStyle(element).display !== "none";
    const header = document.querySelector('[data-testid="sermon-header"]');
    return {
      layout: root.dataset.layout,
      numbersAt: root.dataset.pageNumbers,
      weight: root.dataset.pageNumberWeight,
      mt: px("--mt"),
      mb: px("--mb"),
      pageH: px("--page-h"),
      desk: px("--desk"),
      contentH: px("--content-h"),
      firstTop: px("--first-top"),
      firstContentH: px("--first-content-h"),
      pages: Number(root.querySelector<HTMLElement>(".lab-pages")?.dataset.pages ?? "0"),
      header: header ? rect(header.getBoundingClientRect()) : null,
      numbers: Array.from(root.querySelectorAll(".lab-page-number"))
        .filter(shown)
        .map((element) => ({
          ...rect(element.getBoundingClientRect()),
          text: element.textContent,
          weight: getComputedStyle(element).fontWeight,
        })),
      running: Array.from(root.querySelectorAll(".lab-running-header"))
        .filter(shown)
        .map((element) => ({
          ...rect(element.getBoundingClientRect()),
          text: element.textContent,
        })),
      lines,
      json: JSON.stringify(
        (root as HTMLElement & { editor: { getJSON: () => unknown } }).editor.getJSON(),
      ),
    };
  });
type Measured = Awaited<ReturnType<typeof measure>>;

const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
  a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** Every geometric promise A4.3 makes, on one measurement. */
function checkGeometry(m: Measured) {
  const stride = m.pageH + m.desk;
  // The header sits in the first page's top region, above the first line of text.
  expect(m.header).not.toBeNull();
  expect(m.header!.top).toBeGreaterThanOrEqual(0);
  expect(m.header!.bottom).toBeLessThanOrEqual(m.firstTop + 0.5);
  expect(m.firstTop).toBeGreaterThanOrEqual(m.mt - 0.5);
  for (const line of m.lines) {
    // No line of the sermon under the header, or in a page's margins.
    expect(overlaps(line, m.header!), `line under the header: ${line.text}`).toBe(false);
    const centre = (line.top + line.bottom) / 2;
    // Which page a line is on, by its centre: a glyph may stand just above its page's first line.
    const page = Math.max(0, Math.floor((centre - m.mt + m.desk / 2 + m.mb) / stride));
    const top = page === 0 ? m.firstTop : m.mt + page * stride;
    const height = page === 0 ? m.firstContentH : m.contentH;
    // A passage's label can be drawn in the bottom margin when its passage falls at a page's foot,
    // with or without the header (BUG-011, pre-existing, deferred to A4.6): not this phase's geometry.
    if (line.where.startsWith("lab-passage-label")) continue;
    // Its centre inside its page's text area; its glyphs may stand a few pixels past a tight line box.
    expect(centre, `line outside its page's text: ${line.text} (${line.where})`).toBeGreaterThan(
      top,
    );
    expect(centre, `line outside its page's text: ${line.text} (${line.where})`).toBeLessThan(
      top + height,
    );
    expect(line.top, `line above its page's text: ${line.text}`).toBeGreaterThanOrEqual(top - 6);
    expect(
      line.bottom,
      `line below its page's text: ${line.text} (${line.where})`,
    ).toBeLessThanOrEqual(top + height + 6);
  }
  // Each number in its own page's bottom margin, each running header in its page's top margin.
  m.numbers.forEach((number, index) => {
    const pageBottom = index * stride + m.pageH;
    expect(number.text).toBe(String(index + 1));
    expect(number.top).toBeGreaterThanOrEqual(pageBottom - m.mb - 0.5);
    expect(number.bottom).toBeLessThanOrEqual(pageBottom + 0.5);
    for (const line of m.lines) {
      // A passage label drawn in the bottom margin (BUG-011) can fall on the number: that defect, not this one.
      if (line.where.startsWith("lab-passage-label")) continue;
      expect(
        overlaps(line, number),
        `a line over page ${number.text}'s number: ${line.text} (${line.where})`,
      ).toBe(false);
    }
  });
  m.running.forEach((header, index) => {
    const pageTop = (index + 1) * stride;
    expect(header.top).toBeGreaterThanOrEqual(pageTop - 0.5);
    expect(header.bottom).toBeLessThanOrEqual(pageTop + m.mt + 0.5);
    for (const line of m.lines) expect(overlaps(line, header)).toBe(false);
  });
}

const editorCall = (page: Page, script: string) =>
  page.evaluate((body) => {
    const root = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: unknown;
    };
    // The test's own command on the lab's editor (a paper change, as the Page setup menu makes).
    return new Function("editor", body)(root.editor);
  }, script);

async function setTitle(page: Page, title: string) {
  const field = page.getByTestId("sermon-header-title");
  await field.click();
  await field.fill(title);
  await field.press("Enter");
  await settled(page);
}

/** Turns on the running header (with the subtitle) and bold numbers, through Outline Settings. */
async function headerAndFooter(page: Page) {
  await page.getByTestId("outline-settings-open").click();
  const settings = page.getByRole("dialog", { name: "Outline Settings" });
  await settings.getByRole("button", { name: "Header & Footer" }).click();
  await settings.getByRole("switch", { name: /Header on later pages/ }).click();
  await settings.getByRole("switch", { name: "Include the subtitle" }).click();
  const bold = settings.getByRole("switch", { name: "Bold page numbers" });
  if ((await bold.getAttribute("aria-checked")) !== "true") await bold.click();
  await settings.getByRole("button", { name: "Apply" }).click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await settled(page);
}

/** Chrome's own print of the page, as a print begins (`beforeprint`) and ends. */
async function printPdf(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await settled(page);
  return pdf;
}

test.beforeEach(async ({ page }) => {
  test.skip(!email || !development, "Needs the development Clerk instance and a test user.");
  await clerkSetup({ publishableKey });
  await openV4(page);
});

test("the header, a long title, and the pages never overlap, on every paper", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Print Layout geometry at desktop size.");
  const editor = page.getByTestId("sermon-editor");
  await expect(editor).toHaveAttribute("data-layout", "print");
  const short = await measure(page);
  // A short title fits in the top margin: the text starts at the margin, as before.
  expect(short.firstTop).toBeCloseTo(short.mt, 0);
  checkGeometry(short);
  report("header-short", { firstTop: short.firstTop, mt: short.mt, header: short.header });

  await setTitle(page, longTitle);
  const long = await measure(page);
  expect(long.header!.bottom - long.header!.top).toBeGreaterThan(
    short.header!.bottom - short.header!.top,
  );
  expect(long.firstTop).toBeGreaterThan(long.mt);
  checkGeometry(long);
  report("header-long", { firstTop: long.firstTop, header: long.header, pages: long.pages });
  // The title is the sermon's: the document never holds it.
  expect(long.json).not.toContain("Learning to Trust");

  for (const paper of ["letter", "legal", "a4", "a5", "halfLetter"]) {
    await editorCall(
      page,
      `const inch = 96; const side = ${paper === "a5" || paper === "halfLetter" ? 0.75 : 1} * inch;
       return editor.commands.setPageSettings({ size: "${paper}", margins: { top: side, right: side, bottom: side, left: side } });`,
    );
    await settled(page);
    const on = await measure(page);
    checkGeometry(on);
    expect(on.numbers.length).toBe(on.pages);
    report("paper", { paper, pages: on.pages, firstTop: on.firstTop, mt: on.mt });
  }
  // A wider margin moves the text and the header together.
  await editorCall(
    page,
    `return editor.commands.setPageSettings({ size: "letter", margins: { top: 144, right: 120, bottom: 72, left: 120 } });`,
  );
  await settled(page);
  checkGeometry(await measure(page));
});

test("the running header and bold numbers, through Outline Settings, on screen and in the PDF", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Print Layout and PDF at desktop size.");
  await setTitle(page, "The Lamp and the Light");
  await page.getByTestId("sermon-header-add-subtitle").click();
  const subtitle = page.getByTestId("sermon-header-subtitle");
  await subtitle.fill("Psalm 119:105");
  await subtitle.press("Enter");
  // An explicit page break, so there are later pages whatever the fixture's length.
  await editorCall(
    page,
    `editor.chain().focus("end").insertContent({ type: "pageBreak" }).insertContent({ type: "paragraph", content: [{ type: "text", text: "After the break." }] }).run(); return true;`,
  );
  await headerAndFooter(page);
  const m = await measure(page);
  expect(m.weight).toBe("bold");
  expect(m.numbers.every((number) => Number(number.weight) >= 700)).toBe(true);
  expect(m.running.length).toBe(m.pages - 1);
  expect(m.running[0].text).toBe("The Lamp and the Light · Psalm 119:105");
  checkGeometry(m);

  // Undo takes the whole Apply back in one step.
  const applied = m.json;
  await page.getByTestId("sermon-editor").click();
  await page.keyboard.press("ControlOrMeta+z");
  await settled(page);
  const undone = await measure(page);
  expect(undone.json).not.toBe(applied);
  expect(undone.running.length).toBe(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await settled(page);
  const redone = await measure(page);
  expect(redone.json).toBe(applied);

  const pdf = await printPdf(page);
  if (process.env.LAB_PDF_OUT)
    (await import("node:fs")).writeFileSync(process.env.LAB_PDF_OUT, pdf);
  const lines = pdfLines(pdf, redone.pageH, { placed: true });
  report("pdf-lines", {
    lines: lines.map((line) => [
      line.page,
      Math.round(line.y - line.page * redone.pageH),
      line.text.slice(0, 30),
    ]),
  });
  const printedPages = new Set(lines.map((line) => line.page)).size;
  expect(printedPages).toBe(redone.pages);
  // Where each page's number and running header were printed: in its margins, where the screen drew them.
  for (let index = 0; index < redone.pages; index += 1) {
    const onPage = lines.filter((line) => line.page === index);
    const number = onPage.find((line) => squeeze(line.text) === String(index + 1));
    expect(number, `page ${index + 1}'s number`).toBeDefined();
    const into = number!.y - index * redone.pageH;
    expect(into).toBeGreaterThan(redone.pageH - redone.mb);
    if (index > 0) {
      const header = onPage.find((line) =>
        squeeze(line.text).startsWith(squeeze("The Lamp and the Light")),
      );
      expect(header, `page ${index + 1}'s running header`).toBeDefined();
      expect(header!.y - index * redone.pageH).toBeLessThan(redone.mt);
    }
    // Every other line of the page is in its text area.
    for (const line of onPage) {
      if (line === number) continue;
      const y = line.y - index * redone.pageH;
      if (index > 0 && y < redone.mt) continue; // the running header
      if (index === 0 && y < redone.firstTop) continue; // the sermon header
      expect(y, `printed line out of its page: ${line.text}`).toBeLessThanOrEqual(
        (index === 0 ? redone.firstTop + redone.firstContentH : redone.mt + redone.contentH) + 6,
      );
    }
  }
  // The title printed in the first page's top region, where the screen shows it.
  const title = lines.find(
    (line) => line.page === 0 && squeeze(line.text).includes(squeeze("The Lamp")),
  );
  expect(title, "the printed title").toBeDefined();
  expect(title!.y).toBeLessThan(redone.firstTop);
  expect(title!.y).toBeGreaterThan(redone.header!.top - 2);
  report("pdf", { pages: printedPages, title: title!.y, header: redone.header });
  // Printing changed nothing.
  expect((await measure(page)).json).toBe(applied);
});

test("printing from Regular Layout prints the same pages, on the sermon's paper", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "A narrow window, set here.");
  await editorCall(
    page,
    `return editor.commands.setPageSettings({ size: "a4", margins: { top: 96, right: 96, bottom: 96, left: 96 } });`,
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.getByTestId("sermon-editor")).toHaveAttribute("data-layout", "regular");
  // Every passage printed in full has its verses (they are read a chapter at a time).
  await expect
    .poll(() =>
      page
        .locator('.lab-passage[data-print="full"] .lab-passage-text:not([data-state="ready"])')
        .count(),
    )
    .toBe(0);

  // The print as Chrome makes it: `beforeprint` (Print Layout, every passage in full), the
  // screen measured in that state, the PDF, then `afterprint`.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await settled(page);
  const prepared = await measure(page);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await settled(page);

  expect(prepared.layout).toBe("print");
  checkGeometry(prepared);
  const text = pdf.toString("latin1");
  // The paper is A4 (595.28 × 841.89 points; Chrome writes 594.96 × 841.92), not Letter.
  expect(text).toMatch(/MediaBox\s*\[\s*0\s+0\s+59[45]\.\d*\s+841\.\d*\s*\]/);
  expect(text).not.toMatch(/MediaBox\s*\[\s*0\s+0\s+612/);
  const lines = pdfLines(pdf, prepared.pageH, { placed: true });
  report("regular-print", {
    pages: prepared.pages,
    firstTop: prepared.firstTop,
    header: prepared.header,
    printedPages: new Set(lines.map((line) => line.page)).size,
  });
  expect(new Set(lines.map((line) => line.page)).size).toBe(prepared.pages);
  // Each page's number in its bottom margin; the title in the first page's header region;
  // every other printed line inside its page's text area.
  for (let index = 0; index < prepared.pages; index += 1) {
    const onPage = lines.filter((line) => line.page === index);
    const number = onPage.find((line) => squeeze(line.text) === String(index + 1));
    expect(number, `page ${index + 1}'s number`).toBeDefined();
    expect(number!.y - index * prepared.pageH).toBeGreaterThan(prepared.pageH - prepared.mb);
    for (const line of onPage) {
      if (line === number) continue;
      const y = line.y - index * prepared.pageH;
      if (index === 0 && y < prepared.firstTop) continue; // the sermon header
      expect(y, `printed line out of its page: ${line.text}`).toBeLessThanOrEqual(
        (index === 0
          ? prepared.firstTop + prepared.firstContentH
          : prepared.mt + prepared.contentH) + 6,
      );
    }
  }
  const title = lines.find((line) => line.page === 0 && line.y < prepared.firstTop);
  expect(title, "the printed title").toBeDefined();
  expect(title!.y).toBeGreaterThan(prepared.header!.top - 2);
  // Back in Regular Layout, and the document unchanged by printing.
  await expect(page.getByTestId("sermon-editor")).toHaveAttribute("data-layout", "regular");
  expect((await measure(page)).json).toBe(prepared.json);
});

test("the header in Regular Layout on a phone: editable, labelled, and above the writing", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "mobile", "The phone's own layout.");
  await expect(page.getByTestId("sermon-editor")).toHaveAttribute("data-layout", "regular");
  const header = page.getByTestId("sermon-header");
  await expect(header).toBeVisible();
  const title = page.getByRole("textbox", { name: "Sermon title" });
  await title.tap();
  await title.fill("On the phone");
  await title.press("Enter");
  await expect(title).toHaveValue("On the phone");
  const add = page.getByTestId("sermon-header-add-subtitle");
  const size = await add.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  const headerBox = await header.boundingBox();
  const firstBlock = await page
    .getByTestId("sermon-editor")
    .locator("> *:not(.lab-pages)")
    .first()
    .boundingBox();
  expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(firstBlock!.y + 1);
});

test("in a dark theme the header is drawn in the paper's ink, as the sermon's own text is", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Print Layout's white paper, at desktop size.");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  const colors = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement;
    const title = document.querySelector('[data-testid="sermon-header-title"]') as HTMLElement;
    const body = editor.querySelector("p") as HTMLElement;
    return {
      dark: document.documentElement.classList.contains("dark"),
      paper: editor.dataset.paper,
      header: document.querySelector('[data-testid="sermon-header"]')?.getAttribute("data-paper"),
      title: getComputedStyle(title).color,
      ink: getComputedStyle(editor).color,
      body: getComputedStyle(body).color,
    };
  });
  report("dark-theme", colors);
  expect(colors.dark).toBe(true);
  expect(colors.paper).toBe("light");
  expect(colors.header).toBe("light");
  // The title's ink is the paper's, not the dark theme's near-white.
  expect(colors.title).toBe(colors.ink);
});
