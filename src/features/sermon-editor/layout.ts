import { useSyncExternalStore } from "react";

import type { LayoutMode, PrintLayoutState } from "@/features/editor-lab/pagination/plugin";
import {
  desktopQuery,
  isDesktop,
  readPageSetup,
  readTabLayout,
} from "@/features/editor-lab/pagination/preferences";

/*
 * Which layout the sermon editor shows (owner, A1-UI.1, after Word's own):
 *
 * - On a desktop (a window of 64rem or more with a fine pointer), editable
 *   Print Layout only: there is no Regular/Print switch there.
 * - On anything smaller, Regular Layout, filling the width and following the
 *   theme; Print Layout can be chosen, and that choice is this tab's
 *   (`readTabLayout`, §C.9).
 *
 * Crossing the line (a resized window, a rotated tablet) changes only the
 * view, never the outline, its selection, or its history.
 *
 * Printing is not crossing it (BUG-010): the browser lays a print out at the
 * paper's width, under the desktop's, and the query's `change` then said
 * "not a desktop", so the workspace turned to Regular Layout and printed its
 * toolbar. From `beforeprint` to `afterprint`, and while print media
 * matches, the answer is held at what it was before the print.
 */

let printing = false;
let held: boolean | null = null;

const printMedia = () =>
  typeof window.matchMedia === "function" && window.matchMedia("print").matches;

/** Whether this window counts as a desktop now; while printing, what it was before the print. */
export function desktopNow(): boolean {
  if (held !== null && (printing || printMedia())) return held;
  held = isDesktop();
  return held;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  const before = () => {
    // The screen's media and layout are still in force here (A3.1): what the window is.
    held = isDesktop();
    printing = true;
  };
  const after = () => {
    printing = false;
    onChange();
  };
  query.addEventListener("change", onChange);
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", after);
  };
}

/** Whether this window counts as a desktop, following it as it changes, never because of a print. */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, desktopNow, () => false);
}

/** The layout for a desktop or a smaller window. */
export function workspaceLayout(desktop: boolean): LayoutMode {
  return desktop ? "print" : (readTabLayout() ?? "regular");
}

/** Where a new sermon editor starts: its layout, and the paper and margins last chosen. */
export function initialWorkspaceLayout(): PrintLayoutState {
  return { layout: workspaceLayout(isDesktop()), setup: readPageSetup() };
}
