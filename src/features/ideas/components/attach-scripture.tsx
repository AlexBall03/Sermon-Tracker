"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import {
  formatReferences,
  referenceKey,
  type ScriptureReference,
} from "@/features/scripture/reference";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { attachScripture, type AttachActionResult } from "../actions";
import type { IdeaMatch } from "../idea-search";
import { normaliseSearch } from "../library-query";
import { ideaLimits, searchLimits, type IdeaKind } from "../model";
import { useQuickCapture } from "./quick-capture";
import { useIdeaSearch } from "./use-idea-search";

type AttachScriptureProps = {
  /** The passages to put on an idea, one for each unbroken run. Null closes the dialog. */
  references: readonly ScriptureReference[] | null;
  onClose: () => void;
};

/** Which ideas the list shows. Everything includes the ideas not yet filed as either. */
type Scope = "all" | "sermon" | "point";

const scopes: Scope[] = ["all", "sermon", "point"];

/**
 * Room for the dialog to float: wide enough to stand clear of the edges, and
 * tall enough to keep its list and its footer both in view. A phone on its
 * side is wide and not tall, and gets the whole screen as an upright one does.
 */
const roomToFloat = "(min-width: 48rem) and (min-height: 34rem)";

/**
 * Puts Scripture on an idea: the one dialog behind "Add to idea" in the Bible
 * reader and in saved Scripture. It names the passage, finds the idea by
 * typing, and adds the passage to the one chosen; or it hands the passage to
 * quick capture to begin a new sermon or point idea with. Closing it any
 * other way changes nothing.
 *
 * It is a centred dialog where there is room and the whole of a small
 * screen, so the list keeps its height when the keyboard comes up.
 */
