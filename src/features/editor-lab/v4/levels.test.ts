import { Editor, type JSONContent } from "@tiptap/core";
import { undo, undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { canonicalDocument } from "@/features/sermon-editor/persistence/canonical";
import {
  defaultsGroups,
  fieldsOf,
  levelGroups,
  notDrawn,
  typeGroups,
} from "@/features/sermon-editor/appearance/fields";
import { layoutFromNumbering } from "../layout";
import {
  applyPlan,
  committedAt,
  draftNumbering,
  emptyDraft,
  mergeStyles,
  resetLayer,
  restoreOriginal,
  restoreOutline,
  restorePreset,
  setEdit,
  type Draft,
  type Path,
} from "../styles/draft";
import {
  appearanceSchemas,
  componentKinds,
  componentStyleSchemas,
  componentTypeFields,
  documentStylesSchema,
  levelFields,
  levelStyleSchema,
  type DocumentStyles,
} from "../styles/model";
import { presetRevisionOf, stylesInForce } from "../styles/plugin";
import { presetAt, presetRevised, presets } from "../styles/presets";
import { resolveAt } from "../styles/context";
import { componentLayers, readStyles, resolveComponent, sourceOf } from "../styles/resolve";
import { styleSheet } from "../styles/render";
import { materialize, snapshotAppearance, snapshotDraft } from "../styles/snapshot";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, noteV4, pointV4, proseV4 } from "./fixtures";
import { maxDepth } from "./model";

/*
 * A4.2A: levels (per-depth appearance), a point's number, the indent per
 * level, preset revisions, the numbering in the Appearance draft, and the
 * snapshot contract for personal presets.
 */

const editors: Editor[] = [];
function open(content: JSONContent) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset: "balanced" }) });
  const loaded = loadV4(editor, content, "doc-levels");
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

const sermon = (attrs: Record<string, unknown> = {}) => {
  const doc = documentV4([
    pointV4("intro", "Introduction", 1, { role: "introduction" }),
    proseV4("Why this psalm.", 1),
    pointV4("p-1", "The lamp", 1, { sourcePointId: "idea-7" }),
    pointV4("p-1a", "It shows the next step", 2),
    pointV4("p-1a1", "Enough for today", 3),
    proseV4("Not the whole road.", 3),
    noteV4("n-1", "Pause here.", 3),
    pointV4("p-2", "The path", 1),
    pointV4("concl", "Conclusion", 1, { role: "conclusion" }),
  ]);
  return { ...doc, attrs: { ...doc.attrs, ...attrs } };
};

const stored = (editor: Editor) => readStyles(editor.state.doc.attrs.styles);
const edit = (editor: Editor, draft: Draft, path: Path, value: unknown) =>
  setEdit(draft, path, value, committedAt(stored(editor), editor.state.doc, path));
const posOf = (editor: Editor, id: string) => {
  let at = -1;
  editor.state.doc.forEach((node, offset) => {
    if (node.attrs.id === id) at = offset;
  });
  return at;
};
/** The document as JSON with its appearance and numbering taken out: its content and structure. */
const content = (editor: Editor) => {
  const json = editor.getJSON();
  const strip = (node: JSONContent): JSONContent => ({
    ...node,
    attrs: node.attrs
      ? Object.fromEntries(
          Object.entries(node.attrs).filter(
            ([key]) => !["styles", "layout", "appearance"].includes(key),
          ),
        )
      : undefined,
    content: node.content?.map(strip),
  });
  return strip(json);
};

