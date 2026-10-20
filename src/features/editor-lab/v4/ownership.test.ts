import type { Editor } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { run, type Command } from "../outline-commands";
import {
  decreaseLevel,
  increaseLevel,
  moveGroup,
  moveOut,
  outdentProse,
  indentProse,
  pointToProse,
} from "./commands";
import { parentProse } from "./fixtures";
import type { V4Notice } from "./model";
import { analyzeShapes } from "./ownership";
import { allIds, caret, owners, ownership, testEditorV4 } from "./testing";

/*
 * The owner's scenario (prototype brief §4): ownership before and after
 * moving A and B, changing levels, and converting point headings, each
 * undone and redone exactly. Writing that belongs to Point I itself stands
 * between its two subpoints, and no move may take it over.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

function scenario(notices?: V4Notice[]) {
  const editor = testEditorV4(parentProse, { notices });
  open.push(editor);
  return editor;
}

const before = {
  "p-i": null,
  "p-a": "p-i",
  "Body of A": "p-a",
  "Belongs to I": "p-i",
  "p-b": "p-i",
  "Body of B": "p-b",
  "p-ii": null,
};

const order = (editor: Editor) => ownership(editor).map((row) => row.name);
const doCommand = (editor: Editor, command: Command) => run(editor, command);

/** Undo restores the document exactly, IDs and depths included; redo restores the change. */
function expectUndoRedo(editor: Editor, original: unknown) {
  const changed = editor.getJSON();
  expect(undo(editor.state, editor.view.dispatch)).toBe(true);
  expect(editor.getJSON()).toEqual(original);
  expect(redo(editor.state, editor.view.dispatch)).toBe(true);
  expect(editor.getJSON()).toEqual(changed);
}

describe("ownership is worked out from order and depth (ownership.ts)", () => {
  it("reads the scenario as the owner wrote it", () => {
    expect(owners(scenario())).toEqual(before);
    expect(ownership(scenario()).every((row) => row.irregular === null)).toBe(true);
  });

  it("gives every sequence a meaning, and marks the irregular ones instead of repairing them", () => {
    const analysis = analyzeShapes([
      { isPoint: true, depth: 1 },
      { isPoint: true, depth: 3 }, // two levels below its parent
      { isPoint: false, depth: 1 },
      { isPoint: false, depth: 2 }, // deeper than the point it belongs to
      { isPoint: false, depth: 0 },
      { isPoint: false, depth: 1 }, // deeper than the document, with no point open
    ]);
    expect(analysis.owner).toEqual([null, 0, 0, 0, null, null]);
    expect(analysis.irregular).toEqual([
      null,
      "skipped_level",
      null,
      "deeper_than_owner",
      null,
      "deeper_than_owner",
    ]);
    expect(analysis.groupEnd).toEqual([4, 2, 3, 4, 5, 6]);
  });
});

describe("moving a point never takes over its parent's writing", () => {
  it("moves A down past B: the writing that belongs to I stays I's", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "p-a", 3);
    expect(doCommand(editor, moveGroup("down"))).toBe(true);
    expect(order(editor)).toEqual([
      "p-i",
      "p-b",
      "Body of B",
      "Belongs to I",
      "p-a",
      "Body of A",
      "p-ii",
    ]);
    expect(owners(editor)).toEqual(before);
    expect(allIds(editor).sort()).toEqual(["p-a", "p-b", "p-i", "p-ii"]);
    // The caret went with A.
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-a");
    expectUndoRedo(editor, original);
  });

  it("moves B up past A, the same exchange", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "Body of B", 2);
    expect(doCommand(editor, moveGroup("up"))).toBe(true);
    expect(order(editor)).toEqual([
      "p-i",
      "p-b",
      "Body of B",
      "Belongs to I",
      "p-a",
      "Body of A",
      "p-ii",
    ]);
    expect(owners(editor)).toEqual(before);
    expectUndoRedo(editor, original);
  });

  it("refuses A up and B down: neither leaves its parent by moving", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "p-a");
    expect(doCommand(editor, moveGroup("up"))).toBe(false);
    caret(editor, "p-b");
    expect(doCommand(editor, moveGroup("down"))).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });

  it("moves I with everything it owns past II", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "Belongs to I");
    expect(doCommand(editor, moveGroup("down"))).toBe(true);
    expect(order(editor)[0]).toBe("p-ii");
    expect(owners(editor)).toEqual(before);
    expectUndoRedo(editor, original);
  });

  it("moves A out to the main points without taking over anything", () => {
    const notices: V4Notice[] = [];
    const editor = scenario(notices);
    const original = editor.getJSON();
    caret(editor, "p-a");
    expect(doCommand(editor, moveOut)).toBe(true);
    expect(order(editor)).toEqual([
      "p-i",
      "Belongs to I",
      "p-b",
      "Body of B",
      "p-a",
      "Body of A",
      "p-ii",
    ]);
    expect(owners(editor)).toEqual({ ...before, "p-a": null });
    expect(notices).toEqual([]);
    expectUndoRedo(editor, original);
  });
});

