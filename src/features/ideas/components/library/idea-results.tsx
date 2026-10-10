import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ReferenceChip } from "@/features/scripture/components/reference-chip";
import { referenceKey } from "@/features/scripture/reference";
import { formatDate } from "@/lib/format";
import type { IdeaWithReferences } from "../../ideas";
import { ideaHref, type LibraryQuery } from "../../library-query";
import { ideaKindLabels, ideaStatusLabels, sermonTypeLabels } from "../../model";
import { TagList } from "../tag-chip";

/** A result shows this many references; the rest are on the idea's own page. */
const shownReferences = 3;

/**
 * One page of the library, drawn as cards or as rows. It is one piece of
 * markup: the `card-view:` and `list-view:` variants (globals.css) restyle it
 * from the attribute the view switcher sets, so changing view re-renders
 * nothing and both views always show the same ideas.
 *
 * Hover and focus answer in emerald in both views: a card's border turns, and
 * a row, which shares its borders with its neighbours, gains an emerald edge
 * on the left with a faint tint.
 *
 * The whole card is its link's target. The Scripture references sit above it,
 * so they open their preview instead. Only what an idea actually has is
 * shown: a point has no sermon type and no subject, even if it kept them
 * from its time as a sermon.
 */
export function IdeaResults({
  ideas,
  label,
  query,
}: {
  ideas: IdeaWithReferences[];
  label: string;
  /** The library the ideas were found in, so each one can lead back to it. */
  query: LibraryQuery;
}) {
  return (
    <ul
      aria-label={label}
      className="grid list-view:overflow-hidden list-view:rounded-xl list-view:border list-view:bg-surface list-view:shadow-card card-view:gap-3 card-view:sm:grid-cols-2 card-view:xl:grid-cols-3"
    >
      {ideas.map((idea) => {
        const sermon = idea.kind === "sermon";
        // A sermon's main text leads.
        const references = [...idea.references].sort(
          (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
        );
        const more = references.length - shownReferences;
        return (
          <li
            key={idea.id}
            className="relative flex min-w-0 transition-[border-color,background-color,box-shadow] duration-150 has-[a:active]:bg-foreground/5 list-view:flex-wrap list-view:items-center list-view:gap-x-5 list-view:gap-y-2 list-view:border-b list-view:px-4 list-view:py-3 list-view:last:border-b-0 list-view:focus-within:bg-foreground/[0.03] list-view:focus-within:shadow-[inset_2px_0_0_var(--primary)] list-view:hover:bg-foreground/[0.03] list-view:hover:shadow-[inset_2px_0_0_var(--primary)] card-view:flex-col card-view:rounded-xl card-view:border card-view:bg-surface card-view:p-4 card-view:shadow-card card-view:focus-within:border-primary/70 card-view:hover:border-primary/70"
          >
            <div className="flex min-w-0 items-center gap-2 list-view:order-2 list-view:md:w-64 list-view:md:justify-end card-view:mb-2.5">
              <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
                {ideaKindLabels[idea.kind]}
              </Badge>
              {sermon && idea.sermonType && (
                <span className="truncate text-xs text-muted-foreground">
                  <span className="sr-only">Sermon type: </span>
                  {sermonTypeLabels[idea.sermonType]}
                </span>
              )}
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground card-view:ml-auto">
                <span className="sr-only">Status: </span>
                {ideaStatusLabels[idea.status]}
              </span>
            </div>

            <div className="min-w-0 list-view:order-1 list-view:basis-full list-view:md:flex-1 list-view:md:basis-0 card-view:flex-1">
              <h3 className="font-serif font-medium text-pretty list-view:line-clamp-2 list-view:text-base list-view:leading-snug list-view:md:line-clamp-1 card-view:line-clamp-3 card-view:text-lg card-view:leading-snug">
                <Link
                  href={ideaHref(idea.id, query)}
                  className="rounded-sm outline-offset-4 after:absolute after:inset-0 card-view:after:rounded-xl"
                >
                  {idea.title}
                </Link>
              </h3>
              {sermon && idea.subject && (
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground list-view:hidden">
                  {idea.subject}
                </p>
              )}
              {idea.notes && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground list-view:hidden">
                  {idea.notes}
                </p>
              )}
              {(references.length > 0 || idea.tags.length > 0) && (
                <div className="list-view:mt-1.5 list-view:flex list-view:flex-wrap list-view:items-center list-view:gap-x-3 list-view:gap-y-1.5 card-view:mt-3 card-view:space-y-2.5">
                  {references.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {references.slice(0, shownReferences).map((reference) => (
                        <ReferenceChip
                          key={referenceKey(reference)}
                          reference={reference}
                          className="relative z-10"
                        />
                      ))}
                      {more > 0 && (
                        <span className="text-xs text-muted-foreground">and {more} more</span>
                      )}
                    </div>
                  )}
                  <TagList tags={idea.tags} />
                </div>
              )}
            </div>

            <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums list-view:order-3 list-view:ml-auto list-view:md:w-24 list-view:md:text-right card-view:mt-4">
              <span className="list-view:md:sr-only">Updated </span>
              <time dateTime={idea.updatedAt.toISOString()}>{formatDate(idea.updatedAt)}</time>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
