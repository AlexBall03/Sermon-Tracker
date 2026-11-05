import { Editor, type JSONContent } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { captureAppearance } from "@/features/appearance-presets/capture";
import { defaultSetup, pxToPoints } from "../pagination/geometry";
import {
  headerFooterOf,
  historicalHeaderFooter,
  newDocumentHeaderFooter,
  newDocumentPage,
} from "../pagination/page-config";
import { PrintLayout, pageInForce, printLayoutOf } from "../pagination/plugin";
import {
  applyPlan,
  committedAt,
  conflicts,
  emptyDraft,
  resetAllComponents,
  restoreOriginal,
  restoreOutline,
  restorePreset,
  setEdit,
  type Draft,
  type Path,
} from "../styles/draft";
import type { HeaderFooter } from "../styles/model";
import { stylesInForce } from "../styles/plugin";
import { readStyles } from "../styles/resolve";
import { snapshotAppearance, snapshotDraft } from "../styles/snapshot";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, pointV4, proseV4 } from "./fixtures";

/*
 * A4.3: the sermon's page governs its pages; Header & Footer is one edit of
 * the Appearance draft, previewed as view state, applied in one undoable
 * transaction; no appearance reset, preset, or capture ever touches it.
 */

const editors: Editor[] = [];
function open(content: JSONContent, device = defaultSetup("legal")) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: labV4Extensions({
      preset: "balanced",
      printLayout: { initial: () => ({ layout: "print", setup: device }) },
    }),
  });
  const loaded = loadV4(editor, content, "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

const body = [pointV4("p-1", "The lamp", 1), proseV4("Words.", 1)];
const old = documentV4(body);
const fresh = {
  ...documentV4(body),
  attrs: { ...documentV4(body).attrs, page: newDocumentPage() },
};

const stored = (editor: Editor) => readStyles(editor.state.doc.attrs.styles);
const draftWith = (editor: Editor, path: Path, value: unknown, draft: Draft = emptyDraft) =>
  setEdit(draft, path, value, committedAt(stored(editor), editor.state.doc, path));
const centredLeft: HeaderFooter = {
  header: { titleAlign: "left" },
  runningHeader: { enabled: true, subtitle: true },
  pageNumbers: { enabled: true, align: "center", weight: "normal" },
};

describe("a document stored before A4.3 (no page of its own)", () => {
  it("opens as it always did: the device's paper, plain numbers on the right, nothing written", () => {
    const editor = open(old);
    expect(editor.state.doc.attrs.page).toBeNull();
    const page = pageInForce(editor.state)!;
    expect(page.setup.size).toBe("legal");
    expect(page.headerFooter).toEqual(historicalHeaderFooter);
    const dom = editor.view.dom;
    expect(dom.dataset.pageNumbers).toBe("right");
    expect(dom.dataset.pageNumberWeight).toBe("normal");
    expect(dom.dataset.runningHeader).toBe("off");
    expect(dom.dataset.titleAlign).toBe("center");
  });

  it("is written as version 2 only by a person's change, from what it showed", () => {
    const editor = open(old);
    const before = editor.state.doc;
    expect(editor.commands.setPageSettings({ ...defaultSetup("a4") })).toBe(true);
    const page = editor.state.doc.attrs.page;
    expect(page).toMatchObject({ version: 2, paper: "a4", ...historicalHeaderFooter });
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.doc.attrs.page).toBeNull();
    redo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.attrs.page).toMatchObject({ version: 2, paper: "a4" });
  });
});

