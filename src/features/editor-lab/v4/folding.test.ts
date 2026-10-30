import { Editor } from "@tiptap/core";
import { undo, undoDepth } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { editorSource } from "@/features/sermon-editor/persistence/autosave/editor-adapter";
import { sessionWriteGuard } from "@/features/sermon-editor/persistence/session/write-guard";
import { expansionKey } from "../pagination/expansion";
import { printingKey } from "../pagination/printing";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, noteV4, passageV4, pointV4, proseV4 } from "./fixtures";
import { foldingKey, foldingOf, foldTargetAtCaret, type FoldingOptions } from "./folding";
import { caret, nameOf, press, textStart } from "./testing";

/*
 * A3.1, folding points: view state only. What a folded point hides is what
 * it owns by the ownership analysis; nothing folds, unfolds, or moves the
 * caret except as the rules in `folding.ts` say; and no fold is ever a
 * document change, an undo step, or a save.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

const john = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };

const sermon = () =>
  documentV4([
    proseV4("Opening words", 0),
    pointV4("p-1", "Grace", 1),
    proseV4("Under grace", 1),
    passageV4("s-1", john, 1),
    noteV4("n-1", "Pause", 1),
    pointV4("p-1a", "Free", 2),
    proseV4("Under free", 2),
    pointV4("p-1b", "Undeserved", 2),
    proseV4("Back to grace", 1),
    pointV4("p-2", "Hope", 1),
    proseV4("Under hope", 1),
    proseV4("Closing words", 0),
    pointV4("p-3", "Empty", 1),
  ]);

function make(
  options: Partial<FoldingOptions> & { canEdit?: () => boolean } = {},
  content = sermon(),
) {
  const { canEdit, ...folding } = options;
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...labV4Extensions({
        newId: (() => {
          let n = 0;
          return () => `new-${(n += 1)}`;
        })(),
        folding,
      }),
      ...(canEdit ? [sessionWriteGuard(canEdit)] : []),
    ],
  });
  open.push(editor);
  const loaded = loadV4(editor, content, "doc");
  if (!loaded.ok) throw new Error("refused");
  return editor;
}

/** The names of the top-level blocks drawn hidden. */
function hidden(editor: Editor): string[] {
  const names: string[] = [];
  const children = [...editor.view.dom.children].filter(
    (el) => !el.classList.contains("lab-pages"),
  );
  editor.state.doc.forEach((node, _pos, index) => {
    if (children[index]?.hasAttribute("data-folded")) {
      names.push(typeof node.attrs.id === "string" ? node.attrs.id : nameOf(node));
    }
  });
  return names;
}

const fold = (editor: Editor, id: string, folded = true) =>
  editor.commands.setPointFolded(id, folded);

describe("what a folded point hides", () => {
  it("hides everything it owns, and nothing else", () => {
    const editor = make();
    expect(fold(editor, "p-1")).toBe(true);
    expect(hidden(editor)).toEqual([
      "Under grace",
      "s-1",
      "n-1",
      "p-1a",
      "Under free",
      "p-1b",
      "Back to grace",
    ]);
    // Its heading, its sibling, and the document's own writing after it stay.
    const children = [...editor.view.dom.children];
    expect(children.some((el) => el.getAttribute("data-fold") === "closed")).toBe(true);
  });

  it("depth-0 writing after a group is never the group's", () => {
    const editor = make();
    fold(editor, "p-2");
    expect(hidden(editor)).toEqual(["Under hope"]);
  });

  it("a point that owns nothing cannot fold", () => {
    const editor = make();
    expect(fold(editor, "p-3")).toBe(false);
    expect(fold(editor, "p-1b")).toBe(false);
    expect(foldingOf(editor.state)).toEqual({ foldable: 3, folded: 0 });
  });

  it("keeps a child's fold when its parent unfolds", () => {
    const editor = make();
    fold(editor, "p-1a");
    fold(editor, "p-1");
    fold(editor, "p-1", false);
    expect(hidden(editor)).toEqual(["Under free"]);
    expect(foldingOf(editor.state).folded).toBe(1);
  });

  it("collapses and expands all", () => {
    const editor = make();
    expect(editor.commands.setAllPointsFolded(false)).toBe(false);
    expect(editor.commands.setAllPointsFolded(true)).toBe(true);
    expect(foldingOf(editor.state)).toEqual({ foldable: 3, folded: 3 });
    expect(editor.commands.setAllPointsFolded(true)).toBe(false);
    expect(hidden(editor)).toContain("Under hope");
    expect(editor.commands.setAllPointsFolded(false)).toBe(true);
    expect(hidden(editor)).toEqual([]);
  });

  it("an irregular document still hides only what each point owns", () => {
    const editor = make(
      {},
      documentV4([
        pointV4("a", "Deep first", 3),
        proseV4("Under deep", 3),
        pointV4("b", "Shallow", 1),
        proseV4("Under shallow", 2),
      ]),
    );
    fold(editor, "a");
    expect(hidden(editor)).toEqual(["Under deep"]);
    fold(editor, "b");
    expect(hidden(editor)).toEqual(["Under deep", "Under shallow"]);
  });
});

