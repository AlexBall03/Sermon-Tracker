import type { Editor, JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { numberingPresetIds } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import { documentFixtures } from "../documents";
import { customNumbering, legacyFixtures, powerOfGodsWord } from "../fixtures";
import { legacyToDocument } from "../legacy";
import { layoutFromNumbering } from "../layout";
import { documentLabels } from "../numbering";
import { testEditor } from "../testing";
import { labV4Schema } from "./extensions";
import { documentV4, parentProse, pointV4, proseV4, rolesAnywhere } from "./fixtures";
import { toV3, v3ToV4 } from "./migrate";
import type { V4Notice } from "./model";
import { documentLabelsV4 } from "./numbering";
import { analyze } from "./ownership";
import { restoreV4 } from "./validate";
import { allIds, caret, owners, ownership, testEditorV4, textStart } from "./testing";

/*
 * v4 beside v3 (prototype): every v3 document migrates and comes back
 * exactly; numbering is the outline engine's, label for label; a paste lands
 * at the level where it is put and loses nothing; the validator refuses what
 * breaks meaning and accepts what is only irregular.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});
const keep = <T extends Editor>(editor: T) => {
  open.push(editor);
  return editor;
};

/** Every v3 document the lab has: its own fixtures, PS-1A's sermon, and every legacy outline converted. */
function v3Documents(): [string, JSONContent][] {
  const documents: [string, JSONContent][] = Object.entries(documentFixtures);
  documents.push(["powerOfGodsWord", powerOfGodsWord]);
  for (const [name, outline] of Object.entries(legacyFixtures)) {
    const converted = legacyToDocument(outline);
    if (converted.ok) documents.push([`legacy:${name}`, converted.doc]);
  }
  return documents;
}

describe("v3 → v4 → v3", () => {
  it.each(v3Documents())("%s comes back exactly", (_name, json) => {
    const v3 = keep(testEditor(json));
    const v4 = keep(testEditorV4(json));
    expect(v4.state.doc.attrs.schemaVersion).toBe(4);
    expect(analyze(v4.state.doc).irregular.every((value) => value === null)).toBe(true);
    const back = toV3(v4.getJSON());
    if (!back.ok) throw new Error(back.reason);
    expect(keep(testEditor(back.doc)).getJSON()).toEqual(v3.getJSON());
  });

  it("keeps writing after a point's subpoints with the point", () => {
    const v3 = documentFixtures.lampAndPath;
    const flat = v3ToV4(v3);
    const editor = keep(testEditorV4(flat));
    // Every block that v3 nested in a point is owned by that point in v4.
    const v3Editor = keep(testEditor(v3));
    const ownersV3 = new Map<string, string | null>();
    v3Editor.state.doc.descendants((node, _pos, parent) => {
      // Writing that v3 nested directly in a point or a section (not inside a note or a list).
      if (
        node.type.name === "paragraph" &&
        parent &&
        /outlinePoint|sermonSection/.test(parent.type.name)
      ) {
        ownersV3.set(node.textContent, (parent.attrs.id as string) ?? null);
      }
      return true;
    });
    for (const row of ownership(editor)) {
      if (!row.point && ownersV3.has(row.name)) expect(row.owner).toBe(ownersV3.get(row.name));
    }
  });
});

describe("numbering is the outline engine's", () => {
  const configs: NumberingConfig[] = [
    ...numberingPresetIds.map((preset) => ({ version: 1, preset }) as NumberingConfig),
    customNumbering,
  ];

  it.each(configs.map((config) => [config.preset ?? "custom", config] as const))(
    "%s: v4 labels every point as v3 does, on every document",
    (_name, config) => {
      for (const [, json] of v3Documents()) {
        const v3 = keep(testEditor(json));
        const v4 = keep(testEditorV4(json));
        expect(documentLabelsV4(v4.state.doc, config)).toEqual(
          documentLabels(v3.state.doc, config).labels,
        );
      }
    },
  );

  it("numbers the 500-point outline", () => {
    const converted = legacyToDocument(legacyFixtures.stress);
    if (!converted.ok) throw new Error("refused");
    const labels = documentLabelsV4(keep(testEditorV4(converted.doc)).state.doc);
    // 498 points, numbered, and the introduction and conclusion, not.
    expect(labels.size).toBe(500);
    expect([...labels.values()].filter(Boolean)).toHaveLength(498);
  });

  it("leaves the introduction and conclusion out, and numbers what is under them on their own", () => {
    const doc = keep(testEditorV4(rolesAnywhere)).state.doc;
    const labels = documentLabelsV4(doc);
    expect(labels.get("p-1")).toBe("I.");
    expect(labels.get("p-2")).toBe("II.");
    expect(labels.get("intro")).toBe("");
    expect(labels.get("intro-a")).toBe("A.");
    expect(labels.get("intro-b")).toBe("B.");
    expect(labels.get("concl-a")).toBe("A.");
    expect(labels.get("p-2a")).toBe("A.");
    // A policy, not the schema: the same document with them unnumbered.
    expect(documentLabelsV4(doc, undefined, "none").get("intro-a")).toBe("");
    // And a custom style for the levels follows through.
    const custom = documentLabelsV4(doc, customNumbering);
    expect(custom.get("p-1")).toBe("POINT I:");
    expect(custom.get("intro-a")).toBe("(a)");
  });

  it("renumbers after a structural change, as decorations only", () => {
    const editor = keep(testEditorV4(parentProse));
    const view = editor.view.dom;
    expect(view.querySelector('[data-id="p-b"]')?.getAttribute("data-label")).toBe("B.");
    expect(
      editor.getJSON().content?.some((node) => JSON.stringify(node).includes("data-label")),
    ).toBe(false);
    editor.view.dispatch(
      editor.state.tr.setDocAttribute(
        "layout",
        layoutFromNumbering({ version: 1, preset: "decimal" }),
      ),
    );
    expect(view.querySelector('[data-id="p-b"]')?.getAttribute("data-label")).toBe("1.2.");
  });
});

/** The HTML a copy of `from`..`to` puts on the clipboard: ProseMirror's own serializer, with the document stamp. */
function copied(editor: Editor, from: number, to: number) {
  return editor.view.serializeForClipboard(editor.state.doc.slice(from, to)).dom.innerHTML;
}

/** jsdom has no ClipboardEvent; ProseMirror only hands the event on to the paste handlers. */
const pasteEvent = () => new Event("paste") as ClipboardEvent;

const blockRange = (editor: Editor, first: string, last: string) => {
  const start = textStart(editor, first) - 1;
  const lastStart = textStart(editor, last) - 1;
  return [start, lastStart + editor.state.doc.nodeAt(lastStart)!.nodeSize] as const;
};

describe("a paste lands at the level where it is put", () => {
  it("a copied subpoint pasted into another subpoint's writing goes under it, and takes nothing over", () => {
    const editor = keep(testEditorV4(parentProse));
    const [from, to] = blockRange(editor, "p-a", "Body of A");
    const html = copied(editor, from, to);
    caret(editor, "Body of B", "Body of B".length);
    editor.view.pasteHTML(html, pasteEvent());
    const rows = ownership(editor);
    const pasted = rows.find((row) => row.point && row.name !== "p-a" && row.owner === "p-b");
    expect(pasted?.depth).toBe(3);
    expect(owners(editor)["Body of B"]).toBe("p-b");
    expect(rows.every((row) => row.irregular === null)).toBe(true);
    // A copy in the same document is a copy: a new ID that remembers the original.
    expect(new Set(allIds(editor)).size).toBe(allIds(editor).length);
  });

  it("writing from another application joins the point where it is pasted; headings and lists stay what they are", () => {
    const editor = keep(testEditorV4(parentProse));
    // On a new line under A, as a person pastes a block of writing.
    caret(editor, "Body of A", "Body of A".length);
    editor.view.dispatch(editor.state.tr.split(editor.state.selection.from));
    editor.view.pasteHTML(
      "<h2>From a word processor</h2><p>A paragraph</p><ol><li><p>An item</p></li></ol>",
      pasteEvent(),
    );
    const rows = ownership(editor);
    const heading = editor.state.doc.child(
      rows.findIndex((row) => row.name === "From a word processor"),
    );
    expect(heading.type.name).toBe("heading");
    expect(owners(editor)).toMatchObject({
      "From a word processor": "p-a",
      "A paragraph": "p-a",
      "An item": "p-a",
      "Belongs to I": "p-i",
    });
  });

  it("a point pasted into a note or a list lands beside it, whole", () => {
    const content = documentV4([
      pointV4("p", "Point", 1),
      {
        type: "preacherNote",
        attrs: { id: "n", kind: "note", print: null, depth: 1 },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Note" }] }],
      },
      {
        type: "bulletList",
        attrs: { depth: 1 },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
          },
        ],
      },
    ]);
    const source = keep(testEditorV4(parentProse));
    const [from, to] = blockRange(source, "p-b", "Body of B");
    const html = copied(source, from, to);
    for (const where of ["Note", "Item"]) {
      const editor = keep(testEditorV4(content));
      let at = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent === where) at = pos + 1 + where.length;
        return true;
      });
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)),
      );
      editor.view.pasteHTML(html, pasteEvent());
      const text = editor.getText();
      expect(text).toContain("Subpoint B");
      expect(text).toContain("Body of B");
      expect(text).toContain(where);
      expect(restoreV4(editor.getJSON(), editor.schema).ok).toBe(true);
    }
  });

  it("a second introduction pasted becomes an ordinary point, and the person is told", () => {
    const notices: V4Notice[] = [];
    const editor = keep(testEditorV4(rolesAnywhere, { notices }));
    const [from, to] = blockRange(editor, "intro", "intro");
    const html = copied(editor, from, to);
    caret(editor, "A closing word, the document's own.", 0);
    editor.view.pasteHTML(html, pasteEvent());
    const roles = ownership(editor).filter(
      (_row, index) => editor.state.doc.child(index).attrs.role === "introduction",
    );
    expect(roles).toHaveLength(1);
    expect(notices).toContainEqual({ code: "role_dropped", role: "introduction" });
  });

  it("content from another document gets new IDs throughout", () => {
    const source = keep(testEditorV4(parentProse, { documentKey: "doc-b" }));
    const [from, to] = blockRange(source, "p-a", "Body of A");
    const html = copied(source, from, to);
    const editor = keep(testEditorV4(parentProse));
    caret(editor, "p-ii", "Main Point II".length);
    editor.view.pasteHTML(html, pasteEvent());
    expect(allIds(editor).filter((id) => id === "p-a")).toHaveLength(1);
  });
});

