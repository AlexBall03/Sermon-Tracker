import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  pdfColors,
  pdfDarkAreas,
  pdfLines,
  pdfPageSizes,
  squeeze,
  type PdfColor,
} from "./pdf-text";

/*
 * A4.4 (A1-UI.2D) in a real browser, on `/lab/editor/v4` (the same
 * `SermonWorkspace` as `/outlines/[id]`; the lab persists nothing):
 *
 * - the editing paper (Automatic, Light, Dark) in either theme and either
 *   layout, scoped to the document surface, changing nothing in the document;
 * - Chrome's own PDF (`page.pdf` through `beforeprint`, as a print does) in
 *   Color, Grayscale, and Black & White, on several papers: the same pages and
 *   lines in every mode (a mode only paints), the colors each mode promises,
 *   never a dark page, and the screen given back afterwards;
 * - Outline Settings → Printing: its preview drawn by the print rules, and its
 *   Print button closing the window before the print begins.
 *
 * `LAB_SHOTS=<folder>` also writes screenshots of the print, in each preset
 * and mode, for the preset review and the handoff.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const shots = process.env.LAB_SHOTS;

test.describe.configure({ mode: "default" });

const longTitle =
  "When the Idols Fall: Learning to Trust the Living God Through Every Loss, Every Delay, and Every Unanswered Prayer";
const gallery = "Component gallery (every note, script, and passage)";

function report(name: string, values: Record<string, unknown>) {
  console.log(
    `LAB-MEASURE ${JSON.stringify({ name, project: test.info().project.name, ...values })}`,
  );
}

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.goto("/lab/editor/v4").catch(async (error: Error) => {
    if (!/NS_BINDING_ABORTED|net::ERR_ABORTED|interrupted/i.test(error.message)) throw error;
    await page.goto("/lab/editor/v4");
  });
  await ready(page);
}

async function ready(page: Page) {
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
}

const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))),
      ),
  );

const editorCall = (page: Page, script: string) =>
  page.evaluate((body) => {
    const root = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: unknown;
    };
    return new Function("editor", body)(root.editor);
  }, script);

async function chooseFixture(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Document" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByTestId("sermon-editor")).toBeVisible();
  await settled(page);
}

async function setTitle(page: Page, title: string) {
  const field = page.getByTestId("sermon-header-title");
  await field.click();
  await field.fill(title);
  await field.press("Enter");
  await settled(page);
}

async function choosePaper(page: Page, paper: "automatic" | "light" | "dark") {
  await page.getByTestId("view-menu").click();
  await page.getByTestId(`view-paper-${paper}`).click();
  await page.keyboard.press("Escape");
  await settled(page);
}

async function passagesReady(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('.lab-passage[data-print="full"] .lab-passage-text:not([data-state="ready"])')
        .count(),
    )
    .toBe(0);
}

/** What the document surface and the application around it are drawn in, now. */
const surfaces = (page: Page) =>
  page.evaluate(() => {
    const editor = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
      editor: { getJSON: () => unknown; state: { selection: { from: number } } };
    };
    const writing = document.querySelector(".sermon-paper") as HTMLElement | null;
    const layout = editor.dataset.layout;
    // The paper: the sheet in Print Layout, the writing area in Regular.
    const sheet = layout === "print" ? editor : (writing ?? editor);
    const toolbar = document.querySelector(
      '[data-testid="sermon-workspace"] header',
    ) as HTMLElement;
    const text = editor.querySelector("p") as HTMLElement;
    return {
      layout,
      paper: editor.dataset.paper ?? null,
      header: document.querySelector('[data-testid="sermon-header"]')?.getAttribute("data-paper"),
      sheet: getComputedStyle(sheet).backgroundColor,
      text: getComputedStyle(text).color,
      chrome: getComputedStyle(toolbar).backgroundColor,
      dark: document.documentElement.classList.contains("dark"),
      json: JSON.stringify(editor.editor.getJSON()),
      from: editor.editor.state.selection.from,
    };
  });

