import { readFileSync } from "node:fs";

import { Editor, type JSONContent } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { AttrStep, DocAttrStep } from "@tiptap/pm/transform";
import { afterEach, describe, expect, it } from "vitest";

import {
  blockGroups,
  componentGroups,
  fieldsOf,
  notDrawn,
} from "@/features/sermon-editor/appearance/fields";
import { componentAtSelection } from "@/features/sermon-editor/appearance/target";
import { findComponent } from "../styles/component-node";
import {
  applyPlan,
  committedAt,
  conflicts,
  emptyDraft,
  mergeStyles,
  orphans,
  rebaseEdit,
  resetLayer,
  restoreOutline,
  setEdit,
  UNSET,
  type Draft,
  type Path,
} from "../styles/draft";
import {
  componentFields,
  componentKinds,
  componentStyleSchemas,
  type DocumentStyles,
} from "../styles/model";
import {
  appearanceInForce,
  appearanceTargetKey,
  presetIdInForce,
  stylesInForce,
} from "../styles/plugin";
import { presets } from "../styles/presets";
import { readStyles } from "../styles/resolve";
import { styleSheet } from "../styles/render";
import { ref } from "../fixtures";
import { increaseLevel, moveGroup } from "./commands";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, noteV4, passageV4, pointV4, proseV4 } from "./fixtures";
import { allIds, caret, owners } from "./testing";

/*
 * A1-UI.2B.2: the Appearance panel's draft. One draft across the three
 * scopes, previewed as view state, applied in one transaction or not at all,
 * never sent to a component other than the one chosen, never written over a
 * change made since.
 */