describe("a document's own page (A4.3)", () => {
  it("governs the pages, whatever the device remembers", () => {
    const editor = open(fresh, defaultSetup("a5"));
    const page = pageInForce(editor.state)!;
    expect(page.setup.size).toBe("letter");
    expect(page.headerFooter).toEqual(newDocumentHeaderFooter);
    expect(editor.view.dom.dataset.pageNumberWeight).toBe("bold");
  });

  it("shows a dragged margin as view state, and writes it once, as one undoable change", () => {
    const editor = open(fresh);
    const before = editor.state.doc;
    const wider = { size: "letter" as const, margins: { ...defaultSetup().margins, left: 144 } };
    editor.commands.previewPageSetup(wider);
    expect(editor.state.doc).toBe(before);
    expect(pageInForce(editor.state)!.setup.margins.left).toBe(144);
    editor.commands.setPageSettings(wider);
    expect(editor.state.doc.attrs.page.margins.left).toBe(pxToPoints(144));
    expect(printLayoutOf(editor.state)?.draftSetup).toBeNull();
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.attrs.page).toEqual(newDocumentPage());
  });

  it("refuses margins the page may not have, and writes nothing", () => {
    const editor = open(fresh);
    const before = editor.state.doc;
    const tooWide = {
      size: "halfLetter" as const,
      margins: { top: 96, right: 300, bottom: 96, left: 300 },
    };
    expect(editor.commands.setPageSettings(tooWide)).toBe(false);
    expect(editor.state.doc).toBe(before);
  });

  it("measures the header as view state: no document change, no history", () => {
    const editor = open(fresh);
    const before = editor.state.doc;
    editor.commands.setHeaderHeight(140);
    editor.commands.setHeadingTitle("Title");
    expect(editor.state.doc).toBe(before);
    const metrics = pageInForce(editor.state)!.metrics;
    expect(metrics.firstTop).toBeGreaterThan(metrics.top);
    expect(metrics.firstContentHeight).toBeLessThan(metrics.contentHeight);
    // A header that fits in the top margin moves nothing.
    editor.commands.setHeaderHeight(10);
    expect(pageInForce(editor.state)!.metrics.firstTop).toBe(
      pageInForce(editor.state)!.metrics.top,
    );
  });
});

describe("Header & Footer in the Appearance draft (A4.3)", () => {
  it("is previewed as view state and written by Apply in one undoable transaction", () => {
    const editor = open(fresh);
    const before = editor.state.doc;
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    editor.commands.setStylesPreview({ draft });
    expect(editor.state.doc).toBe(before);
    expect(pageInForce(editor.state)!.headerFooter).toEqual(centredLeft);
    expect(editor.view.dom.dataset.pageNumbers).toBe("center");
    expect(editor.view.dom.dataset.runningHeader).toBe("on");

    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(editor.state.doc.attrs.page).toEqual({ ...newDocumentPage(), ...centredLeft });
    // The preview is put away with the Apply.
    expect(printLayoutOf(editor.state)?.preview ?? null).toBeNull();
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(headerFooterOf(editor.state.doc.attrs.page)).toEqual(newDocumentHeaderFooter);
  });

  it("goes with the styles in the same one step", () => {
    const editor = open(fresh);
    const before = editor.state.doc;
    let draft = draftWith(editor, { layer: "page" }, centredLeft);
    draft = draftWith(editor, { layer: "runningHeader", field: "fontSize" }, 10, draft);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(editor.state.doc.attrs.styles?.runningHeader).toEqual({ fontSize: 10 });
    expect(editor.state.doc.attrs.page.runningHeader.enabled).toBe(true);
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.eq(before)).toBe(true);
  });

  it("writes a document with no page of its own as version 2 with the paper it showed", () => {
    const editor = open(old, defaultSetup("a4"));
    const draft = draftWith(editor, { layer: "page" }, newDocumentHeaderFooter);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(editor.state.doc.attrs.page).toMatchObject({
      version: 2,
      paper: "a4",
      pageNumbers: { enabled: true, align: "right", weight: "bold" },
    });
  });

  it("is a conflict, never overwritten, when the page changed underneath", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    // Changed elsewhere (an Undo, another control) before Apply.
    const changed = {
      ...newDocumentPage(),
      pageNumbers: { enabled: false, align: "right", weight: "bold" },
    };
    editor.view.dispatch(editor.state.tr.setDocAttribute("page", changed));
    expect(conflicts(draft, stored(editor), editor.state.doc)).toHaveLength(1);
    const before = editor.state.doc;
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(editor.state.doc).toBe(before);
  });

  it("is not a conflict when only the margins moved: they are not part of it", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    editor.commands.setPageSettings({
      size: "letter",
      margins: { ...defaultSetup().margins, left: 120 },
    });
    expect(conflicts(draft, stored(editor), editor.state.doc)).toHaveLength(0);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(editor.state.doc.attrs.page.margins.left).toBe(pxToPoints(120));
  });

  it("refuses an invalid setting whole", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, { header: { titleAlign: "justify" } });
    expect(applyPlan(draft, stored(editor), editor.state.doc)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
  });

  it("is never touched by an appearance reset", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    const doc = editor.state.doc;
    for (const reset of [restoreOutline, restorePreset, restoreOriginal, resetAllComponents]) {
      const next = reset(draft, stored(editor), doc);
      expect(next.edits.get("page")?.value).toEqual(centredLeft);
    }
    // And a reset made with no page edit adds none.
    expect(restoreOriginal(emptyDraft, stored(editor), doc).edits.has("page")).toBe(false);
  });

  it("is drawn by the stylesheet only through the running header's size and color", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    editor.commands.setStylesPreview({ draft });
    // The page edit is not a style: the styles shown are the committed ones.
    expect(stylesInForce(editor.state)).toBe(stored(editor));
  });
});

