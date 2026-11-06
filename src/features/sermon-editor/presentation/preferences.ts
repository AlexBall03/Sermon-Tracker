/*
 * How this device shows and prints sermons (A4.4, A1-UI.2D). Two device
 * preferences, shared by every sermon and every tab on this browser, never
 * the account's, never the document's, never a change, a revision, or a save:
 *
 * - The editing paper: Automatic (the look before A4.4: Regular Layout
 *   follows the application's theme, Print Layout is white), Light, or Dark,
 *   in either theme and either layout (`v4/paper.ts`). Never printed.
 * - The default print color mode: Color, Grayscale, or Black & White. A print
 *   is drawn in it unless a print started from Outline Settings → Printing
 *   names another for that one print (`print-job.ts`).
 *
 * Kept in `localStorage`; strictly validated on every read; a missing,
 * unknown, or unreadable value is the default. When storage refuses a write
 * (a private window) the choice still holds in this page's memory. Other
 * tabs follow a change through the `storage` event.
 */

export const paperChoices = ["automatic", "light", "dark"] as const;
export type PaperChoice = (typeof paperChoices)[number];
export const defaultPaper: PaperChoice = "automatic";
export const paperStorageKey = "sermon-paper";

export const printColorModes = ["color", "grayscale", "bw"] as const;
export type PrintColorMode = (typeof printColorModes)[number];
export const defaultPrintColor: PrintColorMode = "color";
export const printColorStorageKey = "sermon-print-color";

export const isPaperChoice = (value: unknown): value is PaperChoice =>
  typeof value === "string" && (paperChoices as readonly string[]).includes(value);

export const isPrintColorMode = (value: unknown): value is PrintColorMode =>
  typeof value === "string" && (printColorModes as readonly string[]).includes(value);

type Store = Pick<Storage, "getItem" | "setItem">;

const local = (): Store | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** One device preference: read strictly, written if storage allows, held in memory if not. */
function preference<T extends string>(
  key: string,
  valid: (value: unknown) => value is T,
  fallback: T,
) {
  let held: T | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const read = (store: () => Store | undefined = local): T => {
    try {
      const stored = store()?.getItem(key) ?? null;
      if (valid(stored)) return stored;
    } catch {
      // Unreadable storage: what this page was told, else the default.
    }
    return held ?? fallback;
  };

  const write = (value: T, store: () => Store | undefined = local) => {
    if (!valid(value)) return;
    held = value;
    try {
      store()?.setItem(key, value);
    } catch {
      // Storage refused: the choice lasts for this page.
    }
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) listener();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  };

  /** For tests: forget what this page holds. */
  const reset = () => {
    held = null;
  };

  return { read, write, subscribe, reset };
}

const paper = preference(paperStorageKey, isPaperChoice, defaultPaper);
const printColor = preference(printColorStorageKey, isPrintColorMode, defaultPrintColor);

export const readPaper = paper.read;
export const storePaper = paper.write;
export const subscribePaper = paper.subscribe;

export const readPrintColor = printColor.read;
export const storePrintColor = printColor.write;
export const subscribePrintColor = printColor.subscribe;

/** For tests only. */
export const resetHeldPreferences = () => {
  paper.reset();
  printColor.reset();
};
