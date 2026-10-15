import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  BookmarkPlus,
  Check,
  ChevronRight,
  CornerDownRight,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  ListOrdered,
  MoreHorizontal,
  NotebookPen,
  Plus,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { defaultNumbering, entryLabel } from "@/features/outlines/numbering";
import { formatReference } from "@/features/scripture/reference";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { demoWorkspace, type DemoOutlineEntry } from "../demo";
import { place, WindowFrame } from "./frames";

/** A heading or a note at rest: the editor's fields have no border until they are focused. */
const field = "px-2";
/** An entry's card: clear at rest, raised when it is the one selected (`OutlineRow`). */
const card = "rounded-xl border";
/** A passage at rest, as `PassageTags` draws it. */
const tag =
  "inline-flex h-6 items-center gap-1.5 rounded-full border bg-surface px-2.5 font-serif text-sm italic";
/** A button of the selected entry's bar, as `PointBar` draws it. */
const barButton =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * The outline editor, drawn from `OutlineEditor` and `OutlineRow`: the save
 * status and numbering, the introduction, the points with their subpoints and
 * passages, and the conclusion, read as an outline, with one subpoint selected
 * and its bar of options open beneath it. The labels are the application's
 * own, worked out by `entryLabel` in the default style, so they cannot drift
 * from it.
 */
