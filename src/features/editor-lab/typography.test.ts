import type { Editor, JSONContent } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { documentFixtures, paragraph, point, sermonDocument, text } from "./documents";
import {
  clearFormatting,
  parseFontSize,
  setAlignment,
  setFontFamily,
  setFontSize,
  setHighlight,
  setNamedStyle,
  setParagraphFormat,
  setTextColor,
  steppedSize,
} from "./formatting-commands";
import { blockState, mixed, textState } from "./formatting-state";
import { run } from "./outline-commands";
import { labSchema } from "./schema/extensions";
import { fontFromCss, sizeFromCss } from "./styles/font-stack";
import { documentStylesKey, stylesInForce } from "./styles/plugin";
import { styleSheet } from "./styles/render";
import { testEditor, titleStart } from "./testing";
import { restoreDocument } from "./validate";

/*
 * Rich text, fonts, typography, and named styles (PS-1B.2B.2B): the shared
 * formatting commands, what the controls read, drawing, copy and paste, and
 * the Document Styles preview.
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});
const open = (doc: JSONContent) => {
  const editor = testEditor(doc);
  editors.push(editor);
  return editor;
};

/** The position just inside the first textblock whose text starts with `start`. */
function at(editor: Editor, start: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isTextblock && node.textContent.startsWith(start)) found = pos + 1;
    return true;
  });
  if (found < 0) throw new Error(`no block "${start}"`);
  return found;
}

const select = (editor: Editor, from: number, to = from) =>
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );

const sample = () =>
  sermonDocument([
    paragraph(text("Alpha beta gamma")),
    paragraph(text("Second paragraph")),
    point("p1", [text("Point one")], [paragraph(text("Body of the point"))]),
  ]);

const valid = (editor: Editor) => restoreDocument(editor.getJSON(), labSchema()).ok;
const undoDepth = (editor: Editor) => {
  let depth = 0;
  while (editor.can().undo() && depth < 50) {
    editor.commands.undo();
    depth += 1;
  }
  return depth;
};

describe("inline formatting", () => {
  it("sets a font, a size, and a color on the selection, keeping each run's other attributes", () => {
    const editor = open(sample());
    const from = at(editor, "Alpha");
    select(editor, from, from + 5);
    expect(run(editor, setTextColor("red"))).toBe(true);
    expect(run(editor, setFontSize(18))).toBe(true);
    expect(run(editor, setFontFamily("inter"))).toBe(true);
    const runs = editor.getJSON().content![0].content!;
    expect(runs[0]).toEqual({
      type: "text",
      text: "Alpha",
      marks: [{ type: "textStyle", attrs: { color: "red", fontFamily: "inter", fontSize: 18 } }],
    });
    // Unrelated text is untouched.
    expect(runs[1]).toEqual({ type: "text", text: " beta gamma" });
    // Clearing the last attribute removes the mark.
    run(editor, setTextColor(null));
    run(editor, setFontSize(null));
    run(editor, setFontFamily(null));
    expect(editor.getJSON().content![0].content).toEqual([
      { type: "text", text: "Alpha beta gamma" },
    ]);
    expect(valid(editor)).toBe(true);
  });

  it("stores the format at a collapsed cursor for what is typed next", () => {
    const editor = open(sample());
    const end = at(editor, "Alpha") + "Alpha beta gamma".length;
    select(editor, end);
    run(editor, setFontSize(20));
    run(editor, setHighlight({ mode: "exact", color: "#1e3a8a" }));
    editor.view.dispatch(editor.state.tr.insertText("!"));
    const runs = editor.getJSON().content![0].content!;
    expect(runs.at(-1)).toEqual({
      type: "text",
      text: "!",
      marks: [
        { type: "textStyle", attrs: { color: null, fontFamily: null, fontSize: 20 } },
        { type: "highlight", attrs: { color: { mode: "exact", color: "#1e3a8a" } } },
      ],
    });
    expect(valid(editor)).toBe(true);
  });

  it("refuses an invalid size and steps and rounds sizes as a word processor does", () => {
    const editor = open(sample());
    select(editor, at(editor, "Alpha"), at(editor, "Alpha") + 3);
    expect(run(editor, setFontSize(3))).toBe(false);
    expect(run(editor, setFontSize(12.25))).toBe(false);
    expect(parseFontSize("10,5")).toBe(10.5);
    expect(parseFontSize("12.3")).toBe(12.5);
    expect(parseFontSize("200")).toBeNull();
    expect(parseFontSize("")).toBeNull();
    expect(steppedSize(12, 1)).toBe(14);
    expect(steppedSize(13, -1)).toBe(12);
    expect(steppedSize(144, 1)).toBe(144);
    expect(steppedSize(8, -1)).toBe(4);
  });

  it("formats a point's title without touching the point, its children, or its ID", () => {
    const editor = open(documentFixtures.lampAndPath);
    const pointId = editor.getJSON().content!.find((node) => node.type === "outlinePoint")!.attrs!
      .id;
    const before = editor.getJSON();
    const start = titleStart(editor, pointId);
    const title = editor.state.doc.resolve(start).parent;
    select(editor, start, start + title.content.size);
    expect(run(editor, setFontFamily("merriweather"))).toBe(true);
    expect(run(editor, setTextColor({ mode: "themed", light: "#7c2d12", dark: "#fdba74" }))).toBe(
      true,
    );
    const after = editor.getJSON();
    const strip = (doc: JSONContent) =>
      JSON.stringify(doc, (key, value) => (key === "marks" ? undefined : value));
    expect(strip(after)).toBe(strip(before));
    expect(valid(editor)).toBe(true);
  });
});