describe("the levels schema", () => {
  const valid = (styles: unknown) => documentStylesSchema.safeParse(styles).success;

  it("accepts every depth the v4 schema allows, sparse, and nothing else", () => {
    expect(valid({ version: 1, levels: { "1": { fontSize: 14 } } })).toBe(true);
    expect(valid({ version: 1, levels: { [String(maxDepth)]: { bold: false } } })).toBe(true);
    for (const key of ["0", String(maxDepth + 1), "01", "1.5", "a", ""]) {
      expect(valid({ version: 1, levels: { [key]: { bold: false } } }), key).toBe(false);
    }
    // Nothing redundant is stored: an empty record or level is refused.
    expect(valid({ version: 1, levels: {} })).toBe(false);
    expect(valid({ version: 1, levels: { "2": {} } })).toBe(false);
  });

  it("bounds every value and refuses anything not a level's", () => {
    expect(levelStyleSchema.safeParse({ fontFamily: "comic-sans" }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ notationColor: "#12345" }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ notationColor: null }).success).toBe(true);
    expect(levelStyleSchema.safeParse({ markerGap: 37 }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ markerGap: -1 }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ markerSize: 3 }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ markerAlign: "center" }).success).toBe(false);
    // A level's place is its depth's: no indent, no lines, no fill.
    expect(levelStyleSchema.safeParse({ indentLeft: 12 }).success).toBe(false);
    expect(levelStyleSchema.safeParse({ fill: "blue" }).success).toBe(false);
  });

  it("gives a point's number to its type style and its levels, never to a single node", () => {
    expect(componentStyleSchemas.point.safeParse({ markerSize: 10, hanging: false }).success).toBe(
      true,
    );
    expect(appearanceSchemas.point.safeParse({ markerSize: 10 }).success).toBe(false);
    expect(componentStyleSchemas.scripture.safeParse({ markerSize: 10 }).success).toBe(false);
  });

  it("puts the indent per level on the defaults only, bounded", () => {
    expect(valid({ version: 1, defaults: { levelIndent: 18 } })).toBe(true);
    expect(valid({ version: 1, defaults: { levelIndent: 5 } })).toBe(false);
    expect(valid({ version: 1, named: { heading1: { levelIndent: 18 } } })).toBe(false);
  });

  it("names a preset revision of 1 or 2 only", () => {
    expect(valid({ version: 1, preset: "minimal", presetRevision: 2 })).toBe(true);
    expect(valid({ version: 1, presetRevision: 3 })).toBe(false);
    expect(valid({ version: 1, presetRevision: "2" })).toBe(false);
  });

  it("keeps every version 1 document stored before A4.2A valid, with the same meaning", () => {
    const before: DocumentStyles = {
      version: 1,
      preset: "expressive",
      defaults: { fontSize: 13 },
      components: { point: { titleColor: "red" }, scripture: { fill: null } },
    };
    expect(documentStylesSchema.parse(before)).toEqual(before);
    expect(presetRevisionOf(before)).toBe(1);
  });
});

describe("the cascade with levels", () => {
  const styles: DocumentStyles = {
    version: 1,
    components: { subpoint: { bold: false, italic: true, fontSize: 11 } },
    levels: { "3": { fontSize: 15 } },
  };

  it("puts a level after its type's style and before the node's own", () => {
    const sources = componentLayers(styles, "subpoint", { fontSize: 9 }, presets.balanced, 3).map(
      (layer) => layer.source,
    );
    expect(sources).toEqual([
      "presetDefaults",
      "defaults",
      "presetStyle",
      "style",
      "presetLevel",
      "level",
      "own",
    ]);
    expect(
      resolveComponent(styles, "subpoint", { fontSize: 9 }, presets.balanced, 3).fontSize,
    ).toBe(9);
  });

  it("lets one level property leave every other inherited", () => {
    const resolved = resolveComponent(styles, "subpoint", null, presets.balanced, 3);
    expect(resolved.fontSize).toBe(15);
    expect(resolved.italic).toBe(true);
    expect(resolved.bold).toBe(false);
    expect(resolved.fontFamily).toBe(presets.balanced.components.subpoint.fontFamily);
    expect(sourceOf(componentLayers(styles, "subpoint", null, presets.balanced, 3), "italic")).toBe(
      "style",
    );
    // Another depth has no level: its type's style.
    expect(resolveComponent(styles, "subpoint", null, presets.balanced, 2).fontSize).toBe(11);
  });

  it("gives a role's heading no level", () => {
    const withMain: DocumentStyles = { version: 1, levels: { "1": { fontSize: 20 } } };
    expect(resolveComponent(withMain, "introduction", null, presets.balanced, 1).fontSize).toBe(
      presets.balanced.components.introduction.fontSize,
    );
    expect(resolveComponent(withMain, "point", null, presets.balanced, 1).fontSize).toBe(20);
  });

  it("follows a point to its new depth, copying nothing onto it", () => {
    const editor = open(sermon({ styles: styles }));
    const at = (id: string) => editor.state.doc.resolve(posOf(editor, id) + 1);
    expect(resolveAt(styles, at("p-1a1"), presets.balanced).fontSize).toBe(15);
    expect(resolveAt(styles, at("p-1a"), presets.balanced).fontSize).toBe(11);
    editor.view.dispatch(editor.state.tr.setNodeAttribute(posOf(editor, "p-1a"), "depth", 3));
    expect(resolveAt(styles, at("p-1a"), presets.balanced).fontSize).toBe(15);
    expect(editor.state.doc.nodeAt(posOf(editor, "p-1a"))!.attrs.appearance).toBeNull();
  });

  it("keeps a point with a named style in that style", () => {
    const editor = open(sermon({ styles }));
    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(posOf(editor, "p-1a1"), "styleName", "heading1"),
    );
    const $pos = editor.state.doc.resolve(posOf(editor, "p-1a1") + 1);
    expect(resolveAt(styles, $pos, presets.balanced).fontSize).toBe(
      presets.balanced.named.heading1.fontSize,
    );
  });
});

