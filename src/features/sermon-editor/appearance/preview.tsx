"use client";

import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useMemo, useRef, useState } from "react";

import { findComponent } from "@/features/editor-lab/styles/component-node";
import { isDirty, type Draft } from "@/features/editor-lab/styles/draft";
import type { ComponentKind, DocumentStyles } from "@/features/editor-lab/styles/model";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { PageScaler } from "@/features/editor-lab/components/page-scaler";
import type { PageSetup } from "@/features/editor-lab/pagination/geometry";
import { pageInForce, printLayoutOf } from "@/features/editor-lab/pagination/plugin";
import { SermonHeader } from "../header/sermon-header";
import type { Dictionaries } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { AppearanceSession } from "./session";

/*
 * The preview inside Outline Settings and Component Appearance (A1-UI.2B.2):
 * a small read-only editor built from the same extensions as the outline, so
 * it is drawn by the same rules: the generated style sheet (`render.ts`), the
 * preset's CSS (`lab-v4.css`), the numbering, the section frames, the note and
 * script labels, and the passage's own node view, with its verses.
 *
 * It holds its own sample document (or a copy of one component), never the
 * person's. It carries the outline's committed styles and is shown the
 * session's draft through `setStylesPreview({ draft })`, the same view-state
 * command as the outline, so nothing is computed a second way. It is created
 * once when the window opens, destroyed when it closes, never edited, and
 * nothing it does reaches the outline's document or history.
 */

type SampleWords = Dictionaries["editorLab"]["appearance"]["sample"];

const text = (value: string): JSONContent[] => (value ? [{ type: "text", text: value }] : []);
const point = (id: string, title: string, depth: number, role: string | null = null) => ({
  type: "point",
  attrs: { id, depth, role },
  content: text(title),
});
const prose = (value: string, depth: number, styleName: string | null = null) => ({
  type: "paragraph",
  attrs: styleName ? { depth, styleName } : { depth },
  content: text(value),
});
const container = (type: "preacherNote" | "script", id: string, value: string, depth: number) => ({
  type,
  attrs: type === "preacherNote" ? { id, kind: "reminder", print: null, depth } : { id, depth },
  content: [{ type: "paragraph", content: text(value) }],
});

/** Which block of the sample shows each kind of component. */
export const sampleIds: Record<ComponentKind, string> = {
  introduction: "preview-introduction",
  point: "preview-point",
  subpoint: "preview-subpoint",
  scripture: "preview-scripture",
  preacherNote: "preview-note",
  script: "preview-script",
  conclusion: "preview-conclusion",
};

/** Which point of the sample shows each of the first three levels (A4.2A). */
export const sampleLevelIds: Record<1 | 2 | 3, string> = {
  1: sampleIds.point,
  2: sampleIds.subpoint,
  3: "preview-deeper",
};

/**
 * A short representative sermon with every component and text style the
 * Appearance settings reach, in the person's language. Psalm 119:105 is read
 * from the outline's translation, as any passage is.
 */
export function sampleOutline(words: SampleWords): JSONContent[] {
  return [
    prose(words.title, 0, "title"),
    prose(words.subtitle, 0, "subtitle"),
    point(sampleIds.introduction, words.introduction, 1, "introduction"),
    prose(words.introductionText, 1),
    point(sampleIds.point, words.point, 1),
    prose(words.pointText, 1),
    {
      type: "scripturePassage",
      attrs: {
        id: sampleIds.scripture,
        book: 19,
        chapterStart: 119,
        verseStart: 105,
        // One verse: no end (`scripture/reference.ts`).
        chapterEnd: null,
        verseEnd: null,
        translation: null,
        print: "full",
        depth: 1,
      },
    },
    point(sampleIds.subpoint, words.subpoint, 2),
    prose(words.subpointText, 2),
    container("preacherNote", sampleIds.preacherNote, words.note, 2),
    container("script", sampleIds.script, words.script, 2),
    // A third level (A4.2A), so a level's own look and a deeper number can be seen.
    point(sampleLevelIds[3], words.deeper, 3),
    point(sampleIds.conclusion, words.conclusion, 1, "conclusion"),
    prose(words.conclusionText, 1),
  ];
}

/**
 * Two pages of a short sermon (A4.3), for Header & Footer: an explicit page
 * break puts the second point on page 2, so the first page's header, the
 * later page's running header, and both page numbers can be seen.
 */
