import { Extension } from "@tiptap/core";

import { run, type Command } from "../outline-commands";
import {
  addPoint,
  backspaceInPoint,
  deleteBeforePoint,
  deleteSelection,
  enterInPoint,
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
 * Tab is taken here, for the prototype (the owner's Tab decision is still
 * open): in a list it moves the item, on a point it changes its level in
 * place, in writing it moves the block into or out of a point. Alt+Shift+→
 * and Alt+Shift+← are the same level change without Tab, and Move out.
 */
export const V4Keymap = Extension.create({
  name: "v4Keymap",
  // Before StarterKit's paragraph, list, and history keys.
  priority: 200,
  addKeyboardShortcuts() {
    const on = (command: Command) => () => run(this.editor, command);
    return {
      Enter: on(enterInPoint),
      Backspace: on(firstOf(deleteSelection, backspaceInPoint)),
      Delete: on(firstOf(deleteSelection, deleteBeforePoint)),
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
