import type { Editor } from "@tiptap/core";
import { undo, undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { setNamedStyle } from "../formatting-commands";
import { run } from "../outline-commands";
import {
  addPoint,
  deletePointGroup,
  pointToProse,
  proseToPoint,
  setPointStyle,
  setRole,
} from "./commands";
import { documentV4, parentProse, pointV4, proseV4, writingFirst } from "./fixtures";
import type { V4Notice } from "./model";
import { presentationOf, setPresentation } from "./plugins";
import { allIds, caret, owners, ownership, press, testEditorV4, textStart } from "./testing";

/*
 * Natural editing in v4 (prototype brief §5), through the real key handlers
 * (`press` delivers a keydown as the browser does), with the
 * identity, undo, and ownership of what was not touched checked each time.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

function make(content = parentProse, notices?: V4Notice[]) {
  const editor = testEditorV4(content, { notices });
  open.push(editor);
  return editor;
}

const names = (editor: Editor) => ownership(editor).map((row) => row.name);
const block = (editor: Editor, index: number) => editor.state.doc.child(index);

/** Selects from `offset` in one block (by name) to `offset` in another. */
function select(editor: Editor, from: [string, number], to: [string, number]) {
  const doc = editor.state.doc;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(
        doc,
        textStart(editor, from[0]) + from[1],
        textStart(editor, to[0]) + to[1],
      ),
    ),
  );
}

describe("writing is ordinary", () => {
  it("needs no structure: an empty document takes writing, paragraphs, and line breaks", () => {
    const editor = make(documentV4([proseV4("", 0)]));
    editor.commands.insertContent("First line");
    press(editor, "Enter");
    editor.commands.insertContent("Second");
    press(editor, "Shift-Enter");
    editor.commands.insertContent("same paragraph");
    expect(editor.getText({ blockSeparator: "|" })).toBe("First line|Second\nsame paragraph");
    expect(ownership(editor).every((row) => !row.point && row.depth === 0)).toBe(true);
  });

  it("splits a paragraph under a point and the new one stays the point's", () => {
    const editor = make();
    caret(editor, "Body of A", 4);
    press(editor, "Enter");
    expect(names(editor).slice(2, 4)).toEqual(["Body", " of A"]);
    expect(owners(editor)[" of A"]).toBe("p-a");
  });

  it("joins two paragraphs with Backspace as any editor does", () => {
    const editor = make(writingFirst);
    caret(editor, "A second paragraph, still just writing.");
    press(editor, "Backspace");
    expect(names(editor)[0]).toBe(
      "The sermon begins as writing, with no structure at all.A second paragraph, still just writing.",
    );
  });

  it("allows writing before, between, and after points", () => {
    const editor = make(writingFirst);
    expect(ownership(editor).map((row) => row.owner)).toEqual([null, null, null, "p-only", null]);
  });
});

describe("Enter in a point heading", () => {
  it("at its end opens an ordinary paragraph at the point's depth, the point's own", () => {
    const editor = make();
    caret(editor, "p-a", "Subpoint A".length);
    press(editor, "Enter");
    expect(block(editor, 2).type.name).toBe("paragraph");
    expect(block(editor, 2).attrs.depth).toBe(2);
    expect(owners(editor)[""]).toBe("p-a");
    expect(editor.state.selection.$from.parent).toBe(block(editor, 2));
  });

  it("at its start opens an empty point above; the original keeps its ID, words, and content", () => {
    const editor = make();
    caret(editor, "p-a");
    press(editor, "Enter");
    expect(block(editor, 1).attrs.id).toBe("new-1");
    expect(block(editor, 1).textContent).toBe("");
    expect(block(editor, 2).attrs.id).toBe("p-a");
    expect(block(editor, 2).textContent).toBe("Subpoint A");
    expect(owners(editor)["Body of A"]).toBe("p-a");
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-a");
  });

  it("in the middle splits it: the original identity, source, role, and content stay with the second half", () => {
    const content = documentV4([
      pointV4("p-1", "Faith and works", 1, { sourcePointId: "saved-1" }),
      proseV4("What the point says.", 1),
      pointV4("p-1a", "A subpoint", 2),
    ]);
    const editor = make(content);
    const original = editor.getJSON();
    caret(editor, "p-1", "Faith".length);
    const depth = undoDepth(editor.state);
    press(editor, "Enter");
    const [first, second] = [block(editor, 0), block(editor, 1)];
    expect(first.textContent).toBe("Faith");
    expect(first.attrs).toMatchObject({ id: "new-1", derivedFrom: "p-1", sourcePointId: null });
    expect(second.textContent).toBe(" and works");
    expect(second.attrs).toMatchObject({ id: "p-1", sourcePointId: "saved-1", derivedFrom: null });
    expect(owners(editor)).toMatchObject({
      "What the point says.": "p-1",
      "p-1a": "p-1",
      "new-1": null,
    });
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-1");
    expect(undoDepth(editor.state)).toBe(depth + 1);
    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(original);
  });

  it("in an empty point that owns nothing turns it into a paragraph where it stands", () => {
    const editor = make();
    caret(editor, "p-b", "Subpoint B".length);
    run(editor, addPoint("sibling"));
    expect(block(editor, 6).type.name).toBe("point");
    press(editor, "Enter");
    expect(block(editor, 6).type.name).toBe("paragraph");
    // The deepest depth that stays regular: under B, beside it at its level.
    expect(block(editor, 6).attrs.depth).toBe(2);
    expect(ownership(editor).every((row) => row.irregular === null)).toBe(true);
  });

  it("Shift+Enter breaks the line inside a heading, which stays one point", () => {
    const editor = make();
    caret(editor, "p-a", "Subpoint".length);
    press(editor, "Shift-Enter");
    expect(block(editor, 1).type.name).toBe("point");
    expect(block(editor, 1).child(1).type.name).toBe("hardBreak");
  });

  it("takes rich formatting and a named style's look, and stays a point", () => {
    const editor = make();
    select(editor, ["p-a", 0], ["p-a", 8]);
    editor.commands.toggleBold();
    expect(run(editor, setPointStyle("heading2"))).toBe(true);
    const point = block(editor, 1);
    expect(point.type.name).toBe("point");
    expect(point.attrs.styleName).toBe("heading2");
    expect(point.child(0).marks.map((mark) => mark.type.name)).toEqual(["bold"]);
    expect(editor.getHTML()).toContain('data-style-name="heading2"');
    // Since A1 the toolbar's paragraph style command gives a point a look too; it stays a point.
    expect(run(editor, setNamedStyle("normal"))).toBe(true);
    expect(block(editor, 1).type.name).toBe("point");
    expect(block(editor, 1).attrs.styleName).toBe("normal");
  });
});