describe("paragraph formatting and named styles", () => {
  it("applies Title to a body paragraph as a look only: the document's attributes are untouched", () => {
    const editor = open(sample());
    const attrs = JSON.stringify(editor.state.doc.attrs);
    select(editor, at(editor, "Alpha"));
    expect(run(editor, setNamedStyle("title"))).toBe(true);
    expect(editor.getJSON().content![0].attrs).toMatchObject({ styleName: "title" });
    expect(JSON.stringify(editor.state.doc.attrs)).toBe(attrs);
    expect(run(editor, setNamedStyle("heading1"))).toBe(true);
    expect(editor.getJSON().content![0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(run(editor, setNamedStyle("normal"))).toBe(true);
    expect(editor.getJSON().content![0]).toMatchObject({
      type: "paragraph",
      attrs: { styleName: null },
    });
    expect(valid(editor)).toBe(true);
  });

  it("carries alignment and format through a change of style, across several paragraphs, in one undo step", () => {
    const editor = open(sample());
    select(editor, at(editor, "Alpha"), at(editor, "Second") + 3);
    run(editor, setAlignment("center"));
    run(editor, setParagraphFormat({ spaceBefore: 12, lineHeight: 2 }));
    const before = undoDepth(open(editor.getJSON()));
    expect(before).toBe(0);
    run(editor, setNamedStyle("heading2"));
    const [first, second] = editor.getJSON().content!;
    for (const block of [first, second]) {
      expect(block).toMatchObject({
        type: "heading",
        attrs: { level: 2, textAlign: "center", format: { spaceBefore: 12, lineHeight: 2 } },
      });
    }
    editor.commands.undo();
    expect(editor.getJSON().content![0].type).toBe("paragraph");
    expect(editor.getJSON().content![1].type).toBe("paragraph");
  });

  it("keeps a paragraph's format sparse: a property returned to its style is left out, and an empty format is null", () => {
    const editor = open(sample());
    select(editor, at(editor, "Alpha"));
    run(editor, setParagraphFormat({ spaceAfter: 12 }));
    expect(editor.getJSON().content![0].attrs!.format).toEqual({ spaceAfter: 12 });
    run(editor, setParagraphFormat({ spaceAfter: undefined }));
    expect(editor.getJSON().content![0].attrs!.format).toBeNull();
    expect(run(editor, setParagraphFormat({ lineHeight: 9 }))).toBe(false);
  });

  it("refuses named styles and paragraph format in a title, and headings in a note", () => {
    const editor = open(documentFixtures.stylesAndScript);
    const start = titleStart(editor, "st-1");
    select(editor, start);
    expect(setNamedStyle("title")(editor.state)).toBe(false);
    expect(setParagraphFormat({ spaceAfter: 3 })(editor.state)).toBe(false);
    expect(blockState(editor.state).style).toBeNull();
    select(editor, at(editor, "Pause here"));
    expect(setNamedStyle("heading1")(editor.state)).toBe(false);
    // Paragraph format still applies inside a note.
    expect(setParagraphFormat({ spaceAfter: 3 })(editor.state)).toBe(true);
  });

  it("clears direct formatting and nothing structural", () => {
    const editor = open(documentFixtures.typography);
    const before = editor.getJSON();
    editor.commands.selectAll();
    expect(run(editor, clearFormatting)).toBe(true);
    const after = editor.getJSON();
    const marks = JSON.stringify(after).match(/"marks"/g);
    expect(marks).toBeNull();
    // Named styles, heading levels, and the point stay.
    expect(
      after.content!.map((node) => [node.type, node.attrs?.styleName ?? node.attrs?.level ?? null]),
    ).toEqual(
      before.content!.map((node) => [
        node.type,
        node.attrs?.styleName ?? node.attrs?.level ?? null,
      ]),
    );
    expect(after.content!.every((node) => (node.attrs?.format ?? null) === null)).toBe(true);
    expect(valid(editor)).toBe(true);
  });
});

describe("what the controls read", () => {
  it("shows inherited values, mixed selections, and the block's style", () => {
    const editor = open(documentFixtures.typography);
    select(editor, at(editor, "Lora by default"));
    const plain = textState(editor.state);
    expect(plain).toMatchObject({ fontFamily: "lora", fontSize: 12, color: null, highlight: null });
    expect(plain.inherited.fontFamily).toBe(true);
    const from = at(editor, "Lora by default");
    select(editor, from, from + 40);
    expect(textState(editor.state).fontFamily).toBe(mixed);
    expect(textState(editor.state).fontSize).toBe(mixed);
    select(editor, at(editor, "Heading 1"));
    expect(textState(editor.state)).toMatchObject({ fontFamily: "figtree", fontSize: 20 });
    expect(blockState(editor.state)).toMatchObject({
      style: "heading1",
      align: "left",
      paragraph: true,
    });
    select(editor, at(editor, "Typography and Color"), at(editor, "Heading 1"));
    expect(blockState(editor.state).style).toBe(mixed);
  });
});

describe("drawing, and copy and paste", () => {
  it("draws fonts, sizes, and both color variants, and reads them back from its own HTML", () => {
    const editor = open(documentFixtures.typography);
    const html = editor.getHTML();
    expect(html).toContain('data-font-family="inter"');
    expect(html).toContain("font-family: var(--lab-font-inter, &quot;Inter&quot;)");
    expect(html).toContain("font-size: 11pt");
    expect(html).toContain('data-color-mode="exact"');
    expect(html).toContain('data-color-dark="#fdba74"');
    // The light variant inline (jsdom writes it as rgb()), the dark one in a variable.
    expect(html).toMatch(/class="lab-ink" style="color: rgb\([\d, ]+\); --ink-d: #[0-9a-f]{6};"/);
    expect(html).toContain("padding-top: 18pt");
    expect(html).toContain("text-indent: -18pt");
    const element = document.createElement("div");
    element.innerHTML = html;
    const reparsed = ProseMirrorDOMParser.fromSchema(editor.schema).parse(element).toJSON();
    expect(reparsed.content).toEqual(editor.getJSON().content);
  });

  it("maps another application's fonts, sizes, and colors only where it can", () => {
    expect(fontFromCss('"Times New Roman", serif')).toBe("tinos");
    expect(fontFromCss("Garamond, 'EB Garamond', serif")).toBe("eb-garamond");
    expect(fontFromCss("Comic Sans MS, cursive")).toBeNull();
    expect(fontFromCss("var(--x)")).toBeNull();
    expect(sizeFromCss("11pt")).toBe(11);
    expect(sizeFromCss("15px")).toBe(11.5);
    expect(sizeFromCss("1.2em")).toBeNull();
    expect(sizeFromCss("400pt")).toBeNull();
    const element = document.createElement("div");
    element.innerHTML =
      '<p><span style="font-family: Arial; font-size: 15px; color: rgb(0, 0, 0)">a</span>' +
      '<mark style="background-color: #FFEE00">b</mark>' +
      '<span data-color="#123456" data-color-mode="exact">c</span>' +
      '<span data-color="#123456" data-color-mode="themed">d</span></p>';
    const json = ProseMirrorDOMParser.fromSchema(labSchema()).parse(element).toJSON();
    const runs = json.content[0].content;
    expect(runs[0].marks).toEqual([
      { type: "textStyle", attrs: { color: "#000000", fontFamily: "arimo", fontSize: 11.5 } },
    ]);
    expect(runs[1].marks).toEqual([{ type: "highlight", attrs: { color: "#ffee00" } }]);
    expect(runs[2].marks).toEqual([
      {
        type: "textStyle",
        attrs: { color: { mode: "exact", color: "#123456" }, fontFamily: null, fontSize: null },
      },
    ]);
    // A per-theme color without its dark half is not one: no mark, the words stay.
    expect(runs[3]).toEqual({ type: "text", text: "d" });
  });

  it("gives highlighted text a color judged against its fill, and leaves an exact color alone", () => {
    const editor = open(documentFixtures.typography);
    const decorated = editor.view.dom.querySelectorAll(
      "mark .lab-ink, .lab-ink mark, mark span.lab-ink",
    );
    expect(decorated.length).toBeGreaterThan(0);
    // The inline decoration is inside the marks, so its color wins.
    const red = Array.from(editor.view.dom.querySelectorAll("mark")).find((mark) =>
      mark.textContent?.startsWith("red on"),
    )!;
    const inner =
      red.querySelector("span.lab-ink:not([data-color])") ?? red.closest("span.lab-ink");
    expect(inner).not.toBeNull();
  });
});

describe("document styles", () => {
  it("draws named and component styles as one scoped sheet, with dark colors for the screen only", () => {
    const sheet = styleSheet(
      { version: 1, defaults: { fontFamily: "inter" }, named: { title: { color: "#1e3a8a" } } },
      ".lab-editor[data-sheet='x']",
    );
    expect(sheet).toContain(
      '[data-style-name="title"] { font-family: var(--lab-font-playfair-display',
    );
    expect(sheet).toMatch(
      /p:not\(\.lab-title\):not\(\.lab-passage-text p\) \{ font-family: var\(--lab-font-inter/,
    );
    expect(sheet).toContain("padding-bottom: 6pt");
    expect(sheet).toMatch(
      /@media screen \{ \.dark .*\[data-style-name="title"\] \{ color: #[0-9a-f]{6}; \}/,
    );
  });

  it("previews without writing, cancels to exactly what was there, and applies in one undo step", () => {
    const editor = open(sample());
    const json = JSON.stringify(editor.getJSON());
    const next = { version: 1 as const, named: { normal: { fontSize: 15.5 } } };
    editor.commands.setStylesPreview({ styles: next });
    expect(stylesInForce(editor.state)).toBe(next);
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(editor.can().undo()).toBe(false);
    const sheet = document.head.querySelector(
      `style[data-lab-sheet="${editor.view.dom.dataset.sheet}"]`,
    )!;
    expect(sheet.textContent).toContain("font-size: 15.5pt");
    editor.commands.setStylesPreview(null);
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(sheet.textContent).not.toContain("font-size: 15.5pt");

    expect(editor.commands.applyDocumentStyles(next)).toBe(true);
    expect(editor.getJSON().attrs!.styles).toEqual(next);
    expect(documentStylesKey.getState(editor.state)!.preview).toBeNull();
    expect(valid(editor)).toBe(true);
    editor.commands.undo();
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    // Styles the schema refuses are neither previewed nor applied.
    expect(
      editor.commands.applyDocumentStyles({ version: 1, defaults: { fontSize: 1 } } as never),
    ).toBe(false);
  });

  it("lets explicit formatting win over a changed style", () => {
    const editor = open(documentFixtures.typography);
    select(editor, at(editor, "Lora by default"));
    editor.commands.applyDocumentStyles({
      version: 1,
      named: { normal: { fontFamily: "tinos", fontSize: 13 } },
    });
    expect(textState(editor.state)).toMatchObject({ fontFamily: "tinos", fontSize: 13 });
    const from = at(editor, "Lora by default") + "Lora by default, ".length;
    select(editor, from, from + 3);
    expect(textState(editor.state)).toMatchObject({ fontFamily: "inter", fontSize: 11 });
  });
});
