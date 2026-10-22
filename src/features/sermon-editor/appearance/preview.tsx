"use client";

import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef, useState } from "react";

import { findComponent } from "@/features/editor-lab/styles/component-node";
import { isDirty } from "@/features/editor-lab/styles/draft";
import type { ComponentKind } from "@/features/editor-lab/styles/model";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
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
}: {
  session: AppearanceSession;
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
  const live = session.editor;
  const labels = t.v4.components;

  // One read-only editor for as long as the window is open.
  useEffect(() => {
    if (!host.current) return;
    // The paper the outline is drawn on (Print Layout), so colors show as they will there.
    const paper = live.view.dom.getAttribute("data-paper");
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
    setPreview(editor);
    return () => {
      setPreview(null);
      editor.destroy();
    };
  }, [live, locale, labels]);

  // The blocks, in a document with the outline's own settings (numbering, translation, styles).
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    const attrs = live.state.doc.toJSON().attrs as Record<string, unknown>;
    const loaded = loadV4(preview, { type: "doc", attrs, content }, "appearance-preview");
    if (!loaded.ok) return;
    // A passage shows its verses (Regular Layout draws them only when expanded).
    preview.commands.setPassagesExpanded(true);
  }, [preview, live, content]);

  // The outline's committed styles, followed (an Undo underneath shows here too).
  const stored = session.stored;
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    if (preview.state.doc.attrs.styles === stored) return;
    preview.view.dispatch(
      preview.state.tr.setDocAttribute("styles", stored).setMeta("addToHistory", false),
    );
  }, [preview, stored, content]);

  // The draft, as the outline shows it.
  const { draft } = session;
  useEffect(() => {
    if (!preview || preview.isDestroyed) return;
    preview.commands.setStylesPreview(isDirty(draft) ? { draft } : null);
  }, [preview, draft, stored, content]);

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
  }, [preview, mark, content]);

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
        <div ref={host} className="lab-surface" aria-hidden inert />
      </div>
    </figure>
  );
}
