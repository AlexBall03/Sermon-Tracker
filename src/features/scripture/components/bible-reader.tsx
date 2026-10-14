"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Link2,
  Link2Off,
  LoaderCircle,
  TextSearch,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { AttachScripture } from "@/features/ideas/components/attach-scripture";
import { setBibleTranslation } from "@/features/preferences/actions";
import { useReading } from "@/features/preferences/client";
import { useT } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { routes, siteConfig } from "@/lib/site";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { versesIn } from "../books";
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
  offered,
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
import {
  lockScrolling,
  readScrollLocked,
  storeScrollLocked,
  subscribeScrollLock,
  type Alignment,
} from "../scroll-lock";
import { formatReference, formatReferences, type ScriptureReference } from "../reference";
import { noMarks, type ChapterMarks, type FavoriteSummary } from "../saved/model";
import { versesInChapter } from "../saved/verse-set";
import {
  formatSelectionText,
  noSelection,
  selectedVerses,
  selectionReferences,
  selectRange,
  toggleVerse,
  wholeChapter,
  type VerseSelection,
} from "../selection";
import {
  fallbackTranslation,
  otherTranslation,
  translations as allTranslations,
  type TranslationId,
} from "../translations";
import { keepChapter, loadChapter, useChapter, type ChapterText } from "../use-chapter";
import { keepMarks, loadMarks, useChapterMarks } from "../use-chapter-marks";
import { PassageError, PassageSkeleton, PassageText } from "./passage-text";
import { ReaderNavigator, useReaderNavigation } from "./reader-navigator";
import { FavoriteEditor } from "./saved/favorite-editor";
import { SelectionActions, SelectionFavorites } from "./saved/selection-actions";
import { SelectionToolbar } from "./selection-toolbar";

/**
 * A chapter the server sent with the page, so a link to it arrives with its
 * text, and with what the reader has marked in it where that could be read.
 */
export type InitialChapter = {
  /** The translation the text is in. A page sent before there were two is the King James. */
  translation?: TranslationId;
  book: number;
  chapter: number;
  text: ChapterText;
  marks?: ChapterMarks;
};

/**
 * What the reader was opened from, as the server found it among the account's
 * own: an idea, or an outline (`outline`), whose title is then its sermon's.
 */
/**
 * True in the offline page's reader (features/pwa/components/offline-shell.tsx):
 * the text is read from this device and nothing of an account is asked for or
 * changed. There are no marks, favorites, highlights, or attaching to an idea,
 * and choosing a translation is not saved; reading, comparing, and copying
 * work as always.
 */
const LocalReading = createContext(false);

export type ReaderOrigin = { id: string; title: string; outline?: boolean };

/** True while the reading still goes on from where the reader was opened. */
function cameFrom(location: ReaderLocation, origin: ReaderOrigin | undefined) {
  if (!origin) return false;
  return (origin.outline ? location.outline : location.idea) === origin.id;
}

/**
 * The two panes of a comparison. `primary` is the reader as it always was, and
 * is the only one when nothing is being compared; `beside` is the one opened
 * next to it.
 */
type PaneId = "primary" | "beside";

const sidebarId = "bible-navigation";

/**
 * Room for two panes: two columns of twenty rems of reading each, and their
 * gutters. Narrower than this (a phone held upright), two columns of
 * Scripture would be too cramped to read, so comparing is not offered.
 */
const roomForTwoPanes = "(min-width: 44rem)";

/**
 * Room for two panes and the navigation docked beside them. Between the two
 * widths the panes have the window to themselves while they are open, and the
 * navigation is opened over them, as it is on a phone.
 */
const roomForPanesAndNavigation = "(min-width: 66rem)";

/**
 * A chapter as it is written: "John 3", "Psalm 23", and "Jude" for a book of
 * one chapter. In a pane it is written as that pane's translation names the
 * books: "Juan 3" above the Spanish text.
 */
