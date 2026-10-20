import type { Editor, JSONContent } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { inlineRef } from "../documents";
import { ref } from "../fixtures";
import { run } from "../outline-commands";
import { addPoint, increaseLevel, indentProse, proseToPoint } from "./commands";
import { documentV4, parentProse, pointV4, proseV4, rolesAnywhere } from "./fixtures";
import { maxDepth, type V4Notice } from "./model";
import { dropTransaction } from "./plugins";
import { allIds, caret, owners, ownership, press, testEditorV4, textStart } from "./testing";
import { restoreV4 } from "./validate";

/*
 * PS-ER1, interaction hardening: the edits the investigation found refused
 * or unsafe, each through the real key handlers where there is a key, with
 * identity, ownership, undo, and the notices checked.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

function make(content: JSONContent = parentProse, notices?: V4Notice[]) {
  const editor = testEditorV4(content, { notices });
  open.push(editor);
  return editor;
}

const names = (editor: Editor) => ownership(editor).map((row) => row.name);
const block = (editor: Editor, index: number) => editor.state.doc.child(index);
const json = (editor: Editor) => editor.getJSON();

function select(editor: Editor, from: [string, number], to: [string, number]) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(
        editor.state.doc,
        textStart(editor, from[0]) + from[1],
        textStart(editor, to[0]) + to[1],
      ),
    ),
  );
}

/** The change `act` makes is one undo step; undo gives back exactly what was there, and redo the change. */
function expectOneStep(editor: Editor, act: () => void) {
  const original = json(editor);
  const depth = undoDepth(editor.state);
  act();
  const changed = json(editor);
  expect(changed).not.toEqual(original);
  expect(undoDepth(editor.state)).toBe(depth + 1);
  undo(editor.state, editor.view.dispatch);
  expect(json(editor)).toEqual(original);
  redo(editor.state, editor.view.dispatch);
  expect(json(editor)).toEqual(changed);
}

/** The block (by name) holding the caret, and how far into it. */
function caretAt(editor: Editor) {
  const { $from } = editor.state.selection;
  const node = $from.node(1);
  return {
    name: node.type.name === "point" ? node.attrs.id : node.textContent,
    offset: $from.parentOffset,
  };
}

describe("Backspace and Delete with a modifier, at a point's edge (defect 1)", () => {
  it.each(["Mod-Backspace", "Shift-Backspace"])(
    "%s at the start of a heading does what Backspace does",
    (key) => {
      const plain = make();
      caret(plain, "p-b");
      press(plain, "Backspace");
      const notices: V4Notice[] = [];
      const editor = make(parentProse, notices);
      caret(editor, "p-b");
      expectOneStep(editor, () => {
        expect(press(editor, key)).toBe(true);
        expect(json(editor)).toEqual(json(plain));
      });
      expect(notices).toEqual([{ code: "point_converted", linked: false }]);
    },
  );

  it("Ctrl+Delete at the end of writing before a point goes into the heading and joins nothing", () => {
    const editor = make();
    const original = json(editor);
    caret(editor, "Belongs to I", "Belongs to I".length);
    expect(press(editor, "Mod-Delete")).toBe(true);
    expect(json(editor)).toEqual(original);
    expect(caretAt(editor)).toEqual({ name: "p-b", offset: 0 });
  });

  it("in the middle of words they are left to the browser, which deletes a word", () => {
    const editor = make();
    caret(editor, "p-b", 5);
    expect(press(editor, "Mod-Backspace")).toBe(false);
    expect(press(editor, "Mod-Delete")).toBe(false);
  });
});

