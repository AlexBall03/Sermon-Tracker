"use client";

import { useId, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useIdeaSearch } from "@/features/ideas/components/use-idea-search";
import type { IdeaMatch } from "@/features/ideas/idea-search";
import { normaliseSearch } from "@/features/ideas/library-query";
import { searchLimits } from "@/features/ideas/model";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/** Where a saved point is to go: after the last main point, or beside a point of the outline. */
export type SavedPointTarget = { anchor: { id: string; name: string } | null };

/** Beside the point it was asked for from: after it, or under it. */
export type SavedPointPlace = "below" | "under";

type AddSavedPointProps = {
  /** Null closes the dialog. */
  target: SavedPointTarget | null;
  /**
   * Places a copy of the point. False when it could not be placed (the outline
   * is full), which the editor says for itself.
   */
  onAdd: (point: { id: string; title: string }, place: SavedPointPlace) => boolean;
  onClose: () => void;
  /**
   * Words of the editor that opened it, in place of the legacy outline's
   * (A3.1: the sermon editor copies the title only, and places a point with
   * no anchor before its conclusion).
   */
  words?: { description?: string; atEnd?: string };
  /** Said when `onAdd` answers false; without it, the editor says it for itself. */
  refused?: string;
};

/** As in `RelateIdea`: a centred dialog where there is room, the whole of a small screen otherwise. */
const roomToFloat = "(min-width: 48rem) and (min-height: 34rem)";

/**
 * Finds one of the account's saved point ideas and places a copy of it in the
 * outline. Only point ideas are offered, and archived ones are left out, as in
 * every picker but Related Ideas'. The saved point is not changed, and is not
 * related to the sermon by being placed: the entry only remembers where it
 * came from.
 *
 * The same point may be placed again, here or in another outline, so nothing
 * is marked as used up. The dialog stays open after each and closes with Done.
 */
export function AddSavedPoint({ target, onAdd, onClose, words, refused }: AddSavedPointProps) {
  // What was last asked for stays drawn while the dialog closes over it.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const wide = useMediaQuery(roomToFloat);
  const box = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        placement={wide ? "top" : "full"}
        className={wide ? "max-w-lg" : undefined}
        initialFocus={box}
      >
        {shown && (
          <PointPicker
            // A search of its own each time it is opened for another place.
            key={shown.anchor?.id ?? "end"}
            target={shown}
            box={box}
            onAdd={onAdd}
            onClose={onClose}
            words={words}
            refused={refused}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PointPicker({
  target,
  box,
  onAdd,
  onClose,
  words,
  refused,
}: {
  target: SavedPointTarget;
  box: React.RefObject<HTMLInputElement | null>;
  onAdd: AddSavedPointProps["onAdd"];
  onClose: () => void;
  words: AddSavedPointProps["words"];
  refused: AddSavedPointProps["refused"];
}) {
  const id = useId();
  const t = useT("outlines").editor.savedPoint;
  const search = useT("ideas").attach;
  const statuses = useT("ideas").statuses;
  const locale = useLocale();
  const [text, setText] = useState("");
  const [place, setPlace] = useState<SavedPointPlace>("below");
  /** How many times each point was placed from this dialog, to say that it was. */
  const [placed, setPlaced] = useState<ReadonlyMap<string, number>>(new Map());
  const [said, setSaid] = useState("");

  const q = normaliseSearch(text);
  const { loading, matches, failed, typed, retry } = useIdeaSearch(q, "point", {
    failure: search.searchFailed,
  });

  function add(match: IdeaMatch) {
    if (!onAdd({ id: match.id, title: match.title }, place)) {
      if (refused) setSaid(refused);
      return;
    }
    setPlaced((current) => new Map(current).set(match.id, (current.get(match.id) ?? 0) + 1));
    setSaid(t.added(match.title));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {words?.description ?? t.description}
          </DialogDescription>
        </div>
        <DialogClose label={search.close} className="-mr-2" />
      </div>

      <div className="mx-5 mb-3 shrink-0">
        {target.anchor ? (
          <Segmented
            label={t.place(target.anchor.name)}
            name={`${id}-place`}
            value={place}
            onChange={setPlace}
            options={[
              { value: "below", label: t.below },
              { value: "under", label: t.under },
            ]}
          />
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">{words?.atEnd ?? t.atEnd}</p>
        )}
      </div>

      <form
        role="search"
        aria-label={t.find}
        onSubmit={(event) => event.preventDefault()}
        className="relative mx-5 mb-3 shrink-0"
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {t.find}
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
          placeholder={t.placeholder}
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
          loading && matches && "opacity-60",
        )}
      >
        {failed ? (
          <div role="alert" className="px-2.5 py-3 text-sm text-muted-foreground">
            <p>{failed}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
              {search.tryAgain}
            </Button>
          </div>
        ) : !matches ? (
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
        ) : matches.items.length === 0 ? (
          <p className="px-2.5 py-3 text-sm leading-relaxed text-muted-foreground">
            {q ? t.noMatch(q) : t.none}
          </p>
        ) : (
          <>
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              {q ? t.matching : t.recent}
            </p>
            <ul aria-label={q ? t.matching : t.recent}>
              {matches.items.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    aria-label={t.add(match.title)}
                    onClick={() => add(match)}
                    className="group/idea flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:min-h-14"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                        {match.title}
                      </span>
                      <span className="mt-1.5 block text-xs font-medium text-muted-foreground">
                        {statuses[match.status]}
                      </span>
                    </span>
                    {placed.has(match.id) ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Plus
                        className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/idea:text-primary"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              ))}
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
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 truncate text-sm text-muted-foreground"
        >
          {said}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t.done}
        </Button>
      </div>
    </div>
  );
}