function placeName({ book, chapter }: ReaderLocation, language?: Locale) {
  return formatReference(
    { book, chapterStart: chapter, verseStart: null, chapterEnd: null, verseEnd: null },
    language,
  );
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
 * beside it; or two, side by side, each in a translation of its own.
 *
 * Where it is open is the address (features/scripture/reader-location.ts).
 * An address that names a place is obeyed; one that names none is sent to the
 * chapter this browser last read, or to Genesis 1. Moving about changes the
 * address in the browser alone, so Back and Forward retrace the reading and
 * the text comes a chapter at a time from the cache every Scripture surface
 * shares. What is selected is not in the address and does not outlive its
 * chapter.
 *
 * Comparing is for a window wide enough for two columns of text: a desktop,
 * a tablet, a phone turned on its side. Where there is not that room it is
 * not offered, and an address that asks for it shows the first pane alone
 * until there is. The panes never compete with the navigation for room:
 * where both do not fit, the navigation steps aside while two panes are open
 * and is opened over them instead.
 *
 * Two panes are two readers that share this one address: each has its own
 * translation, its own place, its own selection and marks, and scrolls by
 * itself unless the reader locks the two together. They are joined in one
 * place only, here: `go` moves a pane and `linked` says whether the other
 * follows (it does not), and the lock on the line between them makes them
 * scroll as one (features/scripture/scroll-lock.ts). Nothing in a pane knows
 * of the other.
 */
export function BibleReader({
  initial,
  origin,
  local = false,
}: {
  initial?: InitialChapter;
  /** Given when the address names an idea of the account's: the way back to it is then offered. */
  origin?: ReaderOrigin;
  /** Read without the server and without an account (see `LocalReading`). */
  local?: boolean;
}) {
  const t = useT("scripture").reader;
  const router = useRouter();
  const toast = useToast();
  const preferred = useReading();
  const params = useSearchParams();
  const query = params.toString();
  // A translation that is not on offer is read as the reader's own, and a pane in it is closed.
  const location = useMemo(() => {
    const named = parseReaderLocation(new URLSearchParams(query));
    return named ? offered(named, preferred.translations) : null;
  }, [query, preferred.translations]);
  const navigation = useReaderNavigation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Which way each pane's last move went, so its chapter arrives from that side.
  const [arrivals, setArrivals] = useState<Record<PaneId, Arrival>>({
    primary: "none",
    beside: "none",
  });

  // Open on the server and until hydration; the attribute on <html> already has the truth.
  const sidebarOpen = useSyncExternalStore(subscribeSidebar, readSidebarOpen, () => true);
  // Arriving from another page loads no HTML, so the inline script did not run.
  useLayoutEffect(() => applySidebar(), []);
  // Counts the moves that change nothing in the address, so going to the verse
  // already in it points that verse out again.
  const [moves, setMoves] = useState<Record<PaneId, number>>({ primary: 0, beside: 0 });
  // The second pane's verse is of the moment and is not in the address: the address
  // says which chapter is open beside the first, and no more.
  const [besideVerse, setBesideVerse] = useState<{ place: string; verse: number } | null>(null);

  // A translation just chosen in a pane, until the address says the same. The address
  // is changed through the router, which may hold the change back while it is busy
  // (saving the choice refreshes the page behind it); the pane must not wait for that.
  // So the choice is shown from here at once, with its loading lines if the text is
  // still on its way, and the address catches up.
  const [chosen, setChosen] = useState<Partial<Record<PaneId, TranslationId>>>({});
  if (chosen.primary && location?.translation === chosen.primary) {
    setChosen(({ beside }) => (beside ? { beside } : {}));
  }
  if (chosen.beside && (!location?.beside || location.beside.translation === chosen.beside)) {
    setChosen(({ primary }) => (primary ? { primary } : {}));
  }

  // The pane the navigation, the keyboard, and the page's name answer to: the one last
  // touched. With one pane there is nothing to choose between.
  const [touched, setTouched] = useState<PaneId>("primary");
  const roomForTwo = useMediaQuery(roomForTwoPanes);
  const roomBeside = useMediaQuery(roomForPanesAndNavigation);
  const comparing = Boolean(location?.beside) && roomForTwo;
  // Two panes and no room left for the docked navigation: it is opened over them instead.
  const navigationOver = comparing && !roomBeside;
  const active: PaneId = comparing ? touched : "primary";
  // Whether moving one pane moves the other. It does not: each turns its own chapters,
  // even while their scrolling is locked.
  const linked = false;
  // Whether the two panes scroll as one: this browser's choice, and off until asked for.
  const scrollLocked = useSyncExternalStore(subscribeScrollLock, readScrollLocked, () => false);

  // The address named no place: go to the one last read here. It replaces the
  // entry, so Back does not return to an address that only sends forward again.
  useEffect(() => {
    if (location) return;
    const saved = readSavedLocation() ?? firstLocation;
    void loadChapter(preferred.translation, saved.book, saved.chapter).catch(() => {});
    router.replace(readerHref(saved), { scroll: false });
  }, [location, router, preferred.translation]);

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

  /** Each pane as it stands: its translation and its place. */
  const panes = useMemo(() => {
    if (!location) return null;
    const second = location.beside;
    const secondPlace = second ? `${second.book}.${second.chapter}` : "";
    return {
      primary: {
        translation: chosen.primary ?? location.translation ?? preferred.translation,
        place: location,
      },
      beside:
        second && roomForTwo
          ? {
              translation: chosen.beside ?? second.translation,
              place: {
                book: second.book,
                chapter: second.chapter,
                verse: besideVerse?.place === secondPlace ? besideVerse.verse : null,
              } as ReaderLocation,
            }
          : null,
    };
  }, [location, preferred.translation, besideVerse, roomForTwo, chosen]);
  const current = panes ? (panes[active] ?? panes.primary) : null;
  const language = (id: TranslationId) => allTranslations[id].language;

  // The chapter is the page's name, so a tab, a bookmark, and the history list say where it is.
  const titled = current ? placeName(current.place, language(current.translation)) : null;
  useEffect(() => {
    if (titled) document.title = `${titled} · ${siteConfig.name}`;
  }, [titled]);

  function go(pane: PaneId, to: ReaderLocation, how?: Arrival) {
    setSheetOpen(false);
    // Asked for before the address had named a place: simply go there.
    if (!location || !panes) return window.history.pushState(null, "", readerHref(to));
    const from = (panes[pane] ?? panes.primary).place;
    let next: ReaderLocation;
    if (pane === "beside" && location.beside) {
      // The first pane stays exactly where it is; only what is open beside it changes.
      next = {
        ...location,
        beside: {
          translation: chosen.beside ?? location.beside.translation,
          book: to.book,
          chapter: to.chapter,
        },
      };
      setBesideVerse(to.verse ? { place: `${to.book}.${to.chapter}`, verse: to.verse } : null);
    } else {
      // Reading on from an idea, the way back to it comes along; so do the translation
      // being read and whatever is open beside it.
      next = {
        ...to,
        idea: to.idea ?? location.idea ?? null,
        outline: to.outline ?? location.outline ?? null,
        translation: to.translation ?? chosen.primary ?? location.translation ?? null,
        beside: location.beside ?? null,
      };
    }
    const href = readerHref(next);
    // Exactly one thing changes per move, so the chapter's view answers it once: the
    // address when the place is new, and the count only when it is the place already
    // shown (the same verse asked for again). Both at once would start the glide to
    // a verse twice, which is seen as a start, a pause, and a second start.
    if (href !== readerHref(location)) window.history.pushState(null, "", href);
    else setMoves((counts) => ({ ...counts, [pane]: counts[pane] + 1 }));
    // A new chapter is read from its head; a verse is brought into view once its text is there.
    if (!sameChapter(from, to)) {
      const order = (place: ReaderLocation) => place.book * 1000 + place.chapter;
      setArrivals((sides) => ({
        ...sides,
        [pane]: how ?? (order(to) > order(from) ? "forward" : "back"),
      }));
      // Alone, the reader scrolls the page. Side by side, each pane scrolls by itself,
      // and a new chapter is a new pane, which starts at its head.
      if (!comparing) window.scrollTo({ top: 0, behavior: "instant" });
      // The lock held the two at one place in their reading, and that place is gone: a
      // pane that turns its chapter is let go, and the reader locks them again if wanted.
      if (comparing && scrollLocked) storeScrollLocked(false);
      setAnnouncement(placeName(to, language((panes[pane] ?? panes.primary).translation)));
    }
    // `linked` is where a move in one pane would be repeated in the other.
    void linked;
  }

  /**
   * Reads a pane in another translation: the same book, chapter, and verse,
   * with no request for the page. Chosen in the first pane it is also saved as
   * the account's own translation, and taken back here if the server will not
   * have it. Nothing marked in either translation is touched.
   */
  function changeTranslation(pane: PaneId, id: TranslationId, remember = true) {
    if (!location || !panes) return;
    const before = readerHref(location);
    const next: ReaderLocation =
      pane === "beside" && location.beside
        ? { ...location, beside: { ...location.beside, translation: id } }
        : { ...location, translation: id };
    const after = readerHref(next);
    if (after === before) return;
    // Shown at once, from the reader's own state; the address follows.
    setChosen((current) => ({ ...current, [pane]: id }));
    // With no state of its own, as the moves are: handed the router's state back, the
    // router takes the call for one of its own and the reader never hears of it.
    window.history.replaceState(null, "", after);
    // The other text is seen to take the first one's place.
    setArrivals((sides) => ({ ...sides, [pane]: "swap" }));
    setAnnouncement(t.nowReading(allTranslations[id].short));
    if (pane !== "primary" || !remember || local) return;
    void setBibleTranslation(id)
      .catch(() => ({ ok: false, message: t.translationNotSaved }))
      .then((result) => {
        if (result.ok) return;
        // Refused: the text goes back to what it was, if nothing has moved since.
        setChosen(({ beside }) => (beside ? { beside } : {}));
        if (window.location.pathname + window.location.search === after) {
          window.history.replaceState(null, "", before);
        }
        toast({ message: result.message });
      });
  }

  /** Opens a second pane on the chapter being read, in the other translation where there is one. */
  function compare() {
    if (!location || !panes || location.beside) return;
    const beside = {
      translation: otherTranslation(panes.primary.translation, preferred.translations),
      book: location.book,
      chapter: location.chapter,
    };
    window.history.pushState(null, "", readerHref({ ...location, beside }));
    setTouched("primary");
    setArrivals({ primary: "none", beside: "none" });
  }

  /** Closes a pane. The one left is the reader, where it was and in its own translation. */
  function closePane(pane: PaneId) {
    if (!location?.beside) return;
    const { beside, ...first } = location;
    const kept: ReaderLocation =
      pane === "beside"
        ? first
        : {
            book: beside.book,
            chapter: beside.chapter,
            verse: null,
            translation: beside.translation,
            idea: location.idea ?? null,
            outline: location.outline ?? null,
          };
    window.history.pushState(null, "", readerHref(kept));
    setTouched("primary");
    setArrivals({ primary: "none", beside: "none" });
    setBesideVerse(null);
  }

  const paneProps = (pane: PaneId) => {
    const shown = panes?.[pane];
    if (!shown) return null;
    return {
      pane,
      translation: shown.translation,
      location: shown.place,
      offered: preferred.translations,
      initial,
      arrival: arrivals[pane],
      moves: moves[pane],
      onGo: (to: ReaderLocation, how?: Arrival) => go(pane, to, how),
      onTranslation: (id: TranslationId, remember?: boolean) =>
        changeTranslation(pane, id, remember),
      onBrowse: () => {
        setTouched(pane);
        setSheetOpen(true);
      },
    };
  };
  const first = paneProps("primary");
  const second = paneProps("beside");

  // Locked, the two panes scroll as one. A pane is a new element whenever its chapter
  // or its translation changes, so they are bound again each time either does.
  const panesBox = useRef<HTMLDivElement>(null);
  const bound = useRef<{ panes: readonly HTMLElement[]; owed: Alignment | null }>({
    panes: [],
    owed: null,
  });
  const paneKey = (shown: typeof first) =>
    shown ? `${shown.translation}.${shown.location.book}.${shown.location.chapter}` : "";
  const [firstKey, secondKey] = [paneKey(first), paneKey(second)];
  const locking = scrollLocked && Boolean(firstKey && secondKey);
  const samePlace =
    first?.location.book === second?.location.book &&
    first?.location.chapter === second?.location.chapter;
  useEffect(() => {
    const was = bound.current;
    const find = (pane: PaneId) =>
      panesBox.current?.querySelector<HTMLElement>(`[data-pane="${pane}"] [data-pane-scroller]`);
    const [one, two] = [find("primary"), find("beside")];
    if (!locking || !one || !two) {
      bound.current = { panes: [], owed: null };
      return;
    }
    const fresh = [one, two].filter((pane) => !was.panes.includes(pane));
    const align: Alignment | null =
      was.panes.length === 0
        ? // Just locked: the other pane is seen to come into line with the one in use.
          { follower: active === "primary" ? two : one, glide: true }
        : fresh.length === 1
          ? // A pane was replaced: the new one takes its place beside the one that stayed.
            { follower: fresh[0], glide: false, atHead: true }
          : was.owed && [one, two].includes(was.owed.follower)
            ? was.owed
            : null;
    const held = { panes: [one, two], owed: null as Alignment | null };
    bound.current = held;
    const stop = lockScrolling(one, two, { sameChapter: samePlace, align });
    return () => {
      held.owed = stop();
    };
  }, [locking, firstKey, secondKey, samePlace, active]);

  return (
    <LocalReading.Provider value={local}>
      <div className="flex min-h-[calc(100dvh-var(--bar-h))] flex-1">
        <aside
          id={sidebarId}
          aria-label={t.navigation}
          // Put away, its place closes to nothing while the panel itself slides off
          // to the left and fades, so the text glides over to where it was. It keeps
          // its width throughout, so nothing inside reflows, and once away it is
          // hidden from the keyboard and from assistive technology.
          className={cn(
            "sticky top-bar h-[calc(100dvh-var(--bar-h))] w-72 shrink-0 overflow-hidden transition-[width,visibility] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] max-md:hidden lg:w-80 sidebar-closed:invisible sidebar-closed:w-0",
            navigationOver && "hidden",
          )}
        >
          <div className="flex h-full w-72 flex-col border-r transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] lg:w-80 sidebar-closed:-translate-x-10 sidebar-closed:opacity-0">
            {/* As tall as the chapter bar beside it, so the two read as one line. */}
            <p className="flex h-14 shrink-0 items-center px-4 font-display text-lg leading-snug font-medium tracking-[-0.01em]">
              {t.bible}
            </p>
            <ReaderNavigator
              location={current?.place ?? null}
              translation={current?.translation ?? preferred.translation}
              onGo={(to) => go(active, to)}
              navigation={navigation}
            />
          </div>
        </aside>

        {/* The room the text has, which is what decides whether two panes fit side by side. */}
        <div className="relative min-w-0 flex-1">
          {/*
           * The handle on the navigation's edge. It is one control in one place: it
           * sits astride the line between the navigation and the text and travels
           * with that line, so putting the navigation away carries it to the edge
           * of the window, where the same click brings the navigation back. Its
           * arrow says which way the navigation will go. It stands apart from the
           * chapter bars, level with them, so it is the same with one pane or two.
           */}
          <div className={cn("sticky top-bar z-40 h-0 max-md:hidden", navigationOver && "hidden")}>
            <button
              type="button"
              aria-label={sidebarOpen ? t.hideNavigation : t.showNavigation}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarId}
              onClick={() => storeSidebarOpen(!sidebarOpen)}
              className="group/handle absolute top-7 left-0 z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-input bg-surface-raised text-muted-foreground shadow-card transition-[translate,color,border-color,box-shadow] duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] hover:border-primary/70 hover:text-primary hover:shadow-raised active:bg-accent pointer-coarse:size-9 sidebar-closed:translate-x-2.5"
            >
              <ChevronLeft
                className="size-4 transition-transform duration-[380ms] ease-[cubic-bezier(0.65,0,0.35,1)] sidebar-closed:rotate-180"
                aria-hidden
              />
            </button>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {!first ? (
            <>
              <ChapterBar name={t.bible} onBrowse={() => setSheetOpen(true)} sticky />
              <div className="mx-auto max-w-[46rem] px-3 py-8 sm:px-5">
                <PassageSkeleton lines={12} />
              </div>
            </>
          ) : !second ? (
            <ReaderPane
              // A chapter of its own, in a translation of its own: nothing chosen in
              // one is carried into the next.
              key={`${first.translation}.${first.location.book}.${first.location.chapter}`}
              {...first}
              active
              origin={cameFrom(first.location, origin) ? origin : undefined}
              // Offered only where two panes fit, and not while one is waiting for room.
              onCompare={roomForTwo && !location?.beside ? compare : undefined}
            />
          ) : (
            // Two panes fill the window beneath the bar and scroll apart, each by itself.
            <div
              ref={panesBox}
              data-comparing
              className="relative flex h-[calc(100dvh-var(--bar-h))] flex-col max-md:h-[calc(100dvh-var(--bar-h)*2-var(--bar-lift))]"
            >
              <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
                {[first, second].map((props) => (
                  <ReaderPane
                    key={`${props.pane}.${props.translation}.${props.location.book}.${props.location.chapter}`}
                    {...props}
                    comparing
                    browseAlways={navigationOver}
                    active={active === props.pane}
                    onActivate={() => setTouched(props.pane)}
                    onClose={() => closePane(props.pane)}
                    origin={
                      props.pane === "primary" && cameFrom(props.location, origin)
                        ? origin
                        : undefined
                    }
                  />
                ))}
              </div>
              {/*
               * The lock on the panes' scrolling: one control, astride the line between
               * them and level with their bars, as the navigation's handle is on its own
               * line. Emerald while they are locked together.
               */}
              <button
                type="button"
                aria-pressed={scrollLocked}
                aria-label={scrollLocked ? t.unlockScrolling : t.lockScrolling}
                title={scrollLocked ? t.unlockScrolling : t.lockScrolling}
                onClick={() => {
                  storeScrollLocked(!scrollLocked);
                  setAnnouncement(scrollLocked ? t.scrollingUnlocked : t.scrollingLocked);
                }}
                className="absolute top-7 left-1/2 z-40 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-input bg-surface-raised text-muted-foreground shadow-card transition-[color,border-color,box-shadow] duration-200 hover:border-primary/70 hover:text-primary hover:shadow-raised active:bg-accent aria-pressed:border-primary/70 aria-pressed:text-primary pointer-coarse:size-9"
              >
                {/* Keyed, so the change of state is seen: the new icon grows into place. */}
                {scrollLocked ? (
                  <Link2
                    key="locked"
                    className="size-4 animate-in duration-300 zoom-in-50"
                    aria-hidden
                  />
                ) : (
                  <Link2Off
                    key="free"
                    className="size-4 animate-in duration-300 zoom-in-50"
                    aria-hidden
                  />
                )}
              </button>
            </div>
          )}
        </div>

        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent placement="full">
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <DialogTitle>{t.bible}</DialogTitle>
                <DialogDescription>
                  {allTranslations[current?.translation ?? preferred.translation].name}
                </DialogDescription>
              </div>
              <DialogClose label={t.closeNavigation} />
            </div>
            <ReaderNavigator
              location={current?.place ?? null}
              translation={current?.translation ?? preferred.translation}
              onGo={(to) => go(active, to)}
              navigation={navigation}
            />
          </DialogContent>
        </Dialog>
      </div>
    </LocalReading.Provider>
  );
}

