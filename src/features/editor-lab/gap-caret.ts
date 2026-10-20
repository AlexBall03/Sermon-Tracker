import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/*
 * The caret between blocks (PS-1B.2B.2B): where the selection is a gap
 * cursor (before or after a section or a point, `outline-commands.ts`), a
 * caret is drawn where the new line would appear if Enter were pressed. It is
 * at the left edge of the writing at that depth, as tall as a line of
 * ordinary text, and in the white space between the two blocks: just below
 * what comes before and above what comes after. A block's own top padding,
 * a point's number, and a section's rule are never under it.
 *
 * ProseMirror's own gap cursor element stays (hidden, `lab.css`): it marks
 * the place and takes no space. This caret is drawn outside the document, in
 * the editor's wrapper, and is measured in a frame after the change (after
 * Print Layout has placed its pages), on a resize, on focus, and when fonts
 * arrive; it changes nothing in the document and is never printed.
 */

/**
 * Where a block's visible content begins and ends: a block drawn with a
 * rule or a bar (a section, a quotation, a passage) ends at its box, which
 * the rule or bar spans; any other block at its first and last lines of text.
 */
function visibleEdge(element: HTMLElement, side: "top" | "bottom"): number {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const borders = [
    style.borderTopWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
    style.borderRightWidth,
  ];
  if (borders.some((width) => Number.parseFloat(width) > 0))
    return side === "top" ? box.top : box.bottom;
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = element.ownerDocument.createRange();
  let edge: number | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node as Text).data.trim()) continue;
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    if (rects.length === 0) continue;
    if (side === "top") return rects[0].top;
    edge = rects[rects.length - 1].bottom;
  }
  return edge ?? (side === "top" ? box.top : box.bottom);
}

class GapCaretView {
  private readonly caret: HTMLElement;
  private frame = 0;
  private readonly redraw = () => this.schedule();

  constructor(private view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.caret = doc.createElement("div");
    this.caret.className = "lab-gap-caret";
    this.caret.setAttribute("aria-hidden", "true");
    this.caret.hidden = true;
    view.dom.parentElement?.append(this.caret);
    view.dom.addEventListener("focus", this.redraw);
    view.dom.addEventListener("blur", this.redraw);
    doc.defaultView?.addEventListener("resize", this.redraw);
    doc.fonts?.addEventListener?.("loadingdone", this.redraw);
    this.schedule();
  }

  update(view: EditorView) {
    this.view = view;
    this.schedule();
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    const doc = this.view.dom.ownerDocument;
    this.view.dom.removeEventListener("focus", this.redraw);
    this.view.dom.removeEventListener("blur", this.redraw);
    doc.defaultView?.removeEventListener("resize", this.redraw);
    doc.fonts?.removeEventListener?.("loadingdone", this.redraw);
    this.caret.remove();
  }

  private schedule() {
    if (this.frame || typeof requestAnimationFrame === "undefined") return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const { view, caret } = this;
    const selection = view.state.selection;
    const host = view.dom.parentElement;
    if (!(selection instanceof GapCursor) || !view.hasFocus() || !host || !view.dom.isConnected) {
      caret.hidden = true;
      return;
    }
    if (caret.parentElement !== host) host.append(caret);
    const $gap = selection.$head;
    const element = (pos: number) => {
      const node = view.nodeDOM(pos);
      return node instanceof HTMLElement ? node : null;
    };
    const before = $gap.nodeBefore ? element($gap.pos - $gap.nodeBefore.nodeSize) : null;
    const after = $gap.nodeAfter ? element($gap.pos) : null;
    const reference = after ?? before;
    if (!reference) {
      caret.hidden = true;
      return;
    }

    // A line of ordinary text: the editor's own size, which is Normal Text's.
    const rootStyle = getComputedStyle(view.dom);
    const fontSize = Number.parseFloat(rootStyle.fontSize) || 16;
    const height = fontSize * 1.25;
    // Print Layout scales the sheet; the caret is placed in the sheet's own pixels.
    const scale = view.dom.getBoundingClientRect().width / (view.dom.offsetWidth || 1) || 1;
    const lineGap = 4 * scale;
    const tall = height * scale;

    let top: number;
    let drawn = height;
    if (before && after) {
      const above = visibleEdge(before, "bottom");
      const below = visibleEdge(after, "top");
      const space = below - above;
      // A narrow space (two boxes close together) gets a shorter caret, so it touches neither.
      drawn = Math.max(10, Math.min(height, (space - lineGap) / scale));
      const size = drawn * scale;
      // In the middle of the space between them; where that space is large (a page gap), just above what follows.
      top = space <= size * 2.5 ? above + (space - size) / 2 : below - size - lineGap;
    } else if (after) {
      top = visibleEdge(after, "top") - tall - lineGap;
    } else {
      top = visibleEdge(before!, "bottom") + lineGap;
    }
    const left = reference.getBoundingClientRect().left;
    const origin = host.getBoundingClientRect();
    caret.style.left = `${(left - origin.left) / scale}px`;
    caret.style.top = `${(top - origin.top) / scale}px`;
    caret.style.height = `${drawn}px`;
    // Start the blink again where the caret moved to, as a text caret does.
    const moved = caret.dataset.at !== String($gap.pos);
    caret.dataset.at = String($gap.pos);
    caret.hidden = false;
    if (moved) {
      caret.style.animation = "none";
      void caret.offsetWidth;
      caret.style.animation = "";
    }
  }
}

export const GapCaret = Extension.create({
  name: "gapCaret",
  addProseMirrorPlugins() {
    return [new Plugin({ view: (view) => new GapCaretView(view) })];
  },
});