describe("Enter over a selection across blocks (defects 2 and 3)", () => {
  it("from writing into a heading: the selection goes, the point keeps its identity, the caret starts it", () => {
    const editor = make();
    select(editor, ["Body of A", 4], ["p-b", "Subpoint ".length]);
    expectOneStep(editor, () => {
      expect(press(editor, "Enter")).toBe(true);
      expect(names(editor)).toEqual(["p-i", "p-a", "Body", "p-b", "Body of B", "p-ii"]);
      expect(block(editor, 3).textContent).toBe("B");
      expect(caretAt(editor)).toEqual({ name: "p-b", offset: 0 });
      expect(owners(editor)["Body of B"]).toBe("p-b");
    });
  });

  it("from a heading into writing: the writing stays writing, owned as before", () => {
    const editor = make();
    select(editor, ["p-a", 3], ["Body of A", 4]);
    expectOneStep(editor, () => {
      expect(press(editor, "Enter")).toBe(true);
      expect(block(editor, 1).attrs.id).toBe("p-a");
      expect(block(editor, 1).textContent).toBe("Sub");
      expect(block(editor, 2).type.name).toBe("paragraph");
      expect(block(editor, 2).attrs.depth).toBe(2);
      expect(owners(editor)[" of A"]).toBe("p-a");
      expect(allIds(editor)).toEqual(["p-i", "p-a", "p-b", "p-ii"]);
      expect(caretAt(editor)).toEqual({ name: " of A", offset: 0 });
    });
  });

  it("from an introduction's heading into its writing: the role stays, once", () => {
    const editor = make(rolesAnywhere);
    select(editor, ["intro", 2], ["Why this psalm, and why now.", 3]);
    expectOneStep(editor, () => {
      expect(press(editor, "Enter")).toBe(true);
      const intro = editor.state.doc.child(3);
      expect(intro.attrs).toMatchObject({ id: "intro", role: "introduction" });
      expect(intro.textContent).toBe("In");
      expect(editor.state.doc.child(4).textContent).toBe(" this psalm, and why now.");
      let roles = 0;
      editor.state.doc.forEach((node) => {
        if (node.attrs.role === "introduction") roles += 1;
      });
      expect(roles).toBe(1);
    });
  });

  it("from one heading into another: both points stay, and points wholly selected are reported", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    select(editor, ["p-a", 3], ["p-ii", 5]);
    press(editor, "Enter");
    expect(names(editor)).toEqual(["p-i", "p-a", "p-ii"]);
    expect(block(editor, 1).textContent).toBe("Sub");
    expect(block(editor, 2).textContent).toBe("Point II");
    expect(caretAt(editor)).toEqual({ name: "p-ii", offset: 0 });
    expect(notices).toEqual([{ code: "points_deleted", count: 1, linked: false, reparented: 0 }]);
  });

  it("with an inline reference selected in a heading: it is replaced, and the split keeps the original with what follows", () => {
    const editor = make(
      documentV4([
        {
          type: "point",
          attrs: { id: "p", depth: 1, role: null, sourcePointId: "saved-1" },
          content: [
            { type: "text", text: "Alpha " },
            inlineRef("r-1", ref(43, 3, 16)),
            { type: "text", text: " omega" },
          ],
        },
        proseV4("Under it.", 1),
      ]),
    );
    const at = textStart(editor, "p") + "Alpha ".length;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)));
    expectOneStep(editor, () => {
      expect(press(editor, "Enter")).toBe(true);
      expect(block(editor, 0).textContent).toBe("Alpha ");
      expect(block(editor, 0).attrs).toMatchObject({ derivedFrom: "p", sourcePointId: null });
      expect(block(editor, 1).attrs).toMatchObject({ id: "p", sourcePointId: "saved-1" });
      expect(block(editor, 1).textContent).toBe(" omega");
      expect(owners(editor)["Under it."]).toBe("p");
    });
  });
});

