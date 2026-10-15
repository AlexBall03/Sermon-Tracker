"use client";

import { memo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  BookmarkPlus,
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
import { formatReferences, type ScriptureReference } from "@/features/scripture/reference";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { MoveDirection } from "../editor/moves";
import type { Conflict } from "../editor/store";
import { outlineLimits, type SectionType } from "../model";
import { EntryPassages, type SetReferences } from "./entry-passages";

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
  /** Shows the entry's passages, empty, with the way to add the first. */
  openPassages: (id: string) => void;
  setReferences: SetReferences;
  /** Opens the picker that places a saved point beside this one. */
  addSavedPoint: (id: string) => void;
  toggle: (id: string) => void;
  /** Makes this the selected entry, open for work with its options beneath; null selects none. */
  select: (id: string | null) => void;
  resolve: (id: string, keep: "mine" | "theirs") => void;
  startDrag: (id: string, event: React.PointerEvent<HTMLElement>) => void;
};

type OutlineRowProps = {
  id: string;
  title: string;
  notes: string;
  /**
   * The introduction or the conclusion, drawn as a point is but named instead
   * of numbered, one of each, and never moved. Left out for a point.
   */
  section?: SectionType;
  /** 0 for a main point. */
  depth: number;
  /** Its number, worked out and never stored: "II.", "1.2.". Empty where the style has none. */
  label: string;
  /** How many points are under it, at any depth. */
  nested: number;
  collapsed: boolean;
  notesOpen: boolean;
  /** The passages on it. The same array until they change, so the row is not drawn again for nothing. */
  references: ScriptureReference[];
  passagesOpen: boolean;
  /** The saved point idea it was made from, if that idea still exists. */
  sourcePointId: string | null;
  /** The outline it is in, for the way back from the Bible. */
  outlineId: string;
  /** The sermon's own passages, offered on its points. The same array for every row. */
  sermonReferences?: readonly ScriptureReference[];
  /** The ways it can move, joined by commas: "up,down,indent". */
  moves: string;
  dragging: boolean;
  /** The entry being worked on: open in a card, with its options beneath. One at a time. */
  selected: boolean;
  conflict?: Conflict;
  actions: RowActions;
};

/** Past this many levels the indentation stops growing and a small marker says the level instead. */
export const markedFromDepth = 6;

/** A heading or notes field: plain text until its entry is selected, a field once it is. */
const field = (selected: boolean) =>
  cn(
    "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 transition-[border-color,background-color,box-shadow] duration-150 outline-none focus-visible:border-ring focus-visible:shadow-focus",
    selected
      ? "placeholder:text-muted-foreground/70 hover:border-input"
      : "placeholder:text-muted-foreground placeholder:italic",
  );

/** A character count is shown once the notes are within this many of the limit. */
const countFrom = 200;

/**
 * One entry of the outline: a point, or the introduction or the conclusion.
 * At rest it reads as the outline does: its number, its heading, its notes,
 * and its passages as small tags. Selected, it opens into a card where the
 * heading and notes are fields, its passages can be changed, and its options
 * are in a bar beneath. It holds no state of its own beyond its bar's;
 * everything it shows is given, and everything it does is asked of the editor.
 *
 * At rest its words are not yet fields (`SelectCover`): a click with a mouse
 * selects the entry and puts the caret in what was clicked; on a touch screen
 * the first tap only selects it, without the keyboard, and a tap on the
 * heading of the selected entry starts typing. The keyboard reaches the fields
 * directly, and focusing one selects its entry.
 */
