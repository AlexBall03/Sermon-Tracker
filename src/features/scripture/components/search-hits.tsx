"use client";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatReference } from "../reference";
import { splitHit, type SearchHit, type SearchScope } from "../search";
import type { SearchResults } from "../use-bible-search";
import { PassageSkeleton } from "./passage-text";

type SearchHitsProps = {
  results: SearchResults;
  /** Runs the search again, or fetches a further page of it. */
  onSearch: (query: string, scope: SearchScope, offset?: number) => void;
  onOpen: (hit: SearchHit) => void;
  /** Marks the verse now open, where the list stays on screen beside the text. */
  current?: { book: number; chapter: number; verse: number | null };
  /** Shown between the count and the verses. */
  children?: React.ReactNode;
};

/**
 * What a word search found: how many verses, each with its reference and the
 * matched words marked, and more on request. Also its waiting, empty, and
 * failed states. The same list wherever the Bible is searched.
 */
export function SearchHits({ results, onSearch, onOpen, current, children }: SearchHitsProps) {
  return (
    <>
      <p role="status" aria-live="polite" className="px-2 text-sm text-muted-foreground">
        {results.status === "loading" && "Searching…"}
        {results.status === "ready" &&
          (results.total === 0
            ? "No verses match. Check the spelling, try fewer words, or end a word with * to match its beginning."
            : `${results.total.toLocaleString("en")} ${results.total === 1 ? "verse" : "verses"}`)}
      </p>
      {results.status === "loading" && <PassageSkeleton lines={6} />}
      {results.status === "error" && (
        <div role="alert" className="px-2 text-sm text-muted-foreground">
          <p>{results.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onSearch(results.query, results.scope)}
          >
            Try again
          </Button>
        </div>
      )}

      {children}

      {results.hits.length > 0 && (
        <ul className="mt-2">
          {results.hits.map((hit) => {
            const open =
              current?.book === hit.book &&
              current.chapter === hit.chapter &&
              current.verse === hit.verse;
            return (
              <li key={`${hit.book}.${hit.chapter}.${hit.verse}`}>
                <button
                  type="button"
                  aria-current={open ? "true" : undefined}
                  onClick={() => onOpen(hit)}
                  className="block w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 aria-[current=true]:bg-primary-soft"
                >
                  <span className="block font-serif text-[0.8125rem] font-medium text-primary italic">
                    {formatReference({
                      book: hit.book,
                      chapterStart: hit.chapter,
                      verseStart: hit.verse,
                      chapterEnd: null,
                      verseEnd: null,
                    })}
                  </span>
                  <span className="mt-0.5 block font-serif text-base leading-[1.6]">
                    {splitHit(hit.text).map((run, index) =>
                      index % 2 === 1 ? (
                        <mark
                          key={index}
                          className="rounded-sm bg-primary/20 px-1 font-semibold text-primary dark:bg-primary/25"
                        >
                          {run}
                        </mark>
                      ) : (
                        run
                      ),
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {results.status === "ready" && results.hits.length < results.total && (
        <div className="px-2 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={results.more}
            aria-busy={results.more}
            onClick={() => onSearch(results.query, results.scope, results.hits.length)}
          >
            {results.more && <LoaderCircle className="animate-spin" aria-hidden />}
            {results.more ? "Loading…" : "Show more"}
          </Button>
          {results.message && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {results.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}
