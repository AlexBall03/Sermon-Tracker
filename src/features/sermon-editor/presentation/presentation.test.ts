import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPrinting, printingKey } from "@/features/editor-lab/pagination/printing";
import { contrast, grayOf, renderColor } from "@/features/editor-lab/styles/colors";
import { presets } from "@/features/editor-lab/styles/presets";
import { darkScope, styleSheet } from "@/features/editor-lab/styles/render";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { paperMeta, paperShown, type PaperTheme } from "@/features/editor-lab/v4/paper";
import {
  defaultPaper,
  defaultPrintColor,
  paperStorageKey,
  printColorStorageKey,
  readPaper,
  readPrintColor,
  resetHeldPreferences,
  storePaper,
  storePrintColor,
  subscribePaper,
} from "./preferences";
import {
  activePrintColor,
  installPrintColor,
  modeForNextPrint,
  printColorAttribute,
  printRequestTimeout,
  printWith,
  resetPrintJob,
} from "./print-job";

/*
 * A4.4 (A1-UI.2D): the paper and the print color mode are this device's view
 * state. Neither is the document's, a change, an Undo step, or a save.
 */

const editors: Editor[] = [];
beforeEach(() => {
  window.localStorage.clear();
  resetHeldPreferences();
  resetPrintJob();
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const refusing = () => ({
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
});

describe("device preferences", () => {
  it("starts Automatic paper and Color printing, and reads only valid values", () => {
    expect(readPaper()).toBe(defaultPaper);
    expect(defaultPaper).toBe("automatic");
    expect(readPrintColor()).toBe(defaultPrintColor);
    expect(defaultPrintColor).toBe("color");
    window.localStorage.setItem(paperStorageKey, "sepia");
    window.localStorage.setItem(printColorStorageKey, "GRAYSCALE");
    expect(readPaper()).toBe("automatic");
    expect(readPrintColor()).toBe("color");
    window.localStorage.setItem(paperStorageKey, "dark");
    window.localStorage.setItem(printColorStorageKey, "bw");
    expect(readPaper()).toBe("dark");
    expect(readPrintColor()).toBe("bw");
  });

  it("keeps a choice for the page when storage refuses, and never throws", () => {
    expect(readPaper(refusing)).toBe("automatic");
    expect(() => storePaper("light", refusing)).not.toThrow();
    expect(readPaper(refusing)).toBe("light");
    expect(() => storePrintColor("grayscale", refusing)).not.toThrow();
    expect(readPrintColor(refusing)).toBe("grayscale");
    // An invalid value is never written or held.
    storePaper("purple" as never);
    expect(readPaper()).not.toBe("purple");
  });

  it("tells this tab and follows another tab's change", () => {
    const told = vi.fn();
    const stop = subscribePaper(told);
    storePaper("dark");
    expect(told).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: paperStorageKey }));
    expect(told).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    expect(told).toHaveBeenCalledTimes(2);
    stop();
    storePaper("light");
    expect(told).toHaveBeenCalledTimes(2);
  });
});

