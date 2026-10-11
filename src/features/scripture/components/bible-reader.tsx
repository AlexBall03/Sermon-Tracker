"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, TextSearch } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { translation, versesIn } from "../books";
import {
  defaultCopyKind,
  readCopyKind,
  subscribeCopyKind,
  type CopyKind,
} from "../copy-preference";
import { glideTo } from "../glide";
import { swipeDirection, type TouchPoint } from "../swipe";
import {
  firstLocation,
  parseReaderLocation,
  readerHref,
  readSavedLocation,
  sameChapter,
  saveLocation,
  stepChapter,
  type ReaderLocation,
} from "../reader-location";
import {
  applySidebar,
  readSidebarOpen,
  sidebarScript,
  storeSidebarOpen,
  subscribeSidebar,
} from "../reader-sidebar";
import { formatReference, formatReferences } from "../reference";
import {
  formatSelectionText,
  noSelection,
  selectedVerses,
  selectionReferences,
  toggleVerse,
  wholeChapter,
  type VerseSelection,
} from "../selection";
import { keepChapter, loadChapter, useChapter, type ChapterText } from "../use-chapter";
import { PassageError, PassageSkeleton, PassageText } from "./passage-text";
import { ReaderNavigator, useReaderNavigation } from "./reader-navigator";
import { SelectionToolbar } from "./selection-toolbar";

/** A chapter the server sent with the page, so a link to it arrives with its text. */
export type InitialChapter = { book: number; chapter: number; text: ChapterText };

const sidebarId = "bible-navigation";

/** A chapter as it is written: "John 3", "Psalm 23", and "Jude" for a book of one chapter. */
function placeName({ book, chapter }: ReaderLocation) {
  return formatReference({
    book,
    chapterStart: chapter,
    verseStart: null,
    chapterEnd: null,
    verseEnd: null,
  });
}

/**
 * Applies the stored sidebar choice before the first paint, as
 * `LibraryViewScript` does for the library's view. In the browser React never
 * runs a script it renders, so there it is inert and the reader's layout
 * effect does the same job.
 */
export function ReaderSidebarScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: sidebarScript }}
    />
  );
}

/**
 * The Bible reader: one chapter, set to be read, with the way to any other
 * beside it.
 *
 * Where it is open is the address (features/scripture/reader-location.ts).
 * An address that names a place is obeyed; one that names none is sent to the
 * chapter this browser last read, or to Genesis 1. Moving about changes the
 * address in the browser alone, so Back and Forward retrace the reading and
 * the text comes a chapter at a time from the cache every Scripture surface
 * shares. What is selected is not in the address and does not outlive its
 * chapter.
 */