export function pagesSample(words: SampleWords): JSONContent[] {
  return [
    point(sampleIds.introduction, words.introduction, 1, "introduction"),
    prose(words.introductionText, 1),
    point(sampleIds.point, words.point, 1),
    prose(words.pointText, 1),
    { type: "pageBreak" },
    point(sampleIds.conclusion, words.conclusion, 1, "conclusion"),
    prose(words.conclusionText, 1),
  ];
}

/**
 * One component of the outline, as itself: a copy of its node with the
 * headings that own it (so a subpoint keeps its depth, and a note inside the
 * Introduction keeps the section's frame), or null when it is not found.
 */
export function componentExcerpt(doc: ProseMirrorNode, id: string): JSONContent[] | null {
  const found = findComponent(doc, id);
  if (!found) return null;
  const owners: ProseMirrorNode[] = [];
  let reached = false;
  doc.forEach((child, offset) => {
    if (reached) return;
    if (offset === found.pos) {
      reached = true;
      return;
    }
    if (child.type.name === "point") {
      const depth = child.attrs.depth as number;
      owners.length = Math.min(owners.length, depth - 1);
      owners[depth - 1] = child;
    }
  });
  // Not a block of the outline itself (never expected in schema v4): the component alone.
  if (!reached) return [found.node.toJSON()];
  const depth = (found.node.attrs.depth as number | undefined) ?? 0;
  const keep = found.node.type.name === "point" ? depth - 1 : depth;
  return [...owners.slice(0, Math.max(0, keep)).filter(Boolean), found.node].map((node) =>
    node.toJSON(),
  );
}

export function AppearancePreview({
  session,
  content,
  mark = null,
  caption,
  className,
  pages = false,
}: {
  session: AppearanceSession;
  /** The preview's blocks; read again only when this array changes (memoize it). */
  content: JSONContent[];
  /** A component to mark and bring into view (view state of the preview only). */
  mark?: string | null;
  caption: string;
  className?: string;
  /** Show the sample as pages, with the sermon header (Header & Footer, A4.3). */
  pages?: boolean;
}) {
  const live = session.editor;
  const sampleTitle = useT("editorLab").appearance.headerFooter.sampleTitle;
  const inForce = pageInForce(live.state);
  // The outline's own settings (numbering, translation, styles), read when the blocks are loaded.
  const attrs = useMemo(
    () => live.state.doc.toJSON().attrs as Record<string, unknown>,
    // Read again with the blocks, as the preview always has: not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, content],
  );
  return (
    <PreviewSurface
      attrs={attrs}
      // The paper the outline is drawn on (Print Layout), so colors show as they will there.
      paper={live.view.dom.getAttribute("data-paper")}
      // The outline's committed styles and layout, followed (an Undo underneath shows here too).
      styles={session.stored}
      layout={live.state.doc.attrs.layout as unknown}
      draft={session.draft}
      content={content}
      mark={mark}
      caption={caption}
      className={className}
      pages={
        pages
          ? {
              // The outline's own title and paper, as its pages show them.
              title: printLayoutOf(live.state)?.title || sampleTitle,
              setup: inForce?.setup ?? null,
              page: live.state.doc.attrs.page as unknown,
            }
          : null
      }
    />
  );
}

/** What a preview drawn as pages needs from the outline (A4.3). */
export type PreviewPages = { title: string; setup: PageSetup | null; page: unknown };

/**
 * The preview itself, with no session (A4.2C): what Outline Settings shows
 * through `AppearancePreview`, and what My Presets shows of a saved preset.
 * One read-only editor of the same extensions (`labV4Extensions`), loaded
 * with `loadV4` and shown a draft through `setStylesPreview`, exactly as
 * before; nothing here resolves a style another way.
 */
