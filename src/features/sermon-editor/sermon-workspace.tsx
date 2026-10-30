"use client";

import { undo } from "@tiptap/pm/history";
import type { Extensions } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { ArrowLeft, Settings2, SlidersHorizontal, TextQuote } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ClipboardNotice } from "@/features/editor-lab/clipboard";
import { MarginRuler } from "@/features/editor-lab/components/margin-ruler";
import { NumberingSelect } from "@/features/editor-lab/components/numbering-select";
import { PageScaler } from "@/features/editor-lab/components/page-scaler";
import {
  PrintPageStyle,
  usePageView,
  ViewControls,
} from "@/features/editor-lab/components/page-view";
import {
  HistoryGroup,
  InlineGroup,
  ListGroup,
  ParagraphGroup,
  StyleGroup,
  Tool,
  ToolbarRow,
} from "@/features/editor-lab/components/toolbar";
import { WorkspaceFrame } from "@/features/editor-lab/components/workspace-frame";
import { pageMetrics } from "@/features/editor-lab/pagination/geometry";
import { namedStyleOf } from "@/features/editor-lab/styles/resolve";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import type { V4Notice } from "@/features/editor-lab/v4/model";
import type { PassageLink } from "@/features/editor-lab/schema/scripture";
import type { DocumentProblem } from "@/features/editor-lab/validate";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { AppearanceDialogsProvider, useAppearanceDialogs } from "./appearance/dialogs";
import { initialWorkspaceLayout, useDesktop, workspaceLayout } from "./layout";
import { readFolded, storeFolded } from "./folding-storage";
import { noticeText } from "./notice";
import { InsertMenu } from "./insert-menu";
import { StructureTools } from "./structure-tools";
import { ViewMenu } from "./view-menu";
import "@/features/editor-lab/v4/lab-v4.css";

export type SermonWorkspaceProps = {
  /**
   * The document to edit: schema v4 JSON, or an older version, migrated as
   * it opens. It is read once, when the workspace mounts; another document
   * is another workspace (give it a different React `key`), so a document is
   * never loaded over one being edited.
   */
  document: unknown;
  /** Names the document for copy and paste between documents (`clipboard.ts`); never stored in it. */
  documentKey: string;
  /** Where the header's way back goes, and what it says. */
  back: { href: string; label: string };
  /** The header's start, after the way back (a title, or a document picker). */
  headerStart?: React.ReactNode;
  /** The header's end, after the numbering. */
  headerEnd?: React.ReactNode;
  /** A side column beside the writing area (the lab's diagnostics); Outline Settings never goes in it. */
  aside?: (editor: Editor) => React.ReactNode;
  /** Called once the editor exists and holds the document. */
  onReady?: (editor: Editor) => void;
  /** Called instead of `onReady` when the document is refused: nothing is open to edit. */
  onRefused?: () => void;
  /**
   * More behaviour, added after the editor's own (A3: the session's write
   * guard). Read once, when the editor is made; it changes nothing in the schema.
   */
  extensions?: Extensions;
  /**
   * Where this device remembers which points are folded (A3.1,
   * `folding-storage.ts`): one account's outline. Without it folds last only
   * as long as the workspace. Read when the editor is made.
   */
  foldKey?: string;
  /**
   * A passage's way to the Bible reader, in this tab (A3.1): the page that
   * mounts the workspace knows which outline it is. Without it passages have
   * no link. Read when the editor is made.
   */
  openInBible?: PassageLink;
};

/**
 * The sermon editor's workspace (A1): one schema v4 document, freeform first
 * with structure on demand, in the full editing workspace: the formatting
 * toolbar, the structure tools, Outline Settings (with Appearance), the numbering, Regular and
 * editable Print Layout with paper and margins.
 *
 * Depth is always drawn as an outline. A sermon, however fully it is written
 * out, is an outline with writing in it (the owner, A1), so there is no
 * separate manuscript view to switch to.
 *
 * It saves nothing and sends nothing: persistence is put around it (A2),
 * reading the document from the editor `onReady` hands over. Everything in
 * the view (layout, paper while not saved, expansion, the open
 * pane) is view state, never a document change (handoff PS-1B.1 §J).
 *
 * The editor does not render React on a transaction
 * (`shouldRerenderOnTransaction: false`); each control follows only the
 * values it shows.
 */
