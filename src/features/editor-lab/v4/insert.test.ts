import type { Editor } from "@tiptap/core";
import { undo } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { insertNote, insertPassage, insertRolePoint, insertScript } from "./commands";
import { documentV4, pointV4, proseV4 } from "./fixtures";
import { caret, owners, ownership, testEditorV4 } from "./testing";

/*
 * The commands behind A3's Insert menu, on a real v4 editor: each makes one
 * transaction (one undo step), changes no other block's owner, and leaves a
 * document the core accepts.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

const sermon = () =>
  documentV4([
    proseV4("Opening words", 0),
    pointV4("p-1", "Grace", 1),
    proseV4("Under grace", 1),
    pointV4("p-1a", "Free", 2),
    pointV4("p-2", "Hope", 1),
  ]);

function make(content = sermon()) {
  const editor = testEditorV4(content);
  open.push(editor);
  return editor;
}

const types = (editor: Editor) => {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
};

const accepted = (editor: Editor) => restoreSermonDocument(editor.getJSON()).ok;

describe("insertNote and insertScript", () => {
  it.each([
    ["note", insertNote, "preacherNote"],
    ["script", insertScript, "script"],
  ] as const)(
    "puts a %s after the caret's line, inside its point, with the caret in it",
    (_, command, type) => {
      const editor = make();
      const before = owners(editor);
      caret(editor, "Under grace", 3);
      expect(editor.commands.command(({ state, dispatch }) => command(state, dispatch))).toBe(true);
      expect(types(editor)[3]).toBe(type);
      const inserted = ownership(editor)[3];
      expect(inserted.owner).toBe("p-1");
      // No block already there changes owner.
      for (const [name, owner] of Object.entries(before)) expect(owners(editor)[name]).toBe(owner);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.selection.$from.node(1).type.name).toBe(type);
      expect(accepted(editor)).toBe(true);

      undo(editor.state, editor.view.dispatch);
      expect(types(editor)).toEqual(["paragraph", "point", "paragraph", "point", "point"]);
    },
  );

  it("can be typed into", () => {
    const editor = make();
    caret(editor, "p-2", 2);
    editor.commands.command(({ state, dispatch }) => insertNote(state, dispatch));
    editor.commands.insertContent("Pause here");
    expect(editor.state.doc.lastChild?.type.name).toBe("preacherNote");
    expect(editor.state.doc.lastChild?.textContent).toBe("Pause here");
    expect(accepted(editor)).toBe(true);
  });
});

describe("insertPassage, after the shared placement step", () => {
  it("still puts a passage after the caret's line in its point", () => {
    const editor = make();
    caret(editor, "Under grace", 0);
    const reference = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: 17 };
    expect(
      editor.commands.command(({ state, dispatch }) => insertPassage(reference)(state, dispatch)),
    ).toBe(true);
    expect(types(editor)[3]).toBe("scripturePassage");
    expect(ownership(editor)[3].owner).toBe("p-1");
    expect(accepted(editor)).toBe(true);
  });
});

describe("insertRolePoint", () => {
  it("puts an introduction before the first main point, taking nothing over", () => {
    const editor = make();
    const before = owners(editor);
    caret(editor, "p-2", 0);
    expect(
      editor.commands.command(({ state, dispatch }) =>
        insertRolePoint("introduction")(state, dispatch),
      ),
    ).toBe(true);
    const intro = editor.state.doc.child(1);
    expect(intro.type.name).toBe("point");
    expect(intro.attrs).toMatchObject({ role: "introduction", depth: 1 });
    expect(editor.state.selection.$from.parent).toBe(intro);
    for (const [name, owner] of Object.entries(before)) expect(owners(editor)[name]).toBe(owner);
    expect(accepted(editor)).toBe(true);
    // One of each: a second is refused.
    expect(insertRolePoint("introduction")(editor.state)).toBe(false);
    undo(editor.state, editor.view.dispatch);
    expect(insertRolePoint("introduction")(editor.state)).toBe(true);
  });

  it("puts a conclusion at the end", () => {
    const editor = make();
    caret(editor, "p-1", 0);
    editor.commands.command(({ state, dispatch }) =>
      insertRolePoint("conclusion")(state, dispatch),
    );
    const last = editor.state.doc.lastChild!;
    expect(last.attrs).toMatchObject({ role: "conclusion", depth: 1 });
    expect(editor.state.selection.$from.parent).toBe(last);
    expect(accepted(editor)).toBe(true);
    expect(insertRolePoint("conclusion")(editor.state)).toBe(false);
  });

  it("in a sermon with no points yet, puts an introduction after the caret's line", () => {
    const editor = make(documentV4([proseV4("Just writing", 0), proseV4("More writing", 0)]));
    caret(editor, "Just writing", 2);
    editor.commands.command(({ state, dispatch }) =>
      insertRolePoint("introduction")(state, dispatch),
    );
    expect(types(editor)).toEqual(["paragraph", "point", "paragraph"]);
    expect(editor.state.doc.child(1).attrs.role).toBe("introduction");
    expect(accepted(editor)).toBe(true);
  });
});
