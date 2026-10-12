"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { normaliseSearch } from "../../library-query";
import { searchLimits } from "../../model";
import { useLibrary } from "./library-state";
import type { ApplyQuery } from "./query-navigation";

/** How long typing must pause before the search is run. */
export const searchDebounceMs = 300;

type SearchBoxProps = {
  /** The search in the query the controls are showing. */
  q: string;
  apply: ApplyQuery<{ q: string; page: number }>;
  /** Names the box, and the search landmark around it. */
  label: string;
  landmark: string;
  placeholder: string;
  className?: string;
};

/** The ideas' search box. */
export function LibrarySearch({ className }: { className?: string }) {
  const { query, apply } = useLibrary();
  const t = useT("library").search;
  return (
    <SearchBox
      q={query.q}
      apply={apply as SearchBoxProps["apply"]}
      label={t.label}
      landmark={t.landmark}
      placeholder={t.placeholder}
      className={className}
    />
  );
}

/**
 * A search box for a section of the library. The database does the searching: this only
 * decides when to ask.
 *
 * - Typing asks after a pause of `searchDebounceMs`, not on every key.
 * - Enter asks at once, and so does the clear button.
 * - One spell of typing is one entry in the browser's history: the first
 *   request adds it and the refinements that follow rewrite it, so Back
 *   leaves the search rather than undoing it a letter at a time.
 * - When the address changes from outside (Back, Forward, a cleared filter
 *   bar), the box follows it.
 */
export function SearchBox({ q, apply, label, landmark, placeholder, className }: SearchBoxProps) {
  const id = useId();
  const clear = useT("library").search.clear;
  const [text, setText] = useState(q);
  // What this box last asked for. A query that differs came from elsewhere.
  const [sent, setSent] = useState(q);
  const [seen, setSeen] = useState(q);
  // True until this spell of typing has added its history entry.
  const fresh = useRef(true);
  const input = useRef<HTMLInputElement>(null);

  if (q !== seen) {
    setSeen(q);
    if (q !== sent) {
      setSent(q);
      setText(q);
    }
  }

  function submit(value: string, history: "push" | "replace") {
    const next = normaliseSearch(value);
    if (next === sent) return;
    setSent(next);
    apply({ q: next }, { history });
  }

  const wanted = normaliseSearch(text);
  useEffect(() => {
    if (wanted === sent) return;
    const timer = window.setTimeout(() => {
      const history = fresh.current ? "push" : "replace";
      fresh.current = false;
      setSent(wanted);
      apply({ q: wanted }, { history });
    }, searchDebounceMs);
    // A newer keystroke, Enter, or a change from outside withdraws the request.
    return () => window.clearTimeout(timer);
  }, [wanted, sent, apply]);

  return (
    <form
      role="search"
      aria-label={landmark}
      onSubmit={(event) => {
        event.preventDefault();
        submit(text, "push");
        fresh.current = true;
      }}
      className={cn("relative min-w-0", className)}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={input}
        id={id}
        type="search"
        name="q"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => (fresh.current = true)}
        placeholder={placeholder}
        maxLength={searchLimits.query}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        // The browser's own clear control is replaced by ours, which is the same in every browser.
        className="h-11 pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text && (
        <button
          type="button"
          aria-label={clear}
          onClick={() => {
            setText("");
            submit("", "push");
            fresh.current = true;
            input.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-9"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