/** Relative luminance of a CSS `rgb()`/`rgba()`/`color(srgb …)` color, 0 to 1. */
function luminance(css: string) {
  const parts = (css.match(/[\d.]+/g) ?? []).map(Number);
  const srgb = css.startsWith("color(") ? parts.slice(0, 3) : parts.slice(0, 3).map((v) => v / 255);
  const linear = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

test.beforeEach(async ({ page }) => {
  test.skip(!email || !development, "Needs the development Clerk instance and a test user.");
  await clerkSetup({ publishableKey });
  await openV4(page);
});

test("dark paper is the document's alone, in either theme and layout, and changes nothing", async ({
  page,
}) => {
  const requests: string[] = [];
  // Anything that could carry a change or a save: a write, a Server Action, a document read.
  // (The device's own Bible download runs in the background and is not counted.)
  const watch = (request: { url: () => string; method: () => string; headers: () => object }) => {
    const url = request.url();
    if (
      request.method() !== "GET" ||
      "next-action" in request.headers() ||
      /\/api\/(sermon-documents|ideas|offline|sync)/.test(url)
    )
      requests.push(`${request.method()} ${url}`);
  };
  const results: Record<string, unknown>[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    for (const layout of ["print", "regular"] as const) {
      if (test.info().project.name === "desktop") {
        // A desktop shows Print Layout; a narrower window, Regular.
        await page.setViewportSize(
          layout === "print" ? { width: 1280, height: 900 } : { width: 900, height: 900 },
        );
      } else {
        await editorCall(page, `return editor.commands.setLayout("${layout}");`);
      }
      await settled(page);
      for (const paper of ["light", "dark", "automatic"] as const) {
        const scroller = page.locator("main").first();
        const before = await surfaces(page);
        const top = await scroller.evaluate((element) => element.scrollTop);
        page.on("request", watch);
        await choosePaper(page, paper);
        page.off("request", watch);
        const after = await surfaces(page);
        expect(after.layout).toBe(before.layout);
        expect(after.json).toBe(before.json);
        expect(after.from).toBe(before.from);
        expect(await scroller.evaluate((element) => element.scrollTop)).toBe(top);
        // The application around the paper follows the theme, never the paper.
        expect(after.chrome).toBe(before.chrome);
        expect(after.dark).toBe(theme === "dark");
        const drawn = paper === "automatic" ? (after.layout === "print" ? "light" : null) : paper;
        expect(after.paper).toBe(drawn);
        expect(after.header ?? null).toBe(drawn);
        const sheetDark = luminance(after.sheet) < 0.2;
        const textDark = luminance(after.text) < 0.2;
        const shownDark = drawn === "dark" || (drawn === null && theme === "dark");
        expect(sheetDark, `${theme}/${layout}/${paper} sheet ${after.sheet}`).toBe(shownDark);
        // Readable: light words on dark paper, dark words on light paper.
        expect(textDark, `${theme}/${layout}/${paper} text ${after.text}`).toBe(!shownDark);
        results.push({ theme, layout: after.layout, paper, sheet: after.sheet, text: after.text });
      }
    }
  }
  report("paper-matrix", { results });
  // Choosing a paper sends nothing anywhere: it is this device's.
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("sermon-paper"))).toBe("automatic");
});

type Printed = {
  pdf: Buffer;
  during: { attr: string | null; paper: string | null; layout: string | undefined };
  after: { attr: string | null; paper: string | null; layout: string | undefined };
  pageH: number;
};

/** Chrome's own print: `beforeprint`, the PDF, `afterprint`, with what the page said meanwhile. */
async function print(page: Page): Promise<Printed> {
  const state = () =>
    page.evaluate(() => {
      const editor = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement;
      return {
        attr: document.documentElement.getAttribute("data-print-color"),
        paper: editor.dataset.paper ?? null,
        layout: editor.dataset.layout,
        pageH: Number.parseFloat(getComputedStyle(editor).getPropertyValue("--page-h")),
      };
    });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const during = await state();
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await settled(page);
  const after = await state();
  return {
    pdf,
    during: { attr: during.attr, paper: during.paper, layout: during.layout },
    after: { attr: after.attr, paper: after.paper, layout: after.layout },
    pageH: during.pageH,
  };
}

