import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ReferenceChip } from "@/features/scripture/components/reference-chip";
import { referenceKey } from "@/features/scripture/reference";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import type { IdeaWithReferences } from "../ideas";
import { ideaKindLabels, ideaStatusLabels } from "../model";
import { TagList } from "./tag-chip";

/** A row shows this many references; the rest are on the idea's own page. */
const shownReferences = 3;

/**
 * Ideas as a list of cards, each one a link to the idea. The whole card is
 * the link's target; the Scripture references sit above it, so they open
 * their preview instead. This is the dashboard's short list; the library
 * draws its pages with `library/idea-results.tsx`, as cards or as rows.
 */
export function IdeaList({ ideas, label }: { ideas: IdeaWithReferences[]; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-3">
      {ideas.map((idea) => {
        // A sermon's main text leads.
        const references = [...idea.references].sort(
          (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
        );
        const more = references.length - shownReferences;
        return (
          <li
            key={idea.id}
            className="relative rounded-xl border bg-surface px-4 py-4 shadow-card transition-[border-color,background-color] duration-150 focus-within:border-primary/70 hover:border-primary/70 has-[a:active]:bg-foreground/5 sm:px-5"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="min-w-0 font-serif text-lg leading-snug font-medium text-pretty">
                <Link
                  href={`${routes.library}/${idea.id}`}
                  className="rounded-sm outline-offset-4 after:absolute after:inset-0 after:rounded-xl"
                >
                  {idea.title}
                </Link>
              </h3>
              <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
                {ideaKindLabels[idea.kind]}
              </Badge>
            </div>

            {idea.kind === "sermon" && idea.subject && (
              <p className="mt-1 text-sm text-muted-foreground">{idea.subject}</p>
            )}
            {idea.notes && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {idea.notes}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {references.slice(0, shownReferences).map((reference) => (
                <ReferenceChip
                  key={referenceKey(reference)}
                  reference={reference}
                  className="relative z-10"
                />
              ))}
              {more > 0 && <span className="text-xs text-muted-foreground">and {more} more</span>}
              <TagList tags={idea.tags} limit={3} />
              <p className="ml-auto text-xs text-muted-foreground">
                {ideaStatusLabels[idea.status]}
                <span aria-hidden> · </span>
                <span className="sr-only">, </span>
                <time dateTime={idea.updatedAt.toISOString()}>{formatDate(idea.updatedAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
