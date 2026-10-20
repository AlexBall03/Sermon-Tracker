import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import { documentFixtures } from "./documents";
import {
  breakFill,
  clampSide,
  defaultMargins,
  defaultSetup,
  fitMargins,
  inUnit,
  marginLimits,
  marginStep,
  pageAt,
  pageMetrics,
  papers,
  pagesFor,
  paperSizes,
} from "./pagination/geometry";
import { expansionKey } from "./pagination/expansion";
import { printLayoutKey } from "./pagination/plugin";
import {
  readDefaultLayout,
  readPageSetup,
  readTabLayout,
  resolveLayout,
  writeDefaultLayout,
  writePageSetup,
  writeTabLayout,
} from "./pagination/preferences";
import { loadDocument } from "./load";
import { restoreDocument } from "./validate";
import { labSchema } from "./schema/extensions";
import { testEditor } from "./testing";

/*
 * Print Layout (PS-1B.2B.1): the page arithmetic, where it starts, and that
 * switching layout, paper, margins, or a passage's expansion is view state
 * only (P8 in unit form). Pagination itself needs a browser's layout and is
 * tested in tests/lab/pagination.spec.ts.
 */

describe("page geometry", () => {
  it("measures paper in CSS pixels at 96 an inch", () => {
    expect(papers.letter).toMatchObject({ width: 816, height: 1056, unit: "in" });
    expect(papers.legal.height).toBe(1344);
    expect(papers.halfLetter).toMatchObject({ width: 528, height: 816 });
    expect(papers.a4.width).toBeCloseTo(793.7, 1);
    expect(papers.a4.height).toBeCloseTo(1122.5, 1);
    expect(papers.a5.unit).toBe("cm");
    expect(paperSizes).toEqual(["letter", "legal", "a4", "a5", "halfLetter"]);
  });

  it("gives a comfortable default margin for each paper", () => {
    expect(defaultMargins("letter")).toEqual({ top: 96, right: 96, bottom: 96, left: 96 });
    expect(defaultMargins("halfLetter").left).toBe(72);
    expect(defaultMargins("a5").left).toBe(72);
    expect(defaultSetup()).toEqual({ size: "letter", margins: defaultMargins("letter") });
  });

  it("keeps side margins within the paper", () => {
    expect(clampSide("letter", 10, 96)).toBe(marginLimits.minSide);
    // Text never narrower than three inches.
    expect(clampSide("letter", 600, 96)).toBe(816 - 96 - 288);
    expect(fitMargins("halfLetter", { top: 72, bottom: 72, left: 200, right: 200 })).toEqual({
      top: 72,
      bottom: 72,
      left: 192,
      right: 48,
    });
  });

  it("steps an eighth of an inch, or 2.5 mm on metric paper, and reads in that unit", () => {
    expect(marginStep("letter")).toBe(12);
    expect(marginStep("a4")).toBeCloseTo(9.449, 3);
    expect(inUnit("letter", 96)).toBe(1);
    expect(inUnit("a4", 96)).toBeCloseTo(2.54, 5);
  });

  it("finds the page of a point and the fill of a page break", () => {
    const m = pageMetrics(defaultSetup());
    expect(m).toMatchObject({ contentHeight: 864, contentWidth: 624, stride: 1080 });
    expect(pageAt(m, 0)).toBe(0);
    expect(pageAt(m, 96 + 863)).toBe(0);
    expect(pageAt(m, 96 + 1080)).toBe(1);
    // A break 100 px into page 2 fills the other 764 px of its text area.
    expect(breakFill(m, 96 + 1080 + 100)).toEqual({ fill: 764, atTop: false });
    expect(breakFill(m, 96 + 1080)).toEqual({ fill: 0, atTop: true });
    expect(pagesFor(m, 96 + 10)).toBe(1);
    expect(pagesFor(m, 96 + 1080 + 1)).toBe(2);
    expect(pagesFor(m, 0)).toBe(1);
    // Content run into the bottom margin, before a gap is made there, needs a second page.
    expect(pagesFor(m, 96 + 864 + 40)).toBe(2);
  });

  it("depends on the paper and margins, never on anything else", () => {
    const narrow = pageMetrics({
      size: "letter",
      margins: { ...defaultMargins("letter"), left: 48 },
    });
    expect(narrow.contentWidth).toBe(672);
    expect(narrow.contentHeight).toBe(864);
  });
});

/** An in-memory stand-in for `localStorage` or `sessionStorage`. */
function memory() {
  const values = new Map<string, string>();
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  return { values, get: () => store };
}

const refusing = () => {
  throw new Error("storage refused");
};

