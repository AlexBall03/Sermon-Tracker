"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";

import { findComponent } from "@/features/editor-lab/styles/component-node";
import {
  applyPlan,
  committedAt,
  conflicts as conflictsOf,
  emptyDraft,
  isDirty,
  keyOf,
  mergeStyles,
  orphans as orphansOf,
  rebaseEdit,
  resetLayer,
  setEdit,
  withoutEdits,
  type Draft,
  type Edit,
  type LayerPath,
  type Path,
} from "@/features/editor-lab/styles/draft";
import type { ComponentStyle, DocumentStyles } from "@/features/editor-lab/styles/model";
import { documentStylesKey } from "@/features/editor-lab/styles/plugin";
import { presets, type Preset, type PresetId } from "@/features/editor-lab/styles/presets";
import { readStyles } from "@/features/editor-lab/styles/resolve";

/*
 * One Appearance editing session (A1-UI.2B.2), shared by Outline Settings and
 * Component Appearance: the draft (`styles/draft.ts`), what is committed, and
 * the ways to change, apply, or discard it.
 *
 * Opening reads what is committed; the draft starts empty. Each adjustment is
 * one edit; the outline behind shows it at once as a preview (view state: no
 * document change, no history), as does the modal's own preview. Apply writes
 * all of it in one transaction (`applyAppearanceDraft`), undone in one step, or
 * nothing if any of it is stale; Cancel throws it away. Leaving the session
 * leaves no preview behind.
 */

export type ConflictActions = { keep: () => void; current: () => void };
export type SessionMessage = "applied" | "invalid" | "refused" | null;

export type AppearanceSession = {
  editor: Editor;
  draft: Draft;
  /** The outline's committed styles. */
  stored: DocumentStyles | null;
  /** The committed styles with the draft laid over them. */
  merged: DocumentStyles | null;
  presetId: PresetId;
  preset: Preset;
  /** The target component's committed own appearance (null when none, or no target). */
  appearance: ComponentStyle | null;
  dirty: boolean;
  conflictCount: number;
  orphanCount: number;
  message: SessionMessage;
  setMessage: (message: SessionMessage) => void;
  /** Replaces the draft (a reset worked out elsewhere). */
  change: (next: Draft) => void;
  set: (path: Path, value: unknown) => void;
  reset: (layer: LayerPath) => void;
  /** Applies the draft; true when it was written. */
  apply: () => boolean;
  discard: () => void;
  conflictFor: (path: Path) => ConflictActions | null;
  keepAllMine: () => void;
  useAllCurrent: () => void;
  discardOrphans: () => void;
};

export function useAppearanceSession(
  editor: Editor,
  { targetId = null }: { targetId?: string | null } = {},
): AppearanceSession {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState<SessionMessage>(null);

  // What is committed, and what in the draft is stale: read on every change of the document.
  const committed = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc } = current.state;
      const styles = readStyles(doc.attrs.styles);
      return {
        styles,
        fallback: documentStylesKey.getState(current.state)?.fallback ?? "baseline",
        appearance: targetId
          ? ((findComponent(doc, targetId)?.node.attrs.appearance ?? null) as ComponentStyle | null)
          : null,
        conflicts: conflictsOf(draft, styles, doc)
          .map((edit) => keyOf(edit.path))
          .join("\n"),
        orphans: orphansOf(draft, doc).length,
      };
    },
    equalityFn: (x, y) =>
      Boolean(x && y) &&
      x!.styles === y!.styles &&
      x!.fallback === y!.fallback &&
      x!.appearance === y!.appearance &&
      x!.conflicts === y!.conflicts &&
      x!.orphans === y!.orphans,
  });
  const stored = committed?.styles ?? null;
  const merged = useMemo(() => mergeStyles(stored, draft), [stored, draft]);
  const presetId: PresetId = merged?.preset ?? (committed?.fallback as PresetId) ?? "balanced";
  const conflictList = committed?.conflicts ?? "";
  const conflictKeys = useMemo(
    () => new Set(conflictList ? conflictList.split("\n") : []),
    [conflictList],
  );
  const dirty = isDirty(draft);

  // The outline shows the draft while there is one: view state only, never the document's.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.commands.setStylesPreview(dirty ? { draft } : null);
  }, [editor, draft, dirty]);
  // Leaving the session leaves no preview behind.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) editor.commands.setStylesPreview(null);
    },
    [editor],
  );
  // "Applied" describes the last change only: any later change of the outline (an Undo) retires it.
  useEffect(() => {
    const retire = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) setMessage((shown) => (shown === "applied" ? null : shown));
    };
    editor.on("transaction", retire);
    return () => {
      editor.off("transaction", retire);
    };
  }, [editor]);

  const change = (next: Draft) => {
    setMessage(null);
    setDraft(next);
  };
  const allConflicts = () => conflictsOf(draft, stored, editor.state.doc);
  const keepMine = (edits: Edit[]) =>
    change(edits.reduce((next, edit) => rebaseEdit(next, edit, stored, editor.state.doc), draft));
  const takeCurrent = (edits: Edit[]) => change(withoutEdits(draft, edits));

  return {
    editor,
    draft,
    stored,
    merged,
    presetId,
    preset: presets[presetId],
    appearance: committed?.appearance ?? null,
    dirty,
    conflictCount: conflictKeys.size,
    orphanCount: committed?.orphans ?? 0,
    message,
    setMessage,
    change,
    set: (path, value) =>
      change(setEdit(draft, path, value, committedAt(stored, editor.state.doc, path))),
    reset: (layer) => change(resetLayer(draft, stored, editor.state.doc, layer)),
    apply: () => {
      if (editor.commands.applyAppearanceDraft(draft)) {
        setDraft(emptyDraft);
        setMessage("applied");
        return true;
      }
      const plan = applyPlan(draft, readStyles(editor.state.doc.attrs.styles), editor.state.doc);
      setMessage(!plan.ok && plan.reason === "invalid" ? "invalid" : "refused");
      return false;
    },
    discard: () => {
      setMessage(null);
      setDraft(emptyDraft);
    },
    conflictFor: (path) => {
      const key = keyOf(path);
      if (!conflictKeys.has(key)) return null;
      const edit = draft.edits.get(key);
      return edit ? { keep: () => keepMine([edit]), current: () => takeCurrent([edit]) } : null;
    },
    keepAllMine: () => keepMine(allConflicts()),
    useAllCurrent: () => takeCurrent(allConflicts()),
    discardOrphans: () => change(withoutEdits(draft, orphansOf(draft, editor.state.doc))),
  };
}