describe("the style sheet", () => {
  const scope = ".lab-editor";

  it("draws a level only where one is set, after the types and before the named styles", () => {
    expect(styleSheet(null, scope, presets.balanced)).not.toContain('[data-depth="3"]:not');
    const sheet = styleSheet(
      { version: 1, levels: { "3": { fontSize: 15, notationColor: "red" } } },
      scope,
      presets.balanced,
    );
    const level = sheet.indexOf('p.lab-v4-point[data-depth="3"]:not([data-role]) {');
    expect(level).toBeGreaterThan(sheet.indexOf('p.lab-v4-point:not([data-depth="1"]) {'));
    expect(level).toBeLessThan(sheet.indexOf('[data-style-name="normal"] {'));
    const rule = sheet.slice(level, sheet.indexOf("}", level));
    // Read through its type's instance properties, so a single point's own still wins.
    expect(rule).toContain("font-size: var(--ps-subpoint-i-size, 15pt)");
    expect(rule).toMatch(/--x-notation: var\(--ps-subpoint-i-notation, #[0-9a-f]{6}\)/);
  });

  it("draws a number's look only where a style says it, and hides or flattens it by rule", () => {
    const plain = styleSheet(null, scope, presets.balanced);
    expect(plain).not.toContain("--x-marker-");
    const sheet = styleSheet(
      {
        version: 1,
        components: { point: { markerSize: 16, markerBold: false } },
        levels: { "2": { markerVisible: false }, "3": { hanging: false } },
      },
      scope,
      presets.balanced,
    );
    expect(sheet).toContain("--x-marker-size: 16pt");
    expect(sheet).toContain("--x-marker-weight: 400");
    expect(sheet).toContain(
      '.lab-editor p.lab-v4-point[data-depth="2"]:not([data-role]).lab-numbered::before { content: none; }',
    );
    expect(sheet).toContain(
      '.lab-editor p.lab-v4-point[data-depth="3"]:not([data-role]).lab-numbered { --x-hang: 0px; }',
    );
  });

  it("draws the indent per level as the studio's step, never in the baseline", () => {
    const styles: DocumentStyles = { version: 1, defaults: { levelIndent: 30 } };
    expect(styleSheet(styles, scope, presets.balanced)).toContain("--ps-step: 30pt");
    expect(styleSheet(styles, scope, presets.baseline)).not.toContain("--ps-step");
  });
});

describe("the presets' revisions", () => {
  it("draw a document that names no revision by the first, unchanged", () => {
    for (const id of ["baseline", "minimal", "balanced", "expressive"] as const) {
      expect(presetAt(id, undefined)).toBe(presets[id]);
      expect(presetAt(id, 1)).toBe(presets[id]);
    }
  });

  it("offer an update only where the latest revision draws differently", () => {
    for (const id of ["minimal", "balanced", "expressive"] as const) {
      expect(presetRevised(id, 2), id).toBe(false);
    }
    // Balanced, the default, and Expressive are unchanged in revision 2 (A4.2A review).
    for (const id of ["balanced", "expressive"] as const) {
      expect(presetRevised(id, undefined), id).toBe(false);
      expect(presetAt(id, 2), id).toBe(presets[id]);
    }
    // Minimal's script is a rule, never a box like a reminder: only in revision 2.
    expect(presetRevised("minimal", undefined)).toBe(true);
    expect(presets.minimal.components.script.borderWidth).toBe(0.75);
    expect(presetAt("minimal", 2).components.script).toMatchObject({
      borderWidth: 0,
      accentWidth: 2.25,
      borderStyle: "double",
    });
  });

  it("are chosen by the outline, and show on the editor only past the first", () => {
    const first = open(sermon({ styles: { version: 1, preset: "minimal" } }));
    expect(first.view.dom.hasAttribute("data-preset-revision")).toBe(false);
    const second = open(sermon({ styles: { version: 1, preset: "minimal", presetRevision: 2 } }));
    expect(second.view.dom.getAttribute("data-preset-revision")).toBe("2");
    expect(presetRevisionOf(stylesInForce(second.state))).toBe(2);
  });

  it("show their single-valued lines and space as numbers, exactly the CSS they replace", () => {
    expect(presets.balanced.components.scripture).toMatchObject({
      accentWidth: 1.5,
      radius: 3,
      outsideAfter: 8,
    });
    expect(presets.expressive.components.script).toMatchObject({
      accentWidth: 3,
      borderWidth: 0,
      borderStyle: "double",
    });
    // A note's corners and accent differ by its kind: left to the CSS.
    expect(presets.balanced.components.preacherNote.radius).toBeUndefined();
  });
});

describe("numbering in the Appearance draft", () => {
  const decimal = { version: 1, preset: "decimal" } as const;

  it("is previewed without a document change, then applied with a level in one step", () => {
    const editor = open(sermon());
    const before = editor.state.doc;
    let draft = edit(editor, emptyDraft, { layer: "numbering" }, decimal);
    draft = edit(editor, draft, { layer: "level", depth: 2, field: "fontSize" }, 14);
    editor.commands.setStylesPreview({ draft });
    expect(editor.state.doc).toBe(before);
    expect(undoDepth(editor.state)).toBe(0);
    const label = () =>
      editor.view.dom.querySelector('[data-id="p-1a"]')?.getAttribute("data-label");
    expect(label()).toBe("1.1.");

    const words = content(editor);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(undoDepth(editor.state)).toBe(1);
    expect(editor.state.doc.attrs.layout.numbering).toEqual(decimal);
    expect(stored(editor)).toEqual({ version: 1, levels: { "2": { fontSize: 14 } } });
    // Nothing else changed: words, structure, identities, links.
    expect(content(editor)).toEqual(words);
    expect(label()).toBe("1.1.");

    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(label()).toBe("A.");
  });

  it("previews only a configuration that validates", () => {
    const editor = open(sermon());
    const bad = {
      version: 1,
      preset: "custom",
      levels: [
        {
          counter: "decimal",
          case: "upper",
          bullet: "•",
          prefix: "<",
          suffix: ".",
          composite: false,
          separator: ".",
        },
      ],
      overflow: "last",
      repeatFrom: 0,
    };
    const draft = edit(editor, emptyDraft, { layer: "numbering" }, bad);
    expect(draftNumbering(draft)).toBeUndefined();
    expect(applyPlan(draft, stored(editor), editor.state.doc)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses the whole draft over a layout it cannot read, and never replaces it", () => {
    const layout = { version: 99, from: "a later version" };
    const editor = open(sermon());
    editor.view.dispatch(editor.state.tr.setDocAttribute("layout", layout));
    let draft = edit(editor, emptyDraft, { layer: "numbering" }, decimal);
    draft = edit(editor, draft, { layer: "level", depth: 2, field: "fontSize" }, 14);
    expect(applyPlan(draft, stored(editor), editor.state.doc)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(editor.state.doc.attrs.layout).toEqual(layout);
    expect(stored(editor)).toBeNull();
    // Appearance alone never touches the layout.
    const appearance = edit(
      editor,
      emptyDraft,
      { layer: "level", depth: 2, field: "fontSize" },
      14,
    );
    expect(editor.commands.applyAppearanceDraft(appearance)).toBe(true);
    expect(editor.state.doc.attrs.layout).toEqual(layout);
  });

  it("is a conflict, never overwritten, when the numbering changed elsewhere", () => {
    const editor = open(sermon());
    const draft = edit(editor, emptyDraft, { layer: "numbering" }, decimal);
    editor.view.dispatch(
      editor.state.tr.setDocAttribute(
        "layout",
        layoutFromNumbering({ version: 1, preset: "roman" }),
      ),
    );
    expect(applyPlan(draft, stored(editor), editor.state.doc)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("is never touched by an appearance reset", () => {
    const editor = open(
      sermon({
        styles: { version: 1, preset: "minimal", levels: { "2": { bold: false } } },
        layout: layoutFromNumbering(decimal),
      }),
    );
    for (const reset of [restoreOutline, restorePreset, restoreOriginal]) {
      const draft = reset(emptyDraft, stored(editor), editor.state.doc);
      expect(
        [...draft.edits.keys()].some((key) => key === "numbering"),
        reset.name,
      ).toBe(false);
      expect(mergeStyles(stored(editor), draft)?.levels, reset.name).toBeUndefined();
    }
  });
});

describe("level resets", () => {
  it("reset one level and leave every other layer", () => {
    const styles: DocumentStyles = {
      version: 1,
      components: { subpoint: { italic: true } },
      levels: { "2": { bold: false }, "3": { fontSize: 15, markerSize: 9 } },
    };
    const editor = open(sermon({ styles }));
    const draft = resetLayer(emptyDraft, stored(editor), editor.state.doc, {
      layer: "level",
      depth: 3,
    });
    expect(mergeStyles(stored(editor), draft)).toEqual({
      version: 1,
      components: { subpoint: { italic: true } },
      levels: { "2": { bold: false } },
    });
  });

  it("keep single components through every outline-wide reset", () => {
    const editor = open(sermon({ styles: { version: 1, levels: { "2": { bold: false } } } }));
    editor.commands.setComponentAppearance(posOf(editor, "p-1a"), { fontSize: 9 });
    const draft = restoreOutline(emptyDraft, stored(editor), editor.state.doc);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(stored(editor)).toBeNull();
    expect(editor.state.doc.nodeAt(posOf(editor, "p-1a"))!.attrs.appearance).toEqual({
      fontSize: 9,
    });
  });
});

describe("persistence of levels", () => {
  const styles: DocumentStyles = {
    version: 1,
    preset: "expressive",
    presetRevision: 2,
    defaults: { levelIndent: 18 },
    components: { point: { markerFont: "inter", hanging: false } },
    levels: { "2": { fontSize: 12.5, notationColor: { mode: "exact", color: "#224466" } } },
  };

  it("survive the core's restore and the canonical form unchanged", () => {
    const json = sermon({ styles });
    const restored = restoreSermonDocument(json);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.doc.attrs.styles).toEqual(styles);
    const canonical = canonicalDocument(restored.doc.toJSON());
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    expect((canonical.content as JSONContent).attrs?.styles).toEqual(styles);
  });

  it("are refused, never repaired, when out of contract", () => {
    const restored = restoreSermonDocument(
      sermon({ styles: { version: 1, levels: { "40": { fontSize: 12 } } } }),
    );
    expect(restored.ok).toBe(false);
  });
});

describe("snapshots for personal presets (contract only)", () => {
  const decimal = { version: 1, preset: "decimal" } as const;

  it("hold the outline-wide layers and numbering, never a node's own appearance", () => {
    const styles: DocumentStyles = {
      version: 1,
      preset: "minimal",
      components: { point: { bold: false } },
      levels: { "3": { italic: true } },
    };
    const snapshot = snapshotAppearance(styles, decimal, "balanced");
    expect(snapshot).toEqual({
      version: 1,
      preset: "minimal",
      presetRevision: 1,
      components: { point: { bold: false } },
      levels: { "3": { italic: true } },
      numbering: decimal,
    });
    expect(JSON.stringify(snapshot)).not.toContain("appearance");
  });

  it("materialize a built-in revision's values under the snapshot's own", () => {
    const snapshot = materialize(
      snapshotAppearance(
        { version: 1, components: { point: { bold: false } } },
        decimal,
        "balanced",
      ),
    );
    expect(snapshot.defaults).toEqual(presets.balanced.defaults);
    expect(snapshot.components?.point).toEqual({
      ...presets.balanced.components.point,
      bold: false,
    });
    expect(snapshot.components?.scripture).toEqual(presets.balanced.components.scripture);
  });

  it("apply as an ordinary draft: previewable, one transaction, single components kept", () => {
    const editor = open(sermon());
    editor.commands.setComponentAppearance(posOf(editor, "p-1a"), { fontSize: 9 });
    const snapshot = snapshotAppearance(
      { version: 1, preset: "expressive", presetRevision: 2, levels: { "2": { bold: false } } },
      decimal,
      "balanced",
    );
    const draft = snapshotDraft(snapshot, stored(editor), editor.state.doc, emptyDraft)!;
    expect(draft).not.toBeNull();
    const depth = undoDepth(editor.state);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(undoDepth(editor.state)).toBe(depth + 1);
    expect(stored(editor)).toEqual({
      version: 1,
      preset: "expressive",
      presetRevision: 2,
      levels: { "2": { bold: false } },
    });
    expect(editor.state.doc.attrs.layout.numbering).toEqual(decimal);
    expect(editor.state.doc.nodeAt(posOf(editor, "p-1a"))!.attrs.appearance).toEqual({
      fontSize: 9,
    });
    expect(
      snapshotDraft(
        { ...snapshot, numbering: { version: 1 } as never },
        null,
        editor.state.doc,
        emptyDraft,
      ),
    ).toBeNull();
  });
});

describe("the fields offered", () => {
  it("cover every property a type style accepts that draws, and a level's", () => {
    for (const kind of componentKinds) {
      const offered = new Set(fieldsOf(typeGroups[kind]));
      const skipped = Object.keys(notDrawn[kind] ?? {});
      expect([...offered, ...skipped].sort(), kind).toEqual([...componentTypeFields(kind)].sort());
    }
    expect(fieldsOf(levelGroups).sort()).toEqual([...levelFields].sort());
    expect(fieldsOf(defaultsGroups)).toContain("levelIndent");
  });
});