describe("personal presets never carry or change the page (A4.3)", () => {
  it("applying a preset leaves a pending page edit and the committed page alone", () => {
    const editor = open(fresh);
    const draft = draftWith(editor, { layer: "page" }, centredLeft);
    const snapshot = snapshotAppearance(null, { version: 1, preset: "decimal" }, "minimal");
    const applied = snapshotDraft(snapshot, stored(editor), editor.state.doc, draft)!;
    expect(applied.edits.get("page")?.value).toEqual(centredLeft);
    expect(
      snapshotDraft(snapshot, stored(editor), editor.state.doc, emptyDraft)!.edits.has("page"),
    ).toBe(false);
    expect(
      editor.commands.applyAppearanceDraft(
        snapshotDraft(snapshot, stored(editor), editor.state.doc, emptyDraft)!,
      ),
    ).toBe(true);
    expect(editor.state.doc.attrs.page).toEqual(newDocumentPage());
  });

  it("capturing a preset (Save or Update) takes nothing of the page or the running header", () => {
    const editor = open(fresh);
    let draft = draftWith(editor, { layer: "page" }, centredLeft);
    draft = draftWith(editor, { layer: "runningHeader", field: "fontSize" }, 11, draft);
    const capture = captureAppearance(draft, stored(editor), editor.state.doc, "balanced");
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    const text = JSON.stringify(capture.snapshot);
    expect(text).not.toMatch(/page|runningHeader|titleAlign|pageNumbers/);
    // Capturing changes nothing.
    expect(editor.state.doc.attrs.page).toEqual(newDocumentPage());
  });
});

describe("the v3 lab keeps its own pages (A4.3)", () => {
  it("is drawn from the device, with plain numbers, whatever a document says", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: [
        ...labV4Extensions({ preset: "balanced" }).filter((each) => each.name !== "printLayout"),
        PrintLayout.configure({ initial: () => ({ layout: "print", setup: defaultSetup("a5") }) }),
      ],
    });
    editors.push(editor);
    loadV4(editor, fresh, "doc-b");
    const page = pageInForce(editor.state)!;
    expect(page.fromDocument).toBe(false);
    expect(page.setup.size).toBe("a5");
    expect(page.headerFooter).toEqual(historicalHeaderFooter);
    expect(editor.commands.setPageSettings(defaultSetup("letter"))).toBe(false);
  });
});

describe("printing from Regular Layout with a sermon header (A4.3)", () => {
  it("reads the header's printed height as the print begins, before measuring, as view state", () => {
    const wrapper = document.createElement("div");
    const header = document.createElement("div");
    header.setAttribute("data-page-header", "");
    // The height the header has once the editor is in Print Layout (jsdom lays nothing out).
    Object.defineProperty(header, "offsetHeight", { configurable: true, get: () => 150 });
    const surface = document.createElement("div");
    wrapper.append(header, surface);
    document.body.append(wrapper);
    const editor = new Editor({
      element: surface,
      extensions: labV4Extensions({
        preset: "balanced",
        printLayout: { initial: () => ({ layout: "regular", setup: defaultSetup("letter") }) },
      }),
    });
    editors.push(editor);
    loadV4(editor, fresh, "doc-print");
    const before = editor.state.doc;
    window.dispatchEvent(new Event("beforeprint"));
    expect(printLayoutOf(editor.state)?.layout).toBe("print");
    expect(printLayoutOf(editor.state)?.headerHeight).toBe(150);
    const metrics = pageInForce(editor.state)!.metrics;
    expect(metrics.firstTop).toBeGreaterThan(metrics.top);
    expect(editor.state.doc).toBe(before);
    window.dispatchEvent(new Event("afterprint"));
    expect(printLayoutOf(editor.state)?.layout).toBe("regular");
    wrapper.remove();
  });
});
