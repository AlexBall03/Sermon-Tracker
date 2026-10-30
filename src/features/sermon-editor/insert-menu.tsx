"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  BookOpen,
  Bookmark,
  ChevronDown,
  CornerDownRight,
  Flag,
  MessageSquareText,
  Plus,
  ScrollText,
  Sunrise,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeptSelection } from "@/features/editor-lab/components/formatting/keep-selection";
import type { Command } from "@/features/editor-lab/outline-commands";
import {
  addPoint,
  insertNote,
  insertPassage,
  insertRolePoint,
  insertSavedPoint,
  insertScript,
  pointAtCaret,
} from "@/features/editor-lab/v4/commands";
import {
  AddSavedPoint,
  type SavedPointPlace,
  type SavedPointTarget,
} from "@/features/outlines/components/add-saved-point";
import { parseReference } from "@/features/scripture/reference";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/*
 * The Insert menu (A3, pulled forward from A1-UI.3 by the owner): every
 * semantic component the editor has, in one visible place at the start of
 * the toolbar, on a phone as on a desktop. Each item is an existing v4
 * command (`v4/commands.ts`), offered only where it applies; none is a
 * second implementation of one. Writing stays freeform: the menu adds a
 * component where the caret is and nothing else.
 *
 * It is not the whole of UI.3: slash commands, page breaks, the mobile
 * insert bar, and context menus are still to come.
 */

type Item = {
  key:
    | "introduction"
    | "point"
    | "subpoint"
    | "savedPoint"
    | "scripture"
    | "note"
    | "script"
    | "conclusion";
  icon: typeof Plus;
  command: Command | null;
};

const items: Item[] = [
  { key: "introduction", icon: Sunrise, command: insertRolePoint("introduction") },
  { key: "point", icon: Plus, command: addPoint("sibling") },
  { key: "subpoint", icon: CornerDownRight, command: addPoint("child") },
  // A point idea's title, chosen in its picker (A3.1): the dialog runs `insertSavedPoint`.
  { key: "savedPoint", icon: Bookmark, command: null },
  // The passage needs a reference first: its dialog runs `insertPassage`.
  { key: "scripture", icon: BookOpen, command: null },
  { key: "note", icon: MessageSquareText, command: insertNote },
  { key: "script", icon: ScrollText, command: insertScript },
  { key: "conclusion", icon: Flag, command: insertRolePoint("conclusion") },
];

/** Whether a passage can go anywhere near the caret: any valid reference tells. */
const anyPassage = insertPassage({
  book: 43,
  chapterStart: 3,
  verseStart: 16,
  chapterEnd: null,
  verseEnd: null,
});

/** Whether a saved point can be placed at all: a main point with no anchor always can, while editing. */
const anySavedPoint = insertSavedPoint(
  { id: "probe", title: "" },
  { anchorId: null, place: "below" },
);