describe("changing a level in place moves nothing", () => {
  it("refuses to put B under A while I's own writing stands between them", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "p-b");
    expect(doCommand(editor, increaseLevel)).toBe(false);
    caret(editor, "p-a");
    expect(doCommand(editor, increaseLevel)).toBe(false); // a first child has nothing to go under
    expect(editor.getJSON()).toEqual(original);
  });

  it("puts II under I, with nothing else changing owner", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "p-ii");
    expect(doCommand(editor, increaseLevel)).toBe(true);
    expect(order(editor)).toEqual(order(testEditorV4(parentProse)));
    expect(owners(editor)).toEqual({ ...before, "p-ii": "p-i" });
    expectUndoRedo(editor, original);
  });

  it("outdents A in place: what follows at its old level becomes A's, and that is reported", () => {
    const notices: V4Notice[] = [];
    const editor = scenario(notices);
    const original = editor.getJSON();
    caret(editor, "p-a");
    expect(doCommand(editor, decreaseLevel)).toBe(true);
    expect(order(editor)).toEqual(order(testEditorV4(parentProse)));
    expect(owners(editor)).toEqual({
      ...before,
      "p-a": null,
      "Belongs to I": "p-a",
      "p-b": "p-a",
    });
    expect(notices).toEqual([{ code: "ownership_changed", count: 2 }]);
    expectUndoRedo(editor, original);
  });

  it("moves writing into the open point above (Tab) and back (Shift+Tab)", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "Belongs to I");
    expect(doCommand(editor, indentProse)).toBe(true);
    expect(owners(editor)["Belongs to I"]).toBe("p-a");
    expect(doCommand(editor, outdentProse)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  });
});

describe("converting a point heading keeps its words and everything under it", () => {
  it("turns A into writing: its words and body go to I, and one undo restores A and its ID", () => {
    const notices: V4Notice[] = [];
    const editor = scenario(notices);
    const original = editor.getJSON();
    caret(editor, "p-a");
    expect(doCommand(editor, pointToProse)).toBe(true);
    expect(owners(editor)).toEqual({
      "p-i": null,
      "Subpoint A": "p-i",
      "Body of A": "p-i",
      "Belongs to I": "p-i",
      "p-b": "p-i",
      "Body of B": "p-b",
      "p-ii": null,
    });
    expect(notices).toEqual([{ code: "point_converted", linked: false }]);
    expectUndoRedo(editor, original);
  });

  it("turns I into writing: its subpoints come up a level and its own writing becomes the document's", () => {
    const editor = scenario();
    const original = editor.getJSON();
    caret(editor, "p-i");
    expect(doCommand(editor, pointToProse)).toBe(true);
    expect(owners(editor)).toEqual({
      "Main Point I": null,
      "p-a": null,
      "Body of A": "p-a",
      "Belongs to I": null,
      "p-b": null,
      "Body of B": "p-b",
      "p-ii": null,
    });
    expect(ownership(editor).every((row) => row.irregular === null)).toBe(true);
    expectUndoRedo(editor, original);
  });

  it("each structural change is one undo step", () => {
    const editor = scenario();
    caret(editor, "p-a");
    const depth = undoDepth(editor.state);
    doCommand(editor, moveOut);
    expect(undoDepth(editor.state)).toBe(depth + 1);
  });
});