export function PreviewSurface({
  attrs,
  paper = null,
  styles,
  layout,
  draft = null,
  content,
  mark = null,
  caption,
  className,
  pages = null,
}: {
  /**
   * Draw the sample as pages in Print Layout, with the sermon header (A4.3):
   * the same paginator, header, and footer as the outline, read-only.
   */
  pages?: PreviewPages | null;
  /** The document's attributes the blocks are loaded with; read again only when this object or `content` changes. */
  attrs: Record<string, unknown>;
  paper?: string | null;
  /** The committed styles and layout to draw, followed when they change. */
  styles: DocumentStyles | null;
  layout: unknown;
  draft?: Draft | null;
  /** The preview's blocks; read again only when this array changes (memoize it). */
  content: JSONContent[];
  /** A component to mark and bring into view (view state of the preview only). */
  mark?: string | null;
  caption: string;
  className?: string;
}) {
  const t = useT("editorLab");
  const locale = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Editor | null>(null);
  const labels = t.v4.components;
  const asPages = pages !== null;

  // One read-only editor for as long as the window is open (and drawn the same way).
  useEffect(() => {
    if (!host.current) return;
    const editor = new Editor({
      element: host.current,
      editable: false,
      extensions: labV4Extensions({ locale, preset: "balanced", componentLabels: labels }),
      editorProps: {
        attributes: {
          class: "lab-editor",
          "data-testid": "appearance-preview-editor",
          ...(paper ? { "data-paper": paper } : {}),
        },
      },
    });
    // Pages (A4.3): Print Layout, view state of the preview only.
    if (asPages) editor.commands.setLayout("print");
    setPreview(editor);
    return () => {
      setPreview(null);
      editor.destroy();
    };
  }, [paper, locale, labels, asPages]);

  // The outline's paper and margins, and its committed page, followed (A4.3). View state, or the preview's own document.
  const setup = pages?.setup ?? null;
  const page = pages?.page;
  useEffect(() => {
    if (!preview || preview.isDestroyed || !asPages) return;
    preview.commands.previewPageSetup(setup);
    if (preview.state.doc.attrs.page !== page) {
      preview.view.dispatch(
        preview.state.tr.setDocAttribute("page", page ?? null).setMeta("addToHistory", false),
      );
    }
  }, [preview, asPages, setup, page, attrs, content]);
  const width = preview && asPages ? (pageInForce(preview.state)?.metrics.width ?? 816) : 816;

  // The blocks, in a document with the outline's own settings (numbering, translation, styles).
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    const loaded = loadV4(preview, { type: "doc", attrs, content }, "appearance-preview");
    if (!loaded.ok) return;
    // A passage shows its verses (Regular Layout draws them only when expanded).
    preview.commands.setPassagesExpanded(true);
  }, [preview, attrs, content]);

  // The committed styles, followed.
  const stored = styles;
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    if (preview.state.doc.attrs.styles === stored) return;
    preview.view.dispatch(
      preview.state.tr.setDocAttribute("styles", stored).setMeta("addToHistory", false),
    );
  }, [preview, stored, attrs, content]);

  // The committed layout (its numbering, A4.2A), followed after an Apply or an Undo.
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    if (preview.state.doc.attrs.layout === layout) return;
    preview.view.dispatch(
      preview.state.tr.setDocAttribute("layout", layout).setMeta("addToHistory", false),
    );
  }, [preview, layout, attrs, content]);

  // The draft, as the outline shows it.
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    preview.commands.setStylesPreview(draft && isDirty(draft) ? { draft } : null);
  }, [preview, draft, stored, attrs, content]);

  // The component being customized, marked and brought into view inside the preview.
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    preview.commands.setAppearanceTarget(mark);
    const found = mark ? findComponent(preview.state.doc, mark) : null;
    const dom = found ? preview.view.nodeDOM(found.pos) : null;
    const box = scroller.current;
    if (!(dom instanceof HTMLElement) || !box) return;
    const top = dom.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo?.({ top: Math.max(0, top - 24), behavior: "smooth" });
  }, [preview, mark, attrs, content]);

  return (
    <figure
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border bg-surface",
        className,
      )}
      data-testid="appearance-preview"
    >
      <figcaption className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {caption}
      </figcaption>
      {/*
       * The box scrolls (by wheel, touch, or keys once focused); what is inside it is a
       * picture of the outline: nothing in it can be focused, chosen, or read twice. An
       * inert element is never scrolled, so only the picture is inert, never the box.
       */}
      <div
        ref={scroller}
        role="region"
        aria-label={caption}
        tabIndex={0}
        data-testid="appearance-preview-scroller"
        className="lab-appearance-preview relative min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {asPages ? (
          // The pages, scaled to the box, with the sermon header read-only (A4.3).
          <div aria-hidden inert className="p-2">
            <PageScaler layout="print" pageWidth={width}>
              <div className="sermon-page relative">
                {preview && !preview.isDestroyed && pages && (
                  <SermonHeader
                    editor={preview}
                    editable={false}
                    title={{ value: pages.title, editable: false, commit: () => undefined }}
                  />
                )}
                <div ref={host} key="pages" className="lab-surface" />
              </div>
            </PageScaler>
          </div>
        ) : (
          <div ref={host} key="flow" className="lab-surface" aria-hidden inert />
        )}
      </div>
    </figure>
  );
}
