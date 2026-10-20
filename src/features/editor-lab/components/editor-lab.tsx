"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { numberingPresetIds } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import type { ClipboardNotice } from "../clipboard";
import { customNumbering } from "../fixtures";
import { layoutFromNumbering, layoutNumbering, layoutParses } from "../layout";
import { labFixture, labFixtureIds, loadDocument, type LabFixtureId } from "../load";
import { createSaveMeter } from "../measure";
import {
  defaultMargins,
  fitMargins,
  isPaperSize,
  pageMetrics,
  paperSizes,
  papers,
  type Margins,
  type PageSetup,
  type PaperSize,
} from "../pagination/geometry";
import { layoutModes, printLayoutOf, type LayoutMode } from "../pagination/plugin";
import {
  initialPrintLayout,
  layoutPreferences,
  readDefaultLayout,
  writeDefaultLayout,
  writePageSetup,
  writeTabLayout,
  type LayoutPreference,
} from "../pagination/preferences";
import { labExtensions } from "../schema/extensions";
import { MarginRuler } from "./margin-ruler";
import { PageScaler } from "./page-scaler";
import { SidePanel } from "./side-panel";
import { LabToolbar, Tool } from "./toolbar";
import "../lab.css";

const firstFixture: LabFixtureId = "powerOfGodsWord";

/** The page's body never changes: nothing to listen to. */
const noSubscription = () => () => undefined;

/** A key for each document opened, so copying from one and pasting in another is a paste between documents. */
let opened = 0;
const keyFor = (id: LabFixtureId) => `lab:${id}:${(opened += 1)}`;

