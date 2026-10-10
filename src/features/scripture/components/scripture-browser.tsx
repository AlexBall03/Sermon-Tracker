"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectGroup } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bibleBooks, chaptersIn, getBook, oldTestamentBooks, versesIn } from "../books";
import {
  formatReference,
  formatReferences,
  parseReference,
  referenceSpans,
  versesToReferences,
  type ScriptureReference,
} from "../reference";
import { buildSearchQuery, splitHit, type SearchHit, type SearchScope } from "../search";
import { requestSearch, SearchError } from "../search-request";
import { useChapter } from "../use-chapter";
import { PassageError, PassageSkeleton, PassageText } from "./passage-text";

export type PanelAttach = {
  /** What attaching does here: "Add to idea", "Update reference". */
  label: string;
  /** One passage for each unbroken run of chosen verses. */
  onAttach: (references: ScriptureReference[]) => void;
  /**
   * True when attaching can be done again and again (adding), false when it
   * finishes the job (replacing one reference).
   */
  repeatable?: boolean;
};

type ScriptureBrowserProps = {
  /** Where to open, with that passage selected. Genesis 1 when omitted. */
  initial?: ScriptureReference;
  /** Omitted when the passage is only being read. */
  attach?: PanelAttach;
  /**
   * The idea is still on screen beside the panel. A repeatable attach then
   * leaves the panel open for the next passage; where the panel covers the
   * idea, attaching always returns to it.
   */
  besideIdea?: boolean;
  /** The header: the surface supplies its own title and close or back control. */
  header: React.ReactNode;
  onDone: () => void;
  className?: string;
};

type Results = {
  query: string;
  scope: SearchScope;
  status: "loading" | "ready" | "error";
  message?: string;
  total: number;
  hits: SearchHit[];
  /** Fetching a further page. */
  more: boolean;
};

const bookGroups: SelectGroup[] = [
  { label: "Old Testament", options: [] as { value: string; label: string }[] },
  { label: "New Testament", options: [] as { value: string; label: string }[] },
].map((group, index) => ({
  ...group,
  options: (index === 0
    ? bibleBooks.slice(0, oldTestamentBooks)
    : bibleBooks.slice(oldTestamentBooks)
  ).map((book) => ({ value: String(book.id), label: book.name })),
}));

const numbers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  }));

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const tips = [
  ["grace mercy", "verses with both words"],
  ['"living water"', "the exact phrase"],
  ["faith OR hope", "either word"],
  ["shepherd -sheep", "the first without the second"],
  ["lov*", "love, loved, loveth, lovingkindness"],
] as const;

/**
 * Reading and choosing a passage. This is the Scripture Panel's content, and
 * it is the same in every container that holds it: a side panel, a full
 * sheet, a column inside quick capture, and later the Bible reader.
 *
 * The box searches the text for words. A passage is reached with the Book,
 * Chapter, and Verse filters. Tap verses to choose them, any number, and tap
 * one again to unselect it; with none chosen the selection is the whole
 * chapter.
 */