export function OutlineWindow({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const t = dictionary(locale, "outlines");
  const { sermon, entries } = workspace.outline;
  const section = (type: "introduction" | "conclusion") =>
    entries.find((entry) => entry.type === type);
  const points = entries.filter((entry) => entry.type === "point");
  const under = (entry: DemoOutlineEntry, other: DemoOutlineEntry) =>
    other.path.length === entry.path.length + 1 &&
    entry.path.every((place, index) => other.path[index] === place);
  const hasChildren = (entry: DemoOutlineEntry) => points.some((other) => under(entry, other));
  // The point shown at work: a plain subpoint, so its bar offers everything.
  const selected = points.find(
    (entry) =>
      entry.path.length > 1 &&
      !entry.notes &&
      entry.references.length === 0 &&
      !entry.sourcePointId,
  );

  const tags = (entry: DemoOutlineEntry) =>
    entry.references.length > 0 && (
      <div className="mt-1 mb-1 ml-2 flex flex-wrap gap-1.5">
        {entry.references.map((reference) => (
          <span key={formatReference(reference)} className={tag}>
            <BookOpen className="size-3 shrink-0 text-muted-foreground" />
            {formatReference(reference, locale)}
          </span>
        ))}
      </div>
    );

  const drawSection = (type: "introduction" | "conclusion", first = false) => {
    const entry = section(type);
    if (!entry) return null;
    return (
      <div className={cn(!first && "mt-3 border-t pt-3")}>
        <div className={cn(card, "border-transparent py-1 pr-1")}>
          <div className="pl-11">
            <p className="px-2 pt-1 text-[0.6875rem] font-bold tracking-[0.09em] text-muted-foreground uppercase">
              {t.editor.sections[type]}
            </p>
            <p className={cn(field, "flex h-9 items-center font-serif text-[1.0625rem]")}>
              {entry.title}
            </p>
            {entry.notes && (
              <p className={cn(field, "py-1 text-sm leading-relaxed text-muted-foreground")}>
                {entry.notes}
              </p>
            )}
            {tags(entry)}
          </div>
        </div>
      </div>
    );
  };

  const bar = (entry: DemoOutlineEntry) => {
    const last = entry.path[entry.path.length - 1];
    const parent = entry.path.slice(0, -1);
    const hasNext = points.some(
      (other) =>
        other.path.length === entry.path.length &&
        parent.every((place, index) => other.path[index] === place) &&
        other.path[other.path.length - 1] === last + 1,
    );
    const moves = [
      { icon: <ArrowUp />, off: last === 1 },
      { icon: <ArrowDown />, off: !hasNext },
      { icon: <IndentDecrease />, off: entry.path.length === 1 },
      { icon: <IndentIncrease />, off: last === 1 },
    ];
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 border-t py-1.5 pr-1.5 pl-11">
        <span className={cn(barButton, "px-2.5")}>
          <NotebookPen />
          {t.editor.row.bar.notes}
        </span>
        <span className={cn(barButton, "px-2.5")}>
          <BookOpen />
          {t.editor.row.bar.passage}
        </span>
        <span className={cn(barButton, "px-2.5")}>
          <CornerDownRight />
          {t.editor.row.bar.subpoint}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <span className="mx-1 h-5 w-px bg-border" />
          {moves.map((move, index) => (
            <span key={index} className={cn(barButton, "w-8", move.off && "opacity-35")}>
              {move.icon}
            </span>
          ))}
        </span>
      </div>
    );
  };

  return (
    <WindowFrame
      locale={locale}
      current="outlines"
      initials={workspace.initials}
      className={className}
    >
      <div className="px-8 py-10">
        <p className="mb-3 -ml-1 inline-flex min-h-8 items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="size-4" />
          {t.page.back}
        </p>
        <div className="border-b pb-6">
          <p className="font-display text-[2.125rem] leading-tight font-medium tracking-[-0.015em]">
            {t.page.title}
          </p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t.page.sermon}{" "}
            <span className="font-serif font-medium text-foreground">{sermon.title}</span>
          </p>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-x-4 border-b py-2">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Check className="size-4 shrink-0" />
            {t.editor.status.saved}
          </p>
          <div className="flex items-center gap-1.5">
            <span className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ListOrdered />
              {t.editor.numbering}
            </span>
            <span className="grid size-9 place-items-center text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </span>
          </div>
        </div>

        <div className="mt-5 max-w-3xl">
          {drawSection("introduction", true)}
          <div className="mt-3 border-t pt-3">
            {points.map((entry, index) => {
              const depth = entry.path.length - 1;
              const at = entry === selected;
              return (
                <div
                  key={entry.id}
                  className="stagger"
                  style={{ ...place(index), paddingLeft: `${depth * 1.75}rem` }}
                >
                  <div
                    className={cn(
                      card,
                      at ? "border-border bg-surface shadow-card" : "border-transparent",
                    )}
                  >
                    <div className="flex items-start gap-0.5 py-1 pr-1">
                      <span
                        className={cn(
                          "grid h-9 w-6 shrink-0 place-items-center text-muted-foreground/60",
                          !at && "opacity-0",
                        )}
                      >
                        <GripVertical className="size-4" />
                      </span>
                      {hasChildren(entry) ? (
                        <span className="grid h-9 w-6 shrink-0 place-items-center text-muted-foreground">
                          <ChevronRight className="size-4 rotate-90" />
                        </span>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "shrink-0 pt-[0.4375rem] pl-1 tabular-nums",
                          depth === 0
                            ? "font-semibold text-foreground"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {entryLabel(defaultNumbering, entry.path)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            field,
                            "flex h-9 items-center font-serif text-[1.0625rem]",
                            depth === 0 && "font-medium",
                          )}
                        >
                          <span className="truncate">{entry.title}</span>
                        </p>
                        {entry.notes && (
                          <p
                            className={cn(
                              field,
                              "py-1 text-sm leading-relaxed text-muted-foreground",
                            )}
                          >
                            {entry.notes}
                          </p>
                        )}
                        {tags(entry)}
                        {entry.sourcePointId && (
                          <p className="mb-1 ml-2 inline-flex min-h-7 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <BookmarkPlus className="size-3.5" />
                            {t.editor.fromSavedPoint}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center text-muted-foreground",
                          !at && "opacity-0",
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </span>
                    </div>
                    {at && bar(entry)}
                  </div>
                </div>
              );
            })}
            <div className="mt-2 flex flex-wrap gap-1 pl-10">
              <span className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Plus />
                {t.editor.addPoint}
              </span>
              <span className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <BookmarkPlus />
                {t.editor.addSavedPoint}
              </span>
            </div>
          </div>
          {drawSection("conclusion")}
        </div>
      </div>
    </WindowFrame>
  );
}