describe("Backspace and Delete", () => {
  it("leave deleting a character to the browser, in a heading too (nothing of v4 takes the key)", () => {
    const editor = make();
    const original = editor.getJSON();
    caret(editor, "p-a", 3);
    // The browser deletes the character natively; jsdom has no such editing, so only the hand-off is checked here.
    expect(press(editor, "Backspace")).toBe(false);
    caret(editor, "p-a", 3);
    expect(press(editor, "Delete")).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });

  it("join a heading's first line of writing into the heading, which stays the point", () => {
    const editor = make();
    caret(editor, "Body of A");
    press(editor, "Backspace");
    expect(block(editor, 1).textContent).toBe("Subpoint ABody of A");
    expect(block(editor, 1).attrs.id).toBe("p-a");
  });

  it("at the start of a heading turn the point into writing, then join it as writing", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    caret(editor, "p-b");
    press(editor, "Backspace");
    expect(block(editor, 4).type.name).toBe("paragraph");
    expect(block(editor, 4).attrs.depth).toBe(1);
    expect(owners(editor)["Body of B"]).toBe("p-i");
    expect(notices).toEqual([{ code: "point_converted", linked: false }]);
    press(editor, "Backspace");
    expect(names(editor)[3]).toBe("Belongs to ISubpoint B");
  });

  it("removes an empty point that owns nothing, and goes to the end of the line before", () => {
    const editor = make();
    caret(editor, "p-b", "Subpoint B".length);
    run(editor, addPoint("sibling"));
    press(editor, "Backspace");
    expect(names(editor)).toEqual(names(make()));
    expect(editor.state.selection.$from.parent.textContent).toBe("Body of B");
  });

  it("Delete at the end of the writing before a point never joins the heading into it", () => {
    const editor = make();
    const original = editor.getJSON();
    caret(editor, "Belongs to I", "Belongs to I".length);
    press(editor, "Delete");
    expect(editor.getJSON()).toEqual(original);
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-b");
  });

  it("Delete removes an empty line before a point and stops at the point", () => {
    const editor = make(documentV4([proseV4("", 1), pointV4("p", "Point", 1)]));
    caret(editor, "");
    press(editor, "Delete");
    expect(names(editor)).toEqual(["p"]);
  });

  it("a selection from writing into a heading deletes what was selected and keeps the point", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    const original = editor.getJSON();
    select(editor, ["Body of A", 4], ["p-b", "Subpoint ".length]);
    press(editor, "Backspace");
    expect(names(editor)).toEqual(["p-i", "p-a", "Body", "p-b", "Body of B", "p-ii"]);
    expect(block(editor, 3).textContent).toBe("B");
    expect(block(editor, 3).attrs.id).toBe("p-b");
    expect(owners(editor)["Body of B"]).toBe("p-b");
    expect(notices).toEqual([]);
    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(original);
  });

  it("typing over such a selection replaces it the same way", () => {
    const editor = make();
    select(editor, ["Body of A", 4], ["p-b", "Subpoint ".length]);
    const view = editor.view;
    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, view.state.selection.from, view.state.selection.to, "!", () => view.state.tr),
    );
    expect(handled).toBe(true);
    expect(names(editor)).toEqual(["p-i", "p-a", "Body!", "p-b", "Body of B", "p-ii"]);
  });

  it("a selection over whole points deletes them and says how many", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    select(editor, ["Body of A", 4], ["Body of B", 4]);
    press(editor, "Backspace");
    expect(names(editor)).toEqual(["p-i", "p-a", "Body of B", "p-ii"]);
    expect(allIds(editor)).toEqual(["p-i", "p-a", "p-ii"]);
    expect(notices).toEqual([{ code: "points_deleted", count: 1, linked: false, reparented: 0 }]);
  });

  it("a built-in deletion that would end a point while its words survive is refused", () => {
    const editor = make();
    const original = editor.getJSON();
    select(editor, ["Body of A", 4], ["p-b", 3]);
    editor.view.dispatch(editor.state.tr.deleteSelection());
    expect(editor.getJSON()).toEqual(original);
  });

  it("a built-in command that would change a point's type is refused", () => {
    const editor = make();
    const original = editor.getJSON();
    caret(editor, "p-a", 2);
    editor.commands.setParagraph();
    editor.commands.toggleBulletList();
    editor.commands.toggleHeading({ level: 2 });
    expect(editor.getJSON()).toEqual(original);
  });

  it("removing a point's role is one command, deleting the point and its content another", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    caret(editor, "p-a");
    expect(run(editor, pointToProse)).toBe(true);
    expect(names(editor)).toContain("Body of A");
    caret(editor, "p-b");
    expect(run(editor, deletePointGroup)).toBe(true);
    expect(names(editor)).toEqual(["p-i", "Subpoint A", "Body of A", "Belongs to I", "p-ii"]);
    expect(notices.at(-1)).toEqual({
      code: "points_deleted",
      count: 1,
      linked: false,
      reparented: 0,
    });
  });
});

