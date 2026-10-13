"use client";

import { useId, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { IdeaMatch } from "../idea-search";
import { normaliseSearch } from "../library-query";
import { searchLimits } from "../model";
import { relateIdeas } from "../relation-actions";
import { useIdeaSearch } from "./use-idea-search";

/** The kind of idea being looked for: a sermon to go with a sermon or a point, or a point to go with a sermon. */
export type RelateKind = "sermon" | "point";

type RelateIdeaProps = {
  /** The kind to choose from. Null closes the dialog. */
  kind: RelateKind | null;
  /** The idea the chosen one will be related to. */
  idea: { id: string; title: string };
  /** The ideas related to it already, which are shown as such and cannot be chosen again. */
  relatedIds: ReadonlySet<string>;
  /** Called once the server has related one, so the page can show it. */
  onRelated: (id: string) => void;
  onClose: () => void;
};

/** As in `AttachScripture`: a centred dialog where there is room, the whole of a small screen otherwise. */
const roomToFloat = "(min-width: 48rem) and (min-height: 34rem)";

/**
 * Finds one of the account's sermon or point ideas and relates it to the idea
 * on the page. Archived ideas are offered too, marked: a relation has nothing
 * to do with the archive, and choosing one does not restore it. The dialog
 * stays open after each, so several can be added, and closes with Done.
 */
export function RelateIdea({ kind, idea, relatedIds, onRelated, onClose }: RelateIdeaProps) {
  // The kind last asked for stays drawn while the dialog closes over it.
  const [shown, setShown] = useState(kind);
  if (kind && kind !== shown) setShown(kind);
  const [busy, setBusy] = useState(false);
  const wide = useMediaQuery(roomToFloat);
  const box = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        // A request in flight finishes first.
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        placement={wide ? "top" : "full"}
        className={wide ? "max-w-lg" : undefined}
        initialFocus={box}
      >
        {shown && (
          <RelateForm
            // A search of its own each time it is opened for another kind.
            key={shown}
            kind={shown}
            idea={idea}
            relatedIds={relatedIds}
            box={box}
            onBusy={setBusy}
            onRelated={onRelated}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RelateForm({
  kind,
  idea,
  relatedIds,
  box,
  onBusy,
  onRelated,
  onClose,
}: {
  kind: RelateKind;
  idea: { id: string; title: string };
  relatedIds: ReadonlySet<string>;
  box: React.RefObject<HTMLInputElement | null>;
  onBusy: (busy: boolean) => void;
  onRelated: (id: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const t = useT("ideas").related;
  const search = useT("ideas").attach;
  const words = useT("ideas");
  const locale = useLocale();
  const offline: ActionResult = { ok: false, message: t.offline };
  const [text, setText] = useState("");
  const [relating, setRelating] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Related from this dialog, and so marked before the page has been read again. */
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  const q = normaliseSearch(text);
  const { loading, matches, failed, typed, retry } = useIdeaSearch(q, kind, {
    archive: "all",
    failure: search.searchFailed,
  });
  // An idea is never offered to itself.
  const items = matches?.items.filter((match) => match.id !== idea.id) ?? null;

  async function relate(match: IdeaMatch) {
    if (relating) return;
    setRelating(match.id);
    onBusy(true);
    setProblem(null);
    const outcome = await relateIdeas(idea.id, match.id).catch(() => offline);
    onBusy(false);
    setRelating(null);
    if (!outcome.ok) return setProblem(outcome.message);
    setDone((current) => new Set(current).add(match.id));
    toast({ message: outcome.message });
    onRelated(match.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={relating !== null}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{kind === "sermon" ? t.sermonTitle : t.pointTitle}</DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {t.pickerDescription(idea.title)}
          </DialogDescription>
        </div>
        <DialogClose label={search.close} className="-mr-2" disabled={relating !== null} />
      </div>

      <form
        role="search"
        aria-label={kind === "sermon" ? t.findSermon : t.findPoint}
        onSubmit={(event) => event.preventDefault()}
        className="relative mx-5 mb-3 shrink-0"
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {kind === "sermon" ? t.findSermon : t.findPoint}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={box}
          id={`${id}-q`}
          type="search"
          value={text}
          onChange={(event) => {
            typed();
            setText(event.target.value);
          }}
          placeholder={kind === "sermon" ? t.sermonPlaceholder : t.pointPlaceholder}
          maxLength={searchLimits.query}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-controls={`${id}-results`}
          className="h-11 pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text && (
          <button
            type="button"
            aria-label={search.clear}
            onClick={() => {
              setText("");
              box.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-9"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </form>

      <div
        id={`${id}-results`}
        aria-busy={loading}
        className={cn(
          "min-h-24 flex-1 scroll-quiet overflow-y-auto overscroll-contain border-t px-2.5 py-2 transition-opacity duration-150",
          loading && items && "opacity-60",
        )}
      >
        {failed ? (
          <div role="alert" className="px-2.5 py-3 text-sm text-muted-foreground">
            <p>{failed}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
              {search.tryAgain}
            </Button>
          </div>
        ) : !items || !matches ? (
          <div role="status" className="space-y-2 px-2.5 py-2">
            <span className="sr-only">{t.loading}</span>
            {[72, 56, 64].map((width) => (
              <div key={width} className="space-y-2 py-1.5">
                <div
                  className="h-4 animate-pulse rounded-md bg-secondary"
                  style={{ width: `${width}%` }}
                />
                <div className="h-3 w-28 animate-pulse rounded-md bg-secondary" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2.5 py-3 text-sm leading-relaxed text-muted-foreground">
            {q ? search.noMatch(kind, q) : t.none(kind)}
          </p>
        ) : (
          <>
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              {q ? search.matching : search.recent}
            </p>
            <ul aria-label={q ? search.matching : search.recentIdeas}>
              {items.map((match) => {
                const held = relatedIds.has(match.id) || done.has(match.id);
                const working = relating === match.id;
                return (
                  <li key={match.id}>
                    <button
                      type="button"
                      disabled={held || (relating !== null && !working)}
                      aria-busy={working}
                      aria-label={held ? t.alreadyRelated(match.title) : t.relate(match.title)}
                      onClick={() => void relate(match)}
                      className="group/idea flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 disabled:cursor-default disabled:hover:bg-transparent pointer-coarse:min-h-14"
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "line-clamp-2 font-serif text-base leading-snug font-medium text-pretty",
                            held && "text-muted-foreground",
                          )}
                        >
                          {match.title}
                        </span>
                        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {words.statuses[match.status]}
                          </span>
                          {match.archived && <Badge tone="muted">{words.archived}</Badge>}
                          {match.subject && (
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {match.subject}
                            </span>
                          )}
                        </span>
                      </span>
                      {held ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Check className="size-3.5" aria-hidden />
                          {t.linked}
                        </span>
                      ) : working ? (
                        <LoaderCircle
                          className="size-4 shrink-0 animate-spin text-primary"
                          aria-hidden
                        />
                      ) : (
                        <Plus
                          className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/idea:text-primary group-disabled/idea:opacity-0"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {matches.total > matches.items.length && (
              <p className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
                {search.showing(matches.items.length, formatNumber(locale, matches.total))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
        <p role="alert" className="min-w-0 text-sm font-medium text-destructive">
          {problem}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={relating !== null}
          onClick={onClose}
        >
          {t.done}
        </Button>
      </div>
    </div>
  );
}