export const OutlineRow = memo(function OutlineRow({
  id,
  title,
  notes,
  section,
  depth,
  label,
  nested,
  collapsed,
  notesOpen,
  references,
  passagesOpen,
  sourcePointId,
  outlineId,
  sermonReferences,
  moves,
  dragging,
  selected,
  conflict,
  actions,
}: OutlineRowProps) {
  const t = useT("outlines").editor;
  const can = new Set(moves ? moves.split(",") : []);
  const name = section
    ? t.sections[section]
    : [label, title.trim() || t.untitled].filter(Boolean).join(" ");
  // Opened and left empty, notes and passages fold away with the card.
  const showNotes = notes !== "" || (selected && notesOpen);
  const showPassages = references.length > 0 || (selected && passagesOpen);
  const left = outlineLimits.notes - [...notes].length;
  // The bar is drawn from the first time the entry is selected, and stays, so it can fold away.
  const [barDrawn, setBarDrawn] = useState(selected);
  if (selected && !barDrawn) setBarDrawn(true);

  /** A tap on an entry that is not selected: it selects it, and leaves typing elsewhere. */
  function selectHere() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest(`[data-entry-id="${id}"]`)) active.blur();
    actions.select(id);
  }

  function onTitleKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      actions.select(null);
      return;
    }
    if (section) {
      // A section has nothing below it to add: Enter goes on to its notes.
      if (event.key === "Enter") {
        event.preventDefault();
        actions.openNotes(id);
      }
      return;
    }
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
    if (
      event.key === "Backspace" &&
      title === "" &&
      notes === "" &&
      references.length === 0 &&
      nested === 0
    ) {
      event.preventDefault();
      actions.remove(id);
    }
  }

  const card = (
    <div
      data-selected={selected || undefined}
      className={cn(
        "group/card rounded-xl border transition-[background-color,border-color,box-shadow] duration-200 ease-in-out",
        selected
          ? "border-border bg-surface shadow-card"
          : "cursor-pointer border-transparent pointer-fine:hover:bg-muted/60",
      )}
    >
      <div
        data-row
        role="group"
        aria-label={section ? name : `${name}, ${t.row.level(depth + 1)}`}
        onFocus={() => {
          if (!selected) actions.select(id);
        }}
        onClick={(event) => {
          // The row's own ground (its number, its margins) selects it too.
          if (selected || (event.target as HTMLElement).closest("button, a, input, textarea"))
            return;
          selectHere();
        }}
        className="flex items-start gap-0.5 py-1 pr-1"
      >
        {!section && (
          <>
            {/* For a pointer or a finger, in sight on the entry being worked on. The bar and the keyboard move a point without it. */}
            <span
              aria-hidden
              title={t.row.drag}
              data-grip
              onPointerDown={(event) => actions.startDrag(id, event)}
              className={cn(
                "grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/60 transition-[color,background-color,opacity] duration-150 select-none hover:bg-accent hover:text-foreground active:cursor-grabbing active:bg-foreground/10 pointer-coarse:order-last pointer-coarse:h-11 pointer-coarse:w-8",
                selected
                  ? "pointer-coarse:grid"
                  : "pointer-coarse:hidden pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100",
              )}
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
                  className={cn(
                    "size-4 transition-transform duration-150",
                    !collapsed && "rotate-90",
                  )}
                  aria-hidden
                />
              </button>
            ) : (
              <span className="w-6 shrink-0 pointer-coarse:w-8" aria-hidden />
            )}
          </>
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

        {/* A section lines up with the points' numbers, where its own name stands instead of one. */}
        <div className={cn("min-w-0 flex-1", section && "pl-11 pointer-coarse:pl-7")}>
          {section && (
            <p
              aria-hidden
              className="px-2 pt-1 text-[0.6875rem] font-bold tracking-[0.09em] text-muted-foreground uppercase"
            >
              {name}
            </p>
          )}
          <div className="relative">
            <input
              data-field="title"
              value={title}
              onChange={(event) => actions.setTitle(id, event.target.value)}
              onBlur={() => actions.blur(id)}
              onKeyDown={onTitleKey}
              placeholder={
                section ? t.placeholders[section] : selected ? t.placeholders.point : t.untitled
              }
              aria-label={
                section ? `${name}: ${t.heading}` : label ? t.headingOf(label) : t.heading
              }
              maxLength={outlineLimits.title}
              autoComplete="off"
              enterKeyHint={section ? "next" : "enter"}
              className={cn(
                field(selected),
                "h-9 font-serif text-[1.0625rem] pointer-coarse:h-11",
                depth === 0 && "font-medium",
              )}
            />
            {!selected && <SelectCover onSelect={selectHere} />}
          </div>
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
                aria-label={section ? `${name}: ${t.notes}` : t.notesOf(name)}
                maxLength={outlineLimits.notes}
                rows={1}
                className={cn(
                  field(selected),
                  "block field-sizing-content min-h-7 resize-none py-1 text-base leading-relaxed text-muted-foreground focus-visible:text-foreground md:text-sm md:leading-relaxed",
                )}
              />
              {left <= countFrom && (
                <p className="px-2 text-right text-xs text-muted-foreground tabular-nums">
                  {t.remaining(left)}
                </p>
              )}
              {!selected && <SelectCover onSelect={selectHere} />}
            </div>
          ) : null}
          {selected && showPassages ? (
            <EntryPassages
              entryId={id}
              outlineId={outlineId}
              references={references}
              suggested={sermonReferences}
              setReferences={actions.setReferences}
              className="mt-2 mb-1 ml-2 animate-menu"
            />
          ) : references.length > 0 ? (
            <PassageTags references={references} name={name} />
          ) : null}
          {sourcePointId && <SourceLink pointId={sourcePointId} name={name} />}
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
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,opacity] duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 data-popup-open:bg-accent data-popup-open:text-foreground pointer-coarse:size-11",
              // At rest it waits for the pointer, the keyboard, or the entry being selected.
              !selected &&
                "pointer-coarse:hidden pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:data-popup-open:opacity-100",
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {!section && (
              <>
                <DropdownMenuItem onClick={() => actions.addBelow(id)}>
                  <Plus aria-hidden />
                  {t.row.addBelow}
                  <DropdownMenuShortcut>{t.shortcuts.addBelow}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.addSavedPoint(id)}>
                  <BookmarkPlus aria-hidden />
                  {t.row.addSavedPoint}
                </DropdownMenuItem>
                {can.has("top") && (
                  <DropdownMenuItem onClick={() => actions.move(id, "top")}>
                    <ChevronsLeft aria-hidden />
                    {t.row.toTop}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => actions.remove(id)}>
              <Trash2 aria-hidden />
              {t.row.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {barDrawn && (
        <PointBar
          id={id}
          name={name}
          section={section !== undefined}
          open={selected}
          showNotes={showNotes}
          showPassages={showPassages}
          can={can}
          actions={actions}
        />
      )}
    </div>
  );

  if (section) {
    return (
      <section data-entry-id={id} aria-label={name} className="scroll-mt-32 scroll-mb-28">
        {card}
      </section>
    );
  }
  return (
    <li
      data-entry-id={id}
      data-depth={depth}
      style={{ "--depth": depth } as React.CSSProperties}
      className={cn(
        // Clear of the sticky bars when a move brings it back into view.
        "scroll-mt-32 scroll-mb-28 pl-[min(calc(var(--depth)*var(--outline-step)),var(--outline-cap))] transition-opacity duration-150",
        dragging && "opacity-50",
      )}
    >
      {card}
    </li>
  );
});