describe("dragging within the document (defect 4, and identity on a drag)", () => {
  /** Drags the current selection to `pos` the way ProseMirror would start the drag (its slice). */
  function drop(editor: Editor, pos: number, move = true) {
    const { state } = editor;
    const result = dropTransaction(state, { slice: state.selection.content(), move }, pos, move);
    if (result && result !== "refused") editor.view.dispatch(result);
    return result;
  }

  it("a moved point keeps its ID and everything it owns, and lands at the level where it is put", () => {
    const editor = make();
    select(editor, ["p-b", 0], ["Body of B", "Body of B".length]);
    expectOneStep(editor, () => {
      drop(editor, editor.state.doc.content.size);
      expect(names(editor)).toEqual([
        "p-i",
        "p-a",
        "Body of A",
        "Belongs to I",
        "p-ii",
        "p-b",
        "Body of B",
      ]);
      expect(owners(editor)).toMatchObject({ "p-b": "p-ii", "Body of B": "p-b" });
      expect(allIds(editor).sort()).toEqual(["p-a", "p-b", "p-i", "p-ii"]);
    });
  });

  it("a moved selection that ends inside a heading is removed by the protected deletion", () => {
    const editor = make();
    select(editor, ["Body of A", 4], ["p-b", "Subpoint ".length]);
    const result = drop(editor, editor.state.doc.content.size);
    expect(result).not.toBeNull();
    expect(result).not.toBe("refused");
    const heading = editor.state.doc.child(3);
    expect(heading.attrs.id).toBe("p-b");
    expect(heading.textContent).toBe("B");
    expect(owners(editor)["Body of B"]).toBe("p-b");
    expect(new Set(allIds(editor)).size).toBe(allIds(editor).length);
  });

  it("a copy is a copy: a new ID that remembers the original", () => {
    const editor = make();
    select(editor, ["p-b", 0], ["Body of B", "Body of B".length]);
    drop(editor, editor.state.doc.content.size, false);
    const copy = editor.state.doc.child(7);
    expect(copy.attrs.id).not.toBe("p-b");
    expect(copy.attrs.derivedFrom).toBe("p-b");
    expect(allIds(editor)).toContain("p-b");
  });

  it("a moved introduction keeps its role (it is the only one)", () => {
    const editor = make(rolesAnywhere);
    select(editor, ["intro", 0], ["intro-b", "A small light".length]);
    drop(editor, editor.state.doc.content.size);
    const moved: string[] = [];
    editor.state.doc.forEach((node) => {
      if (node.attrs.role === "introduction") moved.push(node.attrs.id);
    });
    expect(moved).toEqual(["intro"]);
  });
});

describe("the depth limit (defect 7)", () => {
  it("no command goes deeper than the limit, and what the editor makes can be loaded again", () => {
    const editor = make(documentV4([pointV4("p", "P", 1)]));
    caret(editor, "p");
    for (let level = 2; level <= maxDepth; level += 1) {
      expect(run(editor, addPoint("child"))).toBe(true);
    }
    expect(editor.state.doc.lastChild!.attrs.depth).toBe(maxDepth);
    expect(run(editor, addPoint("child"))).toBe(false);
    // A sibling at the limit cannot go under the one before it.
    run(editor, addPoint("sibling"));
    expect(run(editor, increaseLevel)).toBe(false);
    // Writing under the deepest point can be neither a point below it nor deeper.
    press(editor, "Enter");
    expect(editor.state.selection.$from.parent.attrs.depth).toBe(maxDepth);
    expect(run(editor, proseToPoint)).toBe(false);
    expect(run(editor, indentProse)).toBe(false);
    expect(press(editor, "Tab")).toBe(false);
    const restored = restoreV4(json(editor), editor.schema);
    expect(restored.ok).toBe(true);
  });

  it("the guard refuses any other change that would put a depth out of range, and says so", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    const original = json(editor);
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "depth", maxDepth + 1));
    expect(json(editor)).toEqual(original);
    expect(notices).toEqual([{ code: "change_refused" }]);
  });
});