export function InsertMenu({ editor }: { editor: Editor }) {
  const t = useT("sermonEditor").insert;
  const keeper = useKeptSelection(editor);
  const [scripture, setScripture] = useState(false);
  const [savedPoint, setSavedPoint] = useState<SavedPointTarget | null>(null);
  // A choice was made in the menu now closing (see the content's `onKeyDownCapture`).
  const chosen = useRef(false);
  const can = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const editable = e.isEditable;
      const check = (command: Command) => editable && command(e.state);
      return {
        introduction: check(insertRolePoint("introduction")),
        point: check(addPoint("sibling")),
        subpoint: check(addPoint("child")),
        savedPoint: check(anySavedPoint),
        scripture: check(anyPassage),
        note: check(insertNote),
        script: check(insertScript),
        conclusion: check(insertRolePoint("conclusion")),
      };
    },
  });

  return (
    <div className="flex items-center gap-0.5 border-r pr-1">
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            chosen.current = false;
            keeper.remember();
          }
        }}
      >
        <DropdownMenuTrigger
          data-testid="insert-menu"
          aria-label={t.menu}
          title={t.menu}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1 font-medium pointer-coarse:h-11",
          )}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Plus aria-hidden />
          {t.label}
          <ChevronDown className="size-3.5 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // No closing animation, so the menu gives the focus back as soon as it can.
          className="w-72 data-closed:animate-none"
          finalFocus={keeper.finalFocus}
          // Until it has (the pointer still over the item takes it back for a few frames), a key
          // pressed straight after a choice goes to the editor, at the new component: focus moved
          // in keydown takes the character with it, and the menu never sees the key (a space
          // reaching it chose the item again, A3).
          onKeyDownCapture={(event) => {
            if (!chosen.current) return;
            event.stopPropagation();
            editor.view.focus();
          }}
        >
          {items.map(({ key, icon: Icon, command }) => (
            <DropdownMenuItem
              key={key}
              data-testid={`insert-${key}`}
              disabled={!can[key]}
              onClick={() => {
                if (key === "savedPoint") {
                  const point = pointAtCaret(editor.state);
                  return setSavedPoint({
                    anchor: point
                      ? { id: point.id, name: point.title.trim() || t.thisPoint }
                      : null,
                  });
                }
                if (!command) return setScripture(true);
                chosen.current = true;
                keeper.apply(command);
              }}
              className="items-start py-2"
            >
              <Icon className="mt-0.5" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span>{t[key]}</span>
                <span className="text-xs text-muted-foreground">{t.hints[key]}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ScriptureDialog
        open={scripture}
        onClose={() => {
          setScripture(false);
          editor.commands.focus();
        }}
        onInsert={(command) => keeper.apply(command)}
      />
      <AddSavedPoint
        target={savedPoint}
        words={{ description: t.savedPointDescription, atEnd: t.savedPointAtEnd }}
        refused={t.savedPointRefused}
        onAdd={(point, place) => placeSavedPoint(editor, point, savedPoint, place)}
        onClose={() => {
          setSavedPoint(null);
          editor.commands.focus();
        }}
      />
    </div>
  );
}

/**
 * Places a copy of a saved point through the editor's own dispatch, so it
 * passes the session's write guard and its autosave like any edit. True only
 * when the document really changed: a session that may not edit (another
 * tab, a lost lock) refuses the transaction, and that is never said to be
 * added. The anchor is the point's ID, so several copies from one opening of
 * the picker all go where it was asked.
 */
export function placeSavedPoint(
  editor: Editor,
  point: { id: string; title: string },
  target: SavedPointTarget | null,
  place: SavedPointPlace,
): boolean {
  if (!target || editor.isDestroyed || !editor.isEditable) return false;
  const before = editor.state.doc;
  const command = insertSavedPoint(point, { anchorId: target.anchor?.id ?? null, place });
  if (!command(editor.state)) return false;
  command(editor.state, editor.view.dispatch);
  return editor.state.doc !== before;
}

/** Asks for a reference, then inserts its passage where the caret was. */
function ScriptureDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  /** Runs the passage's command on the selection kept from the menu; false when it cannot go there. */
  onInsert: (command: Command) => boolean;
}) {
  const t = useT("sermonEditor").insert;
  const locale = useLocale();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseReference(text, locale);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    if (!onInsert(insertPassage(parsed.reference))) {
      setProblem(t.scriptureNowhere);
      return;
    }
    setText("");
    setProblem(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setProblem(null);
          onClose();
        }
      }}
    >
      <DialogContent
        initialFocus={field}
        className="max-w-md p-5"
        data-testid="insert-scripture-dialog"
      >
        <form onSubmit={submit} className="space-y-4">
          <DialogTitle>{t.scriptureTitle}</DialogTitle>
          <div className="space-y-2">
            <Label htmlFor={id}>{t.scriptureLabel}</Label>
            <Input
              id={id}
              ref={field}
              value={text}
              placeholder={t.scripturePlaceholder}
              autoComplete="off"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${id}-problem` : undefined}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(null);
              }}
            />
            {problem && (
              <p id={`${id}-problem`} role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" data-testid="insert-scripture-submit">
              {t.scriptureInsert}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