const isGray = ({ rgb: [r, g, b] }: PdfColor) => Math.abs(r - g) < 0.006 && Math.abs(g - b) < 0.006;
const isBlackOrWhite = ({ rgb }: PdfColor) =>
  rgb.every((v) => v < 0.004) || rgb.every((v) => v > 0.996);

test("Color, Grayscale, and Black & White print the same pages on white paper, each in its own colors", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "The print is the paper's, not the window's.");
  await chooseFixture(page, gallery);
  await setTitle(page, longTitle);
  // Dark paper and a dark theme on screen: neither may reach the paper.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await choosePaper(page, "dark");
  await passagesReady(page);
  const page0 = await editorCall(page, `return editor.state.doc.attrs.page;`);
  report("page-attr", { page: page0 });

  const papers = [
    { size: "letter", width: 612, height: 792, side: 96 },
    { size: "a4", width: 595.28, height: 841.89, side: 96 },
    { size: "halfLetter", width: 396, height: 612, side: 72 },
  ] as const;
  for (const paper of papers) {
    await editorCall(
      page,
      `return editor.commands.setPageSettings({ size: "${paper.size}", margins: { top: ${paper.side}, right: ${paper.side}, bottom: ${paper.side}, left: ${paper.side} } });`,
    );
    await settled(page);
    const printed: Record<string, Printed> = {};
    for (const mode of ["color", "grayscale", "bw"] as const) {
      await page.evaluate((value) => localStorage.setItem("sermon-print-color", value), mode);
      printed[mode] = await print(page);
      const { during, after, pdf } = printed[mode];
      // Drawn on white paper in Print Layout, in this mode, and given back afterwards.
      expect(during).toEqual({ attr: mode, paper: "light", layout: "print" });
      expect(after).toEqual({ attr: null, paper: "dark", layout: "print" });
      // Exactly the paper chosen.
      for (const [width, height] of pdfPageSizes(pdf)) {
        expect(Math.abs(width - paper.width)).toBeLessThan(1);
        expect(Math.abs(height - paper.height)).toBeLessThan(1);
      }
      const colors = pdfColors(pdf);
      if (shots) (await import("node:fs")).writeFileSync(`${shots}/${paper.size}-${mode}.pdf`, pdf);
      report("print-colors", {
        paper: paper.size,
        mode,
        colors: colors.length,
        distinct: [
          ...new Set(colors.map((c) => `${c.op} ${c.rgb.map((v) => v.toFixed(3)).join(" ")}`)),
        ].slice(0, 40),
      });
      // Never a dark page: no dark fill covering a fifth of a page or more (the dark paper, the
      // theme's surface, or the browser's dark canvas).
      expect(pdfDarkAreas(pdf), `${paper.size} ${mode}`).toEqual([]);
      if (mode === "grayscale")
        expect(
          colors.filter((c) => !isGray(c)),
          `${paper.size} gray`,
        ).toEqual([]);
      if (mode === "bw")
        expect(
          colors.filter((c) => !isBlackOrWhite(c)),
          `${paper.size} bw`,
        ).toEqual([]);
      if (mode === "color")
        expect(
          colors.some((c) => !isGray(c)),
          `${paper.size} has color`,
        ).toBe(true);
      report("print-colors", {
        paper: paper.size,
        mode,
        colors: colors.length,
        distinct: [...new Set(colors.map((c) => c.rgb.map((v) => v.toFixed(3)).join(" ")))].slice(
          0,
          40,
        ),
      });
    }
    // A mode only paints: the same pages, and every line in the same place, in all three.
    const lines = Object.fromEntries(
      Object.entries(printed).map(([mode, { pdf, pageH }]) => [
        mode,
        pdfLines(pdf, pageH, { placed: true }).map((line) => [
          line.page,
          Math.round(line.y),
          squeeze(line.text),
        ]),
      ]),
    );
    expect(lines.color.length).toBeGreaterThan(10);
    expect(lines.grayscale).toEqual(lines.color);
    expect(lines.bw).toEqual(lines.color);
    expect(pdfPageSizes(printed.bw.pdf).length).toBe(pdfPageSizes(printed.color.pdf).length);
    // The title and the running header are printed.
    const all = lines.color.map((line) => line[2]).join(" ");
    expect(all).toContain(squeeze("When the Idols Fall"));
    report("print-pages", {
      paper: paper.size,
      pages: pdfPageSizes(printed.color.pdf).length,
      lines: lines.color.length,
    });
  }
});

