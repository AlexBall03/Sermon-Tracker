"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useSyncExternalStore } from "react";

import { paperMeta, paperShown, type PaperShown } from "@/features/editor-lab/v4/paper";
import {
  defaultPaper,
  defaultPrintColor,
  readPaper,
  readPrintColor,
  storePaper,
  subscribePaper,
  subscribePrintColor,
  type PaperChoice,
  type PrintColorMode,
} from "./preferences";
import { installPrintColor } from "./print-job";

/** This device's paper choice, followed (another tab's change too). */
export function usePaperChoice(): [PaperChoice, (choice: PaperChoice) => void] {
  const choice = useSyncExternalStore(
    subscribePaper,
    () => readPaper(),
    () => defaultPaper,
  );
  return [choice, storePaper];
}

/** This device's default print color mode, followed. */
export function useDefaultPrintColor(): PrintColorMode {
  return useSyncExternalStore(
    subscribePrintColor,
    () => readPrintColor(),
    () => defaultPrintColor,
  );
}

/**
 * Keeps an editor's paper on this device's choice (A4.4): view state only, a
 * metadata transaction with no steps and no history, so it is never a change,
 * a save, or an Undo step, and a read-only editor may follow it too. Returns
 * the paper drawn, for the writing area around the editor in Regular Layout.
 */
export function useEditorPaper(editor: Editor | null): PaperShown {
  const [choice] = usePaperChoice();
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(paperMeta, choice).setMeta("addToHistory", false));
  }, [editor, choice]);
  return (
    useEditorState({
      editor,
      selector: ({ editor: current }) => (current ? paperShown(current.state) : null),
    }) ?? null
  );
}

/** Prints of this page are drawn in the print color mode (`print-job.ts`) while mounted. */
export function usePrintColorMode() {
  useEffect(() => installPrintColor(), []);
}
