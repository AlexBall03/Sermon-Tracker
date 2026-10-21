"use client";

import { useEditorState, type Editor } from "@tiptap/react";

import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { userPresetIds } from "../styles/model";
import { isUserPresetId, presetIdInForce } from "../styles/plugin";

/**
 * The outline's appearance (A1-UI.2B.1): Minimal, Balanced, or Expressive.
 * The choice is the outline's (`styles.preset`), made in one transaction
 * that can be undone; it changes no words, structure, or identity, and keeps
 * every style and override the outline has. The caret stays where it was.
 * The full Appearance panel is A1-UI.2B.2.
 */
export function PresetSelect({ editor, className }: { editor: Editor; className?: string }) {
  const t = useT("editorLab").appearance;
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => presetIdInForce(e.state),
  });
  return (
    <Select
      label={t.label}
      value={isUserPresetId(current) ? current : "balanced"}
      onChange={(value) => {
        if (!isUserPresetId(value)) return;
        editor.chain().focus().setOutlinePreset(value).run();
      }}
      options={userPresetIds.map((id) => ({ value: id, label: t.presets[id] }))}
      className={className}
    />
  );
}