/**
 * The editor lab (PS-1A, PS-1B.2A): one Tiptap editor over a fixture document, with
 * the controls and read-outs needed to judge it. It is a prototype: nothing
 * is saved, synced, queued, or sent, and it reads no account data.
 *
 * Every document is loaded through the validator (`loadDocument`), the first
 * one included, so the lab never shows a document the validator refuses.
 *
 * The editor does not render React on a transaction
 * (`shouldRerenderOnTransaction: false`); the toolbar follows only the
 * values it shows, and the panels read the document when asked.
 *
 * Print Layout (PS-1B.2B.1) is the same editor with a pagination plugin: the
 * layout, paper, and margins are changed by commands that carry only a meta
 * and stay out of history. The editor starts in the layout this tab chose,
 * or else the default for this device (`initialPrintLayout`), so opening it
 * never dispatches a switch.
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
  const [view, setView] = useState<{ layout: LayoutMode; setup: PageSetup } | null>(null);
  const [defaultLayout, setDefaultLayout] = useState<LayoutPreference>("automatic");
  const [expanded, setExpanded] = useState(false);
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
      const current = printLayoutOf(created.state);
      if (current) setView({ layout: current.layout, setup: current.setup });
      setDefaultLayout(readDefaultLayout());
      meter.ready(performance.now());
      setReady(true);
    },
    onUpdate: ({ editor: current }) => meter.changed(current),
  });

  useEffect(() => () => meter.dispose(), [meter]);
  // The workspace fills the window over the application's shell; the page behind it does not scroll.
  const host = useSyncExternalStore(
    noSubscription,
    () => document.body,
    () => null,
  );
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
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
    setExpanded(false);
    meter.reset();
  };

  const switchLayout = (layout: LayoutMode) => {
    if (!editor || !view) return;
    editor.commands.setLayout(layout);
    // This tab only (§C.9); the default is never written from here.
    writeTabLayout(layout);
    setView({ ...view, layout });
  };

  /** Paper and margins: applied to the pages at once, remembered for the next document when settled. */
  const applySetup = (setup: PageSetup, remember: boolean) => {
    if (!editor) return;
    editor.commands.setPageSetup(setup);
    if (remember) writePageSetup(setup);
    setView((current) => (current ? { ...current, setup } : current));
  };
  const setMargins = (margins: Margins, remember: boolean) => {
    if (view) applySetup({ size: view.setup.size, margins }, remember);
  };
  const setPaper = (size: PaperSize) => {
    if (view) applySetup({ size, margins: fitMargins(size, view.setup.margins) }, true);
  };

  const print = view?.layout === "print";

  // The workspace is drawn on the page's body, so it fills the window whatever
  // the shell around the lab does. It shares the top layer (z-50) with the
  // application bar and the menus: added after the bar, it covers it, and a
  // menu opened from it is added after it, so the menu shows above it.
  if (!host) return null;
  return createPortal(
    <div
      className="lab-workspace fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
      data-testid="editor-lab"
      data-ready={editor && ready ? "true" : "false"}
    >
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
          <details className="relative shrink-0">
            <summary
              role="note"
              className="cursor-pointer list-none rounded-full border border-gold-ink/30 px-2.5 py-0.5 text-xs font-medium text-gold-ink"
            >
              {t.workspace.prototype}
            </summary>
            <div className="absolute top-full left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-4 text-sm shadow-raised">
              <p className="font-semibold text-gold-ink">{t.notice}</p>
              <p className="mt-2 font-medium">{t.limitationsTitle}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {t.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
        {editor && view && (
          <div className="flex flex-wrap items-center gap-2">
            <NumberingSelect editor={editor} className="w-44" />
            <Select
              label={t.print.defaultLayout}
              value={defaultLayout}
              onChange={(value) => {
                const preference = value as LayoutPreference;
                writeDefaultLayout(preference);
                setDefaultLayout(preference);
              }}
              options={layoutPreferences.map((preference) => ({
                value: preference,
                label: t.print.defaults[preference],
              }))}
              className="w-44"
            />
          </div>
        )}
      </header>

      {/* One toolbar row: editing on the left, the view (layout, paper) at its end. */}
      {editor && view && (
        <div className="border-b bg-surface">
          <LabToolbar editor={editor}>
            <Segmented
              label={t.print.layout}
              hideLabel
              name="lab-layout"
              value={view.layout}
              onChange={switchLayout}
              options={layoutModes.map((mode) => ({ value: mode, label: t.print.layouts[mode] }))}
            />
            {/* Always shown: the paper is what the sermon prints on, in either layout. */}
            {
              <Select
                label={t.print.paper}
                value={view.setup.size}
                onChange={(value) => {
                  if (isPaperSize(value)) setPaper(value);
                }}
                options={paperSizes.map((size) => ({ value: size, label: t.print.papers[size] }))}
                className="w-40"
              />
            }
            {/*
              Expansion is Regular Layout's: in Print Layout a passage shows
              as it prints, so the button rests there, saying why. Its icon
              shows what a press does; it is not coloured as "on".
            */}
            <Tool
              label={
                print
                  ? t.print.expandInPrint
                  : expanded
                    ? t.print.collapsePassages
                    : t.print.expandPassages
              }
              disabled={print}
              icon={expanded ? ChevronsDownUp : ChevronsUpDown}
              onPress={() => {
                editor.commands.setPassagesExpanded(!expanded);
                setExpanded(!expanded);
              }}
            />
            <Tool
              label={t.print.resetMargins}
              icon={RotateCcw}
              onPress={() => setMargins(defaultMargins(view.setup.size), true)}
            />
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
            {print && (
              <MarginRuler
                setup={view.setup}
                onChange={(margins) => setMargins(margins, false)}
                onCommit={(margins) => setMargins(margins, true)}
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
      {print && (
        // The size of the printed pages (@page), for the paper chosen.
        <style>{`@media print { @page { size: ${papers[view.setup.size].css}; margin: 0; } }`}</style>
      )}
    </div>,
    host,
  );
}

/** The outline's numbering: part of the document's layout, changed in one transaction that can be undone. */
function NumberingSelect({ editor, className }: { editor: Editor; className?: string }) {
  const t = useT("editorLab");
  const presets = useT("outlines").numbering.presets;
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => layoutNumbering(e.state.doc.attrs.layout).preset,
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
        const layout = editor.state.doc.attrs.layout;
        // An unreadable layout is replaced only now, when a person chooses one.
        const next = layoutParses(layout)
          ? { ...layout, numbering: configs[value] }
          : layoutFromNumbering(configs[value]);
        editor.view.dispatch(editor.state.tr.setDocAttribute("layout", next));
      }}
      options={[
        ...numberingPresetIds.map((preset) => ({ value: preset, label: presets[preset] })),
        { value: "custom", label: t.customNumbering },
      ]}
      className={className}
    />
  );
}
