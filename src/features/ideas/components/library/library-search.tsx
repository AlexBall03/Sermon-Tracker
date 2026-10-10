"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normaliseSearch } from "../../library-query";
import { searchLimits } from "../../model";
import { useLibrary } from "./library-state";

/** How long typing must pause before the search is run. */
export const searchDebounceMs = 300;

/**
 * The library's search box. The database does the searching: this only
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
export function LibrarySearch({ className }: { className?: string }) {
  const id = useId();
  const { query, apply } = useLibrary();
  const [text, setText] = useState(query.q);
  // What this box last asked for. A query that differs came from elsewhere.
  const [sent, setSent] = useState(query.q);
  const [seen, setSeen] = useState(query.q);
  // True until this spell of typing has added its history entry.
  const fresh = useRef(true);
  const input = useRef<HTMLInputElement>(null);

  if (query.q !== seen) {
    setSeen(query.q);
    if (query.q !== sent) {
      setSent(query.q);
      setText(query.q);
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
      aria-label="Search your library"
      onSubmit={(event) => {
        event.preventDefault();
        submit(text, "push");
        fresh.current = true;
      }}
      className={cn("relative min-w-0", className)}
    >
      <label htmlFor={id} className="sr-only">
        Search ideas
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
        placeholder="Search titles, subjects, and notes..."
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
          aria-label="Clear search"
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
