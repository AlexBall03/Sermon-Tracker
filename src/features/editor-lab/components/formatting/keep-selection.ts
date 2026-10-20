"use client";

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useMemo, useRef } from "react";

import type { Command } from "../../outline-commands";

/*
 * Keeping the person's selection through a formatting control (PS-1B.2B.2B).
 *
 * A button never takes focus (its press is prevented), so the selection is
 * never at risk. A menu, a popover, or a field does take focus, and while it
 * has it the browser, a touch, or the control itself can move or collapse
 * the editor's selection. So a control remembers the selection when it is
 * opened or focused, and applying puts that selection back before running
 * the command, then returns focus to the editor. It is put back only if the
 * document is still the one it was taken from (otherwise its positions may
 * not mean the same thing) and only if it differs, so the stored marks a
 * collapsed cursor holds are not lost to a needless selection change. It is
 * used once: applying forgets it, so a late close of a menu can never take
 * the person back to where they were before.
 */

type Kept = { selection: Selection; doc: ProseMirrorNode };

export function useKeptSelection(editor: Editor) {
  const kept = useRef<Kept | null>(null);

  const remember = useCallback(() => {
    kept.current = { selection: editor.state.selection, doc: editor.state.doc };
  }, [editor]);

  const restore = useCallback(() => {
    const view = editor.view;
    const saved = kept.current;
    if (saved && saved.doc === view.state.doc && !saved.selection.eq(view.state.selection)) {
      view.dispatch(view.state.tr.setSelection(saved.selection));
    }
    kept.current = null;
    view.focus();
  }, [editor]);

  /**
   * Runs `command` on the remembered selection, and gives the editor its
   * focus back, unless `focus` is false (a popover that stays open for more
   * changes keeps the focus; it returns it when it closes, `finalFocus`).
   */
  const apply = useCallback(
    (command: Command, { focus = true }: { focus?: boolean } = {}) => {
      const view = editor.view;
      const saved = kept.current;
      if (saved && saved.doc === view.state.doc && !saved.selection.eq(view.state.selection)) {
        view.dispatch(view.state.tr.setSelection(saved.selection));
      }
      const done = command(view.state, (tr) => view.dispatch(tr));
      // Used once: the selection now is the one the change left, and nothing may later put back an older one.
      kept.current = null;
      if (focus) view.focus();
      return done;
    },
    [editor],
  );

  /**
   * For a menu's choice: applied only while the person has the menu (it
   * remembered the selection when they opened or focused it). A menu whose
   * value or options change because the selection moved can report a value
   * by itself, and that must never format anything.
   */
  const choose = useCallback(
    (command: Command) => (kept.current ? apply(command) : false),
    [apply],
  );

  /** For a menu's `finalFocus`: back to the editor, on the kept selection, not to the trigger. */
  const finalFocus = useMemo(
    () => () => {
      restore();
      return false;
    },
    [restore],
  );

  return { remember, restore, apply, choose, finalFocus };
}