export function AttachScripture({ references, onClose }: AttachScriptureProps) {
  // The passage last asked about stays drawn while the dialog closes over it.
  const [shown, setShown] = useState(references);
  if (references && references !== shown) setShown(references);
  const [busy, setBusy] = useState(false);
  const wide = useMediaQuery(roomToFloat);
  // Set when the passage goes on to quick capture, which then has the focus to itself.
  const handedOn = useRef(false);
  // The search box, where the dialog begins: the one thing most people will do is type.
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (references) handedOn.current = false;
  }, [references]);

  return (
    <Dialog
      open={references !== null}
      onOpenChange={(open) => {
        // A request in flight finishes first.
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        placement={wide ? "top" : "full"}
        className={wide ? "max-w-lg" : undefined}
        initialFocus={box}
        finalFocus={() => !handedOn.current}
      >
        {shown && (
          <AttachForm
            // A search of its own for each passage: nothing typed for one is carried to the next.
            key={shown.map(referenceKey).join(",")}
            references={shown}
            box={box}
            onBusy={setBusy}
            onClose={onClose}
            onHandOn={() => {
              handedOn.current = true;
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** True when the idea has every one of the passages already. */
function holdsAll(idea: IdeaMatch, references: readonly ScriptureReference[]) {
  const held = new Set(idea.references.map(referenceKey));
  return references.every((reference) => held.has(referenceKey(reference)));
}

function AttachForm({
  references,
  box,
  onBusy,
  onClose,
  onHandOn,
}: {
  references: readonly ScriptureReference[];
  box: React.RefObject<HTMLInputElement | null>;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onHandOn: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const capture = useQuickCapture();
  const t = useT("ideas").attach;
  const words = useT("ideas");
  const locale = useLocale();
  const offline: AttachActionResult = { ok: false, message: t.offline };
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [attaching, setAttaching] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const passage = formatReferences(references, locale);
  const q = normaliseSearch(text);
  const kind: IdeaKind | null = scope === "all" ? null : scope;
  // Typing waits for a pause; the first list and a change of scope do not.
  // The list last received stays, dimmed, until the next one arrives.
  const { loading, matches, failed, typed, retry } = useIdeaSearch(q, kind, {
    failure: t.searchFailed,
  });
  const tooMany = references.length > ideaLimits.references;

  async function attach(idea: IdeaMatch) {
    if (attaching) return;
    setAttaching(idea.id);
    onBusy(true);
    setProblem(null);
    const outcome = await attachScripture({ ideaId: idea.id, references }).catch(() => offline);
    onBusy(false);
    setAttaching(null);
    if (!outcome.ok) return setProblem(outcome.message);
    toast({
      message: outcome.message,
      action: { label: t.open, href: `${routes.library}/${outcome.id ?? idea.id}` },
    });
    onClose();
  }

  function begin(kindOfIdea: IdeaKind) {
    if (attaching) return;
    onHandOn();
    capture.openWith({ kind: kindOfIdea, references });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={attaching !== null}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          {/* The passage is said whole, and wraps: it is what is about to be added. */}
          <DialogDescription className="mt-0.5 font-serif text-base text-pretty text-foreground italic">
            {passage}
          </DialogDescription>
        </div>
        <DialogClose label={t.close} className="-mr-2" disabled={attaching !== null} />
      </div>

      <div className="shrink-0 space-y-3 px-5 pb-3">
        <form
          role="search"
          aria-label={t.find}
          onSubmit={(event) => event.preventDefault()}
          className="relative"
        >
          <label htmlFor={`${id}-q`} className="sr-only">
            {t.searchLabel}
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
              aria-label={t.clear}
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
        <Segmented
          label={t.kind}
          hideLabel
          name={`${id}-scope`}
          options={scopes.map((value) => ({ value, label: t.scopes[value] }))}
          value={scope}
          onChange={setScope}
        />
      </div>

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
              {t.tryAgain}
            </Button>
          </div>
        ) : !matches ? (
          <div role="status" className="space-y-2 px-2.5 py-2">
            <span className="sr-only">Loading your ideas</span>
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
            {q ? t.noMatch(scope, q) : scope === "all" ? t.none : t.noneOfKind(scope)}
          </p>
        ) : (
          <>
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              {q ? t.matching : t.recent}
            </p>
            <ul aria-label={q ? t.matching : t.recentIdeas}>
              {matches.items.map((idea) => {
                const held = holdsAll(idea, references);
                const working = attaching === idea.id;
                return (
                  <li key={idea.id}>
                    <button
                      type="button"
                      disabled={held || tooMany || (attaching !== null && !working)}
                      aria-busy={working}
                      aria-label={
                        held ? t.alreadyHas(idea.title, passage) : t.addTo(passage, idea.title)
                      }
                      onClick={() => void attach(idea)}
                      className="group/idea flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 disabled:cursor-default disabled:hover:bg-transparent pointer-coarse:min-h-14"
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "line-clamp-2 font-serif text-base leading-snug font-medium text-pretty",
                            held && "text-muted-foreground",
                          )}
                        >
                          {idea.title}
                        </span>
                        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
                            {words.kinds[idea.kind]}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">
                            {words.statuses[idea.status]}
                          </span>
                          {idea.subject && (
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {idea.subject}
                            </span>
                          )}
                        </span>
                      </span>
                      {held ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Check className="size-3.5" aria-hidden />
                          {t.added}
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
                {t.showing(matches.items.length, formatNumber(locale, matches.total))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t px-5 py-3">
        {(problem || tooMany) && (
          <p role="alert" className="mb-2.5 text-sm font-medium text-destructive">
            {problem ?? t.tooMany(ideaLimits.references, references.length)}
          </p>
        )}
        <p className="mb-2 text-xs text-muted-foreground">{t.orBegin}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-0 flex-1"
            disabled={attaching !== null || tooMany}
            onClick={() => begin("sermon")}
          >
            <Plus aria-hidden />
            {t.newSermon}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-0 flex-1"
            disabled={attaching !== null || tooMany}
            onClick={() => begin("point")}
          >
            <Plus aria-hidden />
            {t.newPoint}
          </Button>
        </div>
      </div>
    </div>
  );
}