const editors: Editor[] = [];
function open(content: JSONContent) {
  const element = document.createElement("div");
  document.body.append(element);
  let next = 0;
  const editor = new Editor({
    element,
    extensions: labV4Extensions({ preset: "balanced", newId: () => `new-${(next += 1)}` }),
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

const withAttrs = (node: JSONContent, attrs: Record<string, unknown>): JSONContent => ({
  ...node,
  attrs: { ...node.attrs, ...attrs },
});

const sermon = documentV4([
  pointV4("intro", "Introduction", 1, { role: "introduction" }),
  proseV4("Why this psalm.", 1),
  pointV4("p-1", "The lamp", 1),
  withAttrs(passageV4("s-1", ref(19, 119, 105), 1), { appearance: { fill: "blue" } }),
  passageV4("s-2", ref(19, 119, 106), 1),
  noteV4("n-1", "Ask who walked in the dark.", 1),
  pointV4("p-2", "The path", 1),
]);

const stored = (editor: Editor) => readStyles(editor.state.doc.attrs.styles);
/** Sets one property in the draft, as the panel does: its base is what is committed now. */
const edit = (editor: Editor, draft: Draft, path: Path, value: unknown) =>
  setEdit(draft, path, value, committedAt(stored(editor), editor.state.doc, path));
const appearanceOf = (editor: Editor, id: string) =>
  findComponent(editor.state.doc, id)?.node.attrs.appearance ?? null;
const preview = (editor: Editor, draft: Draft) => editor.commands.setStylesPreview({ draft });

/** A draft that touches every scope: the preset, the defaults, a kind, and one passage. */
function everyScope(editor: Editor): Draft {
  let draft = edit(editor, emptyDraft, { layer: "preset" }, "minimal");
  draft = edit(editor, draft, { layer: "defaults", field: "fontSize" }, 13);
  draft = edit(editor, draft, { layer: "named", name: "heading1", field: "bold" }, false);
  draft = edit(editor, draft, { layer: "component", kind: "point", field: "titleColor" }, "red");
  draft = edit(
    editor,
    draft,
    { layer: "instance", id: "s-2", kind: "scripture", field: "accentPosition" },
    "top",
  );
  return draft;
}

describe("the preview", () => {
  it("shows every scope's change in the outline and changes no document or history", () => {
    const editor = open(sermon);
    const before = editor.getJSON();
    const depth = undoDepth(editor.state);
    preview(editor, everyScope(editor));

    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(depth);
    const shown = stylesInForce(editor.state)!;
    expect(shown.preset).toBe("minimal");
    expect(shown.defaults).toEqual({ fontSize: 13 });
    expect(shown.named).toEqual({ heading1: { bold: false } });
    expect(shown.components).toEqual({ point: { titleColor: "red" } });
    expect(presetIdInForce(editor.state)).toBe("minimal");
    const passage = findComponent(editor.state.doc, "s-2")!.node;
    expect(appearanceInForce(editor.state, passage)).toEqual({ accentPosition: "top" });
    // Drawn on the passage itself, as the outline will be once applied.
    expect(editor.view.dom.querySelector('[data-accent="top"]')).not.toBeNull();
  });

  it("follows an Undo made while it is shown, keeping its own edits", () => {
    const editor = open(sermon);
    editor.commands.setComponentStyle("preacherNote", { fill: "green" });
    const draft = edit(
      editor,
      emptyDraft,
      { layer: "component", kind: "point", field: "bold" },
      false,
    );
    preview(editor, draft);
    expect(stylesInForce(editor.state)?.components).toEqual({
      preacherNote: { fill: "green" },
      point: { bold: false },
    });
    undo(editor.state, editor.view.dispatch);
    expect(stylesInForce(editor.state)?.components).toEqual({ point: { bold: false } });
  });

  it("is the same object while nothing changes, so typing never redraws the sheet", () => {
    const editor = open(sermon);
    preview(editor, everyScope(editor));
    const first = stylesInForce(editor.state);
    caret(editor, "Why this psalm.", 3);
    editor.commands.insertContent("x");
    expect(stylesInForce(editor.state)).toBe(first);
  });

  it("ends on Cancel with nothing left behind", () => {
    const editor = open(sermon);
    const before = editor.getJSON();
    preview(editor, everyScope(editor));
    editor.commands.setStylesPreview(null);
    expect(stylesInForce(editor.state)).toBe(stored(editor));
    expect(editor.view.dom.querySelector("[data-accent]")).toBeNull();
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("Apply", () => {
  it("writes every scope in one transaction of attribute steps, undone and redone in one step", () => {
    const editor = open(sermon);
    const before = editor.getJSON();
    const ids = allIds(editor);
    const owned = owners(editor);
    const depth = undoDepth(editor.state);
    const steps: unknown[] = [];
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) steps.push(...transaction.steps);
    });

    expect(editor.commands.applyAppearanceDraft(everyScope(editor))).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step instanceof DocAttrStep || step instanceof AttrStep)).toBe(
      true,
    );
    expect(undoDepth(editor.state)).toBe(depth + 1);
    expect(stored(editor)).toEqual({
      version: 1,
      preset: "minimal",
      defaults: { fontSize: 13 },
      named: { heading1: { bold: false } },
      components: { point: { titleColor: "red" } },
    });
    expect(appearanceOf(editor, "s-2")).toEqual({ accentPosition: "top" });
    // Nothing of the outline's meaning moved.
    expect(allIds(editor)).toEqual(ids);
    expect(owners(editor)).toEqual(owned);
    expect(editor.state.doc.textContent).toBe(editor.schema.nodeFromJSON(before).textContent);
    const applied = editor.getJSON();

    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(before);
    redo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(applied);
  });

  it("is its own step in history, never joined to the typing just before it", () => {
    const editor = open(sermon);
    caret(editor, "Why this psalm.", 3);
    editor.commands.insertContent("x");
    const typed = editor.getJSON();
    editor.commands.applyAppearanceDraft(
      edit(editor, emptyDraft, { layer: "defaults", field: "fontSize" }, 14),
    );
    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(typed);
  });

  it("ends the preview", () => {
    const editor = open(sermon);
    const draft = everyScope(editor);
    preview(editor, draft);
    editor.commands.applyAppearanceDraft(draft);
    expect(stylesInForce(editor.state)).toBe(stored(editor));
  });

  it("writes nothing at all when one part is invalid", () => {
    const editor = open(sermon);
    const before = editor.getJSON();
    let draft = edit(editor, emptyDraft, { layer: "defaults", field: "fontSize" }, 14);
    draft = edit(
      editor,
      draft,
      { layer: "instance", id: "s-1", kind: "scripture", field: "radius" },
      99,
    );
    expect(applyPlan(draft, stored(editor), editor.state.doc)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("values", () => {
  it("keep unset, null, and a value apart", () => {
    const editor = open(sermon);
    const fill: Path = { layer: "instance", id: "s-1", kind: "scripture", field: "fill" };
    // null: no fill, chosen on purpose.
    editor.commands.applyAppearanceDraft(edit(editor, emptyDraft, fill, null));
    expect(appearanceOf(editor, "s-1")).toEqual({ fill: null });
    // Unset: inherited again; the layer, now empty, is null, never {}.
    editor.commands.applyAppearanceDraft(edit(editor, emptyDraft, fill, UNSET));
    expect(appearanceOf(editor, "s-1")).toBeNull();
  });

  it("are no edit when set back to what is committed", () => {
    const editor = open(sermon);
    const path: Path = { layer: "defaults", field: "fontSize" };
    let draft = edit(editor, emptyDraft, path, 14);
    draft = edit(editor, draft, path, UNSET);
    expect(draft.edits.size).toBe(0);
  });
});

describe("resets", () => {
  const styled = (): JSONContent => ({
    ...sermon,
    attrs: {
      ...sermon.attrs,
      styles: {
        version: 1,
        preset: "expressive",
        defaults: { fontSize: 12 },
        named: { title: { italic: true } },
        components: { point: { bold: false }, scripture: { radius: 4, fill: "green" } },
      } satisfies DocumentStyles,
    },
  });

  it("restore the outline to its preset exactly as resetOutlineToPreset does, keeping single components", () => {
    const a = open(styled());
    const b = open(styled());
    a.commands.applyAppearanceDraft(restoreOutline(emptyDraft, stored(a), a.state.doc));
    b.commands.resetOutlineToPreset();
    expect(stored(a)).toEqual(stored(b));
    expect(stored(a)).toEqual({ version: 1, preset: "expressive" });
    expect(appearanceOf(a, "s-1")).toEqual({ fill: "blue" });
  });

  it("reset one kind, or one component, and nothing else", () => {
    const editor = open(styled());
    let draft = resetLayer(emptyDraft, stored(editor), editor.state.doc, {
      layer: "component",
      kind: "scripture",
    });
    draft = resetLayer(draft, stored(editor), editor.state.doc, {
      layer: "instance",
      id: "s-1",
      kind: "scripture",
    });
    editor.commands.applyAppearanceDraft(draft);
    expect(stored(editor)?.components).toEqual({ point: { bold: false } });
    expect(appearanceOf(editor, "s-1")).toBeNull();
    expect(stored(editor)?.defaults).toEqual({ fontSize: 12 });
  });

  it("keep an edit made after them, and a property set meanwhile by something else", () => {
    const editor = open(styled());
    let draft = resetLayer(emptyDraft, stored(editor), editor.state.doc, {
      layer: "component",
      kind: "scripture",
    });
    draft = edit(editor, draft, { layer: "component", kind: "scripture", field: "radius" }, 2);
    // Someone else sets another property of the same style meanwhile.
    editor.commands.setComponentStyle("scripture", { radius: 4, fill: "green", borderWidth: 1 });
    expect(conflicts(draft, stored(editor), editor.state.doc)).toEqual([]);
    editor.commands.applyAppearanceDraft(draft);
    expect(stored(editor)?.components?.scripture).toEqual({ radius: 2, borderWidth: 1 });
  });

  it("keep explicit overrides across a preset change", () => {
    const editor = open(styled());
    editor.commands.applyAppearanceDraft(edit(editor, emptyDraft, { layer: "preset" }, "minimal"));
    expect(stored(editor)?.components).toEqual({
      point: { bold: false },
      scripture: { radius: 4, fill: "green" },
    });
    expect(appearanceOf(editor, "s-1")).toEqual({ fill: "blue" });
  });
});

describe("a change made elsewhere", () => {
  it("is never written over: a conflict refuses Apply until the person chooses", () => {
    const editor = open(sermon);
    const path: Path = { layer: "component", kind: "point", field: "fontSize" };
    let draft = edit(editor, emptyDraft, path, 15);
    editor.commands.setComponentStyle("point", { fontSize: 11 });
    const before = editor.getJSON();
    expect(conflicts(draft, stored(editor), editor.state.doc)).toHaveLength(1);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    // "Keep mine".
    draft = rebaseEdit(draft, [...draft.edits.values()][0], stored(editor), editor.state.doc);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(true);
    expect(stored(editor)?.components?.point).toEqual({ fontSize: 15 });
  });

  it("to another property is kept when the draft is applied", () => {
    const editor = open(sermon);
    const draft = edit(
      editor,
      emptyDraft,
      { layer: "component", kind: "point", field: "bold" },
      false,
    );
    editor.commands.setComponentStyle("point", { italic: true });
    editor.commands.applyAppearanceDraft(draft);
    expect(stored(editor)?.components?.point).toEqual({ italic: true, bold: false });
  });
});

describe("a single component's edits", () => {
  const passageFill = (value: unknown): [Path, unknown] => [
    { layer: "instance", id: "s-2", kind: "scripture", field: "fill" },
    value,
  ];

  it("follow the component by identity when it moves", () => {
    const editor = open(sermon);
    const draft = edit(editor, emptyDraft, ...passageFill("yellow"));
    caret(editor, "p-2");
    moveGroup("up")(editor.state, editor.view.dispatch);
    expect(orphans(draft, editor.state.doc)).toEqual([]);
    editor.commands.applyAppearanceDraft(draft);
    expect(appearanceOf(editor, "s-2")).toEqual({ fill: "yellow" });
    expect(appearanceOf(editor, "s-1")).toEqual({ fill: "blue" });
  });

  it("are refused, never sent elsewhere, when the component is removed", () => {
    const editor = open(sermon);
    const draft = edit(editor, emptyDraft, ...passageFill("yellow"));
    const { pos, node } = findComponent(editor.state.doc, "s-2")!;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    const before = editor.getJSON();
    expect(orphans(draft, editor.state.doc)).toHaveLength(1);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("are refused when the component becomes another kind", () => {
    const editor = open(sermon);
    const draft = edit(
      editor,
      emptyDraft,
      { layer: "instance", id: "p-2", kind: "point", field: "titleColor" },
      "red",
    );
    caret(editor, "p-2");
    expect(increaseLevel(editor.state, editor.view.dispatch)).toBe(true);
    expect(findComponent(editor.state.doc, "p-2")?.kind).toBe("subpoint");
    expect(orphans(draft, editor.state.doc)).toHaveLength(1);
    expect(editor.commands.applyAppearanceDraft(draft)).toBe(false);
    expect(appearanceOf(editor, "p-2")).toBeNull();
  });
});

describe("the Selected scope's target", () => {
  it("is the component the selection is in, never the point that owns ordinary writing", () => {
    const editor = open(sermon);
    caret(editor, "p-1", 2);
    expect(componentAtSelection(editor.state)).toEqual({ id: "p-1", kind: "point" });
    caret(editor, "intro", 1);
    expect(componentAtSelection(editor.state)).toEqual({ id: "intro", kind: "introduction" });
    caret(editor, "Why this psalm.", 2);
    expect(componentAtSelection(editor.state)).toBeNull();
    // A caret in a note's writing is the note.
    const note = findComponent(editor.state.doc, "n-1")!;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, note.pos + 3)),
    );
    expect(componentAtSelection(editor.state)).toEqual({ id: "n-1", kind: "preacherNote" });
    // A passage, an atom, is selected whole by a click.
    const passage = findComponent(editor.state.doc, "s-2")!;
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, passage.pos)),
    );
    expect(componentAtSelection(editor.state)).toEqual({ id: "s-2", kind: "scripture" });
  });

  it("is nothing for a selection across two components", () => {
    const editor = open(sermon);
    const from = findComponent(editor.state.doc, "p-1")!.pos + 1;
    const to = findComponent(editor.state.doc, "p-2")!.pos + 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    );
    expect(componentAtSelection(editor.state)).toBeNull();
  });

  it("is marked by identity, outside history, and the mark goes with the component", () => {
    const editor = open(sermon);
    const depth = undoDepth(editor.state);
    editor.commands.setAppearanceTarget("n-1");
    expect(undoDepth(editor.state)).toBe(depth);
    expect(appearanceTargetKey.getState(editor.state)).toBe("n-1");
    expect(editor.view.dom.querySelector("[data-appearance-target]")?.className).toContain(
      "lab-note",
    );
    const { pos, node } = findComponent(editor.state.doc, "n-1")!;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    expect(editor.view.dom.querySelector("[data-appearance-target]")).toBeNull();
  });
});

describe("the container properties (A1-UI.2B.2)", () => {
  it("are bounded and from closed lists", () => {
    const schema = componentStyleSchemas.scripture;
    expect(
      schema.safeParse({
        accentPosition: "top",
        paddingBlock: 24,
        paddingInline: 36,
        outsideBefore: 48,
        outsideAfter: 0,
        labelFont: "lora",
      }).success,
    ).toBe(true);
    for (const bad of [
      { accentPosition: "bottom" },
      { paddingBlock: 25 },
      { paddingInline: -1 },
      { outsideAfter: 49 },
      { labelFont: "Comic Sans" },
    ]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
    // A point is not a box.
    expect(componentStyleSchemas.point.safeParse({ paddingBlock: 4 }).success).toBe(false);
    expect(componentStyleSchemas.introduction.safeParse({ accentPosition: "top" }).success).toBe(
      false,
    );
  });

  it("are drawn for a kind and for a single component", () => {
    const styles: DocumentStyles = {
      version: 1,
      components: {
        preacherNote: { paddingBlock: 6, paddingInline: 10, outsideBefore: 12, labelFont: "lora" },
      },
    };
    const sheet = styleSheet(styles, ".s", presets.balanced);
    expect(sheet).toContain("--ps-note-pad-block: 6pt");
    expect(sheet).toContain("--ps-note-pad-inline: 10pt");
    expect(sheet).toContain("--ps-note-out-before: 12pt");
    expect(sheet).toMatch(/--ps-note-label-font: var\(--lab-font-lora/);

    const editor = open(sermon);
    editor.commands.setComponentStyle("preacherNote", { accentPosition: "right" });
    expect(editor.view.dom.querySelector(".lab-note")?.getAttribute("data-accent")).toBe("right");
    const { pos } = findComponent(editor.state.doc, "s-2")!;
    editor.commands.setComponentAppearance(pos, { accentPosition: "top", outsideAfter: 20 });
    const passage = editor.view.dom.querySelectorAll(".lab-passage")[1] as HTMLElement;
    expect(passage.getAttribute("data-accent")).toBe("top");
    expect(passage.getAttribute("style")).toContain("--ps-scripture-out-after: 20pt");
  });

  it("are read by the studio CSS, which draws the accent on its side and no CSS string from data", () => {
    const css = readFileSync("src/features/editor-lab/v4/lab-v4.css", "utf8");
    for (const side of ["top", "right"]) {
      expect(css).toContain(`:is(.lab-passage, .lab-note, .lab-script)[data-accent="${side}"]`);
    }
    for (const part of ["pad-block", "pad-inline", "out-before", "out-after"]) {
      for (const component of ["scripture", "note", "script"]) {
        expect(css).toContain(`--ps-${component}-${part}`);
      }
    }
  });
});

describe("the panel's fields", () => {
  it("offer every property each kind's schema accepts that draws anything", () => {
    for (const kind of componentKinds) {
      const offered = new Set(fieldsOf(componentGroups[kind]));
      const skipped = Object.keys(notDrawn[kind] ?? {});
      for (const field of skipped) expect(offered.has(field)).toBe(false);
      expect([...offered, ...skipped].sort()).toEqual([...componentFields(kind)].sort());
    }
  });

  it("offer every property of a text style", () => {
    expect(fieldsOf(blockGroups).sort()).toEqual(
      [
        "fontFamily",
        "fontSize",
        "bold",
        "italic",
        "underline",
        "color",
        "lineHeight",
        "spaceBefore",
        "spaceAfter",
        "indentLeft",
        "indentFirst",
        "align",
      ].sort(),
    );
  });

  it("merge with nothing left as no styles at all", () => {
    expect(mergeStyles(null, emptyDraft)).toBeNull();
  });
});