export function ScriptureBrowser({
  initial,
  attach,
  besideIdea = false,
  header,
  onDone,
  className,
}: ScriptureBrowserProps) {
  const id = useId();
  const start = initial ?? versesToReferences(1, 1, [])[0];
  const startsInOneChapter = start.chapterEnd === null && start.verseStart !== null;

  const [book, setBook] = useState(start.book);
  const [chapter, setChapter] = useState(start.chapterStart);
  // Verses chosen in the chapter on screen.
  const [picked, setPicked] = useState<number[]>(() =>
    startsInOneChapter ? range(start.verseStart!, start.verseEnd ?? start.verseStart!) : [],
  );
  // A passage that runs across chapters, kept whole until the selection is changed.
  const [carried, setCarried] = useState<ScriptureReference | null>(
    start.chapterEnd !== null ? start : null,
  );
  const [focus, setFocus] = useState<{ verse: number | null; token: number }>({
    verse: picked[0] ?? null,
    token: 0,
  });

  // What was last attached while the panel stayed open, until the selection changes.
  const [attached, setAttached] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [view, setView] = useState<"read" | "results">("read");
  const latestSearch = useRef(0);
  const searchBox = useRef<HTMLInputElement>(null);

  // The panel opens ready to search. After the frame, so it follows whatever
  // the surface holding the panel did with focus as it opened.
  useEffect(() => {
    const frame = requestAnimationFrame(() => searchBox.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  const text = useChapter(book, chapter);
  const scroller = useRef<HTMLDivElement>(null);
  const ready = text.status === "ready";

  // Bring the verse asked for into view when its chapter is on screen; otherwise start at the top.
  useEffect(() => {
    if (!ready || view !== "read") return;
    const target = focus.verse
      ? scroller.current?.querySelector(`[data-verse="${focus.verse}"]`)
      : null;
    if (target) target.scrollIntoView({ block: "center" });
    else scroller.current?.scrollTo({ top: 0 });
  }, [ready, view, book, chapter, focus]);

  const selection = useMemo(
    () => (carried ? [carried] : versesToReferences(book, chapter, picked)),
    [carried, book, chapter, picked],
  );
  const carriedSpan = carried
    ? referenceSpans(carried).find((span) => span.book === book && span.chapter === chapter)
    : undefined;
  const highlighted = carriedSpan
    ? carried!.verseStart === null
      ? []
      : range(carriedSpan.from, carriedSpan.to)
    : picked;

  function goTo(nextBook: number, nextChapter: number, verse: number | null = null) {
    setBook(nextBook);
    setChapter(nextChapter);
    setPicked(verse ? [verse] : []);
    setCarried(null);
    setAttached(null);
    setFocus((current) => ({ verse, token: current.token + 1 }));
    setView("read");
  }

  function step(direction: 1 | -1) {
    const next = chapter + direction;
    if (next >= 1 && next <= chaptersIn(book)) return goTo(book, next);
    const neighbour = book + direction;
    if (neighbour < 1 || neighbour > bibleBooks.length) return;
    goTo(neighbour, direction === 1 ? 1 : chaptersIn(neighbour));
  }

  function toggleVerse(verse: number) {
    // Tapping into a passage carried across chapters starts a fresh choice here.
    const current = carried ? [] : picked;
    setCarried(null);
    setAttached(null);
    setPicked(
      current.includes(verse) ? current.filter((item) => item !== verse) : [...current, verse],
    );
  }

  async function search(query: string, scope: SearchScope, offset = 0) {
    const built = buildSearchQuery(query);
    if (!built.ok) return setEntryError(built.message);
    setEntryError(null);
    setView("results");
    const request = ++latestSearch.current;
    setResults((current) =>
      offset > 0 && current
        ? { ...current, more: true }
        : { query, scope, status: "loading", total: 0, hits: [], more: false },
    );
    try {
      const page = await requestSearch(query, scope, offset);
      // A newer search has started; this answer is no longer wanted.
      if (request !== latestSearch.current) return;
      setResults((current) => ({
        query,
        scope,
        status: "ready",
        total: page.total,
        hits: offset > 0 && current ? [...current.hits, ...page.hits] : page.hits,
        more: false,
      }));
    } catch (error) {
      if (request !== latestSearch.current) return;
      const message =
        error instanceof SearchError ? error.message : "The search could not be run. Try again.";
      setResults((current) =>
        offset > 0 && current
          ? { ...current, more: false, message }
          : { query, scope, status: "error", message, total: 0, hits: [], more: false },
      );
    }
  }

  const atStart = book === 1 && chapter === 1;
  const atEnd = book === bibleBooks.length && chapter === chaptersIn(book);
  const bookName = getBook(book)?.name ?? "";
  const place = chaptersIn(book) > 1 ? `${bookName} ${chapter}` : bookName;
  // Typing a reference into the search box is a natural slip; offer the passage as well.
  const typedReference = results ? parseReference(results.query) : null;

  const scopeOptions = [
    { value: "all", label: "Whole Bible" },
    { value: "old", label: "Old Testament" },
    { value: "new", label: "New Testament" },
    { value: String(book), label: bookName },
  ];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {header}

      <div className="space-y-3 border-b px-4 pb-4 sm:px-5">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            // Never the surrounding form's submit.
            event.stopPropagation();
            void search(entry, results?.scope ?? "all");
          }}
        >
          <label htmlFor={`${id}-search`} className="sr-only">
            Search the Bible
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
                  setEntryError(null);
                }}
                placeholder="Search the text for words"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                maxLength={200}
                aria-invalid={entryError ? true : undefined}
                aria-describedby={entryError ? `${id}-search-error` : undefined}
                // Our own clear control replaces the browser's, which differs from one to the next.
                className="pr-10 [&::-webkit-search-cancel-button]:hidden"
              />
              {entry && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => {
                    setEntry("");
                    setEntryError(null);
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
          {entryError && (
            <p
              id={`${id}-search-error`}
              role="alert"
              className="mt-1.5 text-[0.8125rem] font-medium text-destructive"
            >
              {entryError}
            </p>
          )}
          <button
            type="button"
            aria-expanded={showTips}
            aria-controls={`${id}-tips`}
            onClick={() => setShowTips((shown) => !shown)}
            className="mt-1.5 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {showTips ? "Hide search options" : "Search options"}
          </button>
          <dl
            id={`${id}-tips`}
            hidden={!showTips}
            className={
              showTips
                ? "mt-2 grid animate-menu grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2.5 text-xs"
                : undefined
            }
          >
            {tips.map(([example, meaning]) => (
              <div key={example} className="contents">
                <dt className="font-mono font-semibold whitespace-nowrap">{example}</dt>
                <dd className="text-muted-foreground">{meaning}</dd>
              </div>
            ))}
            <div className="col-span-2 mt-1 text-muted-foreground">
              Words are matched as written, whatever their capitals. To go to a passage, use Book,
              Chapter, and Verse below.
            </div>
          </dl>
        </form>

        <div role="group" aria-label="Go to a passage" className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Previous chapter"
            disabled={atStart}
            onClick={() => step(-1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Select
            label="Book"
            value={String(book)}
            onChange={(value) => goTo(Number(value), 1)}
            groups={bookGroups}
            className="flex-1"
          />
          <Select
            label="Chapter"
            value={String(chapter)}
            onChange={(value) => goTo(book, Number(value))}
            options={numbers(chaptersIn(book))}
            layout="grid"
            className="w-[4.5rem] tabular-nums"
          />
          <Select
            label="Verse"
            value={picked.length === 1 && !carried ? String(picked[0]) : "all"}
            onChange={(value) => goTo(book, chapter, value === "all" ? null : Number(value))}
            options={[{ value: "all", label: "All" }, ...numbers(versesIn(book, chapter))]}
            layout="grid"
            className="w-[4.5rem] tabular-nums"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Next chapter"
            disabled={atEnd}
            onClick={() => step(1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        tabIndex={-1}
        className="min-h-40 flex-1 scroll-quiet overflow-y-auto overscroll-contain px-2 py-4 sm:px-3"
      >
        {view === "results" && results ? (
          <section aria-label="Search results">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 px-2"
                onClick={() => setView("read")}
              >
                <ArrowLeft aria-hidden />
                {place}
              </Button>
              <Select
                label="Search in"
                value={String(results.scope)}
                onChange={(value) =>
                  void search(
                    results.query,
                    value === "all" || value === "old" || value === "new" ? value : Number(value),
                  )
                }
                options={scopeOptions}
                className="ml-auto h-9 w-44"
              />
            </div>

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
                  onClick={() => void search(results.query, results.scope)}
                >
                  Try again
                </Button>
              </div>
            )}

            {typedReference?.ok && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mx-2 mt-3"
                onClick={() => {
                  const reference = typedReference.reference;
                  goTo(reference.book, reference.chapterStart, reference.verseStart);
                  if (reference.chapterEnd !== null) setCarried(reference);
                  else if (reference.verseStart !== null) {
                    setPicked(
                      range(reference.verseStart, reference.verseEnd ?? reference.verseStart),
                    );
                  }
                }}
              >
                Go to {formatReference(typedReference.reference)}
              </Button>
            )}

            {results.hits.length > 0 && (
              <ul className="mt-2">
                {results.hits.map((hit) => (
                  <li key={`${hit.book}.${hit.chapter}.${hit.verse}`}>
                    <button
                      type="button"
                      onClick={() => goTo(hit.book, hit.chapter, hit.verse)}
                      className="block w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10"
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
                ))}
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
                  onClick={() => void search(results.query, results.scope, results.hits.length)}
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
          </section>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <h3 className="font-display text-lg leading-snug font-medium">{place}</h3>
              {results && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mr-2 px-2"
                  onClick={() => setView("results")}
                >
                  Back to results
                </Button>
              )}
            </div>
            {text.status === "loading" && <PassageSkeleton lines={9} />}
            {text.status === "error" && <PassageError retry={text.retry} />}
            {text.status === "ready" && (
              <PassageText
                verses={text.verses}
                selected={highlighted}
                onSelectVerse={attach ? toggleVerse : undefined}
              />
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            data-selection
            className="truncate font-serif text-base font-medium italic"
          >
            {formatReferences(selection)}
          </p>
          {attach && (
            <p className="text-xs text-muted-foreground">
              {picked.length > 0 || carried ? (
                <button
                  type="button"
                  onClick={() => {
                    setPicked([]);
                    setCarried(null);
                  }}
                  className="rounded-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Clear, and use the whole chapter
                </button>
              ) : attached ? (
                <span role="status" className="font-medium text-primary">
                  {attached} added. Choose another, or close.
                </span>
              ) : (
                "The whole chapter. Tap verses to choose them; tap again to unselect."
              )}
            </p>
          )}
        </div>
        {attach ? (
          <Button
            type="button"
            onClick={() => {
              attach.onAttach(selection);
              if (!besideIdea || !attach.repeatable) return onDone();
              // Stay for the next passage, with a clean slate and a word that it worked.
              setAttached(formatReferences(selection));
              setPicked([]);
              setCarried(null);
            }}
          >
            {attach.label}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