describe("folding is view state, never the document", () => {
  it("changes no JSON, no history, no save, and passes a guard that refuses edits", () => {
    let allowed = false;
    const editor = make({ canEdit: () => allowed });
    const onChange = vi.fn();
    const stop = editorSource(editor).subscribe(onChange, () => undefined);
    const json = editor.getJSON();
    const depth = undoDepth(editor.state);
    const changed: boolean[] = [];
    editor.on("transaction", ({ transaction }) => changed.push(transaction.docChanged));

    fold(editor, "p-1");
    editor.commands.setAllPointsFolded(true);
    editor.commands.setAllPointsFolded(false);
    fold(editor, "p-2");
    // The guard refuses edits, not view state.
    expect(foldingOf(editor.state).folded).toBe(1);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((value) => !value)).toBe(true);
    expect(editor.getJSON()).toEqual(json);
    expect(undoDepth(editor.state)).toBe(depth);
    expect(onChange).not.toHaveBeenCalled();
    stop();
    allowed = true;
  });

  it("undo undoes the writing, never a fold", () => {
    const editor = make();
    caret(editor, "Under hope", 10);
    editor.commands.insertContent("!");
    fold(editor, "p-1");
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.textContent).not.toContain("Under hope!");
    expect(foldingOf(editor.state).folded).toBe(1);
  });

  it("keeps hidden content in the document for copying and serializing", () => {
    const editor = make();
    editor.commands.setAllPointsFolded(true);
    expect(editor.getText()).toContain("Under free");
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
    expect(slice.content.textBetween(0, slice.content.size, "\n")).toContain("Back to grace");
  });

  it("draws nothing folded while the browser prints, and folds again after", () => {
    const editor = make();
    fold(editor, "p-1");
    editor.view.dispatch(editor.state.tr.setMeta(printingKey, true));
    expect(hidden(editor)).toEqual([]);
    expect(editor.view.dom.querySelector(".lab-fold-toggle")).toBeNull();
    editor.view.dispatch(editor.state.tr.setMeta(printingKey, false));
    expect(hidden(editor)).toContain("Under grace");
  });

  it("never touches Scripture expansion, nor expansion folding", () => {
    const editor = make();
    editor.commands.setPassagesExpanded(true);
    editor.commands.setAllPointsFolded(true);
    editor.commands.setAllPointsFolded(false);
    expect(expansionKey.getState(editor.state)?.ids.has("s-1")).toBe(true);
    editor.commands.setPassagesExpanded(false);
    fold(editor, "p-1");
    editor.commands.setPassagesCollapsedInPrint(true);
    expect(foldingOf(editor.state).folded).toBe(1);
  });
});

