import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { barStateOf } from "../components/formatting/color-control";
import { setHighlight, setTextColor } from "../formatting-commands";
import { mixed, textState } from "../formatting-state";
import { findComponent } from "../styles/component-node";
import { committedAt, emptyDraft, setEdit, type Draft, type Path } from "../styles/draft";
import { readStyles } from "../styles/resolve";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, noteV4, pointV4, proseV4 } from "./fixtures";
import { textStart } from "./testing";

/*
 * The toolbar's Text Color and Highlight bars (A1-UI.2B.2 finalization):
 * what the text at the caret is drawn in, its own mark or what it inherits,
 * following the Appearance preview of a single component as the outline
 * does; and a bar that tells a color, the theme's text, no highlight, and a
 * mixed selection apart.
 */

const editors: Editor[] = [];
function open(content: JSONContent) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset: "balanced" }) });
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

const sermon = documentV4([
  pointV4("p-1", "The lamp", 1),
  proseV4("Why this psalm.", 1),
  noteV4("n-1", "Ask who walked in the dark.", 1),
  proseV4("After the note.", 1),
]);

const select = (editor: Editor, from: number, to = from) =>
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );
/** Where the note's words begin: inside the note, inside its paragraph. */
const inNote = (editor: Editor) => findComponent(editor.state.doc, "n-1")!.pos + 2;
const draftWith = (editor: Editor, path: Path, value: unknown): Draft =>
  setEdit(
    emptyDraft,
    path,
    value,
    committedAt(readStyles(editor.state.doc.attrs.styles), editor.state.doc, path),
  );
const noteColor: Path = { layer: "instance", id: "n-1", kind: "preacherNote", field: "color" };

describe("the toolbar's colors", () => {
  it("show the theme's text and no highlight where nothing sets either", () => {
    const editor = open(sermon);
    select(editor, textStart(editor, "Why this psalm.") + 2);
    expect(textState(editor.state)).toMatchObject({ color: null, highlight: null });
  });

  it("show a run's own color and highlight, and follow the caret", () => {
    const editor = open(sermon);
    const start = textStart(editor, "Why this psalm.");
    select(editor, start, start + 3);
    setTextColor("red")(editor.state, editor.view.dispatch);
    setHighlight("yellow")(editor.state, editor.view.dispatch);
    select(editor, start + 1);
    expect(textState(editor.state)).toMatchObject({ color: "red", highlight: "yellow" });
    select(editor, start + 8);
    expect(textState(editor.state)).toMatchObject({ color: null, highlight: null });
  });

  it("show a color the text inherits from its component's style", () => {
    const editor = open(sermon);
    editor.commands.setComponentStyle("preacherNote", { color: "green" });
    select(editor, inNote(editor) + 3);
    expect(textState(editor.state).color).toBe("green");
    expect(textState(editor.state).inherited.color).toBe(true);
  });

  it("follow a single component's Appearance preview, and drop it on Cancel", () => {
    const editor = open(sermon);
    const before = editor.getJSON();
    select(editor, inNote(editor) + 3);
    editor.commands.setStylesPreview({ draft: draftWith(editor, noteColor, "purple") });
    expect(textState(editor.state).color).toBe("purple");
    // Shown, not written.
    expect(editor.getJSON()).toEqual(before);
    editor.commands.setStylesPreview(null);
    expect(textState(editor.state).color).toBeNull();
  });

  it("follow a preview of the component kind", () => {
    const editor = open(sermon);
    select(editor, inNote(editor) + 3);
    const kind: Path = { layer: "component", kind: "preacherNote", field: "color" };
    editor.commands.setStylesPreview({ draft: draftWith(editor, kind, "teal") });
    expect(textState(editor.state).color).toBe("teal");
  });

  it("are mixed across text drawn in different colors", () => {
    const editor = open(sermon);
    editor.commands.setComponentStyle("preacherNote", { color: "green" });
    const from = textStart(editor, "Why this psalm.") + 1;
    const to = textStart(editor, "After the note.") + 3;
    select(editor, from, to);
    expect(textState(editor.state).color).toBe(mixed);
  });
});

describe("the color bar", () => {
  it("tells a color, the theme's text, no highlight, and a mixed selection apart", () => {
    expect(barStateOf("ink", "red")).toBe("color");
    expect(barStateOf("fill", "yellow")).toBe("color");
    expect(barStateOf("ink", null)).toBe("theme");
    expect(barStateOf("fill", null)).toBe("none");
    expect(barStateOf("ink", mixed)).toBe("mixed");
    expect(barStateOf("fill", mixed)).toBe("mixed");
  });
});