/**
 * An entry's passages at rest: small tags that read as the outline does. They
 * are not buttons; selecting the entry opens them for change, for their text,
 * and for the way to the Bible.
 */
function PassageTags({ references, name }: { references: ScriptureReference[]; name: string }) {
  const t = useT("outlines").editor;
  const locale = useLocale();
  return (
    <ul aria-label={t.passagesOf(name)} className="mt-1 mb-1 ml-2 flex flex-wrap gap-1.5">
      {references.map((reference, index) => (
        <li
          key={index}
          className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-surface px-2.5 font-serif text-sm italic pointer-coarse:h-7"
        >
          <BookOpen className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          {formatReferences([reference], locale)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Laid over a heading or the notes of an entry that is not selected, so the
 * entry at rest reads as text and is not yet a field. A click with a mouse or
 * a pen selects the entry and puts the caret in the field beneath, at its end;
 * a tap on a touch screen only selects it, without bringing up the keyboard.
 */
function SelectCover({ onSelect }: { onSelect: () => void }) {
  const pointer = useRef("");
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onPointerDown={(event) => {
        pointer.current = event.pointerType;
      }}
      onClick={(event) => {
        const typing = pointer.current === "mouse" || pointer.current === "pen";
        const target = event.currentTarget.parentElement?.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >("[data-field]");
        onSelect();
        if (!typing || !target) return;
        target.focus();
        target.setSelectionRange(target.value.length, target.value.length);
      }}
      className="absolute inset-0 cursor-pointer rounded-md [-webkit-tap-highlight-color:transparent]"
    />
  );
}

const barButton =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium text-muted-foreground transition-[color,background-color,scale,opacity] duration-150 outline-none [-webkit-tap-highlight-color:transparent] hover:bg-accent hover:text-foreground focus-visible:shadow-focus active:scale-95 active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-35 pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0";

type BarItem = {
  key: string;
  label: string;
  /** Shown beside the icon; the move arrows have only their icon. */
  short?: string;
  title: string;
  icon: React.ReactNode;
  disabled?: boolean;
  run: () => void;
};

/**
 * The selected entry's options, along the foot of its card. Pressing one never
 * takes the focus, so a heading being typed keeps its caret and a phone keeps
 * its keyboard. It is one stop for Tab, and the arrow keys move along it, as a
 * toolbar does. It unfolds and folds on its own height, so the entries beneath
 * glide rather than jump. A section has no subpoint and no moves.
 */
function PointBar({
  id,
  name,
  section,
  open,
  showNotes,
  showPassages,
  can,
  actions,
}: {
  id: string;
  name: string;
  section: boolean;
  open: boolean;
  showNotes: boolean;
  showPassages: boolean;
  can: ReadonlySet<string>;
  actions: RowActions;
}) {
  const t = useT("outlines").editor;
  const bar = useRef<HTMLDivElement>(null);
  const [stop, setStop] = useState<string | null>(null);
  const withShortcut = (label: string, shortcut: string) => `${label} · ${shortcut}`;

  const adds = (
    [
      !showNotes && {
        key: "notes",
        label: t.row.addNotes,
        short: t.row.bar.notes,
        title: t.row.addNotes,
        icon: <NotebookPen aria-hidden />,
        run: () => actions.openNotes(id),
      },
      !showPassages && {
        key: "passage",
        label: t.row.addPassage,
        short: t.row.bar.passage,
        title: t.row.addPassage,
        icon: <BookOpen aria-hidden />,
        run: () => actions.openPassages(id),
      },
      !section && {
        key: "subpoint",
        label: t.row.addSubpoint,
        short: t.row.bar.subpoint,
        title: withShortcut(t.row.addSubpoint, t.shortcuts.addSubpoint),
        icon: <CornerDownRight aria-hidden />,
        run: () => actions.addSubpoint(id),
      },
    ] as (BarItem | false)[]
  ).filter((item): item is BarItem => item !== false);
  const moves: BarItem[] = section
    ? []
    : (
        [
          ["up", t.row.moveUp, t.shortcuts.moveUp, <ArrowUp key="up" aria-hidden />],
          ["down", t.row.moveDown, t.shortcuts.moveDown, <ArrowDown key="down" aria-hidden />],
          ["outdent", t.row.outdent, t.shortcuts.outdent, <IndentDecrease key="out" aria-hidden />],
          ["indent", t.row.indent, t.shortcuts.indent, <IndentIncrease key="in" aria-hidden />],
        ] as const
      ).map(([direction, label, shortcut, icon]) => ({
        key: direction,
        label,
        title: withShortcut(label, shortcut),
        icon,
        disabled: !can.has(direction),
        run: () => actions.move(id, direction),
      }));

  // The one button Tab lands on: the last one used, while it can still be pressed.
  const enabled = [...adds, ...moves].filter((item) => !item.disabled);
  const tabStop = enabled.find((item) => item.key === stop)?.key ?? enabled[0]?.key;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      bar.current
        ?.closest("[data-entry-id]")
        ?.querySelector<HTMLElement>('[data-field="title"]')
        ?.focus();
      return;
    }
    const buttons = [
      ...(bar.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: buttons.length - 1,
    }[event.key];
    if (next === undefined || buttons.length === 0) return;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length].focus();
  }

  const button = (item: BarItem) => (
    <button
      key={item.key}
      type="button"
      aria-label={item.label}
      title={item.title}
      disabled={item.disabled}
      tabIndex={item.key === tabStop ? 0 : -1}
      // Pressed without taking the focus: the caret, and a phone's keyboard, stay where they are.
      onMouseDown={(event) => event.preventDefault()}
      onFocus={() => setStop(item.key)}
      onClick={item.run}
      className={cn(
        barButton,
        item.short ? "px-2.5 pointer-coarse:px-3" : "w-8 pointer-coarse:w-11",
      )}
    >
      {item.icon}
      {item.short && <span aria-hidden>{item.short}</span>}
    </button>
  );

  return (
    <div
      inert={!open}
      aria-hidden={open ? undefined : true}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          ref={bar}
          role="toolbar"
          aria-label={t.row.bar.label(name)}
          onKeyDown={onKeyDown}
          className={cn(
            // In line with the heading where there is room; nearer the edge on a phone.
            "mt-1 flex flex-wrap items-center gap-1 border-t py-1.5 pr-1.5 transition-transform duration-200 ease-in-out",
            section ? "pl-2" : "pl-11 pointer-coarse:pl-1.5",
            open ? "translate-y-0" : "-translate-y-1.5",
          )}
        >
          {adds.map(button)}
          {moves.length > 0 && (
            <div className="ml-auto flex items-center gap-0.5">
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              {moves.map(button)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Says an entry was made from a saved point idea, and leads to that idea. The
 * two are edited apart: this is only where the entry came from.
 */
export function SourceLink({ pointId, name }: { pointId: string; name: string }) {
  const t = useT("outlines").editor;
  return (
    <Link
      href={`${routes.library}/${pointId}`}
      aria-label={t.openSource(name)}
      className="mb-1 ml-2 inline-flex min-h-7 items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-primary active:text-primary pointer-coarse:min-h-9"
    >
      <BookmarkPlus className="size-3.5" aria-hidden />
      {t.fromSavedPoint}
    </Link>
  );
}

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
  const locale = useLocale();
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
      {conflict.references !== undefined && (
        <p className="mt-1.5 text-muted-foreground">
          {t.theirPassages}{" "}
          <span className="font-serif text-foreground italic">
            {conflict.references.length > 0
              ? formatReferences(conflict.references, locale)
              : t.empty}
          </span>
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
