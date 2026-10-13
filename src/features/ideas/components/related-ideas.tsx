"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { ideaHref, parseLibraryQuery } from "../library-query";
import { unrelateIdeas } from "../relation-actions";
import type { RelatedIdea } from "../relations";
import { RelateIdea, type RelateKind } from "./relate-idea";

type RelatedIdeasProps = {
  /** The idea on the page: a sermon or a point. An undecided idea has no related ideas and no section. */
  idea: { id: string; title: string; kind: "sermon" | "point" };
  /** On a sermon, the sermons related to it; on a point, the sermons it is related to. */
  sermons: RelatedIdea[];
  /** On a sermon, the points related to it. */
  points: RelatedIdea[];
  /** The library query the page was opened from, passed on so the way back stays the same. */
  from?: string;
};

/**
 * The ideas related to the one on the page, with the way to add and remove
 * them. A sermon has related sermons and related points; a point has the
 * sermons it is related to. Archived ideas are listed, marked: a relation
 * outlives archiving.
 *
 * None of this is part of the idea's draft. Adding and removing take effect
 * at once, change neither idea, and leave any unsaved edits on the page as
 * they are. Removing is not confirmed, because it loses nothing: the idea
 * removed is kept and can be added again.
 */
export function RelatedIdeas({ idea, sermons, points, from }: RelatedIdeasProps) {
  const router = useRouter();
  const toast = useToast();
  const t = useT("ideas").related;
  const offline: ActionResult = { ok: false, message: t.offline };
  const [picking, setPicking] = useState<RelateKind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Rows taken away here and not yet gone from what the server sends. */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  // What the server sends is the truth: once it changes, nothing is held back any longer.
  const incoming = [...sermons, ...points].map((item) => item.id).join(",");
  const [seen, setSeen] = useState(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    setRemoved(new Set());
  }

  const relatedIds = useMemo(
    () => new Set([...sermons, ...points].map((item) => item.id).filter((id) => !removed.has(id))),
    [sermons, points, removed],
  );
  const origin = useMemo(
    () => (from ? parseLibraryQuery(new URLSearchParams(from)) : undefined),
    [from],
  );

  async function remove(other: RelatedIdea) {
    setProblem(null);
    setRemoved((current) => new Set(current).add(other.id));
    const outcome = await unrelateIdeas(idea.id, other.id).catch(() => offline);
    if (!outcome.ok) {
      // It was not removed, so it is shown again, with the reason.
      setRemoved((current) => {
        const next = new Set(current);
        next.delete(other.id);
        return next;
      });
      return setProblem(outcome.message);
    }
    toast({ message: outcome.message });
    router.refresh();
  }

  const list = (kind: RelateKind, items: RelatedIdea[], empty: string) => (
    <RelatedList
      kind={kind}
      items={items.filter((item) => !removed.has(item.id))}
      empty={empty}
      href={(id) => ideaHref(id, origin)}
      onAdd={() => {
        setProblem(null);
        setPicking(kind);
      }}
      onRemove={(item) => void remove(item)}
    />
  );

  return (
    <section aria-labelledby="related-ideas" className="mt-10 max-w-2xl border-t pt-6">
      <h2 id="related-ideas" className="font-display text-xl leading-snug font-semibold">
        {t.heading}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>

      {problem && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {problem}
        </p>
      )}

      {list("sermon", sermons, idea.kind === "sermon" ? t.noSermons : t.noSermonsForPoint)}
      {idea.kind === "sermon" && list("point", points, t.noPoints)}

      <RelateIdea
        kind={picking}
        idea={idea}
        relatedIds={relatedIds}
        onRelated={() => router.refresh()}
        onClose={() => setPicking(null)}
      />
    </section>
  );
}

function RelatedList({
  kind,
  items,
  empty,
  href,
  onAdd,
  onRemove,
}: {
  kind: RelateKind;
  items: RelatedIdea[];
  empty: string;
  href: (id: string) => string;
  onAdd: () => void;
  onRemove: (item: RelatedIdea) => void;
}) {
  const t = useT("ideas").related;
  const words = useT("ideas");
  const heading = `related-${kind}s`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={heading} className="text-sm font-semibold">
          {kind === "sermon" ? t.sermons : t.points}
        </h3>
        <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={onAdd}>
          <Plus aria-hidden />
          {kind === "sermon" ? t.addSermon : t.addPoint}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul aria-labelledby={heading} className="mt-3 grid gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative flex items-center gap-3 rounded-xl border bg-surface py-2.5 pr-2 pl-4 transition-[border-color,background-color] duration-150 focus-within:border-primary/70 hover:border-primary/70 has-[a:active]:bg-foreground/5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={href(item.id)}
                  className="rounded-sm font-serif text-base leading-snug font-medium text-pretty outline-offset-4 after:absolute after:inset-0 after:rounded-xl"
                >
                  {item.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                  {words.statuses[item.status]}
                  {item.archivedAt && <Badge tone="muted">{words.archived}</Badge>}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.remove(item.title)}
                title={t.remove(item.title)}
                onClick={() => onRemove(item)}
                className="relative z-10 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
