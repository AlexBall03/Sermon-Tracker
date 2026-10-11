"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bibleBooks, chaptersIn, getBook, oldTestamentBooks } from "../books";
import { locationOfReference, type ReaderLocation } from "../reader-location";
import { formatReference, parseReference, type ScriptureReference } from "../reference";
import { searchTips, type SearchScope } from "../search";
import { useBibleSearch } from "../use-bible-search";
import { SearchHits } from "./search-hits";

const testaments = [
  { label: "Old Testament", books: bibleBooks.slice(0, oldTestamentBooks) },
  { label: "New Testament", books: bibleBooks.slice(oldTestamentBooks) },
] as const;

/**
 * What the navigation is showing and what was searched for. The reader holds
 * it, above whichever surface shows the navigation, so the results are still
 * there when a narrow screen's sheet is opened again.
 */
export function useReaderNavigation() {
  const search = useBibleSearch();
  const [entry, setEntry] = useState("");
  const [view, setView] = useState<"browse" | "results">("browse");
  /** A reference that was typed and gone to, with the words as typed. */
  const [went, setWent] = useState<{ typed: string; reference: ScriptureReference } | null>(null);
  return { search, entry, setEntry, view, setView, went, setWent };
}

export type ReaderNavigation = ReturnType<typeof useReaderNavigation>;

type ReaderNavigatorProps = {
  /** Where the reader is, once that is known. */
  location: ReaderLocation | null;
  onGo: (location: ReaderLocation) => void;
  navigation: ReaderNavigation;
  className?: string;
};

/**
 * Finding a place in the Bible: a box that goes to a typed reference or
 * searches the text for words, and beneath it either every book with its
 * chapters, or what the search found. It is the same in the sidebar of a wide
 * window and in the sheet of a narrow one.
 */
