import { isPrintColorMode, readPrintColor, type PrintColorMode } from "./preferences";

/*
 * The print color mode of one print (A4.4). A print is drawn in one mode,
 * captured once as the browser's `beforeprint` fires and held until its
 * `afterprint`:
 *
 * - the mode is the one a print started from Outline Settings → Printing asked
 *   for (`printWith`), else this device's default (`readPrintColor`);
 * - it is written as `data-print-color` on `<html>`, which the print rules
 *   (`lab.css`, `lab-v4.css`, the generated sheet) read; nothing else writes
 *   that attribute while a print is in progress, so a default changed in
 *   another tab meanwhile never changes the print under way;
 * - after the print, or when one asked for never started, the request is
 *   forgotten: the next print is drawn in the default again.
 *
 * A mode only paints (colors, fills, the style of a rule): it never changes a
 * width, a font, or what is drawn, so the pages measured for the print in the
 * same `beforeprint` (`pagination/plugin.ts`) are the pages of every mode. It
 * is never the document's, never a change, and never a save.
 */

export const printColorAttribute = "data-print-color";

/** How long a print asked for may take to start before the request is dropped. */
export const printRequestTimeout = 10_000;

type Request = { mode: PrintColorMode; at: number };

let request: Request | null = null;
let active: PrintColorMode | null = null;
let installed = 0;
let dropTimer: ReturnType<typeof setTimeout> | null = null;

const now = () => Date.now();
const root = () => (typeof document === "undefined" ? null : document.documentElement);

function clearDropTimer() {
  if (dropTimer !== null) clearTimeout(dropTimer);
  dropTimer = null;
}

/** The mode a print starting now is drawn in. */
export function modeForNextPrint(): PrintColorMode {
  if (request && now() - request.at <= printRequestTimeout) return request.mode;
  return readPrintColor();
}

/** The mode of the print in progress, if one is. */
export const activePrintColor = (): PrintColorMode | null => active;

function onBeforePrint() {
  // One capture per print: a second `beforeprint` (another listener, a nested print) changes nothing.
  if (active !== null) return;
  active = modeForNextPrint();
  request = null;
  clearDropTimer();
  root()?.setAttribute(printColorAttribute, active);
}

function onAfterPrint() {
  if (active === null) return;
  active = null;
  request = null;
  clearDropTimer();
  root()?.removeAttribute(printColorAttribute);
}

/**
 * Listens for prints while anything that prints a sermon is mounted (the
 * workspace). Counted, so two workspaces listen once; returns the release.
 */
export function installPrintColor(): () => void {
  if (typeof window === "undefined") return () => {};
  if (installed === 0) {
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
  }
  installed += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installed -= 1;
    if (installed === 0) {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      onAfterPrint();
      request = null;
      clearDropTimer();
    }
  };
}

/**
 * Prints once in `mode`, leaving the default as it is. The browser's own
 * print runs `beforeprint` (which captures the mode) inside `print()`; where
 * `print()` returns before the print starts, the request waits at most
 * `printRequestTimeout`, and a print that never starts leaves nothing behind.
 */
export function printWith(mode: PrintColorMode, print: () => void = () => window.print()) {
  if (!isPrintColorMode(mode)) return;
  clearDropTimer();
  request = { mode, at: now() };
  try {
    print();
  } finally {
    // Started and finished (or cancelled) inside `print()`: nothing is left. Not started: dropped soon.
    if (request !== null && active === null) {
      dropTimer = setTimeout(() => {
        request = null;
        dropTimer = null;
      }, printRequestTimeout);
    }
  }
}

/** For tests only: forget every request and print. */
export function resetPrintJob() {
  request = null;
  clearDropTimer();
  if (active !== null) onAfterPrint();
}