/** How a chapter comes in: from the side it lies on, or simply up when there is no side. */
type Arrival = "forward" | "back" | "rise" | "fall" | "swap" | "none";

// A short slide and nothing else. Nothing fades: text that starts from clear
// leaves the page blank for a moment, which is seen as a flash. Sideways is
// turning to a chapter beside this one; up and down is reading on past the
// end of one, or back before its beginning.
const arrivalClasses: Record<Arrival, string> = {
  forward: "animate-in duration-300 ease-out slide-in-from-right-4",
  back: "animate-in duration-300 ease-out slide-in-from-left-4",
  rise: "animate-in duration-300 ease-out slide-in-from-bottom-6",
  fall: "animate-in duration-300 ease-out slide-in-from-top-6",
  // Another translation of the same chapter is a different thing from another chapter,
  // and is shown differently: the new text comes up out of clear, slowly enough to be
  // seen, so nobody is left wondering whether the text changed.
  swap: "animate-in duration-500 ease-out fade-in-0 slide-in-from-bottom-3",
  none: "",
};

/** The links at the foot of a chapter: quiet until pointed at, with a full-height target. */
const onward =
  "group/onward flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:min-h-12";

/**
 * The bar above a chapter: Previous, the chapter's name, and Next, each
 * control balanced by its like at the other end so the name sits over the
 * text. Beside another pane it also carries the way to close this one.
 */
