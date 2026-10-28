import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/*
 * The editor's write guard (A2.3B.3): a session that may not edit cannot
 * change the document, whatever the route. Every change to a ProseMirror
 * document is a transaction with steps (typing, paste, drop, commands, Undo
 * and Redo, document attributes, a plugin's appended transaction), and this
 * refuses any of them (`docChanged`) unless `canEdit()` says yes at that
 * moment. Selection, focus, and view state change no document and pass.
 *
 * There is no exception and no metadata that lets a transaction through.
 * Loading a document (`loadV4`) replaces the editor's state rather than
 * dispatching a transaction, so it needs none. `setEditable(false)` is only
 * the view's hint; this is the boundary.
 *
 * Added after the schema, like the editor's other behaviour; it changes
 * nothing in the schema.
 */

export const writeGuardKey = new PluginKey("sermonWriteGuard");

export function sessionWriteGuard(canEdit: () => boolean) {
  return Extension.create({
    name: "sermonWriteGuard",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: writeGuardKey,
          filterTransaction: (transaction) => {
            if (!transaction.docChanged) return true;
            try {
              return canEdit() === true;
            } catch {
              return false;
            }
          },
        }),
      ];
    },
  });
}