test("printing from Regular Layout on dark paper prints Print Layout on white paper, and gives the screen back", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "A narrow window, set here.");
  await page.setViewportSize({ width: 900, height: 900 });
  await choosePaper(page, "dark");
  await expect(page.getByTestId("sermon-editor")).toHaveAttribute("data-layout", "regular");
  await passagesReady(page);
  await page.evaluate(() => localStorage.setItem("sermon-print-color", "grayscale"));
  const printed = await print(page);
  expect(printed.during).toEqual({ attr: "grayscale", paper: "light", layout: "print" });
  expect(printed.after).toEqual({ attr: null, paper: "dark", layout: "regular" });
  expect(pdfColors(printed.pdf).filter((c) => !isGray(c))).toEqual([]);
  // No application chrome on the paper: only the sermon's words.
  const text = pdfLines(printed.pdf, printed.pageH, { placed: true })
    .map((line) => line.text)
    .join(" ");
  for (const chrome of ["Outline Settings", "View", "Insert"]) expect(text).not.toContain(chrome);
});

test("a default changed in another tab during a print does not change that print", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Once is enough.");
  await page.evaluate(() => localStorage.setItem("sermon-print-color", "bw"));
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  // Another tab: the storage event, as the browser sends it.
  await page.evaluate(() => {
    localStorage.setItem("sermon-print-color", "grayscale");
    window.dispatchEvent(new StorageEvent("storage", { key: "sermon-print-color" }));
  });
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-print-color"))).toBe(
    "bw",
  );
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect(pdfColors(pdf).filter((c) => !isBlackOrWhite(c))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-print-color"))).toBe(
    false,
  );
});

