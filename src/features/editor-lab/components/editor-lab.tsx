"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Select } from "@/components/ui/select";
import { numberingPresetIds } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import { useLocale, useT } from "@/i18n/client";
import { customNumbering } from "../fixtures";
import { labFixture, labFixtureIds, loadDocument, type LabFixtureId } from "../load";
import { createSaveMeter } from "../measure";
import { labExtensions } from "../schema/extensions";
import { SidePanel } from "./side-panel";
import { LabToolbar } from "./toolbar";
import "../lab.css";

const firstFixture: LabFixtureId = "powerOfGodsWord";

/**
 * The editor lab (PS-1A): one Tiptap editor over a fixture document, with
 * the controls and read-outs needed to judge it. It is a prototype: nothing
 * is saved, synced, queued, or sent, and it reads no account data.
 *
 * The editor does not render React on a transaction
 * (`shouldRerenderOnTransaction: false`); the toolbar follows only the
 * values it shows, and the panels read the document when asked.
 */
export function EditorLab() {
  const t = useT("editorLab");
  const locale = useLocale();
  const [fixture, setFixture] = useState<LabFixtureId>(firstFixture);
  const [initial] = useState(() => labFixture(firstFixture));
  const [issues, setIssues] = useState(initial.issues);
  const meter = useMemo(() => createSaveMeter(), []);
  const extensions = useMemo(() => labExtensions({ locale }), [locale]);
  const renders = useRef({ count: 0 });

  const editor = useEditor({
    extensions,
    content: initial.doc,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "lab-editor",
        "aria-label": t.editorLabel,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
        "data-testid": "lab-editor",
      },
    },
    onCreate: () => {
      meter.ready(performance.now());
    },
    onUpdate: ({ editor: current }) => meter.changed(current),
  });

  useEffect(() => () => meter.dispose(), [meter]);
  useEffect(() => {
    renders.current.count += 1;
  });

  const open = (id: LabFixtureId) => {
    if (!editor) return;
    const next = labFixture(id);
    loadDocument(editor, next.doc);
    setFixture(id);
    setIssues(next.issues);
    meter.reset();
  };

  return (
    <div
      className="mt-6 flex flex-col gap-6"
      data-testid="editor-lab"
      data-ready={editor ? "true" : "false"}
    >
      <div
        role="note"
        className="rounded-xl border border-gold-ink/30 bg-surface px-4 py-3 text-sm text-gold-ink"
      >
        <p className="font-semibold">{t.notice}</p>
        <details className="mt-1 text-foreground/80">
          <summary className="cursor-pointer text-gold-ink">{t.limitationsTitle}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {t.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.fixture}>
              <Select
                label={t.fixture}
                value={fixture}
                onChange={(value) => open(value as LabFixtureId)}
                options={labFixtureIds.map((id) => ({ value: id, label: t.fixtures[id] }))}
              />
            </Field>
            {editor && (
              <Field label={t.numbering}>
                <NumberingSelect editor={editor} />
              </Field>
            )}
          </div>
          {editor && (
            <div className="sticky top-[calc(var(--bar-h)+0.5rem)] z-10">
              <LabToolbar editor={editor} />
            </div>
          )}
          <div className="min-w-0 rounded-xl border bg-surface shadow-card">
            <EditorContent editor={editor} className="lab-surface" />
          </div>
          <p className="text-xs text-muted-foreground">{t.shortcuts}</p>
        </div>
        {editor && <SidePanel editor={editor} issues={issues} meter={meter} renders={renders} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium" aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

/** The outline's numbering: a document attribute, changed in one transaction that can be undone. */
function NumberingSelect({ editor }: { editor: Editor }) {
  const t = useT("editorLab");
  const presets = useT("outlines").numbering.presets;
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.state.doc.attrs.numbering as NumberingConfig).preset,
  });
  const configs: Record<string, NumberingConfig> = {
    ...Object.fromEntries(numberingPresetIds.map((preset) => [preset, { version: 1, preset }])),
    custom: customNumbering,
  };
  return (
    <Select
      label={t.numbering}
      value={current}
      onChange={(value) => {
        editor.view.dispatch(editor.state.tr.setDocAttribute("numbering", configs[value]));
      }}
      options={[
        ...numberingPresetIds.map((preset) => ({ value: preset, label: presets[preset] })),
        { value: "custom", label: t.customNumbering },
      ]}
    />
  );
}
