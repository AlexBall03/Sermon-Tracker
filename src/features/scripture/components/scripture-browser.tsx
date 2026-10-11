"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { searchTips, type SearchScope } from "../search";
import { useBibleSearch } from "../use-bible-search";
import { useChapter } from "../use-chapter";
import { PassageError, PassageSkeleton, PassageText } from "./passage-text";
import { SearchHits } from "./search-hits";

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
  const {
    results,
    problem: entryError,
    search: runSearch,
    clearProblem: clearEntryError,
  } = useBibleSearch();
  const [view, setView] = useState<"read" | "results">("read");
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

  function search(query: string, scope: SearchScope, offset = 0) {
    if (runSearch(query, scope, offset)) setView("results");
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
    // `min-w-0`: beside the idea it is a flex item, and must narrow with the dialog.
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {header}

      <div className="space-y-3 border-b px-4 pb-4 sm:px-5">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            // Never the surrounding form's submit.
            event.stopPropagation();
            search(entry, results?.scope ?? "all");
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
                  clearEntryError();
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
                    clearEntryError();
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
          {/* Floats over the passage, so opening it moves nothing. */}
          <Popover>
            <PopoverTrigger className="mt-1.5 rounded-sm text-xs font-medium text-muted-foreground link-underline hover:text-foreground">
              Search options
            </PopoverTrigger>
            <PopoverContent
              // Nothing inside to focus. Focus stays on the link: sending it to the
              // search box counts as leaving the popover, which closes it at once.
              initialFocus={false}
              className="w-[22rem] p-3 text-xs"
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {searchTips.map(([example, meaning]) => (
                  <div key={example} className="contents">
                    <dt className="font-mono font-semibold whitespace-nowrap">{example}</dt>
                    <dd className="text-muted-foreground">{meaning}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-muted-foreground">
                Words are matched as written, whatever their capitals. To go to a passage, use Book,
                Chapter, and Verse below.
              </p>
            </PopoverContent>
          </Popover>
        </form>

        {/* On a phone the book takes a line of its own, so its name is never cut short. */}
        <div
          role="group"
          aria-label="Go to a passage"
          className="flex items-center gap-2 max-sm:flex-wrap"
        >
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
            className="flex-1 max-sm:order-first max-sm:basis-full"
          />
          <Select
            label="Chapter"
            value={String(chapter)}
            onChange={(value) => goTo(book, Number(value))}
            options={numbers(chaptersIn(book))}
            layout="grid"
            className="tabular-nums max-sm:flex-1 sm:w-[4.5rem]"
          />
          <Select
            label="Verse"
            value={picked.length === 1 && !carried ? String(picked[0]) : "all"}
            onChange={(value) => goTo(book, chapter, value === "all" ? null : Number(value))}
            options={[{ value: "all", label: "All" }, ...numbers(versesIn(book, chapter))]}
            layout="grid"
            className="tabular-nums max-sm:flex-1 sm:w-[4.5rem]"
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
                  search(
                    results.query,
                    value === "all" || value === "old" || value === "new" ? value : Number(value),
                  )
                }
                options={scopeOptions}
                className="ml-auto h-9 w-44"
              />
            </div>

            <SearchHits
              results={results}
              onSearch={search}
              onOpen={(hit) => goTo(hit.book, hit.chapter, hit.verse)}
            >
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
            </SearchHits>
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
                  className="rounded-sm font-medium text-primary link-underline"
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
