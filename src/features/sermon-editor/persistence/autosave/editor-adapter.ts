import type { Editor, EditorEvents } from "@tiptap/core";

import type { DocumentSource } from "./model";

/*
 * The editor as a `DocumentSource` (A2.3B.1): the only part of autosave that
 * knows Tiptap. It uses the editor's public events and nothing else, keeps no
 * copy of the document, and writes nothing.
 *
 * - A change is a transaction, or one appended to it, with `docChanged`:
 *   typing, structure, Scripture, notes, scripts, page breaks, document
 *   attributes (numbering, presentation preset, appearance), Undo, and Redo
 *   are all steps. Selection, focus, and view state (Scripture expansion,
 *   Regular or Print, a preview of appearance) are transactions with meta
 *   only, and are not changes. Whether a change altered anything is the
 *   controller's to decide, once, at its snapshot boundary.
 * - The source ends on the editor's `destroy` event, which Tiptap emits
 *   before the view goes, so the last snapshot can still be read.
 *
 * Attach it once the editor holds an accepted document, from
 * `SermonWorkspace`'s `onReady` (which a refused document never calls):
 *
 *   onReady={(editor) => {
 *     controller = createAutosaveController({ owner, outlineId, revision, source: editorSource(editor) });
 *   }}
 */

/** Thrown by `read` once the editor is destroyed. */
export class SourceGone extends Error {
  constructor() {
    super("The editor is no longer available.");
    this.name = "SourceGone";
  }
}

export function editorSource(editor: Editor): DocumentSource {
  return {
    subscribe(onChange, onEnd) {
      let live = true;
      const transaction = ({
        transaction: tr,
        appendedTransactions,
      }: EditorEvents["transaction"]) => {
        if (!live) return;
        if (tr.docChanged || appendedTransactions.some((appended) => appended.docChanged))
          onChange();
      };
      const destroy = () => {
        if (!live) return;
        stop();
        onEnd();
      };
      const stop = () => {
        if (!live) return;
        live = false;
        editor.off("transaction", transaction);
        editor.off("destroy", destroy);
      };
      editor.on("transaction", transaction);
      editor.on("destroy", destroy);
      return stop;
    },
    read() {
      if (editor.isDestroyed) throw new SourceGone();
      return editor.getJSON();
    },
  };
}
