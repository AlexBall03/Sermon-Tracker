import {
  defaultSetup,
  fitMargins,
  isPaperSize,
  type Margins,
  type PageSetup,
  type PaperSize,
} from "./geometry";
import type { LayoutMode, PrintLayoutState } from "./plugin";

/*
 * Where Print Layout starts, in the lab (PS-1B.2B.1). Two choices the owner
 * asked for (19 October 2026):
 *
 * - The default layout is Automatic, Regular, or Print. Automatic is Print
 *   on a desktop-sized window with a fine pointer and Regular otherwise,
 *   worked out on this device when a document opens (never from the user
 *   agent). In production this is an account preference (Settings → Editor);
 *   the lab keeps it in this browser under a lab-only key.
 * - The paper and margins last chosen are where the next document starts. In
 *   production a sermon keeps its own (`printDefaults`, §B.9) and the
 *   account's default for new sermons follows the last choice; the lab keeps
 *   the last choice in this browser.
 *
 * A layout switched in the editor is this tab's only (§C.9), in
 * `sessionStorage`, and never changes the default. Storage can be missing,
 * empty, or refuse (a private window): every read falls back to the default
 * and every write is allowed to fail.
 */

export const layoutPreferences = ["automatic", "regular", "print"] as const;
export type LayoutPreference = (typeof layoutPreferences)[number];

/** A desktop-sized window with a mouse or trackpad. */
export const desktopQuery = "(min-width: 64rem) and (pointer: fine)";

export function resolveLayout(preference: LayoutPreference, desktop: boolean): LayoutMode {
  if (preference === "automatic") return desktop ? "print" : "regular";
  return preference;
}

const keys = {
  defaultLayout: "ps-lab:default-layout",
  pageSetup: "ps-lab:page-setup",
  tabLayout: "ps-lab:layout",
} as const;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function read(store: () => Store | undefined, key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: () => Store | undefined, key: string, value: string | null) {
  try {
    if (value === null) store()?.removeItem(key);
    else store()?.setItem(key, value);
  } catch {
    // Storage refused: the choice lasts for this page only.
  }
}

const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

const isPreference = (value: unknown): value is LayoutPreference =>
  typeof value === "string" && (layoutPreferences as readonly string[]).includes(value);
const isMode = (value: unknown): value is LayoutMode => value === "regular" || value === "print";

export function readDefaultLayout(store: () => Store | undefined = local): LayoutPreference {
  const value = read(store, keys.defaultLayout);
  return isPreference(value) ? value : "automatic";
}

export const writeDefaultLayout = (
  preference: LayoutPreference,
  store: () => Store | undefined = local,
) => write(store, keys.defaultLayout, preference);

export function readTabLayout(store: () => Store | undefined = session): LayoutMode | null {
  const value = read(store, keys.tabLayout);
  return isMode(value) ? value : null;
}

export const writeTabLayout = (mode: LayoutMode | null, store: () => Store | undefined = session) =>
  write(store, keys.tabLayout, mode);

const isMargins = (value: unknown): value is Margins =>
  typeof value === "object" &&
  value !== null &&
  (["top", "right", "bottom", "left"] as const).every((side) => {
    const n = (value as Record<string, unknown>)[side];
    return typeof n === "number" && Number.isFinite(n) && n > 0;
  });

/** The last paper and margins chosen, or the default (Letter, one inch). */
export function readPageSetup(store: () => Store | undefined = local): PageSetup {
  const raw = read(store, keys.pageSetup);
  if (!raw) return defaultSetup();
  try {
    const parsed = JSON.parse(raw) as { size?: unknown; margins?: unknown };
    if (!isPaperSize(parsed.size)) return defaultSetup();
    const size: PaperSize = parsed.size;
    if (!isMargins(parsed.margins)) return defaultSetup(size);
    return { size, margins: fitMargins(size, parsed.margins) };
  } catch {
    return defaultSetup();
  }
}

export const writePageSetup = (setup: PageSetup, store: () => Store | undefined = local) =>
  write(store, keys.pageSetup, JSON.stringify(setup));

/** Whether this window counts as a desktop for Automatic. */
export const isDesktop = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(desktopQuery).matches;

/** Where a new lab editor starts: this tab's own choice, else the default for this device. */
export function initialPrintLayout(): PrintLayoutState {
  return {
    layout: readTabLayout() ?? resolveLayout(readDefaultLayout(), isDesktop()),
    setup: readPageSetup(),
  };
}
