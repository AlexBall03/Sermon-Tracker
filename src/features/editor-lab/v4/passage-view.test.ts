import { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readerHref, referenceLocation } from "@/features/scripture/reader-location";
import type { ScriptureReference } from "@/features/scripture/reference";
import { expansionKey } from "../pagination/expansion";
import { printingKey } from "../pagination/printing";
import type { PassageLink } from "../schema/scripture";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, passageV4, pointV4, proseV4 } from "./fixtures";

/*
 * A3.1 on a passage: Scripture collapsed on screen in Print Layout (its own
 * view state, apart from Regular Layout's expansion and from folding), and
 * the way from a passage to the Bible reader.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

const john: ScriptureReference = {
  book: 43,
  chapterStart: 3,
  verseStart: 16,
  chapterEnd: null,
  verseEnd: 18,
};
const romans: ScriptureReference = {
  book: 45,
  chapterStart: 8,
  verseStart: 38,
  chapterEnd: 9,
  verseEnd: 2,
};

const content = () =>
  documentV4([
    pointV4("p-1", "Grace", 1),
    passageV4("s-1", john, 1),
    proseV4("Between", 1),
    passageV4("s-2", romans, 1),
  ]);

function make(openInBible: PassageLink | null = null) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labV4Extensions({ openInBible }),
  });
  open.push(editor);
  // Attached, as on a page, so clicks reach the node views' own listeners.
  document.body.append(editor.view.dom);
  expect(loadV4(editor, content(), "doc").ok).toBe(true);
  return editor;
}

const passages = (editor: Editor) => [
  ...editor.view.dom.querySelectorAll<HTMLElement>(".lab-passage"),
];

const outline = "6a8f3c62-2b7f-4f43-9a3e-6a0bd7e0b6f1";
const link = (navigate = vi.fn()): PassageLink => ({
  href: (reference) => readerHref(referenceLocation(reference, { outline })),
  label: (name) => `Open ${name} in the Bible`,
  title: "Open in the Bible",
  navigate,
});

describe("Scripture collapsed in Print Layout", () => {
  it("is its own view state: Regular's expansion and the document are untouched", () => {
    const editor = make();
    editor.commands.setPassagesExpanded(true);
    const json = editor.getJSON();
    const depth = undoDepth(editor.state);
    const changed: boolean[] = [];
    editor.on("transaction", ({ transaction }) => changed.push(transaction.docChanged));

    editor.commands.setPassagesCollapsedInPrint(true);
    const state = expansionKey.getState(editor.state)!;
    expect([...state.collapsed].sort()).toEqual(["s-1", "s-2"]);
    expect([...state.ids].sort()).toEqual(["s-1", "s-2"]);
    expect(passages(editor).every((el) => el.hasAttribute("data-collapsed"))).toBe(true);
    expect(passages(editor).every((el) => el.hasAttribute("data-expanded"))).toBe(true);

    editor.commands.setPassagesCollapsedInPrint(false);
    expect(passages(editor).some((el) => el.hasAttribute("data-collapsed"))).toBe(false);
    expect(changed.every((value) => !value)).toBe(true);
    expect(editor.getJSON()).toEqual(json);
    expect(undoDepth(editor.state)).toBe(depth);
  });

  it("is never drawn while the browser prints, so `print` alone decides", () => {
    const editor = make();
    editor.commands.setPassagesExpanded(true);
    editor.commands.setPassagesCollapsedInPrint(true);
    editor.view.dispatch(editor.state.tr.setMeta(printingKey, true));
    expect(passages(editor).some((el) => el.hasAttribute("data-collapsed"))).toBe(false);
    // Regular Layout's expansion is not a print setting and stays as it was.
    expect(passages(editor).every((el) => el.hasAttribute("data-expanded"))).toBe(true);
    expect(passages(editor).every((el) => el.getAttribute("data-print") === "full")).toBe(true);
    editor.view.dispatch(editor.state.tr.setMeta(printingKey, false));
    expect(passages(editor).every((el) => el.hasAttribute("data-collapsed"))).toBe(true);
  });
});

describe("Open in the Bible", () => {
  it("is not drawn where the page gives no way (previews, the lab)", () => {
    const editor = make();
    expect(editor.view.dom.querySelector(".lab-passage-open")).toBeNull();
  });

  it("is a real link to the reader with the outline as the way back, the range kept", () => {
    const editor = make(link());
    const anchors = [...editor.view.dom.querySelectorAll<HTMLAnchorElement>(".lab-passage-open")];
    expect(anchors).toHaveLength(2);
    expect(anchors[0].getAttribute("href")).toBe(
      `/bible?book=43&chapter=3&verse=16&through=18&outline=${outline}`,
    );
    // A passage across chapters opens at its first verse, in its first chapter.
    expect(anchors[1].getAttribute("href")).toBe(
      `/bible?book=45&chapter=8&verse=38&through=39&outline=${outline}`,
    );
    expect(anchors[0].getAttribute("aria-label")).toBe("Open John 3:16–18 in the Bible");
    expect(anchors[0].getAttribute("contenteditable")).toBe("false");
    // Nothing of it is the document's.
    expect(JSON.stringify(editor.getJSON())).not.toContain("bible");
  });

  it("goes there once on a plain click, through the page's own navigation", () => {
    const navigate = vi.fn();
    const editor = make(link(navigate));
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>(".lab-passage-open")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(click);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      `/bible?book=43&chapter=3&verse=16&through=18&outline=${outline}`,
    );
    expect(click.defaultPrevented).toBe(true);
  });

  it("leaves a click someone else stopped (the leave guard) or a modified click alone", () => {
    const navigate = vi.fn();
    const editor = make(link(navigate));
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>(".lab-passage-open")!;
    // The leave guard listens on the document in the capture phase and stops the click first.
    const guard = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", guard, true);
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.removeEventListener("click", guard, true);
    expect(navigate).not.toHaveBeenCalled();

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(modified);
    expect(navigate).not.toHaveBeenCalled();
    expect(modified.defaultPrevented).toBe(false);
  });

  it("is kept from ProseMirror: pressing it neither selects the passage nor moves the caret", () => {
    const editor = make(link());
    const before = editor.state.selection.toJSON();
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>(".lab-passage-open")!;
    anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(editor.state.selection.toJSON()).toEqual(before);
  });
});
