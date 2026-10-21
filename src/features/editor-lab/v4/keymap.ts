import { Extension, isMacOS } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";

import { run, type Command } from "../outline-commands";
import {
  addPoint,
  backspaceInPoint,
  deleteBeforePoint,
  deleteSelection,
  enterInPoint,
  enterOverSelection,
  firstOf,
  increaseLevel,
  moveGroup,
  moveOut,
  shiftTab,
  tab,
} from "./commands";

/*
 * The v4 prototype's keys. Everything not listed is ProseMirror's and
 * StarterKit's own: Enter and Backspace in writing, Shift+Enter (a line
 * break, in a point heading too), lists, undo and redo.
 *
 * Backspace and Delete are taken with every modifier the built-in keymap
 * gives them (Ctrl or Shift; on macOS also Alt, Ctrl+H, Ctrl+D, …): at a
 * point's edge or over a selection that touches a heading they do what the
 * plain key does; anywhere else they are left to the browser (deleting a
 * word stays native).
 *
 * Tab and Shift+Tab (D1, D5; `commands.ts`): in a list they move the item;
 * on a point, Tab goes a level down in place and Shift+Tab moves the point
 * out with everything it owns; in writing they change its level where that
 * changes nothing else. Where nothing applies, the browser moves focus.
 * Alt+Shift+→ and Alt+Shift+← are the level change and Move out without Tab.
 */
/**
 * Brings the selection up to the caret the browser shows, before a key that
 * changes structure acts on it (A1-UI.2B.1). ProseMirror reads a click's
 * caret from `selectionchange`, which Chrome delivers a task or more after
 * the click (69ms after `mouseup` in the lab, measured). A key pressed in
 * that gap found the old selection: Backspace just after a click at a
 * heading's start was refused as if in the middle of the heading, and just
 * after a click at its end converted the heading as if at its start.
 * ProseMirror's own observer reads the browser's selection and dispatches it
 * when the two differ; nothing else is changed.
 */
function caughtUp(view: EditorView) {
  const observer = (view as unknown as { domObserver?: { flush?: () => void } }).domObserver;
  observer?.flush?.();
}

export const V4Keymap = Extension.create({
  name: "v4Keymap",
  // Before StarterKit's paragraph, list, and history keys.
  priority: 200,
  addKeyboardShortcuts() {
    const on = (command: Command) => () => {
      caughtUp(this.editor.view);
      return run(this.editor, command);
    };
    const backspace = on(firstOf(deleteSelection, backspaceInPoint));
    const forward = on(firstOf(deleteSelection, deleteBeforePoint));
    // The macOS variants the built-in keymap has (Tiptap's `Keymap`); elsewhere they are not deletion keys.
    const mac: Record<string, () => boolean> = isMacOS()
      ? {
          "Ctrl-h": backspace,
          "Alt-Backspace": backspace,
          "Ctrl-d": forward,
          "Ctrl-Alt-Backspace": forward,
          "Alt-Delete": forward,
          "Alt-d": forward,
        }
      : {};
    return {
      Enter: on(firstOf(enterOverSelection, enterInPoint)),
      Backspace: backspace,
      "Mod-Backspace": backspace,
      "Shift-Backspace": backspace,
      Delete: forward,
      "Mod-Delete": forward,
      ...mac,
      Tab: on(tab),
      "Shift-Tab": on(shiftTab),
      "Alt-Shift-ArrowUp": on(moveGroup("up")),
      "Alt-Shift-ArrowDown": on(moveGroup("down")),
      "Alt-Shift-ArrowRight": on(increaseLevel),
      "Alt-Shift-ArrowLeft": on(moveOut),
      "Mod-Enter": on(addPoint("sibling")),
      "Mod-Shift-Enter": on(addPoint("child")),
    };
  },
});