export function ReaderNavigator({ location, onGo, navigation, className }: ReaderNavigatorProps) {
  const id = useId();
  const { search, entry, setEntry, view, setView, went, setWent } = navigation;
  const { results, problem } = search;
  const searchBox = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // The book whose chapters are shown: the one being read, until another is opened. 0 is none.
  const [opened, setOpened] = useState<number | null>(null);
  const expanded = opened ?? location?.book ?? 0;

  // Start with the book being read in view, wherever it is in the list.
  const currentBook = location?.book;
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-book="${currentBook}"]`);
    if (view !== "browse" || !box || !row) return;
    // Moved by hand: `scrollIntoView` would move the page as well as the list.
    box.scrollTop +=
      row.getBoundingClientRect().top -
      box.getBoundingClientRect().top -
      (box.clientHeight - row.offsetHeight) / 2;
  }, [currentBook, view]);

  function go(next: ReaderLocation) {
    setOpened(null);
    onGo(next);
  }

  function runSearch(query: string, scope: SearchScope, offset = 0) {
    if (search.search(query, scope, offset)) {
      setWent(null);
      setView("results");
    }
  }

  function submit() {
    // Nothing to look for: back to the books, with the last search put away.
    if (!entry.trim()) {
      search.reset();
      setWent(null);
      return setView("browse");
    }
    // A reference is somewhere to go, not words to look for.
    const typed = parseReference(entry);
    if (typed.ok) {
      search.clearProblem();
      setWent({ typed: entry.trim(), reference: typed.reference });
      setView("browse");
      return go(locationOfReference(typed.reference));
    }
    runSearch(entry, results?.scope ?? "all");
  }

  const bookName = location ? (getBook(location.book)?.name ?? "") : "";
  const scopeOptions = [
    { value: "all", label: "Whole Bible" },
    { value: "old", label: "Old Testament" },
    { value: "new", label: "New Testament" },
    ...(location ? [{ value: String(location.book), label: bookName }] : []),
  ];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="border-b px-4 pt-1 pb-3">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={`${id}-search`} className="sr-only">
            Search the Bible, or go to a reference
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                ref={searchBox}
                id={`${id}-search`}
                type="search"
                value={entry}
                onChange={(event) => {
                  setEntry(event.target.value);
                  search.clearProblem();
                }}
                placeholder="Words, or Romans 8:28"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                maxLength={200}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${id}-search-error` : undefined}
                // Our own clear control replaces the browser's, which differs from one to the next.
                className="pr-10 [&::-webkit-search-cancel-button]:hidden"
              />
              {entry && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => {
                    setEntry("");
                    search.clearProblem();
                    searchBox.current?.focus();
                  }}
                  className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="size-10"
              aria-label="Search"
            >
              <Search aria-hidden />
            </Button>
          </div>
          {problem && (
            <p
              id={`${id}-search-error`}
              role="alert"
              className="mt-1.5 text-[0.8125rem] font-medium text-destructive"
            >
              {problem}
            </p>
          )}
          {/* Floats over the list, so opening it moves nothing. */}
          <Popover>
            <PopoverTrigger className="mt-1.5 rounded-sm text-xs font-medium text-muted-foreground link-underline hover:text-foreground">
              Search options
            </PopoverTrigger>
            <PopoverContent initialFocus={false} className="w-[22rem] p-3 text-xs">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {searchTips.map(([example, meaning]) => (
                  <div key={example} className="contents">
                    <dt className="font-mono font-semibold whitespace-nowrap">{example}</dt>
                    <dd className="text-muted-foreground">{meaning}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-muted-foreground">
                Words are matched as written, whatever their capitals. A reference, such as John
                3:16 or Psalm 23, opens that passage instead.
              </p>
            </PopoverContent>
          </Popover>
        </form>

        {went && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Opened {formatReference(went.reference)}.{" "}
            <button
              type="button"
              onClick={() => runSearch(went.typed, results?.scope ?? "all")}
              className="rounded-sm font-medium text-primary link-underline"
            >
              Search the text for “{went.typed}” instead
            </button>
          </p>
        )}
      </div>

      <div
        ref={list}
        tabIndex={-1}
        className="min-h-0 flex-1 scroll-quiet overflow-y-auto overscroll-contain px-2 py-3"
      >
        {view === "results" && results ? (
          <section aria-label="Search results">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 px-2"
                onClick={() => setView("browse")}
              >
                <ArrowLeft aria-hidden />
                Books
              </Button>
              <Select
                label="Search in"
                value={String(results.scope)}
                onChange={(value) =>
                  runSearch(
                    results.query,
                    value === "all" || value === "old" || value === "new" ? value : Number(value),
                  )
                }
                options={scopeOptions}
                className="ml-auto h-9 w-40"
              />
            </div>
            <SearchHits
              results={results}
              onSearch={runSearch}
              current={location ?? undefined}
              onOpen={(hit) => go({ book: hit.book, chapter: hit.chapter, verse: hit.verse })}
            />
          </section>
        ) : (
          <nav aria-label="Books of the Bible">
            {results && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mb-2 px-2"
                onClick={() => setView("results")}
              >
                Back to results
              </Button>
            )}
            {testaments.map((testament) => (
              <section key={testament.label} className="not-first:mt-4">
                <h2 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                  {testament.label}
                </h2>
                <ul>
                  {testament.books.map((book) => {
                    const chapters = chaptersIn(book.id);
                    const reading = location?.book === book.id;
                    const open = expanded === book.id && chapters > 1;
                    return (
                      <li key={book.id}>
                        <button
                          type="button"
                          data-book={book.id}
                          aria-current={reading ? "true" : undefined}
                          aria-expanded={chapters > 1 ? open : undefined}
                          onClick={() =>
                            // A book of one chapter has nothing to choose between.
                            chapters === 1
                              ? go({ book: book.id, chapter: 1, verse: null })
                              : setOpened(open ? 0 : book.id)
                          }
                          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors duration-150 hover:bg-accent active:bg-foreground/10 aria-[current=true]:font-semibold aria-[current=true]:text-primary pointer-coarse:min-h-11"
                        >
                          {book.name}
                          {chapters > 1 && (
                            <ChevronDown
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                                open && "rotate-180",
                              )}
                              aria-hidden
                            />
                          )}
                        </button>
                        {open && (
                          <ul
                            aria-label={`${book.name}, chapters`}
                            className="grid grid-cols-6 gap-0.5 px-1 pt-1 pb-2"
                          >
                            {Array.from({ length: chapters }, (_, index) => index + 1).map(
                              (chapter) => (
                                <li key={chapter}>
                                  <button
                                    type="button"
                                    aria-label={`${book.name} ${chapter}`}
                                    aria-current={
                                      reading && location.chapter === chapter ? "page" : undefined
                                    }
                                    onClick={() => go({ book: book.id, chapter, verse: null })}
                                    className="grid h-9 w-full place-items-center rounded-md text-sm text-muted-foreground tabular-nums transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary pointer-coarse:h-11"
                                  >
                                    {chapter}
                                  </button>
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
