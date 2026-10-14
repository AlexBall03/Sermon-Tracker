import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  ChevronRight,
  GripVertical,
  ListOrdered,
  MoreHorizontal,
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
import { chip } from "./library-preview";

const sectionHeading = "text-lg font-semibold";
/** A heading or a note at rest: the editor's fields have no border until they are focused. */
const field = "px-2";

/**
 * The outline editor, drawn from `OutlineEditor` and `OutlineRow`: the save
 * status and numbering, the introduction, the points with their subpoints and
 * passages, and the conclusion. The labels are the application's own, worked
 * out by `entryLabel` in the default style, so they cannot drift from it.
 */
export function OutlineWindow({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const t = dictionary(locale, "outlines");
  const { sermon, entries } = workspace.outline;
  const section = (type: "introduction" | "conclusion") =>
    entries.find((entry) => entry.type === type);
  const points = entries.filter((entry) => entry.type === "point");
  const hasChildren = (entry: DemoOutlineEntry) =>
    points.some(
      (other) =>
        other.path.length === entry.path.length + 1 &&
        entry.path.every((place, index) => other.path[index] === place),
    );

  const drawSection = (type: "introduction" | "conclusion", first = false) => {
    const entry = section(type);
    if (!entry) return null;
    return (
      <div className={cn(!first && "mt-6 border-t pt-5")}>
        <p className={sectionHeading}>{t.editor.sections[type]}</p>
        <p className={cn(field, "mt-1 -ml-2 flex h-9 items-center font-serif text-[1.0625rem]")}>
          {entry.title}
        </p>
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

        <div className="mt-6 max-w-4xl">
          {drawSection("introduction", true)}
          <div className="mt-6 border-t pt-5">
            <p className={sectionHeading}>{t.editor.sections.points}</p>
            <div className="mt-2">
              {points.map((entry, index) => {
                const depth = entry.path.length - 1;
                return (
                  <div
                    key={entry.id}
                    className="flex stagger items-start gap-0.5 py-0.5"
                    style={{ ...place(index), paddingLeft: `${depth * 1.75}rem` }}
                  >
                    <span className="grid h-9 w-6 shrink-0 place-items-center text-muted-foreground/60">
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
                            "mt-0.5 py-1.5 text-sm leading-relaxed text-muted-foreground",
                          )}
                        >
                          {entry.notes}
                        </p>
                      )}
                      {entry.references.length > 0 && (
                        <div className="mt-1 mb-2 ml-2 flex flex-wrap gap-2">
                          {entry.references.map((reference) => (
                            <span key={formatReference(reference)} className={chip}>
                              {formatReference(reference, locale)}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.sourcePointId && (
                        <p className="mb-1 ml-2 inline-flex min-h-7 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <BookmarkPlus className="size-3.5" />
                          {t.editor.fromSavedPoint}
                        </p>
                      )}
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center text-muted-foreground">
                      <MoreHorizontal className="size-4" />
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={buttonVariants({ variant: "outline", size: "sm" })}>
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