describe("prose and points convert both ways", () => {
  it("writing becomes a point under its owner, taking nothing that follows", () => {
    const editor = make();
    caret(editor, "Belongs to I");
    expect(run(editor, proseToPoint)).toBe(true);
    const converted = block(editor, 3);
    expect(converted.type.name).toBe("point");
    expect(converted.attrs.depth).toBe(2);
    expect(owners(editor)).toMatchObject({ "p-b": "p-i", "Body of B": "p-b" });
    expect(ownership(editor)[3].owner).toBe("p-i");
  });

  it("a heading becomes a point that keeps the heading's look", () => {
    const editor = make(
      documentV4([
        {
          type: "heading",
          attrs: { level: 3, depth: 0 },
          content: [{ type: "text", text: "Title" }],
        },
      ]),
    );
    caret(editor, "Title");
    run(editor, proseToPoint);
    expect(block(editor, 0).attrs).toMatchObject({ depth: 1, styleName: "heading3" });
  });
});

describe("depth stays with the block through built-in changes", () => {
  it("a list made from writing under a point, and the line lifted back out, keep the point's depth", () => {
    const editor = make();
    caret(editor, "Body of A", 2);
    editor.commands.toggleBulletList();
    expect(block(editor, 2).type.name).toBe("bulletList");
    expect(block(editor, 2).attrs.depth).toBe(2);
    expect(owners(editor)["Body of A"]).toBe("p-a");
    editor.commands.toggleBulletList();
    expect(block(editor, 2).type.name).toBe("paragraph");
    expect(block(editor, 2).attrs.depth).toBe(2);
  });

  it("v3's named-style command restyles writing without changing its depth", () => {
    const editor = make();
    caret(editor, "Body of A", 2);
    run(editor, setNamedStyle("heading2"));
    expect(block(editor, 2).type.name).toBe("heading");
    expect(block(editor, 2).attrs.depth).toBe(2);
  });
});

describe("introduction and conclusion are roles on main points", () => {
  it("one of each at most, only on a main point", () => {
    const editor = make();
    caret(editor, "p-i");
    expect(run(editor, setRole("introduction"))).toBe(true);
    caret(editor, "p-ii");
    expect(run(editor, setRole("introduction"))).toBe(false);
    expect(run(editor, setRole("conclusion"))).toBe(true);
    caret(editor, "p-a");
    expect(run(editor, setRole("conclusion"))).toBe(false);
  });
});

describe("presentation is a view, not the document", () => {
  it("switches between outline and manuscript without a change or an undo step", () => {
    const editor = make();
    const original = editor.getJSON();
    const depth = undoDepth(editor.state);
    setPresentation(editor.view, "manuscript");
    expect(presentationOf(editor.state)).toBe("manuscript");
    expect(editor.view.dom.getAttribute("data-presentation")).toBe("manuscript");
    expect(editor.getJSON()).toEqual(original);
    expect(undoDepth(editor.state)).toBe(depth);
    expect(owners(editor)).toEqual(owners(make()));
  });
});
