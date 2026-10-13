"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchDebounceMs } from "@/features/ideas/components/library/library-search";
import { normaliseSearch } from "@/features/ideas/library-query";
import { searchLimits } from "@/features/ideas/model";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { sermonSearchHref, type SermonMatch, type SermonMatches } from "../sermon-search";

type Answer = { key: string } & ({ matches: SermonMatches } | { problem: string });

type SermonPickerProps = {
  /** The sermon chosen, or null while one is being looked for. */
  value: SermonMatch | null;
  onChange: (sermon: SermonMatch | null) => void;
  /** What the form found wrong: no sermon chosen. */
  error?: string;
  /** The search box, where the dialog begins. */
  box: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
};

/**
 * Chooses the sermon that was preached, by typing part of its name. The
 * server does the searching, among the signed-in account's own sermons and
 * no one else's; archived sermons are offered, and ideas that are not sermons
 * are not. Once one is chosen it is shown by name, with the way to change it.
 */
export function SermonPicker({ value, onChange, error, box, disabled }: SermonPickerProps) {
  const id = useId();
  const t = useT("preaching").form;
  const archived = useT("ideas").archived;
  const clear = useT("library").search.clear;
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Counts the times the same search was asked for again after it failed. */
  const [attempt, setAttempt] = useState(0);
  // Typing waits for a pause; the first list does not.
  const paused = useRef(false);

  const q = normaliseSearch(text);
  const key = `${q}|${attempt}`;
  const looking = value === null;

  useEffect(() => {
    if (!looking) return;
    const control = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await fetch(sermonSearchHref(q), { signal: control.signal });
          const body: unknown = await response.json();
          if (!response.ok) {
            const message = (body as { message?: unknown } | null)?.message;
            throw new Error(typeof message === "string" ? message : "");
          }
          setAnswer({ key, matches: body as SermonMatches });
        } catch (problem) {
          // Withdrawn because a newer search replaced it: nobody is waiting for this one.
          if (control.signal.aborted) return;
          setAnswer({
            key,
            problem: (problem instanceof Error && problem.message) || t.sermonFailed,
          });
        }
      },
      paused.current ? searchDebounceMs : 0,
    );
    paused.current = false;
    return () => {
      window.clearTimeout(timer);
      control.abort();
    };
  }, [key, q, looking, t.sermonFailed]);

  if (value) {
    return (
      <div>
        <p className="text-sm leading-none font-medium">{t.sermon}</p>
        <div className="mt-2 flex items-center gap-3 rounded-lg border bg-surface py-2 pr-2 pl-3.5 shadow-card">
          <p className="min-w-0 flex-1 font-serif text-base leading-snug font-medium text-pretty">
            {value.title}
          </p>
          {value.archived && <Badge tone="muted">{archived}</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t.changeSermon}
            disabled={disabled}
            className="px-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => onChange(null)}
          >
            {t.change}
          </Button>
        </div>
      </div>
    );
  }

  const loading = answer?.key !== key;
  // The list last received stays, dimmed, until the next one arrives.
  const matches = answer && "matches" in answer ? answer.matches : null;
  const failed = !loading && answer && "problem" in answer ? answer.problem : null;

  return (
    <div>
      <label htmlFor={`${id}-q`} className="text-sm leading-none font-medium">
        {t.sermon}
      </label>
      <div role="search" aria-label={t.sermonSearch} className="relative mt-2">
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
            paused.current = true;
            setText(event.target.value);
          }}
          // Enter here is a search, not the form around it being sent.
          onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
          placeholder={t.sermonPlaceholder}
          maxLength={searchLimits.query}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-controls={`${id}-results`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text && (
          <button
            type="button"
            aria-label={clear}
            onClick={() => {
              setText("");
              box.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-9"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[0.8125rem] font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <div
        id={`${id}-results`}
        aria-busy={loading}
        className={cn(
          "mt-2 max-h-60 min-h-20 scroll-quiet overflow-y-auto overscroll-contain rounded-lg border px-1.5 py-1.5 transition-opacity duration-150",
          loading && matches && "opacity-60",
        )}
      >
        {failed ? (
          <div role="alert" className="px-2 py-2 text-sm text-muted-foreground">
            <p>{failed}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setAttempt((count) => count + 1)}
            >
              {t.tryAgain}
            </Button>
          </div>
        ) : !matches ? (
          <div role="status" className="space-y-2 px-2 py-2">
            <span className="sr-only">{t.loading}</span>
            {[72, 56].map((width) => (
              <div
                key={width}
                className="h-4 animate-pulse rounded-md bg-secondary"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ) : matches.items.length === 0 ? (
          <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground">
            {q ? t.sermonNoMatch(q) : t.sermonNone}
          </p>
        ) : (
          <>
            <p className="px-2 pt-0.5 pb-1 text-xs font-semibold text-muted-foreground">
              {q ? t.sermonMatching : t.sermonRecent}
            </p>
            <ul aria-label={q ? t.sermonMatching : t.sermonRecent}>
              {matches.items.map((sermon) => (
                <li key={sermon.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t.choose(sermon.title)}
                    onClick={() => onChange(sermon)}
                    className="group/sermon flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:min-h-12"
                  >
                    <span className="line-clamp-2 min-w-0 flex-1 font-serif text-base leading-snug font-medium text-pretty">
                      {sermon.title}
                    </span>
                    {sermon.archived && <Badge tone="muted">{archived}</Badge>}
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/sermon:text-primary"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
