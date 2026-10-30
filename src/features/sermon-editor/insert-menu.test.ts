import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { placeSavedPoint } from "./insert-menu";
import { sessionWriteGuard } from "./persistence/session/write-guard";

/*
 * A3.1: a saved point is placed through the editor's own dispatch, and the
 * picker is told "added" only when the document really changed: never where
 * the session may not edit, whatever the view says.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

function make(canEdit: () => boolean) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [...labV4Extensions({}), sessionWriteGuard(canEdit)],
  });
  open.push(editor);
  expect(
    loadV4(editor, documentV4([pointV4("p-1", "Grace", 1), proseV4("Under", 1)]), "doc").ok,
  ).toBe(true);
  return editor;
}

const idea = { id: "idea-1", title: "Hearing" };
const target = { anchor: { id: "p-1", name: "Grace" } };

describe("placeSavedPoint", () => {
  it("places a copy and says so", () => {
    const editor = make(() => true);
    expect(placeSavedPoint(editor, idea, target, "under")).toBe(true);
    expect(editor.getJSON().content?.at(-1)?.attrs).toMatchObject({
      sourcePointId: "idea-1",
      depth: 2,
    });
  });

  it("is never said to be added where the write guard refuses it (another tab, a lost lock)", () => {
    const editor = make(() => false);
    const before = editor.getJSON();
    expect(editor.isEditable).toBe(true);
    expect(placeSavedPoint(editor, idea, target, "below")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("does nothing in a view that is not editable, or with no target, or a gone anchor", () => {
    const editor = make(() => true);
    const before = editor.getJSON();
    editor.setEditable(false);
    expect(placeSavedPoint(editor, idea, target, "below")).toBe(false);
    editor.setEditable(true);
    expect(placeSavedPoint(editor, idea, null, "below")).toBe(false);
    expect(placeSavedPoint(editor, idea, { anchor: { id: "gone", name: "x" } }, "below")).toBe(
      false,
    );
    expect(editor.getJSON()).toEqual(before);
  });
});