function ChapterBar({
  name,
  previous,
  next,
  onPrevious,
  onNext,
  onBrowse,
  onClose,
  sticky = false,
  active = false,
  browseAlways = false,
  heading = "h1",
}: {
  /** The navigation is not docked beside the text, so the way to it is shown at every width. */
  browseAlways?: boolean;
  name: string;
  previous?: boolean;
  next?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onBrowse: () => void;
  /** Given beside another pane: closes this one. */
  onClose?: () => void;
  /** Alone, the bar stays at the head of the page as it scrolls. */
  sticky?: boolean;
  /** Beside another pane: this is the one the navigation and the keyboard answer to. */
  active?: boolean;
  heading?: "h1" | "h2";
}) {
  const t = useT("scripture").reader;
  const Heading = heading;
  return (
    <div
      data-active={onClose ? active : undefined}
      className={cn(
        "flex shrink-0 items-center border-b",
        sticky && "sticky top-bar z-30 glass",
        // A short line of emerald under the bar of the pane in use; the other's stays a hairline.
        onClose &&
          "transition-shadow duration-200 data-[active=true]:shadow-[inset_0_-2px_0_var(--color-primary)]",
      )}
    >
      <div
        role="group"
        aria-label={t.chapter}
        className="mx-auto flex h-14 max-w-[46rem] min-w-0 flex-1 items-center gap-1.5 px-3 sm:gap-2 sm:px-5"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={browseAlways ? undefined : "md:hidden"}
          aria-label={t.browse}
          aria-haspopup="dialog"
          onClick={onBrowse}
        >
          <TextSearch aria-hidden />
        </Button>
        {/* Balances the close control at the other end, where the browse button is not shown. */}
        {onClose && !browseAlways && <span aria-hidden className="size-9 shrink-0 max-md:hidden" />}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.previousChapter}
          disabled={!previous}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Heading className="min-w-0 flex-1 truncate text-center font-display text-lg leading-snug font-medium tracking-[-0.01em] sm:text-xl">
          {name}
        </Heading>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.nextChapter}
          disabled={!next}
          onClick={onNext}
        >
          <ChevronRight aria-hidden />
        </Button>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.closePane(name)}
            title={t.closeComparison}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        ) : (
          // Each control has its like at the other end, so the name sits over the text.
          <span aria-hidden className="size-9 shrink-0 md:hidden pointer-coarse:size-11" />
        )}
      </div>
    </div>
  );
}