describe("the print job", () => {
  const root = () => document.documentElement;

  it("draws a print in the default, captured once at beforeprint and cleared at afterprint", () => {
    const release = installPrintColor();
    storePrintColor("grayscale");
    window.dispatchEvent(new Event("beforeprint"));
    expect(root().getAttribute(printColorAttribute)).toBe("grayscale");
    expect(activePrintColor()).toBe("grayscale");
    // Another tab changes the default during the print: the print under way is not touched.
    window.localStorage.setItem(printColorStorageKey, "bw");
    window.dispatchEvent(new StorageEvent("storage", { key: printColorStorageKey }));
    window.dispatchEvent(new Event("beforeprint"));
    expect(root().getAttribute(printColorAttribute)).toBe("grayscale");
    window.dispatchEvent(new Event("afterprint"));
    expect(root().hasAttribute(printColorAttribute)).toBe(false);
    expect(activePrintColor()).toBeNull();
    release();
  });

  it("prints once in a mode asked for, leaving the default as it was", () => {
    const release = installPrintColor();
    storePrintColor("color");
    const seen: (string | null)[] = [];
    printWith("bw", () => {
      window.dispatchEvent(new Event("beforeprint"));
      seen.push(root().getAttribute(printColorAttribute));
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(seen).toEqual(["bw"]);
    expect(readPrintColor()).toBe("color");
    expect(modeForNextPrint()).toBe("color");
    expect(root().hasAttribute(printColorAttribute)).toBe(false);
    release();
  });

  it("forgets a request whose print was cancelled, failed, or never started", () => {
    vi.useFakeTimers();
    const release = installPrintColor();
    // A cancelled print still fires afterprint.
    printWith("grayscale", () => {
      window.dispatchEvent(new Event("beforeprint"));
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(modeForNextPrint()).toBe("color");
    // A print that throws.
    expect(() =>
      printWith("bw", () => {
        throw new Error("blocked");
      }),
    ).toThrow("blocked");
    expect(modeForNextPrint()).toBe("bw");
    vi.advanceTimersByTime(printRequestTimeout + 1);
    expect(modeForNextPrint()).toBe("color");
    // A print that starts after print() returned (an asynchronous print dialog) still gets its mode.
    printWith("grayscale", () => undefined);
    window.dispatchEvent(new Event("beforeprint"));
    expect(root().getAttribute(printColorAttribute)).toBe("grayscale");
    window.dispatchEvent(new Event("afterprint"));
    expect(modeForNextPrint()).toBe("color");
    release();
  });

  it("listens once for many workspaces and stops with the last", () => {
    const one = installPrintColor();
    const two = installPrintColor();
    one();
    window.dispatchEvent(new Event("beforeprint"));
    expect(root().getAttribute(printColorAttribute)).toBe("color");
    window.dispatchEvent(new Event("afterprint"));
    two();
    window.dispatchEvent(new Event("beforeprint"));
    expect(root().hasAttribute(printColorAttribute)).toBe(false);
  });
});

function open(paper: PaperTheme = "automatic") {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labV4Extensions({ paper: () => paper }),
  });
  editors.push(editor);
  const doc = documentV4([pointV4("p-1", "Grace", 1), proseV4("Under the law", 1)]);
  expect(loadV4(editor, doc, "doc").ok).toBe(true);
  return editor;
}

describe("the paper (A4.4)", () => {
  const cases: [PaperTheme, "regular" | "print", string | null][] = [
    ["automatic", "regular", null],
    ["automatic", "print", "light"],
    ["light", "regular", "light"],
    ["light", "print", "light"],
    ["dark", "regular", "dark"],
    ["dark", "print", "dark"],
  ];
  it.each(cases)("%s paper in %s layout draws %s", (paper, layout, drawn) => {
    const editor = open(paper);
    editor.commands.setLayout(layout);
    expect(paperShown(editor.state)).toBe(drawn);
    expect(editor.view.dom.getAttribute("data-paper")).toBe(drawn);
  });

  it("is light while printing, whatever is chosen, and comes back after", () => {
    const editor = open("dark");
    editor.commands.setLayout("print");
    editor.view.dispatch(editor.state.tr.setMeta(printingKey, true).setMeta("addToHistory", false));
    expect(isPrinting(editor.state)).toBe(true);
    expect(editor.view.dom.getAttribute("data-paper")).toBe("light");
    editor.view.dispatch(
      editor.state.tr.setMeta(printingKey, false).setMeta("addToHistory", false),
    );
    expect(editor.view.dom.getAttribute("data-paper")).toBe("dark");
  });

  it("changes nothing in the document, its selection, or its history, and survives a load", () => {
    const editor = open("automatic");
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    const json = JSON.stringify(editor.getJSON());
    const { from } = editor.state.selection;
    const doc = editor.state.doc;
    for (const paper of ["dark", "light", "automatic", "dark"] as const) {
      editor.view.dispatch(
        editor.state.tr.setMeta(paperMeta, paper).setMeta("addToHistory", false),
      );
    }
    expect(editor.state.doc).toBe(doc);
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(editor.state.selection.from).toBe(from);
    editor.commands.undo();
    expect(editor.can().undo()).toBe(false);
    // An unknown value changes nothing.
    editor.view.dispatch(
      editor.state.tr.setMeta(paperMeta, "sepia").setMeta("addToHistory", false),
    );
    expect(editor.view.dom.getAttribute("data-paper")).toBe("dark");
    // A document loaded again starts on the device's choice, read then.
    let chosen: PaperTheme = "light";
    const again = new Editor({
      element: document.createElement("div"),
      extensions: labV4Extensions({ paper: () => chosen }),
    });
    editors.push(again);
    loadV4(again, editor.getJSON(), "doc");
    expect(paperShown(again.state)).toBe("light");
    chosen = "dark";
    loadV4(again, editor.getJSON(), "doc");
    expect(paperShown(again.state)).toBe("dark");
  });

  it("is followed by a read-only editor too", () => {
    const editor = open("automatic");
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setMeta(paperMeta, "dark").setMeta("addToHistory", false));
    expect(editor.view.dom.getAttribute("data-paper")).toBe("dark");
    expect(editor.isEditable).toBe(false);
  });
});

describe("colors on dark paper and in print (A4.4)", () => {
  const scope = ".lab-editor[data-sheet='t']";

  it("draws the dark variants on dark paper in either theme, and never on light paper", () => {
    expect(darkScope(scope)).toBe(
      `:is(.dark ${scope}:not([data-paper="light"]), ${scope}[data-paper="dark"])`,
    );
    const sheet = styleSheet(
      { version: 1, named: { title: { color: "#1e3a8a" } } },
      scope,
      presets.balanced,
    );
    const dark = /@media screen { (.*) }/.exec(sheet)![1];
    expect(dark).toContain(darkScope(scope));
  });

  it("grays every color it draws, keeping its lightness, and only under the grayscale mode", () => {
    const sheet = styleSheet(
      { version: 1, named: { title: { color: "#1e3a8a" } } },
      scope,
      presets.balanced,
    );
    expect(sheet).toMatch(
      /\[data-print-color="grayscale"\] \.lab-editor\[data-sheet='t'\] [^{]*\[data-style-name="title"\][^{]* \{ color: oklch\(from #[0-9a-f]{6} l 0 h\); \}/,
    );
    // Not in a screen block: the Printing preview and the print share the rule.
    const screen = /@media screen { (.*) }/.exec(sheet)![1];
    expect(screen).not.toContain("data-print-color");
  });

  it("works a gray out of a color without changing how light it is", () => {
    for (const hex of ["#dc2626", "#2563eb", "#16a34a", "#7d3a40", "#fde047"]) {
      const gray = grayOf(hex);
      expect(gray).toMatch(/^#([0-9a-f]{2})\1\1$/);
      // About the same contrast with white paper as the color had.
      expect(Math.abs(contrast(gray, "#ffffff") - contrast(hex, "#ffffff"))).toBeLessThan(0.6);
    }
    expect(grayOf("#000000")).toBe("#000000");
    expect(grayOf("#ffffff")).toBe("#ffffff");
    // The paper color is the one grayed: an adaptive ink stays readable on white.
    const paper = renderColor("blue", "ink", "paper")!;
    expect(contrast(grayOf(paper), "#ffffff")).toBeGreaterThan(4);
  });
});