describe("where Print Layout starts (the owner's decision, 19 October 2026)", () => {
  it("is Print on a desktop and Regular on a phone, unless a default was chosen", () => {
    expect(resolveLayout("automatic", true)).toBe("print");
    expect(resolveLayout("automatic", false)).toBe("regular");
    expect(resolveLayout("regular", true)).toBe("regular");
    expect(resolveLayout("print", false)).toBe("print");
  });

  it("remembers the default, this tab's layout, and the last paper and margins", () => {
    const local = memory();
    const session = memory();
    expect(readDefaultLayout(local.get)).toBe("automatic");
    writeDefaultLayout("regular", local.get);
    expect(readDefaultLayout(local.get)).toBe("regular");

    expect(readTabLayout(session.get)).toBeNull();
    writeTabLayout("print", session.get);
    expect(readTabLayout(session.get)).toBe("print");

    expect(readPageSetup(local.get)).toEqual(defaultSetup());
    const chosen = { size: "a4" as const, margins: { top: 96, bottom: 96, left: 60, right: 140 } };
    writePageSetup(chosen, local.get);
    expect(readPageSetup(local.get)).toEqual(chosen);
    for (const key of [...local.values.keys(), ...session.values.keys()]) {
      expect(key).toMatch(/^ps-lab:/);
    }
  });

  it("falls back to the defaults when storage is empty, refuses, or holds nonsense", () => {
    expect(readDefaultLayout(refusing)).toBe("automatic");
    expect(readTabLayout(refusing)).toBeNull();
    expect(readPageSetup(refusing)).toEqual(defaultSetup());
    expect(() => writePageSetup(defaultSetup(), refusing)).not.toThrow();

    const local = memory();
    local.values.set("ps-lab:default-layout", "sideways");
    expect(readDefaultLayout(local.get)).toBe("automatic");
    local.values.set("ps-lab:page-setup", "{not json");
    expect(readPageSetup(local.get)).toEqual(defaultSetup());
    local.values.set("ps-lab:page-setup", JSON.stringify({ size: "tabloid" }));
    expect(readPageSetup(local.get)).toEqual(defaultSetup());
    local.values.set("ps-lab:page-setup", JSON.stringify({ size: "a5", margins: { top: -1 } }));
    expect(readPageSetup(local.get)).toEqual(defaultSetup("a5"));
    // Margins too wide for the paper are brought back within it.
    local.values.set(
      "ps-lab:page-setup",
      JSON.stringify({
        size: "halfLetter",
        margins: { top: 72, bottom: 72, left: 500, right: 500 },
      }),
    );
    expect(readPageSetup(local.get).margins.left).toBe(528 - 48 - 288);
  });
});

describe("layout, paper, margins, and expansion are view state (P8, §J)", () => {
  it("the Print Layout fixture is a valid v2 document that reloads exactly", () => {
    const restored = restoreDocument(documentFixtures.printLayout, labSchema());
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.doc.toJSON()).toEqual(documentFixtures.printLayout);
  });

  it("switching changes neither the document nor its history", () => {
    const editor = testEditor(documentFixtures.printLayout);
    editor.commands.insertContentAt(2, "typed ");
    const json = JSON.stringify(editor.getJSON());
    const depth = undoDepth(editor.state);
    const changed: boolean[] = [];
    editor.on("transaction", ({ transaction }) => changed.push(transaction.docChanged));

    expect(printLayoutKey.getState(editor.state)?.layout).toBe("regular");
    editor.commands.setLayout("print");
    expect(printLayoutKey.getState(editor.state)?.layout).toBe("print");
    editor.commands.setPageSetup({ size: "a4", margins: defaultMargins("a4") });
    editor.commands.setPageSetup({
      size: "a4",
      margins: { ...defaultMargins("a4"), left: 48 },
    });
    editor.commands.setPassagesExpanded(true);
    expect(expansionKey.getState(editor.state)?.ids).toEqual(
      new Set(["pl-3-p1", "pl-3-p2", "pl-3-p3"]),
    );
    editor.commands.setPassagesExpanded(false);
    editor.commands.setLayout("regular");

    expect(changed).toHaveLength(6);
    expect(changed.every((value) => value === false)).toBe(true);
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(undoDepth(editor.state)).toBe(depth);
    // Undo still undoes the typing, not a switch.
    editor.commands.undo();
    expect(JSON.stringify(editor.getJSON())).not.toBe(json);
    expect(editor.state.doc.textContent).not.toContain("typed ");
    editor.destroy();
  });

  it("a document loaded later keeps the layout in force", () => {
    const editor = testEditor(documentFixtures.printLayout);
    editor.commands.setLayout("print");
    editor.commands.setPageSetup({ size: "legal", margins: defaultMargins("legal") });
    const reloaded = testEditor(documentFixtures.lampAndPath);
    expect(printLayoutKey.getState(reloaded.state)?.layout).toBe("regular");
    reloaded.destroy();
    // The same editor, another document: still Print Layout, still Legal.
    loadDocument(editor, documentFixtures.lampAndPath);
    expect(printLayoutKey.getState(editor.state)).toMatchObject({
      layout: "print",
      setup: { size: "legal" },
    });
    editor.destroy();
  });

  it("an expanded passage stays expanded through typing and a structural change", () => {
    const editor = testEditor(documentFixtures.printLayout);
    editor.commands.setPassagesExpanded(true);
    editor.commands.insertContentAt(2, "x");
    const decorated = () =>
      expansionKey
        .getState(editor.state)!
        .decorations.find()
        .map((d) => d.from);
    const before = decorated();
    expect(before).toHaveLength(3);
    editor.commands.undo();
    expect(decorated()).toHaveLength(3);
    editor.destroy();
  });
});

describe("an empty last line after a line break (Print Layout)", () => {
  it("gets a mark that is only a decoration, added and removed as the line changes", () => {
    const editor = testEditor(documentFixtures.manuscriptOnly);
    editor.commands.setLayout("print");
    const marks = () =>
      (editor.view as unknown as { docView: { dom: HTMLElement } }).docView.dom.querySelectorAll(
        ".lab-line-mark",
      ).length;
    const json = JSON.stringify(editor.getJSON());
    expect(marks()).toBe(0);
    // Shift+Enter at the end of the first paragraph leaves an empty last line.
    const end = 1 + editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize - 2;
    editor.commands.setTextSelection(end);
    editor.commands.setHardBreak();
    expect(marks()).toBe(1);
    editor.commands.insertContent("words");
    expect(marks()).toBe(0);
    editor.commands.undo();
    editor.commands.undo();
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(marks()).toBe(0);
    editor.commands.setLayout("regular");
    editor.destroy();
  });
});
