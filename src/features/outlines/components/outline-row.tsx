"use client";

import { memo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsLeft,
  CornerDownRight,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { MoveDirection } from "../editor/moves";
import type { Conflict } from "../editor/store";
import { outlineLimits } from "../model";

/** What a row asks of the editor. One object for every row, so a row is drawn again only when it changes. */
export type RowActions = {
  setTitle: (id: string, value: string) => void;
  setNotes: (id: string, value: string) => void;
  blur: (id: string) => void;
  addBelow: (id: string) => void;
  addSubpoint: (id: string) => void;
  move: (id: string, direction: MoveDirection) => void;
  /** Asks first, unless the point is empty and has nothing under it. */
  remove: (id: string) => void;
  openNotes: (id: string) => void;
  toggle: (id: string) => void;
  resolve: (id: string, keep: "mine" | "theirs") => void;
  startDrag: (id: string, event: React.PointerEvent<HTMLElement>) => void;
};

type OutlineRowProps = {
  id: string;
  title: string;
  notes: string;
  /** 0 for a main point. */
  depth: number;
  /** Its number, worked out and never stored: "II.", "1.2.". Empty where the style has none. */
  label: string;
  /** How many points are under it, at any depth. */
  nested: number;
  collapsed: boolean;
  notesOpen: boolean;
  /** The ways it can move, joined by commas: "up,down,indent". */
  moves: string;
  dragging: boolean;
  conflict?: Conflict;
  actions: RowActions;
};

/** Past this many levels the indentation stops growing and a small marker says the level instead. */
export const markedFromDepth = 6;

const field =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 transition-[border-color,background-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/70 hover:border-input focus-visible:border-ring focus-visible:bg-surface focus-visible:shadow-focus";

/** A character count is shown once the notes are within this many of the limit. */
const countFrom = 200;

/**
 * One point of the outline: its grip, its fold, its number, its heading, its
 * notes, and its menu. The heading and notes are edited in place. It holds no
 * state of its own; everything it shows is given, and everything it does is
 * asked of the editor.
 */
export const OutlineRow = memo(function OutlineRow({
  id,
  title,
  notes,
  depth,
  label,
  nested,
  collapsed,
  notesOpen,
  moves,
  dragging,
  conflict,
  actions,
}: OutlineRowProps) {
  const t = useT("outlines").editor;
  const can = new Set(moves ? moves.split(",") : []);
  const name = [label, title.trim() || t.untitled].filter(Boolean).join(" ");
  const showNotes = notesOpen || notes !== "";
  const left = outlineLimits.notes - [...notes].length;

  function onTitleKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) actions.addSubpoint(id);
      else actions.addBelow(id);
      return;
    }
    if (event.altKey && event.shiftKey) {
      const direction = (
        { ArrowUp: "up", ArrowDown: "down", ArrowRight: "indent", ArrowLeft: "outdent" } as const
      )[event.key];
      if (direction) {
        event.preventDefault();
        actions.move(id, direction);
      }
      return;
    }
    // An empty point with nothing under it goes without a question.
    if (event.key === "Backspace" && title === "" && notes === "" && nested === 0) {
      event.preventDefault();
      actions.remove(id);
    }
  }

  return (
    <li
      data-entry-id={id}
      data-depth={depth}
      style={{ "--depth": depth } as React.CSSProperties}
      className={cn(
        "pl-[min(calc(var(--depth)*var(--outline-step)),var(--outline-cap))] transition-opacity duration-150",
        dragging && "opacity-50",
      )}
    >
      <div
        data-row
        role="group"
        aria-label={`${name}, ${t.row.level(depth + 1)}`}
        className="group/row flex items-start gap-0.5 rounded-lg py-0.5 transition-colors duration-150 focus-within:bg-muted/60"
      >
        {/* For a pointer or a finger. The menu and the keyboard move a point without it. */}
        <span
          aria-hidden
          title={t.row.drag}
          data-grip
          onPointerDown={(event) => actions.startDrag(id, event)}
          className="grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/60 transition-colors duration-150 select-none hover:bg-accent hover:text-foreground active:cursor-grabbing active:bg-foreground/10 pointer-coarse:h-11 pointer-coarse:w-8"
        >
          <GripVertical className="size-4" />
        </span>
        {nested > 0 ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.row.expand(name) : t.row.collapse(name)}
            onClick={() => actions.toggle(id)}
            className="grid h-9 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:h-11 pointer-coarse:w-8"
          >
            <ChevronRight
              className={cn("size-4 transition-transform duration-150", !collapsed && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-6 shrink-0 pointer-coarse:w-8" aria-hidden />
        )}
        {depth >= markedFromDepth && (
          <span
            title={t.row.level(depth + 1)}
            className="mt-2 shrink-0 rounded bg-secondary px-1 text-[0.6875rem] leading-5 font-semibold text-muted-foreground tabular-nums pointer-coarse:mt-3"
          >
            <span className="sr-only">{t.row.level(depth + 1)}</span>
            <span aria-hidden>{depth + 1}</span>
          </span>
        )}
        {label && (
          <span
            data-label
            aria-hidden
            className={cn(
              "max-w-[40%] shrink-0 truncate pt-[0.4375rem] pl-1 tabular-nums pointer-coarse:pt-[0.6875rem]",
              depth === 0 ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
            )}
          >
            {label}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <input
            data-field="title"
            value={title}
            onChange={(event) => actions.setTitle(id, event.target.value)}
            onBlur={() => actions.blur(id)}
            onKeyDown={onTitleKey}
            placeholder={t.placeholders.point}
            aria-label={label ? t.headingOf(label) : t.heading}
            maxLength={outlineLimits.title}
            autoComplete="off"
            enterKeyHint="enter"
            className={cn(
              field,
              "h-9 font-serif text-[1.0625rem] pointer-coarse:h-11",
              depth === 0 && "font-medium",
            )}
          />
          {showNotes ? (
            <div className="relative">
              <textarea
                data-field="notes"
                value={notes}
                onChange={(event) => actions.setNotes(id, event.target.value)}
                onBlur={() => actions.blur(id)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.stopPropagation();
                  event.currentTarget
                    .closest("[data-row]")
                    ?.querySelector<HTMLElement>('[data-field="title"]')
                    ?.focus();
                }}
                placeholder={t.placeholders.notes}
                aria-label={t.notesOf(name)}
                maxLength={outlineLimits.notes}
                rows={1}
                className={cn(
                  field,
                  "mt-0.5 block field-sizing-content min-h-8 resize-none py-1.5 text-base leading-relaxed text-muted-foreground focus-visible:text-foreground md:text-sm md:leading-relaxed",
                )}
              />
              {left <= countFrom && (
                <p className="px-2 text-right text-xs text-muted-foreground tabular-nums">
                  {t.remaining(left)}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => actions.openNotes(id)}
              className="mb-1 ml-2 hidden min-h-7 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 group-focus-within/row:inline-flex hover:text-foreground pointer-coarse:min-h-9"
            >
              <Plus className="size-3.5" aria-hidden />
              {t.addNotes}
            </button>
          )}
          {conflict && <ConflictPanel id={id} conflict={conflict} resolve={actions.resolve} />}
        </div>

        {collapsed && nested > 0 && (
          <span className="mt-2 shrink-0 rounded-full bg-secondary px-2 text-xs leading-5 font-medium whitespace-nowrap text-muted-foreground pointer-coarse:mt-3">
            {t.row.hidden(nested)}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t.row.actions(name)}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 data-popup-open:bg-accent data-popup-open:text-foreground pointer-coarse:size-11"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => actions.addSubpoint(id)}>
              <CornerDownRight aria-hidden />
              {t.row.addSubpoint}
              <DropdownMenuShortcut>{t.shortcuts.addSubpoint}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.addBelow(id)}>
              <Plus aria-hidden />
              {t.row.addBelow}
              <DropdownMenuShortcut>{t.shortcuts.addBelow}</DropdownMenuShortcut>
            </DropdownMenuItem>
            {!showNotes && (
              <DropdownMenuItem onClick={() => actions.openNotes(id)}>
                <NotebookPen aria-hidden />
                {t.row.addNotes}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* These stay open, so a point can be walked several places with one finger. */}
            <DropdownMenuItem
              closeOnClick={false}
              disabled={!can.has("up")}
              onClick={() => actions.move(id, "up")}
            >
              <ArrowUp aria-hidden />
              {t.row.moveUp}
              <DropdownMenuShortcut>{t.shortcuts.moveUp}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={false}
              disabled={!can.has("down")}
              onClick={() => actions.move(id, "down")}
            >
              <ArrowDown aria-hidden />
              {t.row.moveDown}
              <DropdownMenuShortcut>{t.shortcuts.moveDown}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={false}
              disabled={!can.has("indent")}
              onClick={() => actions.move(id, "indent")}
            >
              <IndentIncrease aria-hidden />
              {t.row.indent}
              <DropdownMenuShortcut>{t.shortcuts.indent}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={false}
              disabled={!can.has("outdent")}
              onClick={() => actions.move(id, "outdent")}
            >
              <IndentDecrease aria-hidden />
              {t.row.outdent}
              <DropdownMenuShortcut>{t.shortcuts.outdent}</DropdownMenuShortcut>
            </DropdownMenuItem>
            {can.has("top") && (
              <DropdownMenuItem onClick={() => actions.move(id, "top")}>
                <ChevronsLeft aria-hidden />
                {t.row.toTop}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => actions.remove(id)}>
              <Trash2 aria-hidden />
              {t.row.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});

/**
 * Shown under an entry whose words were changed here and somewhere else at
 * once: what the server holds, and the two ways to settle it. Nothing of
 * either is thrown away until one is chosen.
 */
export function ConflictPanel({
  id,
  conflict,
  resolve,
}: {
  id: string;
  conflict: Conflict;
  resolve: (id: string, keep: "mine" | "theirs") => void;
}) {
  const t = useT("outlines").editor.conflict;
  return (
    <div
      role="alert"
      className="mx-2 mt-1.5 mb-2 animate-menu rounded-lg border border-destructive/40 bg-surface px-3 py-2.5 text-sm"
    >
      <p className="font-semibold">{t.title}</p>
      {conflict.title !== undefined && (
        <p className="mt-1.5 text-muted-foreground">
          {t.theirTitle}{" "}
          <span className="font-serif text-foreground">{conflict.title || t.empty}</span>
        </p>
      )}
      {conflict.notes !== undefined && (
        <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
          {t.theirNotes} <span className="text-foreground">{conflict.notes || t.empty}</span>
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => resolve(id, "mine")}>
          {t.keepMine}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => resolve(id, "theirs")}>
          {t.useTheirs}
        </Button>
      </div>
    </div>
  );
}
