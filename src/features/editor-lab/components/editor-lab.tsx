"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Select } from "@/components/ui/select";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import type { ClipboardNotice } from "../clipboard";
import { customNumbering } from "../fixtures";
import { labFixture, labFixtureIds, loadDocument, type LabFixtureId } from "../load";
import { createSaveMeter } from "../measure";
import { pageMetrics } from "../pagination/geometry";
import { initialPrintLayout } from "../pagination/preferences";
import { labExtensions } from "../schema/extensions";
import { MarginRuler } from "./margin-ruler";
import { NumberingSelect } from "./numbering-select";
import { DefaultLayoutSelect, PrintPageStyle, usePageView, ViewControls } from "./page-view";
import { PageScaler } from "./page-scaler";
import { SidePanel } from "./side-panel";
import { LabToolbar } from "./toolbar";
import { WorkspaceFrame } from "./workspace-frame";
import "../lab.css";

const firstFixture: LabFixtureId = "powerOfGodsWord";

/** A key for each document opened, so copying from one and pasting in another is a paste between documents. */
let opened = 0;
const keyFor = (id: LabFixtureId) => `lab:${id}:${(opened += 1)}`;

/**
 * The editor lab (PS-1A, PS-1B.2A): one Tiptap editor over a fixture document, with
 * the controls and read-outs needed to judge it. It is a prototype: nothing
 * is saved, synced, queued, or sent, and it reads no account data. Since A1
 * it is the frozen schema v3 baseline; the integrated editor is
 * `src/features/sermon-editor` (/lab/editor/v4).
 *
 * Every document is loaded through the validator (`loadDocument`), the first
 * one included, so the lab never shows a document the validator refuses.
 *
 * The editor does not render React on a transaction
 * (`shouldRerenderOnTransaction: false`); the toolbar follows only the
 * values it shows, and the panels read the document when asked.
 *
 * Print Layout (PS-1B.2B.1) is the same editor with a pagination plugin
 * (`page-view.tsx`). The editor starts in the layout this tab chose, or else
 * the default for this device (`initialPrintLayout`), so opening it never
 * dispatches a switch.
 */
export function EditorLab() {
  const t = useT("editorLab");
  const locale = useLocale();
  const [fixture, setFixture] = useState<LabFixtureId>(firstFixture);
  const [initial] = useState(() => labFixture(firstFixture));
  const [issues, setIssues] = useState(initial.issues);
  const [notice, setNotice] = useState<ClipboardNotice | null>(null);
  const [ready, setReady] = useState(false);
  const meter = useMemo(() => createSaveMeter(), []);
  const page = usePageView();
  const extensions = useMemo(
    () =>
      labExtensions({
        locale,
        onNotice: (next) => setNotice(next),
        printLayout: { initial: initialPrintLayout },
      }),
    [locale],
  );
  const renders = useRef({ count: 0 });

  const editor = useEditor({
    extensions,
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
    onCreate: ({ editor: created }) => {
      loadDocument(created, initial.doc, keyFor(firstFixture));
      page.attach(created);
      meter.ready(performance.now());
      setReady(true);
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
    loadDocument(editor, next.doc, keyFor(id));
    setFixture(id);
    setIssues(next.issues);
    setNotice(null);
    page.resetExpansion();
    meter.reset();
  };

  const { view, print } = page;

  return (
    <WorkspaceFrame testId="editor-lab" ready={Boolean(editor && ready)}>
      {/* The editor's own header: the way back, the document, and the lab's settings. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-surface px-3 py-2 sm:px-4">
        <Link
          href={routes.outlines}
          aria-label={t.workspace.back}
          title={t.workspace.back}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Select
            label={t.fixture}
            value={fixture}
            onChange={(value) => open(value as LabFixtureId)}
            options={labFixtureIds.map((id) => ({ value: id, label: t.fixtures[id] }))}
            className="w-full max-w-xs border-transparent bg-transparent font-medium shadow-none hover:border-border"
          />
          <PrototypeBadge />
        </div>
        {editor && view && (
          <div className="flex flex-wrap items-center gap-2">
            <NumberingSelect editor={editor} custom={customNumbering} className="w-44" />
            <DefaultLayoutSelect className="w-44" />
          </div>
        )}
      </header>

      {/* One toolbar row: editing on the left, the view (layout, paper) at its end. */}
      {editor && view && (
        <div className="border-b bg-surface">
          <LabToolbar editor={editor}>
            <ViewControls page={page} />
          </LabToolbar>
        </div>
      )}

      {/* The writing area (the desk, in Print Layout) and, beside it on wide screens, the inspector. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain lg:flex-row lg:overflow-hidden">
        <main
          className={
            print
              ? "lab-desk min-w-0 flex-1 px-3 pb-10 sm:px-6 lg:overflow-auto lg:overscroll-contain"
              : "min-w-0 flex-1 bg-surface pb-10 lg:overflow-auto lg:overscroll-contain"
          }
        >
          <PageScaler
            layout={view?.layout ?? "regular"}
            pageWidth={view ? pageMetrics(view.setup).width : 0}
          >
            {print && view && (
              <MarginRuler
                setup={view.setup}
                onChange={(margins) => page.setMargins(margins, false)}
                onCommit={(margins) => page.setMargins(margins, true)}
              />
            )}
            <EditorContent editor={editor} className="lab-surface" />
          </PageScaler>
          <div className="mx-auto mt-4 flex max-w-[72ch] flex-col gap-2 px-4">
            {notice && (
              <p role="status" data-testid="lab-notice" className="text-sm text-gold-ink">
                {t.notices[notice.code](notice.role)}
              </p>
            )}
            {print && <p className="text-xs text-muted-foreground">{t.print.remembered}</p>}
            <p className="text-xs text-muted-foreground">{t.shortcuts}</p>
          </div>
        </main>
        {editor && (
          <div className="shrink-0 border-t bg-background p-3 lg:w-[23rem] lg:overflow-auto lg:border-t-0 lg:border-l">
            <SidePanel editor={editor} issues={issues} meter={meter} renders={renders} />
          </div>
        )}
      </div>
      <PrintPageStyle page={page} />
    </WorkspaceFrame>
  );
}

/** The prototype's badge and what it does not do (both labs show it; it is the lab's, not the editor's). */
export function PrototypeBadge({
  notice,
  limitations,
}: {
  notice?: string;
  limitations?: readonly string[];
}) {
  const t = useT("editorLab");
  return (
    <details className="relative shrink-0">
      <summary
        role="note"
        className="cursor-pointer list-none rounded-full border border-gold-ink/30 px-2.5 py-0.5 text-xs font-medium text-gold-ink"
      >
        {t.workspace.prototype}
      </summary>
      <div className="absolute top-full left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-4 text-sm shadow-raised">
        <p className="font-semibold text-gold-ink">{notice ?? t.notice}</p>
        <p className="mt-2 font-medium">{t.limitationsTitle}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          {(limitations ?? t.limitations).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
