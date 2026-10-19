import type { Editor, JSONContent } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { highlightPresets, textColorPresets } from "./schema/model";
import {
  documentFixtures,
  invalidDocuments,
  paragraph,
  sermonDocument,
  text,
  unreadableLayout,
} from "./documents";
import { legacyFixtures, powerOfGodsWord, type LegacyFixtureId } from "./fixtures";
import { v1Documents } from "./fixtures-v1";
import { identityStats } from "./identity";
import { layoutFromNumbering } from "./layout";
import { documentToLegacy, legacyToDocument } from "./legacy";
import { loadDocument } from "./load";
import { migrateDocument } from "./migrate";
import { numberingKey, numberingStats } from "./numbering";
import { addPoint, movePoint, run } from "./outline-commands";
import { normalizeColor } from "./schema/formatting";
import { labSchema } from "./schema/extensions";
import { testEditor, titleStart } from "./testing";
import { restoreDocument } from "./validate";

const schema = labSchema();
const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});
const editorFor = (content: JSONContent) => {
  const editor = testEditor(content);
  open.push(editor);
  return editor;
};

/** Freezes a value and everything in it, so any change to it throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Every text, in order, and every ID, in order, found in document JSON. */
function contentOf(json: JSONContent) {
  const texts: string[] = [];
  const idList: string[] = [];
  const marks: string[] = [];
  const walk = (node: JSONContent) => {
    if (typeof node.text === "string") texts.push(node.text);
    if (typeof node.attrs?.id === "string") idList.push(node.attrs.id);
    for (const mark of node.marks ?? []) marks.push(`${node.text}:${mark.type}`);
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return { texts, ids: idList, marks };
}

describe("PS-1A documents (schema v1) keep loading", () => {
  const names = Object.keys(v1Documents) as LegacyFixtureId[];

  it.each(names)("%s, as PS-1A's converter wrote it, migrates to valid v2", (name) => {
    const v1 = deepFreeze(structuredClone(v1Documents[name]));
    const restored = restoreDocument(v1, schema);
    expect(restored.ok ? [] : restored.problems).toEqual([]);
    if (!restored.ok) return;
    expect(restored.migratedFrom).toBe(1);
    expect(restored.doc.attrs.schemaVersion).toBe(2);
  });

  it.each(names)("%s migrates to exactly what the v2 converter writes", (name) => {
    const migrated = migrateDocument(v1Documents[name]);
    const converted = legacyToDocument(legacyFixtures[name]);
    if (!migrated.ok || !converted.ok) throw new Error("not converted");
    expect(migrated.doc).toEqual(converted.doc);
    // And both say the same thing to a legacy reader.
    expect(documentToLegacy(migrated.doc)).toEqual(documentToLegacy(converted.doc));
  });

  it("the PS-1A mixed sermon keeps every word, mark, and ID through migration", () => {
    const v1 = deepFreeze(structuredClone(powerOfGodsWord));
    const restored = restoreDocument(v1, schema);
    if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
    expect(restored.migratedFrom).toBe(1);
    const before = contentOf(powerOfGodsWord);
    const after = contentOf(restored.doc.toJSON());
    expect(after.texts).toEqual(before.texts);
    expect(after.marks).toEqual(before.marks);
    // Passage IDs come first in v1 only because of where `entryPassages` sat; the set is the same.
    expect([...after.ids].sort()).toEqual([...before.ids].sort());
    expect(restored.doc.attrs.layout).toEqual(
      layoutFromNumbering(powerOfGodsWord.attrs!.numbering),
    );
    // The old entry passages are blocks now, printed as references.
    const passages: Record<string, unknown>[] = [];
    restored.doc.descendants((node) => {
      if (node.type.name === "scripturePassage") passages.push(node.attrs);
      return true;
    });
    expect(passages.map((attrs) => [attrs.id, attrs.print, attrs.translation])).toEqual([
      ["pw-1-r1", "reference", null],
      ["pw-1b-r1", "reference", null],
      ["pw-1b-r2", "reference", null],
    ]);
  });

  it("migration is pure and never lowers a version", () => {
    const v1 = deepFreeze(structuredClone(powerOfGodsWord));
    const once = migrateDocument(v1);
    expect(once.ok && once.doc.attrs?.schemaVersion).toBe(2);
    const twice = once.ok ? migrateDocument(once.doc) : null;
    // A current document comes back as it is, the same object.
    expect(twice?.ok && twice.doc).toBe(once.ok && once.doc);
  });
});

describe("schema v2 documents", () => {
  const fixtures = Object.entries(documentFixtures);

  it.each(fixtures)("%s is valid and loads back exactly as written", (_name, fixture) => {
    const restored = restoreDocument(deepFreeze(structuredClone(fixture)), schema);
    if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
    expect(restored.warnings).toEqual([]);
    expect(restored.migratedFrom).toBeNull();
    expect(restored.doc.toJSON()).toEqual(fixture);
  });

  it.each(fixtures)("%s: getJSON → load → getJSON changes nothing", (_name, fixture) => {
    const first = editorFor(fixture).getJSON();
    expect(first).toEqual(fixture);
    const again = editorFor(JSON.parse(JSON.stringify(first))).getJSON();
    expect(again).toEqual(first);
  });

  it.each(fixtures)(
    "%s: the editor's own HTML parses back to the same document",
    (_name, fixture) => {
      // Copy and paste inside the application goes through this HTML.
      const editor = editorFor(fixture);
      const element = document.createElement("div");
      element.innerHTML = editor.getHTML();
      const parsed = ProseMirrorDOMParser.fromSchema(editor.schema).parse(element);
      expect({ ...parsed.toJSON(), attrs: fixture.attrs }).toEqual(fixture);
    },
  );

  it("holds the introduction and conclusion anywhere at the top level, once each", () => {
    const { sectionsAnywhere } = documentFixtures;
    const top = sectionsAnywhere.content!.map((node) => node.attrs?.role ?? node.type);
    expect(top).toEqual([
      "paragraph",
      "outlinePoint",
      "introduction",
      "outlinePoint",
      "pageBreak",
      "conclusion",
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
    expect(restoreDocument(sectionsAnywhere, schema).ok).toBe(true);
  });

  it("keeps a numbered manuscript list apart from sermon points", () => {
    const editor = editorFor(documentFixtures.lampAndPath);
    const labels = numberingKey.getState(editor.state)!.labels;
    // Two main points are numbered; the three list items are not points.
    expect([...labels.entries()].filter(([, label]) => /^[IV]+\.$/.test(label))).toEqual([
      ["lp-1", "I."],
      ["lp-2", "II."],
    ]);
    expect(editor.view.dom.querySelectorAll("ol > li")).toHaveLength(3);
  });

  it("names the passage translation and print as stored, never verse text", () => {
    const json = JSON.stringify(editorFor(documentFixtures.lampAndPath).getJSON());
    expect(json).toContain('"translation":"rvg"');
    expect(json).toContain('"print":"hidden"');
    expect(json).not.toContain("In the beginning was the Word");
    expect(json).not.toContain("data-label");
  });
});

describe("invalid documents", () => {
  it.each(invalidDocuments)(
    "refuses $name ($code), naming it, without changing it",
    ({ json, code }) => {
      const before = structuredClone(json);
      const frozen = deepFreeze(json);
      const result = restoreDocument(frozen, schema);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problems.map((problem) => problem.code)).toContain(code);
      for (const problem of result.problems) {
        if (!["not_a_document", "schema", "too_many_entries"].includes(problem.code)) {
          expect(problem.path, problem.code).toBeDefined();
        }
      }
      expect(json).toEqual(before);
    },
  );

  it("leaves the editor exactly as it was when a document is refused", () => {
    const editor = editorFor(documentFixtures.outlineOnly);
    const before = editor.getJSON();
    for (const { json } of invalidDocuments) {
      expect(loadDocument(editor, json).ok).toBe(false);
      expect(editor.getJSON()).toEqual(before);
    }
  });

  it("names the place of a problem as a path into the JSON", () => {
    const result = restoreDocument(
      sermonDocument([
        paragraph(text("x")),
        {
          type: "outlinePoint",
          attrs: { id: "p", colour: "red" },
          content: [{ type: "pointTitle" }],
        },
      ]),
      schema,
    );
    expect(result).toEqual({
      ok: false,
      problems: [{ code: "unknown_attribute", path: "/content/1", detail: "outlinePoint.colour" }],
    });
  });

  it("loads a layout it cannot read with a warning, keeps it, and numbers by the default", () => {
    const restored = restoreDocument(unreadableLayout, schema);
    expect(restored.ok && restored.warnings).toEqual([
      { code: "invalid_layout", path: "/attrs/layout" },
    ]);
    const editor = editorFor(unreadableLayout);
    expect(editor.getJSON().attrs?.layout).toEqual(unreadableLayout.attrs!.layout);
    expect(numberingKey.getState(editor.state)!.labels.get("i-1")).toBe("I.");
  });
});

describe("versions", () => {
  it("never reads a newer document as an older one", () => {
    const newer = {
      ...documentFixtures.outlineOnly,
      attrs: { ...documentFixtures.outlineOnly.attrs, schemaVersion: 3 },
    };
    expect(restoreDocument(newer, schema)).toEqual({
      ok: false,
      problems: [{ code: "unsupported_version", path: "/attrs/schemaVersion", detail: "3" }],
    });
    expect(migrateDocument(newer)).toEqual({ ok: false, code: "unsupported_version", version: 3 });
  });

  it("writes the current version, whatever was loaded and however it was edited", () => {
    for (const json of [powerOfGodsWord, ...Object.values(documentFixtures)]) {
      const editor = editorFor(json);
      run(editor, addPoint("sibling"));
      expect(editor.getJSON().attrs?.schemaVersion).toBe(2);
    }
  });
});

describe("colors (§B.7)", () => {
  it("stores a preset key or lowercase #rrggbb, and nothing else", () => {
    const cases: [unknown, string | null][] = [
      ["red", "red"],
      ["RED", "red"],
      ["#FDE68A", "#fde68a"],
      ["#abc", "#aabbcc"],
      ["rgb(255, 0, 0)", "#ff0000"],
      ["rgba(0, 128, 255, 1)", "#0080ff"],
      ["rgba(0, 128, 255, 0.5)", null],
      ["rgb(300, 0, 0)", null],
      ["crimson", null],
      ["var(--ink-red)", null],
      ["", null],
      [null, null],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeColor(input, textColorPresets), String(input)).toBe(expected);
    }
    expect(normalizeColor("yellow", highlightPresets)).toBe("yellow");
    expect(normalizeColor("teal", highlightPresets)).toBeNull();
  });

  it("maps or drops foreign colors from pasted HTML, and the result is valid", () => {
    const editor = editorFor(sermonDocument([paragraph()]));
    const element = document.createElement("div");
    element.innerHTML =
      '<p><span style="color: rgb(255, 0, 0)">a</span><span style="color: var(--x)">b</span>' +
      '<mark style="background-color: #ABC">c</mark><mark>d</mark><span data-color="red">e</span>' +
      '<mark style="background-color: hsl(0 0% 0%)">f</mark></p>';
    const doc = ProseMirrorDOMParser.fromSchema(editor.schema).parse(element);
    const marks = doc.firstChild!.content.content.map((node) => [
      node.text,
      node.marks.map((mark) => `${mark.type.name}:${mark.attrs.color}`),
    ]);
    expect(marks).toEqual([
      ["a", ["textStyle:#ff0000"]],
      ["b", []],
      ["c", ["highlight:#aabbcc"]],
      ["d", ["highlight:yellow"]],
      ["e", ["textStyle:red"]],
      ["f", []],
    ]);
    expect(restoreDocument({ ...doc.toJSON(), attrs: sermonDocument([]).attrs }, schema).ok).toBe(
      true,
    );
  });
});

describe("work per keystroke", () => {
  it("typing in a title rebuilds no numbering and runs no identity pass", () => {
    const editor = editorFor(legacyToDocumentOrThrow());
    const at = titleStart(editor, "s-30-1") + 3;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
    const builds = numberingStats.builds;
    const passes = identityStats.passes;
    for (const character of "typed") {
      editor.view.dispatch(editor.state.tr.insertText(character));
    }
    editor.view.dispatch(editor.state.tr.delete(at, at + 2));
    expect(numberingStats.builds).toBe(builds);
    expect(identityStats.passes).toBe(passes);
    // The label still sits on the title it belongs to.
    const title = editor.view.dom.querySelector('[data-id="s-30-1"] > [data-type="point-title"]');
    expect(title?.getAttribute("data-label")).toBe("B.");
    // A change of structure does both (the outline is at its 500-entry bound, so a move).
    expect(run(editor, movePoint("up"))).toBe(true);
    expect(numberingStats.builds).toBe(builds + 1);
    expect(identityStats.passes).toBe(passes + 1);
  });
});

function legacyToDocumentOrThrow() {
  const result = legacyToDocument(legacyFixtures.stress);
  if (!result.ok) throw new Error("not converted");
  return result.doc;
}