describe("the selection", () => {
  it("is moved to the folded heading only when what it is in is folded away", () => {
    const editor = make();
    caret(editor, "Under free", 3);
    fold(editor, "p-1");
    const { $from } = editor.state.selection;
    expect($from.parent.attrs.id).toBe("p-1");
    expect($from.parentOffset).toBe("Grace".length);
  });

  it("goes to the outermost folded heading when all are collapsed", () => {
    const editor = make();
    caret(editor, "Under free", 3);
    editor.commands.setAllPointsFolded(true);
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-1");
  });

  it("is left exactly where it is when it stays visible", () => {
    const editor = make();
    caret(editor, "Under hope", 4);
    const before = editor.state.selection.toJSON();
    fold(editor, "p-1");
    editor.commands.setAllPointsFolded(false);
    expect(editor.state.selection.toJSON()).toEqual(before);
    caret(editor, "p-1", 2);
    const inHeading = editor.state.selection.toJSON();
    fold(editor, "p-1");
    expect(editor.state.selection.toJSON()).toEqual(inHeading);
  });

  it("typing in a folded heading keeps it folded and the caret where it is", () => {
    const editor = make();
    fold(editor, "p-1");
    caret(editor, "p-1", 5);
    editor.commands.insertContent(" abounds");
    expect(foldingOf(editor.state).folded).toBe(1);
    expect(editor.state.selection.$from.parent.textContent).toBe("Grace abounds");
    expect(hidden(editor)).toContain("Under grace");
  });

  it("an edit that puts the caret in folded content unfolds only the points hiding it", () => {
    const editor = make();
    fold(editor, "p-1");
    fold(editor, "p-2");
    caret(editor, "p-1", 5);
    // Enter at the end of a heading: a first line of writing, inside the folded group.
    press(editor, "Enter");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(foldingOf(editor.state).folded).toBe(1);
    expect(foldingKey.getState(editor.state)?.folded.has("p-2")).toBe(true);
    expect(hidden(editor)).toEqual(["Under hope"]);
  });

  it("a selection moved into folded content goes past it, the way it was going", () => {
    const editor = make();
    fold(editor, "p-2");
    caret(editor, "p-2", 2);
    const passage = textStart(editor, "Under hope") - 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, passage + 1)),
    );
    expect(editor.state.selection.$from.parent.textContent).toBe("Closing words");
  });

  it("a hidden passage selected from above goes past it too", () => {
    const editor = make();
    fold(editor, "p-1");
    caret(editor, "Opening words", 0);
    let pos = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.attrs.id === "s-1") pos = offset;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    expect(hidden(editor)).toContain("s-1");
    expect(editor.state.selection.$from.parent.attrs.id).toBe("p-2");
  });
});

describe("remembering folds", () => {
  it("opens with the remembered folds, ignoring IDs that are not foldable points", () => {
    const editor = make({ initial: () => ["p-2", "missing", "p-3"] });
    expect([...(foldingKey.getState(editor.state)?.folded ?? [])]).toEqual(["p-2"]);
    expect(hidden(editor)).toEqual(["Under hope"]);
  });

  it("tells each change, and a failing store never stops the editor", () => {
    const onChange = vi.fn(() => {
      throw new Error("quota");
    });
    const editor = make({ onChange });
    fold(editor, "p-1");
    expect(onChange).toHaveBeenLastCalledWith(["p-1"]);
    editor.commands.setAllPointsFolded(false);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("an initial value that throws opens with nothing folded", () => {
    const editor = make({
      initial: () => {
        throw new Error("blocked");
      },
    });
    expect(foldingOf(editor.state).folded).toBe(0);
  });

  it("forgets a fold whose point no longer owns anything", () => {
    const onChange = vi.fn();
    const editor = make({ onChange });
    fold(editor, "p-2");
    // Delete "Under hope": p-2 owns nothing now.
    let from = -1;
    let to = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.textContent === "Under hope") {
        from = offset;
        to = offset + node.nodeSize;
      }
    });
    editor.view.dispatch(editor.state.tr.delete(from, to));
    expect(foldingOf(editor.state).folded).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("foldTargetAtCaret", () => {
  it("is the nearest point that owns something, the caret's own or its owner", () => {
    const editor = make();
    caret(editor, "Under free", 1);
    expect(foldTargetAtCaret(editor.state)).toEqual({ id: "p-1a", folded: false });
    caret(editor, "p-1b", 1);
    expect(foldTargetAtCaret(editor.state)).toEqual({ id: "p-1", folded: false });
    caret(editor, "Opening words", 1);
    expect(foldTargetAtCaret(editor.state)).toBeNull();
  });
});
