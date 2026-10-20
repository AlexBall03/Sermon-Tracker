"use client";

import { useEditorState, type Editor } from "@tiptap/react";

import { Select } from "@/components/ui/select";
import { numberingPresetIds } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import { useT } from "@/i18n/client";
import { layoutFromNumbering, layoutNumbering, layoutParses } from "../layout";

/**
 * The outline's numbering: part of the document's layout, changed in one
 * transaction that can be undone. The built-in styles are always offered; a
 * custom style is offered when the caller has one to offer (`custom`) or the
 * document already uses its own, which then stays choosable as it is.
 */
export function NumberingSelect({
  editor,
  custom,
  className,
}: {
  editor: Editor;
  custom?: NumberingConfig;
  className?: string;
}) {
  const t = useT("editorLab");
  const presets = useT("outlines").numbering.presets;
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => layoutNumbering(e.state.doc.attrs.layout),
  });
  const own = current.preset === "custom" ? current : undefined;
  const customConfig = custom ?? own;
  const configs: Record<string, NumberingConfig> = Object.fromEntries(
    numberingPresetIds.map((preset) => [preset, { version: 1, preset }]),
  );
  if (customConfig) configs.custom = customConfig;
  return (
    <Select
      label={t.numbering}
      value={current.preset}
      onChange={(value) => {
        if (!configs[value]) return;
        const layout = editor.state.doc.attrs.layout;
        // An unreadable layout is replaced only now, when a person chooses one.
        const next = layoutParses(layout)
          ? { ...layout, numbering: configs[value] }
          : layoutFromNumbering(configs[value]);
        editor.view.dispatch(editor.state.tr.setDocAttribute("layout", next));
      }}
      options={[
        ...numberingPresetIds.map((preset) => ({ value: preset, label: presets[preset] })),
        ...(customConfig
          ? [{ value: "custom", label: custom ? t.customNumbering : t.customNumberingOwn }]
          : []),
      ]}
      className={className}
    />
  );
}
