import {
  ArrowLeft,
  ArrowUpDown,
  CalendarPlus,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TagChip } from "@/features/ideas/components/tag-chip";
import { formatReference } from "@/features/scripture/reference";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { demoWorkspace } from "../demo";
import { place, WindowFrame } from "./frames";

/** A Scripture reference as `ReferenceChip` draws it. */
export const chip =
  "inline-flex h-8 max-w-full items-center rounded-md border bg-surface px-2.5 font-serif text-[0.875rem] leading-none font-medium whitespace-nowrap text-foreground italic shadow-card";

type Section = "ideas" | "scripture" | "history";

/**
 * The head of a library section, as `LibrarySectionHeader` draws it: the way
 * back, the section's title and purpose, and its action.
 */
export function SectionHead({
  locale,
  section,
  action,
  phone = false,
}: {
  locale: Locale;
  section: Section;
  action: React.ReactNode;
  phone?: boolean;
}) {
  const t = dictionary(locale, "library");
  return (
    <>
      <p className="mb-3 -ml-1 inline-flex min-h-8 items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <ArrowLeft className="size-4" />
        {t.back}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6">
        <div className="min-w-0 flex-1 basis-80">
          <p
            className={cn(
              "font-display leading-tight font-medium tracking-[-0.015em]",
              phone ? "text-[1.875rem]" : "text-[2.125rem]",
            )}
          >
            {t.sections[section]}
          </p>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t.descriptions[section]}
          </p>
        </div>
        {action}
      </div>
    </>
  );
}

/** Sermon Ideas, in its card view, drawn from `IdeaResults`. */
export function LibraryWindow({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const t = dictionary(locale, "library");
  const words = dictionary(locale, "ideas");
  const outlines = dictionary(locale, "outlines").link;
  return (
    <WindowFrame
      locale={locale}
      current="library"
      initials={workspace.initials}
      className={className}
    >
      <div className="px-8 py-10">
        <SectionHead
          locale={locale}
          section="ideas"
          action={
            <span className={buttonVariants()}>
              <Plus />
              {words.capture.button}
            </span>
          }
        />
        <div className="mt-6 flex items-center gap-2">
          <span className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-surface px-3 text-sm text-muted-foreground shadow-card">
            <Search className="size-4 shrink-0" />
            <span className="truncate">{t.search.placeholder}</span>
          </span>
          <span className={buttonVariants({ variant: "outline" })}>
            <SlidersHorizontal />
            {t.toolbar.filters}
          </span>
          <span className={buttonVariants({ variant: "outline" })}>
            <ArrowUpDown />
            {t.sorts["updated-desc"]}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {workspace.recentIdeas.slice(0, 6).map((idea, index) => (
            <div
              key={idea.id}
              style={place(index)}
              className="flex min-w-0 stagger flex-col rounded-xl border bg-surface p-4 shadow-card"
            >
              <div className="mb-2.5 flex min-w-0 items-center gap-2">
                <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
                  {words.kinds[idea.kind]}
                </Badge>
                <span className="ml-auto text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {words.statuses[idea.status]}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 font-serif text-lg leading-snug font-medium text-pretty">
                  {idea.title}
                </p>
                {idea.kind === "sermon" && idea.subject && (
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{idea.subject}</p>
                )}
                {idea.notes && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {idea.notes}
                  </p>
                )}
                {(idea.references.length > 0 || idea.tags.length > 0) && (
                  <div className="mt-3 space-y-2.5">
                    {idea.references.map((reference) => (
                      <span key={formatReference(reference)} className={chip}>
                        {formatReference(reference, locale)}
                      </span>
                    ))}
                    {idea.tags.length > 0 && (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {idea.tags.map((tag) => (
                          <TagChip key={tag}>{tag}</TagChip>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-x-3">
                <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {t.results.updated} {formatDate(idea.updatedAt, locale)}
                </p>
                {idea.kind === "sermon" && (
                  <span className="-mr-2 flex items-center text-muted-foreground">
                    <span
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "px-2.5 text-muted-foreground",
                      )}
                    >
                      <List />
                      {outlines.short}
                    </span>
                    <span className="grid size-9 place-items-center">
                      <CalendarPlus className="size-4" />
                    </span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WindowFrame>
  );
}