describe("the v4 validator", () => {
  const schema = labV4Schema();
  const refused = (content: JSONContent[]) => restoreV4(documentV4(content), schema).ok === false;

  it("refuses what breaks meaning", () => {
    expect(refused([pointV4("p", "P", 0)])).toBe(true);
    expect(refused([proseV4("x", -1)])).toBe(true);
    expect(refused([{ ...proseV4("x", 1), attrs: { depth: 1.5 } }])).toBe(true);
    expect(refused([pointV4("p", "P", 2, { role: "introduction" })])).toBe(true);
    expect(
      refused([
        pointV4("a", "A", 1, { role: "introduction" }),
        pointV4("b", "B", 1, { role: "introduction" }),
      ]),
    ).toBe(true);
    expect(refused([pointV4("a", "A", 1), pointV4("a", "B", 1)])).toBe(true);
    expect(
      refused([
        {
          type: "bulletList",
          attrs: { depth: 0 },
          content: [{ type: "listItem", content: [{ ...proseV4("x", 2) }] }],
        },
      ]),
    ).toBe(true);
    expect(refused([{ ...proseV4("x", 0), attrs: { depth: 0, parentId: "a" } }])).toBe(true);
    expect(restoreV4({ ...documentV4([]), attrs: { schemaVersion: 5 } }, schema).ok).toBe(false);
  });

  it("accepts an irregular structure, which is shown and never repaired", () => {
    const json = documentV4([pointV4("a", "A", 1), pointV4("b", "B", 3), proseV4("x", 5)]);
    const restored = restoreV4(json, schema);
    expect(restored.ok).toBe(true);
    const editor = keep(testEditorV4(json));
    expect(ownership(editor).map((row) => row.irregular)).toEqual([
      null,
      "skipped_level",
      "deeper_than_owner",
    ]);
    expect(editor.view.dom.querySelector('[data-id="b"]')?.getAttribute("data-irregular")).toBe(
      "skipped_level",
    );
    expect(editor.getJSON()).toEqual(keep(testEditorV4(json)).getJSON());
  });
});
