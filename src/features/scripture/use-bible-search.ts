"use client";

import { useCallback, useRef, useState } from "react";

import { useLocale, useT } from "@/i18n/client";
import { useReading } from "@/features/preferences/client";
import { buildSearchQuery, type SearchHit, type SearchScope } from "./search";
import { requestSearch, SearchError } from "./search-request";
import type { TranslationId } from "./translations";

export type SearchResults = {
  query: string;
  scope: SearchScope;
  /** The translation that was searched, which is the one its verses are quoted from. */
  translation: TranslationId;
  status: "loading" | "ready" | "error";
  message?: string;
  total: number;
  hits: SearchHit[];
  /** Fetching a further page. */
  more: boolean;
};

/**
 * A word search of the Bible text and its results, for any surface that has a
 * search box: the Scripture Panel and the Bible reader. An answer to a search
 * that has since been replaced is dropped, so a slow one never overwrites a
 * newer one.
 *
 * A search is of one translation: the one given, or the account's own. Asking
 * again with the same words in another translation is a new search.
 */
export function useBibleSearch() {
  const locale = useLocale();
  const failed = useT("scripture").hits.failed;
  const reading = useReading();
  const [results, setResults] = useState<SearchResults | null>(null);
  /** Why what was typed cannot be searched for. */
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef(0);

  /** Starts a search, or a further page of one. False when the words cannot be searched for. */
  const search = useCallback(
    (query: string, scope: SearchScope, offset = 0, inTranslation?: TranslationId): boolean => {
      const translation = inTranslation ?? reading.translation;
      const built = buildSearchQuery(query, locale);
      if (!built.ok) {
        setProblem(built.message);
        return false;
      }
      setProblem(null);
      const request = ++latest.current;
      setResults((current) =>
        offset > 0 && current
          ? { ...current, more: true }
          : { query, scope, translation, status: "loading", total: 0, hits: [], more: false },
      );
      requestSearch(query, scope, offset, translation, failed).then(
        (page) => {
          // A newer search has started; this answer is no longer wanted.
          if (request !== latest.current) return;
          setResults((current) => ({
            query,
            scope,
            translation,
            status: "ready",
            total: page.total,
            hits: offset > 0 && current ? [...current.hits, ...page.hits] : page.hits,
            more: false,
          }));
        },
        (error: unknown) => {
          if (request !== latest.current) return;
          const message = error instanceof SearchError ? error.message : failed;
          setResults((current) =>
            offset > 0 && current
              ? { ...current, more: false, message }
              : {
                  query,
                  scope,
                  translation,
                  status: "error",
                  message,
                  total: 0,
                  hits: [],
                  more: false,
                },
          );
        },
      );
      return true;
    },
    [locale, failed, reading.translation],
  );

  const clearProblem = useCallback(() => setProblem(null), []);

  /** Forgets the results, and anything still on its way. */
  const reset = useCallback(() => {
    latest.current += 1;
    setResults(null);
    setProblem(null);
  }, []);

  return { results, problem, search, clearProblem, reset };
}