type ReaderPaneProps = {
  pane: PaneId;
  translation: TranslationId;
  location: ReaderLocation;
  /** The translations on offer, for this pane's own selector. */
  offered: readonly TranslationId[];
  initial?: InitialChapter;
  arrival: Arrival;
  /** Changes when the verse already shown is gone to again. */
  moves: number;
  onGo: (location: ReaderLocation, how?: Arrival) => void;
  /** Reads this pane in another translation. `remember` false leaves the account's own as it is. */
  onTranslation: (translation: TranslationId, remember?: boolean) => void;
  onBrowse: () => void;
  origin?: ReaderOrigin;
  /** True beside another pane: this one fills its column and scrolls by itself. */
  comparing?: boolean;
  /** The pane the navigation, the keyboard's copy, and a swipe answer to. */
  active: boolean;
  onActivate?: () => void;
  /** Alone: opens a second pane. */
  onCompare?: () => void;
  /** Beside another: closes this one. */
  onClose?: () => void;
  /** Beside another, with no room for the docked navigation: its bar opens the navigation. */
  browseAlways?: boolean;
};

/**
 * One pane of the reader: a chapter's bar, its text in one translation, what
 * is selected in it, and what can be done with the selection. Alone it is the
 * whole reader and scrolls the page. Beside another it fills its column and
 * scrolls by itself; it is told nothing about its neighbour.
 */
