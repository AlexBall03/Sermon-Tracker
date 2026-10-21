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
 */

function subscribe(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether this window counts as a desktop, following it as it changes. */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, () => false);
}

/** The layout for a desktop or a smaller window. */
export function workspaceLayout(desktop: boolean): LayoutMode {
  return desktop ? "print" : (readTabLayout() ?? "regular");
}

/** Where a new sermon editor starts: its layout, and the paper and margins last chosen. */
export function initialWorkspaceLayout(): PrintLayoutState {
  return { layout: workspaceLayout(isDesktop()), setup: readPageSetup() };
}
