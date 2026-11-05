"use client";

import { closeHistory } from "@tiptap/pm/history";
import { useEditorState, type Editor } from "@tiptap/react";
import { Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { headerOffset, pageInForce, printLayoutOf } from "@/features/editor-lab/pagination/plugin";
import { paperKey } from "@/features/editor-lab/v4/paper";
import { subtitleSchema } from "@/features/editor-lab/styles/model";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/*
 * The semantic sermon header (A4.3, UI.2C): the sermon's title and its
 * optional subtitle, on the first page, directly editable.
 *
 * - **The title is the sermon's** (`ideas.title`), never the document's. The
 *   field only shows it and hands a new one to `title.commit`; the host saves
 *   it, revision-checked, outside the document (`use-sermon-title.ts`), so it
 *   is not in the document's Undo.
 * - **The subtitle is the document's** (`doc.attrs.subtitle`): a person's
 *   change is one transaction through the editor's own dispatch (so the
 *   session's write guard, autosave, recovery, and Undo all see it), made when
 *   the field is left or Enter is pressed, never per keystroke. Blank is null.
 * - **Where it sits.** In Print Layout, high in the first page's top margin,
 *   between the side margins; its height is measured and handed to the
 *   paginator (`setHeaderHeight`, view state), which starts the text below it
 *   only when it is taller than the margin leaves room for. In Regular Layout,
 *   a block above the writing. It is outside the ProseMirror body, so
 *   ownership, depth, folding, and the write guard never see it, and it prints
 *   with the page (`data-print-with-editor`).
 *
 * Paragraphs in the body styled Title or Subtitle stay ordinary writing.
 */

/** The sermon's title as the header edits it: shown, and handed on when changed. */
export type TitleControl = {
  /** What the field shows when it is not being edited: the saved title, or one waiting to be. */
  value: string;
  /** Whether the title may be changed here now. */
  editable: boolean;
  /** Called with a new title when the person leaves the field or presses Enter. Never per keystroke. */
  commit: (title: string) => void;
  /**
   * Why the title cannot be changed now, when it cannot. Where the title's
   * save stands is said by the host outside the header, so that nothing on
   * screen only changes the header's height (the printed page must match).
   */
  reason?: string;
};

export function SermonHeader({
  editor,
  title,
  editable,
}: {
  editor: Editor;
  title: TitleControl;
  /** Whether the document may be changed here now (the session's `canEdit`). */
  editable: boolean;
}) {
  const words = useT("sermonEditor").sermonHeader;
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const shown = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const page = pageInForce(current.state);
      return {
        subtitle: (current.state.doc.attrs.subtitle as string | null) ?? null,
        align: page?.headerFooter.header.titleAlign ?? "center",
        top: page ? headerOffset(page.setup) : 0,
        left: page?.setup.margins.left ?? 0,
        right: page?.setup.margins.right ?? 0,
        // The sheet's paper, as the editor has it (`v4/paper.ts`): the header sits on the page,
        // so it takes the paper's colors too, not the application theme's (white paper in a dark theme).
        paper:
          printLayoutOf(current.state)?.layout === "print"
            ? (paperKey.getState(current.state) ?? null)
            : null,
      };
    },
    equalityFn: (a, b) =>
      !!b &&
      a.subtitle === b.subtitle &&
      a.align === b.align &&
      a.top === b.top &&
      a.left === b.left &&
      a.right === b.right &&
      a.paper === b.paper,
  });

  // The running header's copies say the title the header shows.
  useEffect(() => {
    // An editor replaced under the header (a preview made again) is no longer told anything.
    if (editor.isDestroyed) return;
    editor.commands.setHeadingTitle(title.value);
  }, [editor, title.value]);

  // The header's height, for the first page's text (view state; only Print Layout uses it).
  // The paginator also reads it itself as a print begins (`data-page-header`), when no
  // observer could answer in time.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const report = () => {
      if (!editor.isDestroyed) editor.commands.setHeaderHeight(element.offsetHeight);
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [editor]);

  if (!shown) return null;
  const alignment = { left: "text-left", center: "text-center", right: "text-right" }[shown.align];

  return (
    <div
      ref={box}
      role="group"
      aria-label={words.label}
      data-testid="sermon-header"
      data-print-with-editor=""
      data-page-header=""
      data-align={shown.align}
      data-paper={shown.paper ?? undefined}
      className={cn("sermon-header", alignment)}
      // Where it sits on the first page; used only while the editor is in Print Layout (CSS).
      style={{ top: shown.top, left: shown.left, right: shown.right }}
    >
      <TitleField id={`${ids}-title`} control={title} words={words} />
      <SubtitleField
        id={`${ids}-subtitle`}
        editor={editor}
        value={shown.subtitle}
        editable={editable}
        words={words}
      />
    </div>
  );
}

