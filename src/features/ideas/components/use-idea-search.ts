"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ideaSearchHref, type IdeaMatches } from "../idea-search";
import type { ArchiveView, IdeaKind } from "../model";
import { searchDebounceMs } from "./library/library-search";

type Answer = { key: string } & ({ matches: IdeaMatches } | { problem: string });

type IdeaSearchOptions = {
  /** Which ideas to look among. Left out, archived ideas are never offered. */
  archive?: ArchiveView;
  /** What to say when the search fails and the server gave no reason. */
  failure: string;
};

/**
 * The account's ideas by name, for a dialog that picks one: the request to
 * `/api/ideas/search`, and what to show while it is out, when it fails, and
 * when a newer search has replaced it.
 *
 * Typing waits for a pause (`typed` says a key was pressed); the first list
 * and a change of kind do not.
 */
export function useIdeaSearch(q: string, kind: IdeaKind | null, options: IdeaSearchOptions) {
  const { archive, failure } = options;
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Counts the times the same search was asked for again after it failed. */
  const [attempt, setAttempt] = useState(0);
  const paused = useRef(false);
  const key = `${kind ?? "all"}|${q}|${attempt}`;

  useEffect(() => {
    const control = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await fetch(ideaSearchHref(q, kind, archive), {
            signal: control.signal,
          });
          const body: unknown = await response.json();
          if (!response.ok) {
            const message = (body as { message?: unknown } | null)?.message;
            throw new Error(typeof message === "string" ? message : "");
          }
          setAnswer({ key, matches: body as IdeaMatches });
        } catch (error) {
          // Withdrawn because a newer search replaced it: nobody is waiting for this one.
          if (control.signal.aborted) return;
          setAnswer({ key, problem: (error instanceof Error && error.message) || failure });
        }
      },
      paused.current ? searchDebounceMs : 0,
    );
    paused.current = false;
    return () => {
      window.clearTimeout(timer);
      control.abort();
    };
  }, [key, q, kind, archive, failure]);

  const loading = answer?.key !== key;
  return {
    loading,
    /** The list last received, which stays until the next one arrives. */
    matches: answer && "matches" in answer ? answer.matches : null,
    failed: !loading && answer && "problem" in answer ? answer.problem : null,
    typed: useCallback(() => {
      paused.current = true;
    }, []),
    retry: useCallback(() => setAttempt((count) => count + 1), []),
  };
}
