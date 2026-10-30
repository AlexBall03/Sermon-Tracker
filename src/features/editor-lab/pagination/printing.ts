import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

/*
 * Printing and view-only reflow (A3.1). Two things the editor's view state
 * needs from the pages, and nothing else:
 *
 * - `printing`: true from the browser's `beforeprint` to its `afterprint`.
 *   While it is, every screen-only view state that hides content (folded
 *   points, Scripture collapsed in Print Layout) draws nothing, so a print
 *   always has the whole document, each passage exactly as its `print`
 *   setting says. The Paginator (`plugin.ts`) sets it and measures the pages
 *   again in the same handler, synchronously, before the browser lays out
 *   the print: Chromium's own print and PDF pipeline runs `beforeprint` with
 *   the screen's media and layout still in force (measured in A3.1), so the
 *   pages printed are the pages of the complete document.
 * - `version`: moved by any transaction that carries `relayoutMeta`, so the
 *   Paginator measures again at once when view state alone changes what is
 *   drawn (a point folded, Scripture collapsed), as it does for a document
 *   change, instead of a frame late.
 *
 * Neither is ever the document's: both are metadata transactions with no
 * steps and no history, which the write guard and autosave pass over.
 */

export type PrintingState = { printing: boolean; version: number };

export const printingKey = new PluginKey<PrintingState>("labPrinting");

/** Marks a view-only transaction that changes what is drawn, so the pages are measured again. */
export const relayoutMeta = "labRelayout";

/** Whether the browser is printing this editor now. */
export const isPrinting = (state: EditorState): boolean =>
  printingKey.getState(state)?.printing ?? false;

/** A view-only transaction: no history, and the pages measured again. */
export const viewOnly = (tr: Transaction): Transaction =>
  tr.setMeta("addToHistory", false).setMeta(relayoutMeta, true);

export const PrintPreparation = Extension.create({
  name: "printPreparation",

  addProseMirrorPlugins() {
    return [
      new Plugin<PrintingState>({
        key: printingKey,
        state: {
          init: () => ({ printing: false, version: 0 }),
          apply(tr, previous) {
            const printing = tr.getMeta(printingKey) as boolean | undefined;
            const relayout = tr.getMeta(relayoutMeta) === true;
            if (printing === undefined && !relayout) return previous;
            if (printing !== undefined && printing === previous.printing && !relayout) {
              return previous;
            }
            return { printing: printing ?? previous.printing, version: previous.version + 1 };
          },
        },
      }),
    ];
  },
});