function ReaderPane(props: ReaderPaneProps) {
  const { pane, translation, location, onGo, comparing = false, active, onActivate } = props;
  const language = allTranslations[translation].language;
  const previous = stepChapter(location, -1);
  const next = stepChapter(location, 1);
  const scroller = useRef<HTMLDivElement | null>(null);

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
    if (to) onGo(to);
  }

  const bar = (
    <ChapterBar
      name={placeName(location, language)}
      previous={Boolean(previous)}
      next={Boolean(next)}
      onPrevious={() => previous && onGo(previous)}
      onNext={() => next && onGo(next)}
      onBrowse={props.onBrowse}
      onClose={props.onClose}
      sticky={!comparing}
      browseAlways={props.browseAlways}
      active={active}
      heading={pane === "primary" ? "h1" : "h2"}
    />
  );
  const view = (
    <ChapterView
      {...props}
      language={language}
      previous={previous}
      next={next}
      scroller={comparing ? scroller : null}
    />
  );
  const touches = {
    onTouchStart,
    onTouchEnd,
    onTouchCancel: () => (touch.current = null),
  };

  if (!comparing) {
    return (
      <div data-pane={pane} {...touches}>
        {bar}
        {view}
      </div>
    );
  }
  return (
    <section
      data-pane={pane}
      data-active={active}
      aria-label={`${placeName(location, language)}, ${allTranslations[translation].short}`}
      // Touching or tabbing into a pane makes it the one the navigation moves.
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      className="flex min-h-0 min-w-0 flex-col"
      {...touches}
    >
      {bar}
      <div
        ref={scroller}
        data-pane-scroller
        className="min-h-0 flex-1 scroll-quiet overflow-y-auto overscroll-contain"
      >
        {view}
      </div>
    </section>
  );
}

type ChapterViewProps = ReaderPaneProps & {
  /** The language the pane's translation names the books in. */
  language: Locale;
  previous: ReaderLocation | null;
  next: ReaderLocation | null;
  /** The element this pane scrolls, beside another pane; null when it scrolls the page. */
  scroller: React.RefObject<HTMLDivElement | null> | null;
};