type Words = ReturnType<typeof useT<"sermonEditor">>["sermonHeader"];

function TitleField({ id, control, words }: { id: string; control: TitleControl; words: Words }) {
  const [text, setText] = useState(control.value);
  const [editing, setEditing] = useState(false);
  // What is saved (or waiting) is shown again whenever the field is not being edited.
  if (!editing && text !== control.value) setText(control.value);
  /** Escape was pressed: leaving the field keeps nothing. */
  const cancelled = useRef(false);

  const finish = () => {
    setEditing(false);
    const next = text.trim();
    if (!cancelled.current && next && next !== control.value) control.commit(next);
    else setText(control.value);
    cancelled.current = false;
  };

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {words.title}
      </label>
      <div className="sermon-header-title" data-value={text || words.titlePlaceholder}>
        <textarea
          id={id}
          rows={1}
          value={text}
          readOnly={!control.editable}
          title={!control.editable ? control.reason : undefined}
          aria-describedby={`${id}-hint`}
          data-testid="sermon-header-title"
          placeholder={words.titlePlaceholder}
          maxLength={200}
          spellCheck
          onFocus={() => setEditing(true)}
          onChange={(event) => setText(event.target.value.replace(/\r?\n/g, " "))}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <span id={`${id}-hint`} className="sr-only">
        {!control.editable && control.reason ? `${control.reason} ` : ""}
        {words.titleHint}
      </span>
    </>
  );
}

function SubtitleField({
  id,
  editor,
  value,
  editable,
  words,
}: {
  id: string;
  editor: Editor;
  value: string | null;
  editable: boolean;
  words: Words;
}) {
  const [text, setText] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!editing && !problem && text !== (value ?? "")) setText(value ?? "");
  const field = useRef<HTMLTextAreaElement | null>(null);
  /** Escape was pressed: leaving the field keeps nothing. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (adding) field.current?.focus();
  }, [adding]);

  const finish = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      setText(value ?? "");
      setProblem(null);
      setAdding(false);
      return;
    }
    const next = text.trim() === "" ? null : text.trim();
    if (next !== null && !subtitleSchema.safeParse(next).success) {
      setProblem(words.subtitleInvalid);
      return;
    }
    setProblem(null);
    setAdding(false);
    if (next === value) {
      setText(value ?? "");
      return;
    }
    // One transaction, its own step in Undo, through the editor's own dispatch.
    const done = editor
      .chain()
      .command(({ tr }) => {
        closeHistory(tr.setDocAttribute("subtitle", next));
        return true;
      })
      .run();
    if (!done || editor.state.doc.attrs.subtitle !== next) setText(value ?? "");
  };

  if (value === null && !adding && !editing && !problem) {
    if (!editable) return null;
    return (
      <button
        type="button"
        data-print-hidden=""
        data-testid="sermon-header-add-subtitle"
        className="sermon-header-add"
        onClick={() => setAdding(true)}
      >
        <Plus aria-hidden className="size-3.5" />
        {words.addSubtitle}
      </button>
    );
  }

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {words.subtitle}
      </label>
      <div className="sermon-header-subtitle" data-value={text || words.subtitlePlaceholder}>
        <textarea
          ref={field}
          id={id}
          rows={1}
          value={text}
          readOnly={!editable}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          data-testid="sermon-header-subtitle"
          placeholder={words.subtitlePlaceholder}
          maxLength={200}
          spellCheck
          onFocus={() => setEditing(true)}
          onChange={(event) => {
            setText(event.target.value.replace(/\r?\n/g, " "));
            setProblem(null);
          }}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      {problem && (
        <p id={`${id}-problem`} role="alert" className="sermon-header-problem" data-print-hidden="">
          {problem}
        </p>
      )}
    </>
  );
}