export function SermonWorkspace({
  document,
  documentKey,
  back,
  headerStart,
  headerEnd,
  aside,
  onReady,
  onRefused,
  extensions: extra,
  foldKey,
  openInBible,
}: SermonWorkspaceProps) {
  const t = useT("editorLab");
  const viewWords = useT("sermonEditor").view;
  const locale = useLocale();
  const [notice, setNotice] = useState<V4Notice | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState<ClipboardNotice | null>(null);
  const [refused, setRefused] = useState<DocumentProblem[] | null>(null);
  const [ready, setReady] = useState(false);
  const page = usePageView();
  const componentLabels = t.v4.components;
  const extensions = useMemo(
    () =>
      labV4Extensions({
        locale,
        // Balanced for an outline that chose no preset (A1-UI.1); the outline's own choice wins (A1-UI.2B.1).
        preset: "balanced",
        componentLabels,
        onNotice: (next) => {
          setClipboardNotice(null);
          setNotice(next);
        },
        onClipboardNotice: (next) => {
          setNotice(null);
          setClipboardNotice(next);
        },
        printLayout: { initial: initialWorkspaceLayout },
        folding: {
          initial: () => (foldKey ? readFolded(foldKey) : []),
          onChange: foldKey ? (ids) => storeFolded(foldKey, ids) : null,
          labels: { collapse: viewWords.collapsePoint, expand: viewWords.expandPoint },
        },
        openInBible: openInBible ?? null,
      }).concat(extra ?? []),
    // `extra`, `foldKey`, and `openInBible` are read when the editor is made, as it reads its extensions once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, componentLabels, viewWords],
  );

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
        "data-testid": "sermon-editor",
      },
    },
    onCreate: ({ editor: created }) => {
      const loaded = loadV4(created, document, documentKey);
      page.attach(created);
      if (!loaded.ok) {
        // Nothing to edit: never an empty document that could be mistaken for this one.
        created.setEditable(false);
        setRefused(loaded.problems);
        onRefused?.();
      } else {
        onReady?.(created);
      }
      setReady(true);
    },
  });

  const { view, print } = page;

  // A desktop shows Print Layout only; a smaller window starts in Regular (`layout.ts`).
  const desktop = useDesktop();
  const followWindow = useEffectEvent((isDesktopNow: boolean) => {
    page.switchLayout(workspaceLayout(isDesktopNow), false);
  });
  useEffect(() => {
    if (ready) followWindow(desktop);
  }, [desktop, ready]);
  return (
    <AppearanceDialogsProvider editor={editor}>
      <WorkspaceFrame testId="sermon-workspace" ready={Boolean(editor && ready)}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-surface px-3 py-2 sm:px-4">
          <Link
            href={back.href}
            aria-label={back.label}
            title={back.label}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          {/* At least 15rem, so on a narrow screen the numbering wraps below instead of overlapping. */}
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-2">{headerStart}</div>
          {editor && view && (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineSettingsButton />
              <NumberingSelect editor={editor} className="w-44" />
              {headerEnd}
            </div>
          )}
        </header>

        {/* One toolbar row: writing and structure on the left, the view at its end. */}
        {editor && view && !refused && (
          <div className="border-b bg-surface">
            <ToolbarRow
              label={t.toolbar.label}
              end={
                <>
                  <ViewMenu editor={editor} />
                  <ViewControls
                    page={page}
                    pageSetup="menu"
                    layoutSwitch={!desktop}
                    passages={false}
                  />
                </>
              }
            >
              <InsertMenu editor={editor} />
              <HistoryGroup editor={editor} />
              <StyleGroup editor={editor}>
                {/* Beside the style menu it belongs to: Outline Settings, on the text style in use. */}
                <EditStylesTool editor={editor} />
              </StyleGroup>
              <InlineGroup editor={editor} />
              <ParagraphGroup editor={editor} />
              <ListGroup editor={editor}>
                <QuoteTool editor={editor} />
              </ListGroup>
              <StructureToolsWithAppearance editor={editor} bibleHref={openInBible?.href} />
            </ToolbarRow>
          </div>
        )}

        {/* The writing area (the desk, in Print Layout) and, beside it on wide screens, the side column. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain lg:flex-row lg:overflow-hidden">
          {/* The writing area. */}
          <div className="relative flex min-w-0 flex-1 flex-col lg:min-h-0">
            <main
              className={cn(
                print
                  ? "lab-desk min-w-0 flex-1 px-3 pb-10 sm:px-6 lg:min-h-0 lg:overflow-auto lg:overscroll-contain"
                  : "min-w-0 flex-1 bg-surface pb-10 lg:min-h-0 lg:overflow-auto lg:overscroll-contain",
              )}
            >
              {refused && (
                <div
                  role="alert"
                  data-testid="sermon-editor-refused"
                  className="mx-auto mt-4 max-w-[72ch] rounded-xl border border-destructive/40 p-4 text-sm"
                >
                  <p className="font-semibold text-destructive">{t.v4.loadRefused}</p>
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {refused.map((problem, index) => (
                      <li key={index}>
                        {problem.code}
                        {problem.path ? ` ${problem.path}` : ""}
                        {problem.detail ? ` ${problem.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            </main>
          </div>
          {aside && editor && (
            <div className="flex shrink-0 flex-col gap-3 border-t bg-background p-3 lg:w-[23rem] lg:overflow-auto lg:border-t-0 lg:border-l">
              {aside(editor)}
            </div>
          )}
        </div>

        {/* What a change did, kept in sight at the foot of the workspace, on a phone too. */}
        {(notice || clipboardNotice) && editor && (
          <p
            role="status"
            data-testid="sermon-editor-notice"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-surface px-4 py-2 text-sm text-gold-ink"
          >
            <span>
              {notice
                ? noticeText(t.v4.notices, notice)
                : clipboardNotice && t.notices[clipboardNotice.code](clipboardNotice.role)}
            </span>
            {/* A refused change made nothing, so there is nothing of it to undo. */}
            {notice && notice.code !== "change_refused" && (
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  undo(editor.state, editor.view.dispatch);
                  setNotice(null);
                  editor.commands.focus();
                }}
              >
                {t.v4.undo}
              </button>
            )}
          </p>
        )}
        <PrintPageStyle page={page} />
      </WorkspaceFrame>
    </AppearanceDialogsProvider>
  );
}

/** Opens Outline Settings: the outline's own configuration, Appearance first (A1-UI.2B.2). */
function OutlineSettingsButton() {
  const t = useT("editorLab");
  const dialogs = useAppearanceDialogs();
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={t.appearance.open}
      title={t.appearance.open}
      data-testid="outline-settings-open"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => dialogs.openOutlineSettings()}
      className="pointer-coarse:h-11"
    >
      <Settings2 aria-hidden />
      <span className="max-sm:sr-only">{t.appearance.open}</span>
    </Button>
  );
}

/** "Edit styles": Outline Settings → Appearance → Outline, on the text style the caret is in. */
function EditStylesTool({ editor }: { editor: Editor }) {
  const t = useT("editorLab");
  const dialogs = useAppearanceDialogs();
  return (
    <Tool
      label={t.toolbar.documentStyles}
      icon={SlidersHorizontal}
      onPress={() => {
        const { parent } = editor.state.selection.$from;
        dialogs.openOutlineSettings({
          tab: "outline",
          textStyle: namedStyleOf(parent.type.name, parent.attrs) ?? "normal",
        });
      }}
    />
  );
}

/** The structure tools, whose menu opens Component Appearance on the selected component. */
function StructureToolsWithAppearance({
  editor,
  bibleHref,
}: {
  editor: Editor;
  bibleHref?: PassageLink["href"];
}) {
  const dialogs = useAppearanceDialogs();
  return (
    <StructureTools
      editor={editor}
      onAppearance={() => dialogs.openComponentAppearance()}
      bibleHref={bibleHref}
    />
  );
}

/** A quotation: a block like a list, toggled on the selected blocks. */
function QuoteTool({ editor }: { editor: Editor }) {
  const t = useT("editorLab").toolbar;
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isActive("blockquote"),
  });
  return (
    <Tool
      label={t.quote}
      icon={TextQuote}
      pressed={active}
      onPress={() => editor.chain().focus().toggleBlockquote().run()}
    />
  );
}
