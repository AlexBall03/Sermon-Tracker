import { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { printLayoutOf } from "../pagination/plugin";
import { isPrinting } from "../pagination/printing";
import { labExtensions } from "../schema/extensions";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, pointV4, proseV4 } from "./fixtures";

/*
 * BUG-010: a print is always in Print Layout. An editor in Regular Layout is
 * put in Print Layout for the print by the Paginator's own `beforeprint`, as
 * view state, and given its layout back on `afterprint`. The document, its
 * history, and every save stay untouched: nothing but metadata transactions.
 */

const editors: Editor[] = [];
function open() {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset: "balanced" }) });
  const loaded = loadV4(
    editor,
    documentV4([
      pointV4("p-1", "The lamp", 1),
      proseV4("Light for the next step.", 1),
      pointV4("p-1a", "One step", 2),
    ]),
    "doc-print",
  );
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

const layoutOf = (editor: Editor) => printLayoutOf(editor.state)?.layout;

describe("printing (BUG-010)", () => {
  it("prints an editor in Regular Layout in Print Layout, then gives its layout back", () => {
    const editor = open();
    editor.commands.setLayout("regular");
    expect(editor.view.dom.getAttribute("data-layout")).toBe("regular");
    const doc = editor.state.doc;
    const depth = undoDepth(editor.state);
    const changes: boolean[] = [];
    editor.on("transaction", ({ transaction }) => changes.push(transaction.docChanged));

    window.dispatchEvent(new Event("beforeprint"));
    expect(layoutOf(editor)).toBe("print");
    // The print stylesheet draws only an editor in Print Layout: the attribute is there at once.
    expect(editor.view.dom.getAttribute("data-layout")).toBe("print");
    expect(isPrinting(editor.state)).toBe(true);

    window.dispatchEvent(new Event("afterprint"));
    expect(layoutOf(editor)).toBe("regular");
    expect(editor.view.dom.getAttribute("data-layout")).toBe("regular");
    expect(isPrinting(editor.state)).toBe(false);

    // Never a document change, a history step, or anything a save would see.
    expect(editor.state.doc).toBe(doc);
    expect(undoDepth(editor.state)).toBe(depth);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((changed) => !changed)).toBe(true);
  });

  it("leaves the v3 lab, the unchanged baseline, printing as it flows", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const lab = new Editor({ element, extensions: labExtensions() });
    editors.push(lab);
    lab.commands.setLayout("regular");
    window.dispatchEvent(new Event("beforeprint"));
    expect(layoutOf(lab)).toBe("regular");
    window.dispatchEvent(new Event("afterprint"));
    expect(layoutOf(lab)).toBe("regular");
  });

  it("leaves an editor already in Print Layout in it", () => {
    const editor = open();
    editor.commands.setLayout("print");
    window.dispatchEvent(new Event("beforeprint"));
    expect(layoutOf(editor)).toBe("print");
    window.dispatchEvent(new Event("afterprint"));
    expect(layoutOf(editor)).toBe("print");
    expect(isPrinting(editor.state)).toBe(false);
  });
});