describe("Tab (D1)", () => {
  it.each([
    ["the first subpoint", "p-a"],
    ["a subpoint with its parent's writing before it", "p-b"],
  ])("does nothing to %s and leaves the key to the browser", (_label, name) => {
    const editor = make();
    const original = json(editor);
    caret(editor, name);
    expect(press(editor, "Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });

  it("does nothing to a point with a role", () => {
    const editor = make(rolesAnywhere);
    const original = json(editor);
    caret(editor, "intro");
    expect(press(editor, "Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });

  it("in a list only moves list items: the first item does not take the list with it", () => {
    const editor = make();
    caret(editor, "Body of A", 1);
    editor.commands.toggleBulletList();
    const original = json(editor);
    caret(editor, "Body of A", 1);
    expect(press(editor, "Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });

  it("moves a run of writing into the point above, changing nobody else's owner", () => {
    const editor = make(
      documentV4([
        pointV4("I", "I", 1),
        pointV4("A", "A", 2),
        proseV4("x", 1),
        proseV4("y", 1),
        pointV4("B", "B", 2),
      ]),
    );
    select(editor, ["x", 0], ["y", 1]);
    expectOneStep(editor, () => {
      expect(press(editor, "Tab")).toBe(true);
      expect(owners(editor)).toEqual({ I: null, A: "I", x: "A", y: "A", B: "I" });
    });
  });

  it("does not indent writing when that would give another block a new owner", () => {
    const editor = make(
      documentV4([pointV4("I", "I", 1), pointV4("A", "A", 2), proseV4("p", 1), proseV4("q", 2)]),
    );
    const original = json(editor);
    caret(editor, "p");
    expect(press(editor, "Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });
});

describe("Shift+Tab (D5)", () => {
  it("moves a point out with everything it owns; its parent keeps its own writing and later points", () => {
    const editor = make();
    caret(editor, "p-a", 3);
    expectOneStep(editor, () => {
      expect(press(editor, "Shift-Tab")).toBe(true);
      expect(names(editor)).toEqual([
        "p-i",
        "Belongs to I",
        "p-b",
        "Body of B",
        "p-a",
        "Body of A",
        "p-ii",
      ]);
      expect(owners(editor)).toEqual({
        "p-i": null,
        "Belongs to I": "p-i",
        "p-b": "p-i",
        "Body of B": "p-b",
        "p-a": null,
        "Body of A": "p-a",
        "p-ii": null,
      });
      expect(caretAt(editor)).toEqual({ name: "p-a", offset: 3 });
    });
  });

  it("moves consecutive sibling points out together, in order", () => {
    const editor = make(
      documentV4([
        pointV4("I", "I", 1),
        pointV4("A", "A", 2),
        proseV4("a", 2),
        pointV4("B", "B", 2),
        proseV4("b", 2),
        pointV4("C", "C", 2),
      ]),
    );
    select(editor, ["A", 0], ["b", 1]);
    expect(press(editor, "Shift-Tab")).toBe(true);
    expect(names(editor)).toEqual(["I", "C", "A", "a", "B", "b"]);
    expect(owners(editor)).toEqual({ I: null, C: "I", A: null, a: "A", B: null, b: "B" });
  });

  it("does nothing to points that are not consecutive siblings, or to a main point", () => {
    const editor = make();
    const original = json(editor);
    select(editor, ["p-a", 0], ["p-b", 2]);
    expect(press(editor, "Shift-Tab")).toBe(false);
    caret(editor, "p-i");
    expect(press(editor, "Shift-Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });

  it("brings the last writing of a point up a level where it stands, and nothing else changes", () => {
    const editor = make();
    caret(editor, "Body of A", 2);
    expectOneStep(editor, () => {
      expect(press(editor, "Shift-Tab")).toBe(true);
      expect(names(editor)).toEqual(names(make()));
      expect(owners(editor)).toEqual({ ...owners(make()), "Body of A": "p-i" });
    });
  });

  it("does not outdent writing that has more of its point after it, nor writing at the document's level", () => {
    const editor = make(
      documentV4([
        proseV4("Top", 0),
        pointV4("I", "I", 1),
        pointV4("A", "A", 2),
        proseV4("a1", 2),
        proseV4("a2", 2),
      ]),
    );
    const original = json(editor);
    caret(editor, "a1");
    expect(press(editor, "Shift-Tab")).toBe(false);
    caret(editor, "Top");
    expect(press(editor, "Shift-Tab")).toBe(false);
    expect(json(editor)).toEqual(original);
  });
});

describe("deleting a parent while what it owned survives (defect 8)", () => {
  const deep = documentV4([
    pointV4("I", "I", 1),
    pointV4("A", "A", 2),
    proseV4("a text", 2),
    pointV4("B", "B", 2),
    pointV4("B1", "B1", 3),
    proseV4("b1 text", 3),
    pointV4("B2", "B2 head", 3),
    proseV4("b2 text", 3),
  ]);

  it("nothing is repaired: depths stay, owners follow from order, and the change is reported", () => {
    const notices: V4Notice[] = [];
    const editor = make(deep, notices);
    select(editor, ["a text", 1], ["b1 text", 1]);
    expectOneStep(editor, () => {
      press(editor, "Backspace");
      expect(ownership(editor).map((row) => [row.name, row.depth, row.owner])).toEqual([
        ["I", 1, null],
        ["A", 2, "I"],
        ["a1 text", 2, "A"],
        ["B2", 3, "A"],
        ["b2 text", 3, "B2"],
      ]);
    });
    expect(notices[0]).toEqual({ code: "points_deleted", count: 2, linked: false, reparented: 1 });
  });

  it("the protected deletion reports the same way", () => {
    const notices: V4Notice[] = [];
    const editor = make(deep, notices);
    select(editor, ["a text", 1], ["B2", 1]);
    press(editor, "Backspace");
    expect(notices).toEqual([{ code: "points_deleted", count: 2, linked: false, reparented: 1 }]);
  });
});

describe("deletions the browser makes itself (no key the editor took)", () => {
  /** Sends a `beforeinput` the way the browser does before it edits; true when the editor took it. */
  function beforeInput(editor: Editor, inputType: string) {
    const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("Delete from a context menu or a virtual keyboard at the end of writing before a point joins nothing", () => {
    const editor = make();
    const original = json(editor);
    caret(editor, "Belongs to I", "Belongs to I".length);
    expect(beforeInput(editor, "deleteContentForward")).toBe(true);
    expect(json(editor)).toEqual(original);
    expect(caretAt(editor)).toEqual({ name: "p-b", offset: 0 });
  });

  it("Backspace from one at a heading's start turns the point into writing, as the key does", () => {
    const editor = make();
    caret(editor, "p-b");
    expect(beforeInput(editor, "deleteContentBackward")).toBe(true);
    expect(editor.state.doc.child(4).type.name).toBe("paragraph");
  });

  it("a composition begun over a selection into a heading starts at a caret, the selection deleted the protected way", () => {
    const editor = make();
    select(editor, ["Body of A", 4], ["p-b", "Subpoint ".length]);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(names(editor)).toEqual(["p-i", "p-a", "Body", "p-b", "Body of B", "p-ii"]);
    expect(block(editor, 3).textContent).toBe("B");
    expect(editor.state.selection.empty).toBe(true);
  });

  it("is left to the browser in the middle of words", () => {
    const editor = make();
    caret(editor, "p-b", 4);
    expect(beforeInput(editor, "deleteContentBackward")).toBe(false);
    expect(beforeInput(editor, "deleteWordForward")).toBe(false);
  });

  it("the guard refuses the browser's own merge of a heading into writing, read back as one replacement", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    const original = json(editor);
    // What ProseMirror reads back after the browser merges the two blocks, restyling the heading's words.
    const { schema, doc } = editor.state;
    const from = textStart(editor, "Belongs to I") - 1;
    const pb = doc.child(4);
    const to = textStart(editor, "p-b") - 1 + pb.nodeSize;
    const merged = schema.nodes.paragraph.create({ depth: 1 }, [
      schema.text("Belongs to I"),
      schema.text("Subpoint B", [schema.marks.bold.create()]),
    ]);
    editor.view.dispatch(editor.state.tr.replaceWith(from, to, merged));
    expect(json(editor)).toEqual(original);
    expect(notices).toEqual([{ code: "change_refused" }]);
  });

  it("but lets a point go when its words go too, even beside points that read the same", () => {
    const editor = make(
      documentV4([pointV4("a", "Same", 1), pointV4("b", "Same", 1), pointV4("c", "Same", 1)]),
    );
    const b = editor.state.doc.child(1);
    const pos = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + b.nodeSize));
    expect(allIds(editor)).toEqual(["a", "c"]);
  });
});

describe("points whose words are the same (the guard's text check)", () => {
  const twins = documentV4([
    pointV4("intro", "Same", 1, { role: "introduction", sourcePointId: "s-1" }),
    proseV4("Between", 1),
    pointV4("p", "Same", 1, { sourcePointId: "s-2" }),
    proseV4("After", 1),
  ]);
  const attrsOf = (editor: Editor, id: string) => {
    let found: Record<string, unknown> | null = null;
    editor.state.doc.forEach((node) => {
      if (node.attrs.id === id) found = node.attrs;
    });
    return found;
  };

  it("deleting one of two points that read the same leaves the other's identity, role, and source alone", () => {
    const notices: V4Notice[] = [];
    const editor = make(twins, notices);
    const intro = attrsOf(editor, "intro");
    select(editor, ["Between", "Between".length], ["After", 0]);
    expectOneStep(editor, () => {
      press(editor, "Backspace");
      expect(allIds(editor)).toEqual(["intro"]);
      expect(attrsOf(editor, "intro")).toEqual(intro);
      expect(names(editor)).toEqual(["intro", "BetweenAfter"]);
    });
    expect(notices[0]).toEqual({ code: "points_deleted", count: 1, linked: true, reparented: 0 });
  });

  it("turning one of them into writing leaves the other a point, with everything it had", () => {
    const editor = make(twins);
    const intro = attrsOf(editor, "intro");
    caret(editor, "p");
    expectOneStep(editor, () => {
      press(editor, "Backspace");
      expect(allIds(editor)).toEqual(["intro"]);
      expect(attrsOf(editor, "intro")).toEqual(intro);
    });
  });

  it("the browser's own merge of two such points is still refused: the words of one survive in the other", () => {
    const notices: V4Notice[] = [];
    const editor = make(documentV4([pointV4("a", "Same", 1), pointV4("b", "Same", 1)]), notices);
    const original = json(editor);
    const { schema, doc } = editor.state;
    const merged = schema.nodes.point.create({ id: "a", depth: 1 }, schema.text("SameSame"));
    editor.view.dispatch(editor.state.tr.replaceWith(0, doc.content.size, merged));
    expect(json(editor)).toEqual(original);
    expect(notices).toEqual([{ code: "change_refused" }]);
  });

  it("where the browser's result reads exactly as the point deleted, it is let through, reported, and undone whole", () => {
    // Text cannot tell which of two identical stretches went: the one ambiguity the check accepts.
    // It is reached only by an edit the browser makes with no key or input event the editor routes.
    const notices: V4Notice[] = [];
    const editor = make(
      documentV4([
        pointV4("intro", "Intro", 1, { role: "introduction" }),
        proseV4("Same", 1),
        pointV4("p", "Same", 1, { sourcePointId: "s-2" }),
        proseV4("After", 1),
      ]),
      notices,
    );
    const original = json(editor);
    const { schema } = editor.state;
    const from = textStart(editor, "Same") - 1;
    const to = textStart(editor, "p") - 1 + editor.state.doc.child(2).nodeSize;
    const rewritten = schema.nodes.paragraph.create({ depth: 1 }, schema.text("Same"));
    editor.view.dispatch(editor.state.tr.replaceWith(from, to, rewritten));
    expect(allIds(editor)).toEqual(["intro"]);
    // "After" belonged to p and now belongs to the introduction: that is reported too.
    expect(notices).toEqual([{ code: "points_deleted", count: 1, linked: true, reparented: 1 }]);
    undo(editor.state, editor.view.dispatch);
    expect(json(editor)).toEqual(original);
  });
});

describe("the guard is the last line, and quiet where it should be", () => {
  it("a built-in change that would break a point is refused and reported once", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    const original = json(editor);
    select(editor, ["Body of A", 4], ["p-b", 3]);
    editor.view.dispatch(editor.state.tr.deleteSelection());
    expect(json(editor)).toEqual(original);
    expect(notices).toEqual([{ code: "change_refused" }]);
  });

  it("says nothing for a composition's change, or for the deletion a cut makes before its own", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    select(editor, ["Body of A", 4], ["p-b", 3]);
    editor.view.dispatch(editor.state.tr.deleteSelection().setMeta("composition", 1));
    editor.view.dispatch(editor.state.tr.deleteSelection().setMeta("uiEvent", "cut"));
    expect(notices).toEqual([]);
  });

  it("ordinary edits under a point report nothing", () => {
    const notices: V4Notice[] = [];
    const editor = make(parentProse, notices);
    caret(editor, "Body of A", 2);
    editor.commands.toggleBulletList();
    editor.commands.toggleBulletList();
    caret(editor, "Belongs to I", 4);
    press(editor, "Enter");
    caret(editor, "Body of B");
    press(editor, "Backspace");
    expect(notices).toEqual([]);
  });
});