test("Outline Settings → Printing previews each mode with the print's own rules, and prints once after closing", async ({
  page,
}) => {
  await chooseFixture(page, gallery);
  await choosePaper(page, "dark");
  await page.getByTestId("outline-settings-open").click();
  const settings = page.getByRole("dialog", { name: "Outline Settings" });
  await settings.getByRole("button", { name: "Printing" }).click();
  const pages = page.getByTestId("appearance-preview-pages");
  const preview = page.getByTestId("appearance-preview-editor");
  await expect(preview).toHaveAttribute("data-paper", "light");
  const sample = async () =>
    preview.evaluate((editor) => {
      const note = editor.querySelector(".lab-passage") as HTMLElement | null;
      return note
        ? {
            left: getComputedStyle(note).borderLeftColor,
            fill: getComputedStyle(note).backgroundColor,
          }
        : null;
    });
  const seen: Record<string, unknown> = {};
  for (const mode of ["Color", "Grayscale", "Black & White"] as const) {
    // On a phone the preview can be hidden; it is shown by default.
    await settings.getByText(mode, { exact: true }).click();
    await expect(pages).toHaveAttribute(
      "data-print-color",
      mode === "Color" ? "color" : mode === "Grayscale" ? "grayscale" : "bw",
    );
    await settled(page);
    seen[mode] = await sample();
    if (shots)
      await page.screenshot({
        path: `${shots}/printing-${test.info().project.name}-${mode.replace(/\W+/g, "")}.png`,
      });
  }
  report("printing-preview", { seen });
  // A computed color as Chrome writes it: `rgb()`, `oklch(L C H)`, `oklab(L a b)`, or `color(srgb r g b)`.
  const gray = (css: string) => {
    const values = (css.match(/-?[\d.]+/g) ?? []).map(Number);
    if (css.startsWith("oklch(")) return values[1] < 0.002;
    if (css.startsWith("oklab(")) return Math.hypot(values[1], values[2]) < 0.002;
    const scale = css.startsWith("color(") ? 255 : 1;
    const [r, g, b] = values.map((v) => v * scale);
    return Math.abs(r - g) < 2 && Math.abs(g - b) < 2;
  };
  const black = (css: string) =>
    /^(rgb\(0, 0, 0\)|rgba\(0, 0, 0, 1\)|color\(srgb 0 0 0\))$/.test(css);
  const clear = (css: string) => /rgba\(0, 0, 0, 0\)|transparent|\/ 0\)$/.test(css);
  const color = seen.Color as { left: string; fill: string };
  const grayscale = seen.Grayscale as { left: string; fill: string };
  const bw = seen["Black & White"] as { left: string; fill: string };
  expect(gray(color.left), color.left).toBe(false);
  expect(gray(grayscale.left), grayscale.left).toBe(true);
  expect(gray(grayscale.fill), grayscale.fill).toBe(true);
  expect(black(bw.left), bw.left).toBe(true);
  expect(clear(bw.fill), bw.fill).toBe(true);
  // Nothing was remembered by choosing.
  expect(await page.evaluate(() => localStorage.getItem("sermon-print-color"))).toBeNull();

  // Print: the window closes first; the print starts once it is gone, in Grayscale.
  await settings.getByText("Grayscale", { exact: true }).click();
  await page.evaluate(() => {
    const record = window as unknown as { printed: unknown[] };
    record.printed = [];
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      record.printed.push({
        attr: document.documentElement.getAttribute("data-print-color"),
        dialog: document.querySelector('[role="dialog"]') !== null,
        preview: document.querySelector('[data-testid="appearance-preview"]') !== null,
      });
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await settings.getByTestId("printing-print").click();
  await expect(settings).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: unknown[] }).printed))
    .toEqual([{ attr: "grayscale", dialog: false, preview: false }]);
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-print-color"))).toBe(
    false,
  );
  expect(await page.evaluate(() => localStorage.getItem("sermon-print-color"))).toBeNull();
});

test("with Outline Settings open, a print (Ctrl+P) prints the sermon and never the window or its preview", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Once is enough.");
  await page.getByTestId("outline-settings-open").click();
  await page
    .getByRole("dialog", { name: "Outline Settings" })
    .getByRole("button", { name: "Header & Footer" })
    .click();
  await passagesReady(page);
  const printed = await print(page);
  const text = pdfLines(printed.pdf, printed.pageH, { placed: true })
    .map((line) => line.text)
    .join(" ");
  expect(text).not.toContain("Outline Settings");
  expect(text).not.toContain("The Lamp and the Light");
});

test("the presets in each print mode (screenshots for the review)", async ({ page }) => {
  test.skip(
    !shots || test.info().project.name !== "desktop",
    "Only when LAB_SHOTS names a folder.",
  );
  for (const fixture of [gallery, "When Idols Fall (a realistic sermon)"]) {
    await chooseFixture(page, fixture);
    await passagesReady(page);
    for (const preset of ["minimal", "balanced", "expressive"]) {
      await editorCall(page, `return editor.commands.setOutlinePreset("${preset}");`);
      for (const mode of ["color", "grayscale", "bw"]) {
        await page.evaluate((value) => {
          if (value === "color") document.documentElement.removeAttribute("data-print-color");
          else document.documentElement.setAttribute("data-print-color", value);
        }, mode);
        await page.emulateMedia({ media: "print" });
        await settled(page);
        await page.screenshot({
          path: `${shots}/${fixture.split(" ")[0]}-${preset}-${mode}.png`,
          fullPage: true,
        });
        await page.emulateMedia({ media: "screen" });
      }
    }
    await editorCall(page, `return editor.commands.setOutlinePreset("balanced");`);
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-print-color"));
});
