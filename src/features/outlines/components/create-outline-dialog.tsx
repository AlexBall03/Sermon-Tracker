"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Plus, Search, X } from "lucide-react";

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
import { useQuickCapture } from "@/features/ideas/components/quick-capture";
import { useIdeaSearch } from "@/features/ideas/components/use-idea-search";
import type { IdeaMatch } from "@/features/ideas/idea-search";
import { normaliseSearch } from "@/features/ideas/library-query";
import { searchLimits } from "@/features/ideas/model";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { outlineHref } from "../outlines-query";
import { useStartOutline } from "./use-start-outline";

/** As in `RelateIdea`: a centred dialog where there is room, the whole of a small screen otherwise. */
const roomToFloat = "(min-width: 48rem) and (min-height: 34rem)";

/**
 * Chooses the sermon a new outline is for. One of the account's active sermon
 * ideas, found by name: a sermon that has an outline already says so and
 * opens it, and one that has none is given one and opened. Archived sermons
 * are not offered, as in every picker but Related Ideas'.
 *
 * For a sermon not captured yet, "New sermon idea" hands over to quick
 * capture, which saves the sermon first; its outline is made only once the
 * sermon exists. Opening this dialog, or the capture, and leaving either makes
 * nothing.
 */
export function CreateOutlineDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wide = useMediaQuery(roomToFloat);
  const box = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A request in flight finishes first.
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        placement={wide ? "top" : "full"}
        className={wide ? "max-w-lg" : undefined}
        initialFocus={box}
      >
        {open && <SermonPicker box={box} onBusy={setBusy} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function SermonPicker({
  box,
  onBusy,
  onClose,
}: {
  box: React.RefObject<HTMLInputElement | null>;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const capture = useQuickCapture();
  const t = useT("outlines").picker;
  const search = useT("ideas").attach;
  const statuses = useT("ideas").statuses;
  const locale = useLocale();
  const { start, starting } = useStartOutline();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const q = normaliseSearch(text);
  const { loading, matches, failed, typed, retry } = useIdeaSearch(q, "sermon", {
    outlines: true,
    failure: search.searchFailed,
  });

  async function choose(match: IdeaMatch) {
    if (starting) return;
    setProblem(null);
    if (match.outlineId) {
      onClose();
      router.push(outlineHref(match.outlineId));
      return;
    }
    onBusy(true);
    const outcome = await start(match.id);
    onBusy(false);
    if (outcome.ok) onClose();
    else if (outcome.message) setProblem(outcome.message);
  }

  function newSermon() {
    onClose();
    capture.openWith({
      kind: "sermon",
      onSaved: (idea) => {
        // Filed as something else while it was being written: there is nothing to outline.
        if (idea.kind !== "sermon") {
          toast({ message: t.notSermon });
          return true;
        }
        void start(idea.id).then((outcome) => {
          if (!outcome.ok && outcome.message) toast({ message: outcome.message });
        });
        return true;
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={starting !== null}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {t.description}
          </DialogDescription>
        </div>
        <DialogClose label={search.close} className="-mr-2" disabled={starting !== null} />
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
              {matches.items.map((match) => {
                const working = starting === match.id;
                return (
                  <li key={match.id}>
                    <button
                      type="button"
                      disabled={starting !== null && !working}
                      aria-busy={working}
                      aria-label={match.outlineId ? t.open(match.title) : t.create(match.title)}
                      onClick={() => void choose(match)}
                      className="group/idea flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent pointer-coarse:min-h-14"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                          {match.title}
                        </span>
                        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium">{statuses[match.status]}</span>
                          {match.outlineId && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{t.hasOutline}</span>
                            </>
                          )}
                        </span>
                      </span>
                      {working ? (
                        <LoaderCircle
                          className="size-4 shrink-0 animate-spin text-primary"
                          aria-hidden
                        />
                      ) : match.outlineId ? (
                        <ArrowRight
                          className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/idea:text-primary"
                          aria-hidden
                        />
                      ) : (
                        <Plus
                          className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/idea:text-primary"
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

      <div className="shrink-0 border-t px-5 py-3">
        <p role="alert" className="text-sm font-medium text-destructive empty:hidden">
          {problem}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 basis-48 text-[0.8125rem] text-pretty text-muted-foreground">
            {t.orNew}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={starting !== null}
            onClick={newSermon}
          >
            <Plus aria-hidden />
            {t.newSermon}
          </Button>
        </div>
      </div>
    </div>
  );
}
