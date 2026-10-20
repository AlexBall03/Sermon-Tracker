/*
 * Print Layout's page geometry (PS-1B.2B.1, lab only). Everything is in CSS
 * pixels at 96 per inch, the unit the browser prints with, and comes from the
 * chosen paper and margins: never from the window. The page math is pure, so
 * it is tested without a browser; the plugin (`plugin.ts`) only measures and
 * applies it.
 */

export const pxPerInch = 96;
const mm = (value: number) => (value * pxPerInch) / 25.4;
const inch = (value: number) => value * pxPerInch;

/** The standard papers offered, in one closed list. */
export const paperSizes = ["letter", "legal", "a4", "a5", "halfLetter"] as const;
export type PaperSize = (typeof paperSizes)[number];

type Paper = {
  width: number;
  height: number;
  /** How the paper is measured where it is sold: margins are shown and stepped in this unit. */
  unit: "in" | "cm";
  /** The size as CSS writes it, for `@page`. */
  css: string;
};

export const papers: Record<PaperSize, Paper> = {
  letter: { width: inch(8.5), height: inch(11), unit: "in", css: "8.5in 11in" },
  legal: { width: inch(8.5), height: inch(14), unit: "in", css: "8.5in 14in" },
  a4: { width: mm(210), height: mm(297), unit: "cm", css: "210mm 297mm" },
  a5: { width: mm(148), height: mm(210), unit: "cm", css: "148mm 210mm" },
  halfLetter: { width: inch(5.5), height: inch(8.5), unit: "in", css: "5.5in 8.5in" },
};

export const isPaperSize = (value: unknown): value is PaperSize =>
  typeof value === "string" && (paperSizes as readonly string[]).includes(value);

export type Margins = { top: number; right: number; bottom: number; left: number };

/** The initial paper for everyone, until a person chooses another. */
export const defaultPaper: PaperSize = "letter";

/** A comfortable margin for each paper: an inch, or three quarters of one on the small papers. */
export function defaultMargins(size: PaperSize): Margins {
  const side = size === "a5" || size === "halfLetter" ? inch(0.75) : inch(1);
  return { top: side, right: side, bottom: side, left: side };
}

/** The narrowest a side margin may be, and the narrowest the text may become. */
export const marginLimits = { minSide: inch(0.5), minText: inch(3) };

/** One step of a margin handle: an eighth of an inch, or a quarter of a centimetre. */
export const marginStep = (size: PaperSize) => (papers[size].unit === "in" ? inch(1 / 8) : mm(2.5));

/**
 * A side margin as wide as asked, within the paper: never under `minSide`,
 * and never so wide that the text is narrower than `minText`.
 */
export function clampSide(size: PaperSize, value: number, otherSide: number): number {
  const widest = papers[size].width - otherSide - marginLimits.minText;
  return Math.min(Math.max(value, marginLimits.minSide), Math.max(widest, marginLimits.minSide));
}

/** Margins that fit `size`: the left side clamped first, then the right beside it; top and bottom kept. */
export function fitMargins(size: PaperSize, margins: Margins): Margins {
  const left = clampSide(size, margins.left, marginLimits.minSide);
  return { ...margins, left, right: clampSide(size, margins.right, left) };
}

/** A margin in the paper's own unit, for people and for `aria-valuenow`. */
export const inUnit = (size: PaperSize, px: number) =>
  papers[size].unit === "in" ? px / pxPerInch : (px / pxPerInch) * 2.54;

export type PageSetup = { size: PaperSize; margins: Margins };

export const defaultSetup = (size: PaperSize = defaultPaper): PageSetup => ({
  size,
  margins: defaultMargins(size),
});

/** The space between two sheets on screen. It is not printed (`--desk: 0` in print). */
export const deskGap = 24;

/** The numbers a page's layout is made of. `stride` is one sheet and the desk after it. */
export function pageMetrics(setup: PageSetup, desk = deskGap) {
  const paper = papers[setup.size];
  const { top, bottom, left, right } = setup.margins;
  const contentHeight = paper.height - top - bottom;
  return {
    width: paper.width,
    height: paper.height,
    contentWidth: paper.width - left - right,
    contentHeight,
    top,
    bottom,
    stride: paper.height + desk,
  };
}

export type PageMetrics = ReturnType<typeof pageMetrics>;

/** The page (from 0) that a point `y` from the top of the first sheet falls on. */
export function pageAt(metrics: PageMetrics, y: number): number {
  return Math.max(0, Math.floor((y - metrics.top) / metrics.stride));
}

/** How far `y` is below the top of its page's text area (negative in the margin above it). */
export function intoPage(metrics: PageMetrics, y: number): number {
  return y - metrics.top - pageAt(metrics, y) * metrics.stride;
}

/**
 * What an explicit page break at `y` must fill so the next block starts at the
 * top of the next page's text area. Returned as the part on this page
 * (`fill`); the margins and the desk below it are added by CSS, so the screen
 * and the printed page agree. A break already at the top of a page fills
 * nothing (`atTop`).
 */
export function breakFill(metrics: PageMetrics, y: number): { fill: number; atTop: boolean } {
  const into = intoPage(metrics, y);
  if (into <= 0.5) return { fill: 0, atTop: true };
  return { fill: metrics.contentHeight - into, atTop: false };
}

/**
 * How many pages hold content that ends at `bottom`. Content that runs past
 * a page's text area (into the margin below it, before a gap has been made
 * there) needs the next page.
 */
export function pagesFor(metrics: PageMetrics, bottom: number) {
  const y = Math.max(bottom - 0.5, metrics.top);
  const page = pageAt(metrics, y);
  return intoPage(metrics, y) > metrics.contentHeight ? page + 2 : page + 1;
}

/** The top of page `index`'s text area. */
export const contentTop = (metrics: PageMetrics, index: number) =>
  metrics.top + index * metrics.stride;