export function BibleReader({ initial }: { initial?: InitialChapter }) {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const location = useMemo(() => parseReaderLocation(new URLSearchParams(query)), [query]);
  const navigation = useReaderNavigation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Which way the last move went, so the chapter arrives from that side.
  const [arrival, setArrival] = useState<Arrival>("none");

  // Open on the server and until hydration; the attribute on <html> already has the truth.
  const sidebarOpen = useSyncExternalStore(subscribeSidebar, readSidebarOpen, () => true);
  // Arriving from another page loads no HTML, so the inline script did not run.
  useLayoutEffect(() => applySidebar(), []);
  // Counts the moves that change nothing in the address, so going to the verse
  // already in it points that verse out again.
  const [moves, setMoves] = useState(0);

  // The address named no place: go to the one last read here. It replaces the
  // entry, so Back does not return to an address that only sends forward again.
  useEffect(() => {
    if (location) return;
    const saved = readSavedLocation() ?? firstLocation;
    void loadChapter(saved.book, saved.chapter).catch(() => {});
    router.replace(readerHref(saved), { scroll: false });
  }, [location, router]);

  // One place has one address: an address that says it another way is rewritten.
  const canonical = location ? readerHref(location).split("?")[1] : null;
  useEffect(() => {
    if (canonical === null || canonical === query) return;
    window.history.replaceState(window.history.state, "", `?${canonical}`);
  }, [canonical, query]);

  const book = location?.book;
  const chapter = location?.chapter;
  useEffect(() => {
    if (book && chapter) saveLocation({ book, chapter, verse: null });
  }, [book, chapter]);

  function go(next: ReaderLocation, how?: Arrival) {
    setSheetOpen(false);
    const href = readerHref(next);
    // Exactly one thing changes per move, so the chapter's view answers it once: the
    // address when the place is new, and the count only when it is the place already
    // shown (the same verse asked for again). Both at once would start the glide to
    // a verse twice, which is seen as a start, a pause, and a second start.
    if (!location || href !== readerHref(location)) window.history.pushState(null, "", href);
    else setMoves((count) => count + 1);
    // A new chapter is read from its head; a verse is brought into view once its text is there.
    if (!sameChapter(location, next)) {
      const order = (place: ReaderLocation) => place.book * 1000 + place.chapter;
      setArrival(how ?? (!location ? "none" : order(next) > order(location) ? "forward" : "back"));
      window.scrollTo({ top: 0, behavior: "instant" });
      setAnnouncement(placeName(next));
    }
  }

  const previous = location ? stepChapter(location, -1) : null;
  const next = location ? stepChapter(location, 1) : null;

  // A sideways swipe over the text turns the page, as the arrows do: towards the
  // left for the next chapter, towards the right for the one before. One finger
  // only, and never from inside something that takes typing or has marked text.
  const touch = useRef<TouchPoint | null>(null);
  function onTouchStart(event: React.TouchEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const typing = target?.closest("input, textarea, select, [contenteditable='true']");
    const [finger] = Array.from(event.touches);
    touch.current =
      event.touches.length === 1 && !typing
        ? { x: finger.clientX, y: finger.clientY, time: performance.now() }
        : null;
  }
  function onTouchEnd(event: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    const [finger] = Array.from(event.changedTouches);
    if (!start || !finger || event.touches.length > 0) return;
    if (window.getSelection()?.toString()) return;
    const turn = swipeDirection(start, {
      x: finger.clientX,
      y: finger.clientY,
      time: performance.now(),
    });
    const to = turn === 1 ? next : turn === -1 ? previous : null;
    if (to) go(to);
  }
  const place = location ? placeName(location) : "Bible";

  return (
    <div className="flex min-h-[calc(100dvh-var(--bar-h))] flex-1">
      <aside
        id={sidebarId}
        aria-label="Bible navigation"
        // Put away, its place closes to nothing while the panel itself slides off
        // to the left and fades, so the text glides over to where it was. It keeps
        // its width throughout, so nothing inside reflows, and once away it is
        // hidden from the keyboard and from assistive technology.
        className="sticky top-bar h-[calc(100dvh-var(--bar-h))] w-72 shrink-0 overflow-hidden transition-[width,visibility] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] max-md:hidden lg:w-80 sidebar-closed:invisible sidebar-closed:w-0"
      >
        <div className="flex h-full w-72 flex-col border-r transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] lg:w-80 sidebar-closed:-translate-x-10 sidebar-closed:opacity-0">
          {/* As tall as the chapter bar beside it, so the two read as one line. */}
          <p className="flex h-14 shrink-0 items-center px-4 font-display text-lg leading-snug font-medium tracking-[-0.01em]">
            Bible
          </p>
          <ReaderNavigator location={location} onGo={go} navigation={navigation} />
        </div>
      </aside>

      <div
        className="min-w-0 flex-1"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => (touch.current = null)}
      >
        <div className="sticky top-bar z-30 flex items-center border-b glass">
          {/*
           * The handle on the navigation's edge. It is one control in one place: it
           * sits astride the line between the navigation and the text and travels
           * with that line, so putting the navigation away carries it to the edge
           * of the window, where the same click brings the navigation back. Its
           * arrow says which way the navigation will go.
           */}
          <button
            type="button"
            aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
            aria-expanded={sidebarOpen}
            aria-controls={sidebarId}
            onClick={() => storeSidebarOpen(!sidebarOpen)}
            className="group/handle absolute top-1/2 left-0 z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-input bg-surface-raised text-muted-foreground shadow-card transition-[translate,color,border-color,box-shadow] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] hover:border-primary/70 hover:text-primary hover:shadow-raised active:bg-accent max-md:hidden pointer-coarse:size-9 sidebar-closed:translate-x-2.5"
          >
            <ChevronLeft
              className="size-4 transition-transform duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] sidebar-closed:rotate-180"
              aria-hidden
            />
          </button>
          <div
            role="group"
            aria-label="Chapter"
            className="mx-auto flex h-14 max-w-[46rem] min-w-0 flex-1 items-center gap-1.5 px-3 sm:gap-2 sm:px-5"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Browse and search the Bible"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              <TextSearch aria-hidden />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous chapter"
              disabled={!previous}
              onClick={() => previous && go(previous)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <h1 className="min-w-0 flex-1 truncate text-center font-display text-lg leading-snug font-medium tracking-[-0.01em] sm:text-xl">
              {place}
            </h1>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next chapter"
              disabled={!next}
              onClick={() => next && go(next)}
            >
              <ChevronRight aria-hidden />
            </Button>
            {/* Each control has its like at the other end, so the name sits over the text. */}
            <span aria-hidden className="size-9 shrink-0 md:hidden pointer-coarse:size-11" />
          </div>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {location ? (
          <ChapterView
            // A chapter of its own: nothing chosen in one is carried into the next.
            key={`${location.book}.${location.chapter}`}
            location={location}
            initial={initial}
            arrival={arrival}
            moves={moves}
            previous={previous}
            next={next}
            onGo={go}
          />
        ) : (
          <div className="mx-auto max-w-[46rem] px-3 py-8 sm:px-5">
            <PassageSkeleton lines={12} />
          </div>
        )}
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent placement="full">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
            <div className="min-w-0">
              <DialogTitle>Bible</DialogTitle>
              <DialogDescription>{translation.name}</DialogDescription>
            </div>
            <DialogClose label="Close navigation" />
          </div>
          <ReaderNavigator location={location} onGo={go} navigation={navigation} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** How a chapter comes in: from the side it lies on, or simply up when there is no side. */
type Arrival = "forward" | "back" | "rise" | "fall" | "none";

// A short slide and nothing else. Nothing fades: text that starts from clear
// leaves the page blank for a moment, which is seen as a flash. Sideways is
// turning to a chapter beside this one; up and down is reading on past the
// end of one, or back before its beginning.
const arrivals: Record<Arrival, string> = {
  forward: "animate-in duration-300 ease-out slide-in-from-right-4",
  back: "animate-in duration-300 ease-out slide-in-from-left-4",
  rise: "animate-in duration-300 ease-out slide-in-from-bottom-6",
  fall: "animate-in duration-300 ease-out slide-in-from-top-6",
  none: "",
};

/** The links at the foot of a chapter: quiet until pointed at, with a full-height target. */
const onward =
  "group/onward flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:min-h-12";

type ChapterViewProps = {
  location: ReaderLocation;
  initial?: InitialChapter;
  arrival: Arrival;
  /** Changes when the verse already shown is gone to again. */
  moves: number;
  previous: ReaderLocation | null;
  next: ReaderLocation | null;
  onGo: (location: ReaderLocation, how?: Arrival) => void;
};

/** One chapter's text, what is selected in it, and what can be done with the selection. */
function ChapterView({
  location,
  initial,
  arrival,
  moves,
  previous,
  next,
  onGo,
}: ChapterViewProps) {
  const { book, chapter, verse } = location;
  const toast = useToast();
  const verseCount = versesIn(book, chapter);
  const [selection, setSelection] = useState<VerseSelection>(noSelection);
  const [problem, setProblem] = useState<string | null>(null);
  const [versesOpen, setVersesOpen] = useState(false);
  // What the keyboard's copy does here: chosen in Settings, the verse text until then.
  const shortcut = useSyncExternalStore(subscribeCopyKind, readCopyKind, () => defaultCopyKind);

  // The chapter that came with the page is shown as it is and kept, so it is
  // never asked for; any other is fetched, once.
  const sent = initial?.book === book && initial.chapter === chapter ? initial.text : null;
  useEffect(() => {
    if (sent) keepChapter(book, chapter, sent);
  }, [book, chapter, sent]);
  const fetched = useChapter(book, chapter);
  const text = sent ?? (fetched.status === "ready" ? fetched : null);

  // With this chapter in hand, fetch the ones either side, so turning to them
  // shows their text at once and never the loading lines in between.
  const has = text !== null;
  const before = previous ? `${previous.book}.${previous.chapter}` : null;
  const after = next ? `${next.book}.${next.chapter}` : null;
  useEffect(() => {
    if (!has) return;
    for (const neighbour of [before, after]) {
      if (!neighbour) continue;
      const [nearBook, nearChapter] = neighbour.split(".").map(Number);
      // A failure here is nobody's concern: the chapter is asked for again when it is opened.
      void loadChapter(nearBook, nearChapter).catch(() => {});
    }
  }, [has, before, after]);

  // Bring the verse that was gone to into view, once there is text to find it in,
  // and light it for a moment so the eye lands on it. The light fades by itself:
  // there is nothing to clear, and nothing is selected.
  //
  // Arriving in a chapter at a verse (a link, a search result) starts there at
  // once. Within the chapter already being read (Go to verse) the page glides
  // to it, and the light comes up as the glide ends, so the two are one motion
  // and not a jump with a flash. A verse already comfortably in view is lit
  // where it is, without moving the page at all.
  const ready = text !== null;
  const arrived = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const first = !arrived.current;
    arrived.current = true;
    if (!verse) return;
    const row = document.querySelector<HTMLElement>(`[data-reader-text] [data-verse="${verse}"]`);
    if (!row) return;

    // One verse at a time: a verse still tinted from a moment ago lets go at once,
    // so going to a second verse soon after a first lights only the second.
    for (const lit of row.closest("[data-reader-text]")?.querySelectorAll("[data-found]") ?? []) {
      lit.removeAttribute("data-found");
    }
    // Taken off when it has played, so nothing later (a re-render, a theme change) can replay it.
    const done = () => row.removeAttribute("data-found");
    const light = () => {
      // The layout is read first, so it plays again even on the verse it last played on.
      void row.offsetWidth;
      row.setAttribute("data-found", "");
    };
    row.addEventListener("animationend", done);
    row.addEventListener("animationcancel", done);

    const box = row.getBoundingClientRect();
    // Clear of the two bars above and of the foot of the window, with room to read on.
    const inView = box.height > 0 && box.top >= 140 && box.bottom <= window.innerHeight - 120;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const glide = !first && !inView && !still;

    let stop = () => {};
    if (glide) {
      // The verse comes to the middle of the window, and is lit as it gets there.
      const middle = window.scrollY + box.top - (window.innerHeight - box.height) / 2;
      stop = glideTo(middle, light);
    } else {
      if (!inView) row.scrollIntoView({ block: "center", behavior: "instant" });
      light();
    }

    return () => {
      stop();
      row.removeEventListener("animationend", done);
      row.removeEventListener("animationcancel", done);
    };
  }, [ready, verse, moves]);

  const references = useMemo(
    () => selectionReferences(book, chapter, selection),
    [book, chapter, selection],
  );
  const chosen = useMemo(() => selectedVerses(selection, verseCount), [selection, verseCount]);

  function change(next: VerseSelection) {
    setProblem(null);
    setSelection(next);
  }

  const named = formatReferences(references);
  // A link opens the chapter at the first verse chosen; a whole chapter needs no verse.
  const link = readerHref({
    book,
    chapter,
    verse: selection.kind === "verses" ? selection.verses[0] : null,
  });

  /** Copies the selection one of three ways. True when it reached the clipboard. */
  async function copy(kind: CopyKind): Promise<boolean> {
    if (references.length === 0 || !text) return false;
    const [value, done] = {
      text: [formatSelectionText(references, text.verses, translation.short), `Copied ${named}.`],
      reference: [named, "Copied the reference."],
      link: [new URL(link, window.location.origin).href, "Copied a link."],
    }[kind];
    try {
      await navigator.clipboard.writeText(value);
      setProblem(null);
      toast({ message: done });
      return true;
    } catch {
      setProblem("That could not be copied. Your browser did not allow it.");
      return false;
    }
  }

  // Ctrl or Command with C copies what is selected, the way Settings says to,
  // and the selection is done with. Text marked the ordinary way, and anything
  // being typed, is left to the browser's own copy.
  const onCopyKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== "c" || references.length === 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (window.getSelection()?.toString()) return;
    event.preventDefault();
    void copy(readCopyKind()).then((copied) => copied && setSelection(noSelection));
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onCopyKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return (
    <article className="mx-auto flex min-h-[calc(100dvh-var(--bar-h)-3.5rem)] max-w-[46rem] flex-col px-3 pt-5 pb-20 sm:px-5 sm:pt-7">
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <p className="text-xs font-medium text-muted-foreground">{translation.name}</p>
        <div className="-mr-2 flex items-center gap-1">
          <Popover open={versesOpen} onOpenChange={setVersesOpen}>
            <PopoverTrigger
              disabled={!ready}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "px-2 text-muted-foreground hover:text-foreground data-popup-open:text-foreground",
              )}
            >
              Go to verse
            </PopoverTrigger>
            {/* A plain list of numbers: the verse last gone to is not kept marked here either. */}
            <PopoverContent align="end" className="max-h-80 w-72 p-1.5">
              <ul aria-label="Verses" className="grid grid-cols-6 gap-0.5">
                {Array.from({ length: verseCount }, (_, index) => index + 1).map((number) => (
                  <li key={number}>
                    <button
                      type="button"
                      aria-label={`Verse ${number}`}
                      onClick={() => {
                        setVersesOpen(false);
                        onGo({ book, chapter, verse: number });
                      }}
                      className="grid h-9 w-full place-items-center rounded-md text-sm text-muted-foreground tabular-nums transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:h-11"
                    >
                      {number}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 text-muted-foreground hover:text-foreground aria-pressed:text-primary"
            aria-pressed={selection.kind === "chapter"}
            disabled={!ready}
            onClick={() => change(selection.kind === "chapter" ? noSelection : wholeChapter)}
          >
            Select chapter
          </Button>
        </div>
      </div>

      {/* Clipped sideways: a chapter sliding in must not widen the page for a moment. */}
      <div data-reader-text className="flex-1 overflow-x-clip">
        {text ? (
          // A new chapter comes in once, as its text arrives: it settles into place
          // from the side it lies on (the next from the right, the one before from
          // the left), fully there from the first frame. Still under reduced motion.
          <div data-arrival={arrival} className={arrivals[arrival]}>
            <PassageText
              size="reader"
              verses={text.verses}
              superscription={text.title}
              selected={chosen}
              located={verse}
              onSelectVerse={(picked) => change(toggleVerse(selection, picked, verseCount))}
            />
          </div>
        ) : fetched.status === "error" ? (
          <PassageError retry={fetched.retry} />
        ) : (
          <PassageSkeleton lines={12} />
        )}
      </div>

      {/*
       * Reading on. These are at the end of a chapter, so they do not behave like
       * the arrows at its head: the chapter after comes up from below, as the next
       * page of the same reading, and the one before comes down from above. Each
       * says in words which way it goes, and its arrow leans that way under the pointer.
       */}
      <nav
        aria-label="Neighbouring chapters"
        className="mt-10 flex items-stretch justify-between gap-3 border-t pt-4"
      >
        {previous ? (
          <button type="button" className={onward} onClick={() => onGo(previous, "fall")}>
            <ChevronLeft
              className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-150 group-hover/onward:-translate-x-0.5 group-hover/onward:text-primary"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">Previous</span>
              <span className="block truncate font-display text-base leading-snug font-medium">
                {placeName(previous)}
              </span>
            </span>
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button
            type="button"
            className={cn(onward, "text-right")}
            onClick={() => onGo(next, "rise")}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">Next</span>
              <span className="block truncate font-display text-base leading-snug font-medium">
                {placeName(next)}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-150 group-hover/onward:translate-x-0.5 group-hover/onward:text-primary"
              aria-hidden
            />
          </button>
        )}
      </nav>

      {/* The space beneath is the Back to top button's, which floats in that corner. */}
      {/* Rests at the foot of the window, above the tab bar where there is one, and never beyond the column. */}
      <SelectionToolbar
        className="sticky bottom-[calc(var(--bar-h)+env(safe-area-inset-bottom)+0.75rem)] z-20 mt-4 md:bottom-6"
        references={references}
        problem={problem}
        shortcut={shortcut}
        onCopyText={() => void copy("text")}
        onCopyReference={() => void copy("reference")}
        onCopyLink={() => void copy("link")}
        onClear={() => change(noSelection)}
      />
    </article>
  );
}