/** One chapter's text, what is selected in it, and what can be done with the selection. */
function ChapterView({
  translation,
  location,
  offered: onOffer,
  initial,
  arrival,
  moves,
  previous,
  next,
  onGo,
  onTranslation,
  onCompare,
  origin,
  language,
  comparing = false,
  active,
  scroller,
}: ChapterViewProps) {
  const t = useT("scripture").reader;
  const { book, chapter, verse } = location;
  const through = location.through ?? null;
  const toast = useToast();
  const verseCount = versesIn(book, chapter);
  const [selection, setSelection] = useState<VerseSelection>(noSelection);
  const [problem, setProblem] = useState<string | null>(null);
  const [versesOpen, setVersesOpen] = useState(false);
  // What the keyboard's copy does here: chosen in Settings, the verse text until then.
  const shortcut = useSyncExternalStore(subscribeCopyKind, readCopyKind, () => defaultCopyKind);
  const textBox = useRef<HTMLDivElement>(null);
  // The chapter that came with the page is shown as it is and kept, so it is
  // never asked for; any other is fetched, once.
  const sent =
    initial &&
    (initial.translation ?? fallbackTranslation) === translation &&
    initial.book === book &&
    initial.chapter === chapter
      ? initial.text
      : null;
  useEffect(() => {
    if (sent) keepChapter(translation, book, chapter, sent);
  }, [translation, book, chapter, sent]);
  const fetched = useChapter(translation, book, chapter);
  const text = sent ?? (fetched.status === "ready" ? fetched : null);

  // What this account has marked here, in this translation: highlights, and the
  // favorites that touch the chapter. Marks that came with the page are shown
  // from the first frame; after that the store is the truth, and it asks again
  // on its own.
  const sentMarks = sent ? initial?.marks : undefined;
  useEffect(() => {
    if (sentMarks) keepMarks(translation, book, chapter, sentMarks);
  }, [translation, book, chapter, sentMarks]);
  const local = useContext(LocalReading);
  const held = useChapterMarks(translation, book, chapter, !local);
  const marks = held.ready ? held.marks : (sentMarks ?? noMarks);
  const favoriteVerses = useMemo(
    () =>
      new Set(
        marks.favorites.flatMap((favorite) => versesInChapter(favorite.verses, book, chapter)),
      ),
    [marks.favorites, book, chapter],
  );
  // What was marked in this chapter of another translation. It is not shown here,
  // and is not lost: the reader is told it is there and how to see it.
  const elsewhere = (marks.elsewhere ?? []).filter((other) => onOffer.includes(other.translation));
  const [managing, setManaging] = useState<FavoriteSummary | null>(null);
  // The passages being put on an idea: the selection as it stood when that was asked for.
  const [attaching, setAttaching] = useState<readonly ScriptureReference[] | null>(null);
  // The verse last clicked, which Shift and a click reach from.
  const anchor = useRef<number | null>(null);

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
      void loadChapter(translation, nearBook, nearChapter).catch(() => {});
      // Its marks too, so its highlights are there as it slides in.
      void loadMarks(translation, nearBook, nearChapter);
    }
  }, [has, before, after, translation]);

  // And this chapter in the other translations on offer, so changing translation
  // shows the other text at once instead of the loading lines.
  const others = onOffer.filter((id) => id !== translation).join(",");
  useEffect(() => {
    if (!has || !others) return;
    for (const other of others.split(",")) {
      void loadChapter(other as TranslationId, book, chapter).catch(() => {});
    }
  }, [has, others, book, chapter]);

  // Bring the verse that was gone to into view, once there is text to find it in,
  // and light it for a moment so the eye lands on it. The light fades by itself:
  // there is nothing to clear, and nothing is selected. A passage gone to (an
  // idea's reference) is lit from its first verse to its last, as one.
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
    const firstTime = !arrived.current;
    arrived.current = true;
    if (!verse) return;
    const within = textBox.current;
    const row = within?.querySelector<HTMLElement>(`[data-verse="${verse}"]`);
    if (!row) return;
    const rows = [row];
    for (let number = verse + 1; number <= (through ?? verse); number++) {
      const further = within?.querySelector<HTMLElement>(`[data-verse="${number}"]`);
      if (further) rows.push(further);
    }

    // One place at a time: verses still tinted from a moment ago let go at once,
    // so going to a second place soon after a first lights only the second.
    for (const lit of within?.querySelectorAll("[data-found]") ?? []) {
      lit.removeAttribute("data-found");
    }
    // Taken off when it has played, so nothing later (a re-render, a theme change) can replay it.
    const done = () => rows.forEach((lit) => lit.removeAttribute("data-found"));
    const light = () => {
      // The layout is read first, so it plays again even on the verse it last played on.
      void row.offsetWidth;
      rows.forEach((lit) => lit.setAttribute("data-found", ""));
    };
    row.addEventListener("animationend", done);
    row.addEventListener("animationcancel", done);

    const box = row.getBoundingClientRect();
    // What scrolls: this pane, beside another; the page, alone.
    const frame = scroller?.current ?? null;
    const edges = frame?.getBoundingClientRect();
    // Clear of the bars above and of the foot of what scrolls, with room to read on.
    const inView = edges
      ? box.height > 0 && box.top >= edges.top + 56 && box.bottom <= edges.bottom - 96
      : box.height > 0 && box.top >= 140 && box.bottom <= window.innerHeight - 120;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const glide = !firstTime && !inView && !still;

    let stop = () => {};
    if (glide) {
      // The verse comes to the middle of what scrolls, and is lit as it gets there.
      const middle =
        frame && edges
          ? frame.scrollTop + box.top - edges.top - (frame.clientHeight - box.height) / 2
          : window.scrollY + box.top - (window.innerHeight - box.height) / 2;
      stop = glideTo(middle, light, frame);
    } else {
      if (!inView) row.scrollIntoView({ block: "center", behavior: "instant" });
      light();
    }

    return () => {
      stop();
      row.removeEventListener("animationend", done);
      row.removeEventListener("animationcancel", done);
    };
  }, [ready, verse, through, moves, scroller]);

  const references = useMemo(
    () => selectionReferences(book, chapter, selection),
    [book, chapter, selection],
  );
  const chosen = useMemo(() => selectedVerses(selection, verseCount), [selection, verseCount]);

  function change(nextSelection: VerseSelection) {
    setProblem(null);
    setSelection(nextSelection);
  }

  const named = formatReferences(references, language);
  // A link opens the chapter at the first verse chosen; a whole chapter needs no verse.
  // It names the translation only when that is not the one everyone has.
  const link = readerHref({
    book,
    chapter,
    verse: selection.kind === "verses" ? selection.verses[0] : null,
    translation: translation === fallbackTranslation ? null : translation,
  });

  /** Copies the selection one of three ways. True when it reached the clipboard. */
  async function copy(kind: CopyKind): Promise<boolean> {
    if (references.length === 0 || !text) return false;
    const [value, done] = {
      text: [
        formatSelectionText(references, text.verses, allTranslations[translation].short, language),
        t.copied(named),
      ],
      reference: [named, t.copiedReference],
      link: [new URL(link, window.location.origin).href, t.copiedLink],
    }[kind];
    try {
      await navigator.clipboard.writeText(value);
      setProblem(null);
      toast({ message: done });
      return true;
    } catch {
      setProblem(t.copyRefused);
      return false;
    }
  }

  // Ctrl or Command with C copies what is selected, the way Settings says to,
  // and the selection is done with. Text marked the ordinary way, and anything
  // being typed, is left to the browser's own copy. Beside another pane, only
  // the pane in use answers.
  const onCopyKey = useEffectEvent((event: KeyboardEvent) => {
    if (!active) return;
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

  const quiet = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "px-2 text-muted-foreground hover:text-foreground",
  );

  return (
    <article
      className={cn(
        "mx-auto flex max-w-[46rem] flex-col px-2 pt-5 sm:px-5 sm:pt-7",
        // Alone it is at least the height of the window; beside another, of its column.
        comparing ? "min-h-full pb-6" : "min-h-[calc(100dvh-var(--bar-h)-3.5rem)] pb-20",
      )}
    >
      {origin && (
        // Opened from an idea or an outline: the way back to it, for as long as the reading goes on from there.
        <Link
          href={`${origin.outline ? routes.outlines : routes.library}/${origin.id}`}
          className="group/back mb-3 flex max-w-full items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground pointer-coarse:min-h-11"
        >
          <ArrowLeft
            className="size-4 shrink-0 transition-transform duration-150 group-hover/back:-translate-x-0.5"
            aria-hidden
          />
          <span className="min-w-0 truncate">
            {origin.outline ? t.backToOutline : t.backTo}{" "}
            <span className="font-serif text-foreground italic">{origin.title}</span>
          </span>
        </Link>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2">
        {onOffer.length > 1 ? (
          <div className="flex items-center gap-2">
            {/* The translation this pane is read in. Choosing another keeps the place. */}
            <Select
              label={t.translation}
              value={translation}
              onChange={(id) => onTranslation(id as TranslationId)}
              options={onOffer.map((id) => ({ value: id, label: allTranslations[id].short }))}
              className="h-8 w-[5.25rem] text-xs font-medium pointer-coarse:h-11"
            />
            {/* While its text is on the way, said beside the control that asked for it. */}
            {!text && fetched.status === "loading" && (
              <span
                role="status"
                data-translation-loading
                className="flex animate-menu items-center gap-1.5 text-xs text-muted-foreground"
              >
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                {t.loadingTranslation(allTranslations[translation].short)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">
            {allTranslations[translation].name}
          </p>
        )}
        <div className="-mr-2 flex items-center gap-1">
          <Popover open={versesOpen} onOpenChange={setVersesOpen}>
            <PopoverTrigger
              disabled={!ready}
              className={cn(quiet, "data-popup-open:text-foreground")}
            >
              {t.goToVerse}
            </PopoverTrigger>
            {/* A plain list of numbers: the verse last gone to is not kept marked here either. */}
            <PopoverContent align="end" className="max-h-80 w-72 p-1.5">
              <ul aria-label={t.verses} className="grid grid-cols-6 gap-0.5">
                {Array.from({ length: verseCount }, (_, index) => index + 1).map((number) => (
                  <li key={number}>
                    <button
                      type="button"
                      aria-label={t.verse(number)}
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
            {t.selectChapter}
          </Button>
          {onCompare && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2 text-muted-foreground hover:text-foreground"
              aria-label={t.compareLabel}
              title={t.compareLabel}
              onClick={onCompare}
            >
              <Columns2 aria-hidden />
              {/* Its word where the row has room for it; the icon, still named, where it has not. */}
              <span className="max-sm:sr-only">{t.compare}</span>
            </Button>
          )}
        </div>
      </div>

      {elsewhere.length > 0 && (
        <p data-marks-elsewhere className="mb-3 px-2 text-xs text-muted-foreground">
          {elsewhere.map((other) => (
            <button
              key={other.translation}
              type="button"
              onClick={() => onTranslation(other.translation, false)}
              className="rounded-sm font-medium link-underline hover:text-foreground"
            >
              {t.elsewhere(
                other.highlights,
                other.favorites,
                allTranslations[other.translation].short,
              )}
            </button>
          ))}
        </p>
      )}

      {/* Clipped sideways: a chapter sliding in must not widen the page for a moment. */}
      <div ref={textBox} data-reader-text className="flex-1 overflow-x-clip">
        {text ? (
          // A new chapter comes in once, as its text arrives: it settles into place
          // from the side it lies on (the next from the right, the one before from
          // the left), fully there from the first frame. Still under reduced motion.
          <div data-arrival={arrival} className={arrivalClasses[arrival]}>
            <PassageText
              size="reader"
              lang={language}
              verses={text.verses}
              superscription={text.title}
              selected={chosen}
              highlights={marks.highlights}
              favorites={favoriteVerses}
              located={verse}
              onSelectVerse={(picked) => {
                anchor.current = picked;
                change(toggleVerse(selection, picked, verseCount));
              }}
              // Shift reaches from the verse last clicked to this one. With nothing
              // selected to reach from, it is a click like any other.
              onSelectThrough={(picked) => {
                const from = selection.kind === "none" ? null : anchor.current;
                anchor.current = picked;
                change(
                  from === null
                    ? toggleVerse(selection, picked, verseCount)
                    : selectRange(selection, from, picked, verseCount),
                );
              }}
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
        aria-label={t.neighboring}
        className="mt-10 flex items-stretch justify-between gap-3 border-t pt-4"
      >
        {previous ? (
          <button type="button" className={onward} onClick={() => onGo(previous, "fall")}>
            <ChevronLeft
              className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-150 group-hover/onward:-translate-x-0.5 group-hover/onward:text-primary"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">{t.previous}</span>
              <span className="block truncate font-display text-base leading-snug font-medium">
                {placeName(previous, language)}
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
              <span className="block text-xs font-medium text-muted-foreground">{t.next}</span>
              <span className="block truncate font-display text-base leading-snug font-medium">
                {placeName(next, language)}
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
      {/* Rests at the foot of what scrolls, above the tab bar where there is one, and never beyond the column. */}
      <SelectionToolbar
        className={cn(
          "sticky z-20 mt-4",
          comparing
            ? "bottom-3"
            : "bottom-[calc(var(--bar-h)+var(--bar-lift)+0.75rem)] md:bottom-6",
        )}
        references={references}
        language={language}
        problem={problem}
        shortcut={shortcut}
        onCopyText={() => void copy("text")}
        onCopyReference={() => void copy("reference")}
        onCopyLink={() => void copy("link")}
        onClear={() => change(noSelection)}
        footer={
          local ? undefined : (
            <SelectionFavorites
              translation={translation}
              book={book}
              chapter={chapter}
              verses={chosen}
              marks={marks}
              onManage={setManaging}
            />
          )
        }
      >
        {!local && (
          <SelectionActions
            translation={translation}
            book={book}
            chapter={chapter}
            verses={chosen}
            marks={marks}
            onProblem={setProblem}
            onManage={setManaging}
            onAttach={() => setAttaching(references)}
          />
        )}
      </SelectionToolbar>
      <FavoriteEditor favorite={managing} onClose={() => setManaging(null)} />
      <AttachScripture references={attaching} onClose={() => setAttaching(null)} />
    </article>
  );
}
