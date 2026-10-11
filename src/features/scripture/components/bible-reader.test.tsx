import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { versesIn } from "../books";
import { copyKindKey } from "../copy-preference";
import { savedLocationKey } from "../reader-location";
import { sidebarKey } from "../reader-sidebar";
import type { ChapterMarks, FavoriteSummary, HighlightColor } from "../saved/model";
import type { VerseRef } from "../saved/verse-set";
import { clearChapterCache } from "../use-chapter";
import { clearMarksCache } from "../use-chapter-marks";
import { BibleReader, type InitialChapter } from "./bible-reader";

// The address is the browser's own, as it is in the application: the router's
// hooks are stood in for by ones that read and write `window.history`.
const address = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    listeners,
    changed: () => listeners.forEach((notify) => notify()),
    replaced: [] as string[],
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (notify) => {
          address.listeners.add(notify);
          window.addEventListener("popstate", notify);
          return () => {
            address.listeners.delete(notify);
            window.removeEventListener("popstate", notify);
          };
        },
        () => window.location.search,
      );
      return new URLSearchParams(search);
    },
    useRouter: () => ({
      replace: (href: string) => {
        address.replaced.push(href);
        window.history.replaceState(null, "", href);
      },
    }),
  };
});

// The account's marks, as the server would hold them. The actions that change
// them and the endpoint that reads them are stood in for by this.
const account = vi.hoisted(() => ({
  highlights: new Map<string, string>(),
  favorites: [] as {
    id: string;
    translation: "kjv";
    reference: string;
    label: string | null;
    notes: string | null;
    verses: { book: number; chapter: number; verse: number }[];
  }[],
  calls: [] as { action: string; input: unknown }[],
  /** The next action answers with a refusal and changes nothing. */
  refuse: false,
  /** The next action throws, as a request that never arrived would. */
  unreachable: false,
  /** Holds the next highlight until released. */
  hold: null as null | ((release: () => void) => void),
  nextId: 1,
}));

vi.mock("../saved/actions", async () => {
  const { formatVerseSet, normaliseVerses, canonicalKey } = await import("../saved/verse-set");
  type Verses = { book: number; chapter: number; verse: number }[];
  const refused = { ok: false, message: "The server said no." };
  const gate = (action: string, input: unknown) => {
    account.calls.push({ action, input });
    if (account.unreachable) {
      account.unreachable = false;
      throw new Error("network");
    }
    if (account.refuse) {
      account.refuse = false;
      return refused;
    }
    return null;
  };
  return {
    setHighlight: async (input: { verses: Verses; color: string | null }) => {
      if (account.hold) {
        const hold = account.hold;
        account.hold = null;
        await new Promise<void>((release) => hold(release));
      }
      const stopped = gate("setHighlight", input);
      if (stopped) return stopped;
      for (const { book, chapter, verse } of input.verses) {
        const key = `${book}.${chapter}.${verse}`;
        if (input.color) account.highlights.set(key, input.color);
        else account.highlights.delete(key);
      }
      return { ok: true, message: "Highlighted." };
    },
    saveFavorite: async (input: { verses: Verses; label?: string; notes?: string }) => {
      const stopped = gate("saveFavorite", input);
      if (stopped) return stopped;
      const verses = normaliseVerses(input.verses);
      const held = account.favorites.find(
        (favorite) => canonicalKey(favorite.verses) === canonicalKey(verses),
      );
      if (held) return { ok: true, message: "Already saved.", favorite: held, existing: true };
      const favorite = {
        id: `favorite-${account.nextId++}`,
        translation: "kjv" as const,
        reference: formatVerseSet(verses),
        label: input.label ?? null,
        notes: input.notes ?? null,
        verses,
      };
      account.favorites.push(favorite);
      return { ok: true, message: `Saved ${favorite.reference}.`, favorite };
    },
    updateFavorite: async (
      id: string,
      change: { verses?: Verses; label?: string; notes?: string },
    ) => {
      const stopped = gate("updateFavorite", { id, ...change });
      if (stopped) return stopped;
      const at = account.favorites.findIndex((favorite) => favorite.id === id);
      if (at < 0) return { ok: false, message: "That saved passage no longer exists." };
      const verses = change.verses ? normaliseVerses(change.verses) : account.favorites[at].verses;
      const clash = account.favorites.find(
        (favorite) => favorite.id !== id && canonicalKey(favorite.verses) === canonicalKey(verses),
      );
      if (clash) {
        return {
          ok: false,
          message: "You have already saved that passage. Neither one was changed.",
          conflictId: clash.id,
        };
      }
      const favorite = {
        ...account.favorites[at],
        verses,
        reference: formatVerseSet(verses),
        label: change.label?.trim() || null,
        notes: change.notes?.trim() || null,
      };
      account.favorites[at] = favorite;
      return { ok: true, message: "Changes saved.", favorite };
    },
    deleteFavorite: async (id: string) => {
      const stopped = gate("deleteFavorite", { id });
      if (stopped) return stopped;
      account.favorites = account.favorites.filter((favorite) => favorite.id !== id);
      return { ok: true, message: "Removed from your saved Scripture." };
    },
  };
});

/** What the marks endpoint answers for a chapter, from the account above. */
function marksOf(book: number, chapter: number): ChapterMarks {
  const highlights: Record<number, HighlightColor> = {};
  for (const [key, color] of account.highlights) {
    const [atBook, atChapter, verse] = key.split(".").map(Number);
    if (atBook === book && atChapter === chapter) highlights[verse] = color as HighlightColor;
  }
  const favorites = account.favorites.filter((favorite) =>
    favorite.verses.some((verse) => verse.book === book && verse.chapter === chapter),
  );
  return { highlights, favorites: favorites as FavoriteSummary[] };
}

/** Puts a highlight in the account, as if it had been made before this page was opened. */
const highlighted = (verses: VerseRef[], color: HighlightColor) =>
  verses.forEach(({ book, chapter, verse }) =>
    account.highlights.set(`${book}.${chapter}.${verse}`, color),
  );

// The Bible endpoints are faked: every verse says where it is from, Psalm 3
// has a title, and a search for "water" finds two verses on two pages.
const requests: string[] = [];
let failNext = false;
let holdSearch: ((release: () => void) => void) | null = null;
let marksFail = false;
const hits = [
  { book: 43, chapter: 4, verse: 10, text: "the gift of living [[water]]." },
  { book: 66, chapter: 22, verse: 17, text: "take the [[water]] of life freely." },
];
const copied: string[] = [];
let clipboardFails = false;

const verseText = (book: number, chapter: number, verse: number) =>
  `Text of ${book}.${chapter}.${verse}`;

function show(href: string, initial?: InitialChapter) {
  window.history.replaceState(null, "", href);
  return render(
    <ToastProvider>
      <BibleReader initial={initial} />
    </ToastProvider>,
  );
}

const sidebar = () => within(screen.getByRole("complementary", { name: "Bible navigation" }));
const heading = () => screen.getByRole("heading", { level: 1 });
const verse = (number: number, book = 43, chapter = 3) =>
  screen.findByRole("button", {
    name: new RegExp(`^${number}\\s*${verseText(book, chapter, number)}$`),
  });
const toolbar = () => screen.queryByRole("toolbar", { name: "Selected Scripture" });
/** The verses lit at this moment. */
const lit = () =>
  [...document.querySelectorAll("[data-found]")].map((row) => row.getAttribute("data-verse"));
/** Long enough for the page to have glided to a verse and the light to have come up. */
const arrival = { timeout: 3000 };
const here = () => `${window.location.pathname}${window.location.search}`;

beforeEach(() => {
  clearChapterCache();
  clearMarksCache();
  account.highlights.clear();
  account.favorites = [];
  account.calls = [];
  account.refuse = false;
  account.unreachable = false;
  account.hold = null;
  account.nextId = 1;
  marksFail = false;
  window.localStorage.clear();
  delete document.documentElement.dataset.bibleSidebar;
  requests.length = 0;
  address.replaced.length = 0;
  copied.length = 0;
  failNext = false;
  holdSearch = null;
  clipboardFails = false;

  for (const method of ["pushState", "replaceState"] as const) {
    const original = History.prototype[method];
    vi.spyOn(window.history, method).mockImplementation(function (this: History, ...args) {
      original.apply(window.history, args);
      address.changed();
    });
  }
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (failNext) {
      failNext = false;
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (url.startsWith("/api/bible/search")) {
      const params = new URLSearchParams(url.split("?")[1]);
      if (holdSearch && params.get("q") === "slow") {
        await new Promise<void>((release) => holdSearch!(release));
        return {
          ok: true,
          status: 200,
          json: async () => ({ total: 1, hits: [{ ...hits[0], text: "a [[slow]] answer" }] }),
        };
      }
      if (params.get("q") === "nothing") {
        return { ok: true, status: 200, json: async () => ({ total: 0, hits: [] }) };
      }
      const offset = Number(params.get("offset"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ total: 2, hits: hits.slice(offset, offset + 1) }),
      };
    }
    if (url.endsWith("/marks")) {
      const [book, chapter] = url.split("/").slice(-3, -1).map(Number);
      if (marksFail) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => marksOf(book, chapter) };
    }
    const [book, chapter] = url.split("/").slice(-2).map(Number);
    const verses = Array.from({ length: versesIn(book, chapter) }, (_, index) =>
      verseText(book, chapter, index + 1),
    );
    const title = book === 19 && chapter === 3 ? "A Psalm of David, when he fled." : null;
    return { ok: true, status: 200, json: async () => ({ book, chapter, verses, title }) };
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (clipboardFails) throw new Error("denied");
        copied.push(text);
      },
    },
  });
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("where the reader opens", () => {
  it("shows the chapter the address names", async () => {
    show("/bible?book=43&chapter=3");
    expect(heading()).toHaveTextContent("John 3");
    expect(await verse(1)).toBeInTheDocument();
    expect(await verse(36)).toBeInTheDocument();
    // Asked for once.
    expect(requests.filter((url) => url === "/api/bible/43/3")).toHaveLength(1);
    expect(address.replaced).toEqual([]);
  });

  it("opens at Genesis 1 when nothing is named or remembered", async () => {
    show("/bible");
    await waitFor(() => expect(here()).toBe("/bible?book=1&chapter=1"));
    expect(heading()).toHaveTextContent("Genesis 1");
    expect(await verse(1, 1, 1)).toBeInTheDocument();
    // It replaced the bare address; it did not add a second entry behind it.
    expect(address.replaced).toEqual(["/bible?book=1&chapter=1"]);
  });

  it("returns to the chapter last read in this browser", async () => {
    window.localStorage.setItem(savedLocationKey, "45.8");
    show("/bible");
    await waitFor(() => expect(here()).toBe("/bible?book=45&chapter=8"));
    expect(heading()).toHaveTextContent("Romans 8");
    // Never Genesis on the way there.
    expect(requests[0]).toBe("/api/bible/45/8");
    expect(requests).not.toContain("/api/bible/1/1");
  });

  it("lets an address that names a place win over the remembered one, and then remembers it", async () => {
    window.localStorage.setItem(savedLocationKey, "45.8");
    show("/bible?book=43&chapter=3&verse=16");
    expect(heading()).toHaveTextContent("John 3");
    expect(address.replaced).toEqual([]);
    await waitFor(() => expect(window.localStorage.getItem(savedLocationKey)).toBe("43.3"));
  });

  it("falls back from a remembered value that makes no sense", async () => {
    window.localStorage.setItem(savedLocationKey, "99.99");
    show("/bible");
    await waitFor(() => expect(here()).toBe("/bible?book=1&chapter=1"));
  });

  it("rewrites an address that says a place another way, and survives one that says nothing", async () => {
    show("/bible?verse=99&chapter=3&book=43&q=x");
    await waitFor(() => expect(here()).toBe("/bible?book=43&chapter=3"));
    expect(heading()).toHaveTextContent("John 3");
  });

  it("shows the chapter that came with the page without asking for it", async () => {
    const verses = Array.from({ length: 36 }, (_, index) => `Sent verse ${index + 1}`);
    show("/bible?book=43&chapter=3", { book: 43, chapter: 3, text: { verses, title: null } });
    expect(screen.getByRole("button", { name: /Sent verse 16$/ })).toBeInTheDocument();
    await act(async () => {});
    expect(requests).not.toContain("/api/bible/43/3");
  });
});

describe("going to a verse", () => {
  it("brings it into view and lights it for a moment, without selecting it", async () => {
    show("/bible?book=43&chapter=3&verse=16");
    const located = await verse(16);
    expect(located).toHaveAttribute("aria-current", "location");
    expect(located).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    // The light is an animation that ends by itself; no other verse has it.
    await waitFor(() => expect(located).toHaveAttribute("data-found"));
    expect(document.querySelectorAll("[data-found]")).toHaveLength(1);
    expect(toolbar()).not.toBeInTheDocument();
  });

  it("is offered for every verse of the chapter, and changes the address", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    fireEvent.click(screen.getByRole("button", { name: "Go to verse" }));
    const verses = within(await screen.findByRole("list", { name: "Verses" }));
    expect(verses.getAllByRole("button")).toHaveLength(36);
    fireEvent.click(verses.getByRole("button", { name: "Verse 16" }));
    await waitFor(() => expect(here()).toBe("/bible?book=43&chapter=3&verse=16"));
    expect(await verse(16)).toHaveAttribute("aria-current", "location");
    await waitFor(() => expect(lit()).toEqual(["16"]), arrival);
    // The menu keeps no mark of where it last went.
    fireEvent.click(screen.getByRole("button", { name: "Go to verse" }));
    const again = within(await screen.findByRole("list", { name: "Verses" }));
    expect(again.getByRole("button", { name: "Verse 16" })).not.toHaveAttribute("aria-current");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // Going to the same verse again points it out again.
    fireEvent.animationEnd(await verse(16));
    expect(lit()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Go to verse" }));
    fireEvent.click(
      within(await screen.findByRole("list", { name: "Verses" })).getByRole("button", {
        name: "Verse 16",
      }),
    );
    await waitFor(() => expect(lit()).toEqual(["16"]), arrival);
    // Going to a verse is not choosing it, and the menu is out of the way again.
    expect(await verse(16)).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Verses" })).not.toBeInTheDocument(),
    );
  });
});

describe("the light on a verse gone to", () => {
  it("glides to a verse of the chapter being read, and starts at once at a verse arrived at", async () => {
    show("/bible?book=43&chapter=3&verse=16");
    await verse(16);
    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
        block: "center",
        behavior: "instant",
      }),
    );
    const jumps = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Go to verse" }));
    fireEvent.click(
      within(await screen.findByRole("list", { name: "Verses" })).getByRole("button", {
        name: "Verse 30",
      }),
    );
    // Not a jump: the page is moved a frame at a time, and the browser's own
    // smooth scrolling, which stutters here, is not asked for.
    await waitFor(() => expect(lit()).toEqual(["30"]), arrival);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(jumps);
    for (const [options] of vi.mocked(window.scrollTo).mock.calls) {
      expect(options).toMatchObject({ behavior: "instant" });
    }
  });

  const goTo = async (number: number) => {
    fireEvent.click(screen.getByRole("button", { name: "Go to verse" }));
    fireEvent.click(
      within(await screen.findByRole("list", { name: "Verses" })).getByRole("button", {
        name: `Verse ${number}`,
      }),
    );
  };
  it("is on one verse at a time, however quickly another is gone to", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    await goTo(16);
    await waitFor(() => expect(lit()).toEqual(["16"]), arrival);
    await goTo(20);
    await waitFor(() => expect(lit()).toEqual(["20"]), arrival);
  });

  it("is taken off when it has played", async () => {
    show("/bible?book=43&chapter=3&verse=16");
    const row = await verse(16);
    await waitFor(() => expect(lit()).toEqual(["16"]));
    fireEvent.animationEnd(row);
    expect(lit()).toEqual([]);
    // Choosing verses afterwards brings nothing back.
    fireEvent.click(await verse(18));
    expect(lit()).toEqual([]);
  });
});

describe("moving between chapters", () => {
  it("goes forward and back, each a step in the browser's history", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(here()).toBe("/bible?book=43&chapter=4");
    expect(heading()).toHaveTextContent("John 4");
    expect(await verse(1, 43, 4)).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    // Said aloud, for someone who cannot see the heading change.
    expect(screen.getAllByRole("status").some((region) => region.textContent === "John 4")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(here()).toBe("/bible?book=43&chapter=3");
    expect(window.history.pushState).toHaveBeenCalledTimes(2);
  });

  it("has the chapters either side ready, so turning to one shows its text at once", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    await waitFor(() => {
      expect(requests).toContain("/api/bible/43/2");
      expect(requests).toContain("/api/bible/43/4");
    });
    await act(async () => {});
    const asked = requests.length;
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    // No loading lines in between: the text is there in the same breath.
    expect(screen.queryByText("Loading the passage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Text of 43\.4\.1$/ })).toBeInTheDocument();
    expect(requests.slice(asked)).not.toContain("/api/bible/43/4");
  });

  it("arrives from the side the chapter lies on, without fading in", async () => {
    const { container } = show("/bible?book=43&chapter=3");
    await verse(1);
    const arrival = () => container.querySelector("[data-arrival]");
    // The first chapter is simply there.
    expect(arrival()).toHaveAttribute("data-arrival", "none");
    expect(arrival()?.className).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await verse(1, 43, 4);
    expect(arrival()).toHaveAttribute("data-arrival", "forward");
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    await verse(1);
    expect(arrival()).toHaveAttribute("data-arrival", "back");
    expect(arrival()?.className).not.toMatch(/fade/);
    // The chapter's name changes with no animation of its own.
    expect(heading().querySelector("[class*=animate]")).toBeNull();
  });

  it("reads on from the foot of a chapter: the next comes up from below, the one before down from above", async () => {
    const { container } = show("/bible?book=43&chapter=3");
    await verse(1);
    const foot = () => within(screen.getByRole("navigation", { name: "Neighboring chapters" }));
    fireEvent.click(foot().getByRole("button", { name: /^Nexts*John 4$/ }));
    expect(here()).toBe("/bible?book=43&chapter=4");
    await verse(1, 43, 4);
    expect(container.querySelector("[data-arrival]")).toHaveAttribute("data-arrival", "rise");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    fireEvent.click(foot().getByRole("button", { name: /^Previouss*John 3$/ }));
    await verse(1);
    expect(container.querySelector("[data-arrival]")).toHaveAttribute("data-arrival", "fall");
  });

  it("has no arrows floating beside the text: the bar, the foot, and a swipe are the ways", async () => {
    const { container } = show("/bible?book=43&chapter=3");
    await verse(1);
    expect(container.querySelector("[data-beside]")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Next chapter" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Previous chapter" })).toHaveLength(1);
  });

  describe("by swiping", () => {
    // A finger put down at one point and lifted at another, at once.
    const swipe = (target: Element, from: [number, number], to: [number, number]) => {
      const point = ([clientX, clientY]: [number, number]) => ({ clientX, clientY, identifier: 1 });
      fireEvent.touchStart(target, { touches: [point(from)] });
      fireEvent.touchEnd(target, { touches: [], changedTouches: [point(to)] });
    };
    const text = () => document.querySelector("[data-reader-text]")!;

    it("turns to the next chapter towards the left, and to the one before towards the right", async () => {
      show("/bible?book=43&chapter=3");
      await verse(1);
      swipe(text(), [300, 400], [120, 410]);
      expect(here()).toBe("/bible?book=43&chapter=4");
      await verse(1, 43, 4);
      swipe(text(), [80, 400], [260, 395]);
      expect(here()).toBe("/bible?book=43&chapter=3");
    });

    it("is not taken from a scroll or from a short touch", async () => {
      show("/bible?book=43&chapter=3");
      await verse(1);
      swipe(text(), [300, 400], [240, 100]);
      swipe(text(), [300, 400], [270, 400]);
      expect(here()).toBe("/bible?book=43&chapter=3");
    });

    it("is not taken from a slow drag", async () => {
      show("/bible?book=43&chapter=3");
      await verse(1);
      const clock = vi.spyOn(performance, "now");
      clock.mockReturnValueOnce(1000);
      fireEvent.touchStart(text(), { touches: [{ clientX: 300, clientY: 400, identifier: 1 }] });
      clock.mockReturnValueOnce(2200);
      fireEvent.touchEnd(text(), {
        touches: [],
        changedTouches: [{ clientX: 100, clientY: 400, identifier: 1 }],
      });
      clock.mockRestore();
      expect(here()).toBe("/bible?book=43&chapter=3");
    });

    it("stops at the ends of the Bible", async () => {
      show("/bible?book=1&chapter=1");
      await verse(1, 1, 1);
      swipe(text(), [80, 400], [300, 400]);
      expect(here()).toBe("/bible?book=1&chapter=1");
    });
  });

  it("follows Back and Forward", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(heading()).toHaveTextContent("John 4");
    // What the browser does on Back: the address changes, and the reader is told.
    act(() => {
      window.history.replaceState(null, "", "/bible?book=43&chapter=3");
    });
    expect(heading()).toHaveTextContent("John 3");
    expect(await verse(1)).toBeInTheDocument();
  });

  it("crosses from one book to the next", async () => {
    show("/bible?book=39&chapter=4");
    expect(heading()).toHaveTextContent("Malachi 4");
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(heading()).toHaveTextContent("Matthew 1");
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(heading()).toHaveTextContent("Malachi 4");
  });

  it("names a book of one chapter without a chapter number", async () => {
    show("/bible?book=65&chapter=1");
    expect(heading()).toHaveTextContent(/^Jude$/);
    const neighbours = within(screen.getByRole("navigation", { name: "Neighboring chapters" }));
    expect(neighbours.getByRole("button", { name: /^Previouss*3 John$/ })).toBeInTheDocument();
    expect(neighbours.getByRole("button", { name: /^Nexts*Revelation 1$/ })).toBeInTheDocument();
  });

  it("has nowhere to go before Genesis 1 or after Revelation 22", async () => {
    const first = show("/bible?book=1&chapter=1");
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next chapter" })).toBeEnabled();
    first.unmount();
    show("/bible?book=66&chapter=22");
    expect(screen.getByRole("button", { name: "Next chapter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeEnabled();
  });
});

describe("the navigation", () => {
  it("lists every book under its testament and marks where the reader is", () => {
    show("/bible?book=43&chapter=3");
    const nav = within(sidebar().getByRole("navigation", { name: "Books of the Bible" }));
    expect(nav.getByRole("heading", { name: "Old Testament" })).toBeInTheDocument();
    expect(nav.getByRole("heading", { name: "New Testament" })).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "Genesis" })).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "Revelation" })).toBeInTheDocument();
    const john = nav.getByRole("button", { name: "John" });
    expect(john).toHaveAttribute("aria-current", "true");
    expect(john).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("button", { name: "John 3" })).toHaveAttribute("aria-current", "page");
    expect(nav.getAllByRole("button", { name: /^John \d+$/ })).toHaveLength(21);
  });

  it("opens a book's chapters, and goes to the one chosen", async () => {
    show("/bible?book=43&chapter=3");
    const nav = sidebar();
    fireEvent.click(nav.getByRole("button", { name: "Romans" }));
    // Looking is not going.
    expect(here()).toBe("/bible?book=43&chapter=3");
    expect(nav.getAllByRole("button", { name: /^Romans \d+$/ })).toHaveLength(16);
    fireEvent.click(nav.getByRole("button", { name: "Romans 8" }));
    expect(here()).toBe("/bible?book=45&chapter=8");
    expect(heading()).toHaveTextContent("Romans 8");
    expect(await verse(28, 45, 8)).toBeInTheDocument();
  });

  it("goes straight to a book that has one chapter", () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(sidebar().getByRole("button", { name: "Jude" }));
    expect(here()).toBe("/bible?book=65&chapter=1");
  });

  it("can be put away and brought back, and the choice is remembered", () => {
    show("/bible?book=43&chapter=3");
    // One handle, on the navigation's edge, does both.
    const hide = screen.getByRole("button", { name: "Hide navigation" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(hide).toHaveAttribute("aria-controls", "bible-navigation");
    fireEvent.click(hide);
    expect(document.documentElement.dataset.bibleSidebar).toBe("closed");
    expect(window.localStorage.getItem(sidebarKey)).toBe("closed");
    // It is outside what it hides, so it is still there to bring the navigation back.
    const bring = screen.getByRole("button", { name: "Show navigation" });
    expect(bring).toBe(hide);
    expect(bring).toHaveAttribute("aria-expanded", "false");
    expect(bring.closest("aside")).toBeNull();
    fireEvent.click(bring);
    expect(screen.getByRole("button", { name: "Hide navigation" })).toBe(hide);
    expect(document.documentElement.dataset.bibleSidebar).toBe("open");
    expect(window.localStorage.getItem(sidebarKey)).toBe("open");
  });

  it("starts put away where it was left that way", () => {
    window.localStorage.setItem(sidebarKey, "closed");
    show("/bible?book=43&chapter=3");
    expect(document.documentElement.dataset.bibleSidebar).toBe("closed");
    expect(screen.getByRole("button", { name: "Show navigation" })).toBeInTheDocument();
  });

  it("opens as a sheet on a narrow screen, and closes when a chapter is chosen", async () => {
    show("/bible?book=43&chapter=3");
    const opener = screen.getByRole("button", { name: "Browse and search the Bible" });
    fireEvent.click(opener);
    const sheet = await screen.findByRole("dialog", { name: "Bible" });
    fireEvent.click(within(sheet).getByRole("button", { name: "John 4" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Bible" })).not.toBeInTheDocument(),
    );
    expect(here()).toBe("/bible?book=43&chapter=4");
  });

  it("closes the sheet with Escape and leaves the reader where it was", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(screen.getByRole("button", { name: "Browse and search the Bible" }));
    const sheet = await screen.findByRole("dialog", { name: "Bible" });
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Bible" })).not.toBeInTheDocument(),
    );
    expect(here()).toBe("/bible?book=43&chapter=3");
  });
});

describe("selecting", () => {
  it("has nothing selected, and no toolbar, until a verse is chosen", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    expect(toolbar()).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("selects a verse with a click and unselects it with another", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(16));
    expect(await verse(16)).toHaveAttribute("aria-pressed", "true");
    expect(within(toolbar()!).getByText("John 3:16")).toBeInTheDocument();
    fireEvent.click(await verse(16));
    expect(await verse(16)).toHaveAttribute("aria-pressed", "false");
    expect(toolbar()).not.toBeInTheDocument();
  });

  it("keeps verses that are apart as separate passages", async () => {
    show("/bible?book=43&chapter=3");
    for (const number of [8, 3, 6, 5]) fireEvent.click(await verse(number));
    expect(within(toolbar()!).getByText("John 3:3, 5–6, 8")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(4);
  });

  it("selects the whole chapter only when asked, as one reference", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    const whole = screen.getByRole("button", { name: "Select chapter" });
    expect(whole).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(whole);
    expect(whole).toHaveAttribute("aria-pressed", "true");
    expect(within(toolbar()!).getByText("John 3")).toBeInTheDocument();
    expect(await verse(36)).toHaveAttribute("aria-pressed", "true");
    // One verse taken out leaves the rest, as verses.
    fireEvent.click(await verse(1));
    expect(within(toolbar()!).getByText("John 3:2–36")).toBeInTheDocument();
    expect(whole).toHaveAttribute("aria-pressed", "false");
  });

  it("clears with the toolbar's own control", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(16));
    fireEvent.click(await verse(18));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Clear selection" }));
    expect(toolbar()).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("does not carry a selection into another chapter", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(16));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await verse(1, 43, 4);
    expect(toolbar()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(await verse(16)).toHaveAttribute("aria-pressed", "false");
  });

  it("is worked from the keyboard: verses are buttons", async () => {
    show("/bible?book=43&chapter=3");
    const target = await verse(16);
    expect(target.tagName).toBe("BUTTON");
    target.focus();
    expect(target).toHaveFocus();
  });
});

describe("copying", () => {
  it("copies the reference", async () => {
    show("/bible?book=43&chapter=3");
    for (const number of [3, 5, 6, 8]) fireEvent.click(await verse(number));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy reference" }));
    await waitFor(() => expect(copied).toEqual(["John 3:3, 5–6, 8"]));
    expect(await screen.findByText("Copied the reference.")).toBeInTheDocument();
  });

  it("copies the selected verses in order, apart where they are apart, and nothing between", async () => {
    show("/bible?book=43&chapter=3");
    for (const number of [8, 3, 6, 5]) fireEvent.click(await verse(number));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy text" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe(
      [
        "John 3:3, 5–6, 8 (KJV)",
        "3 Text of 43.3.3",
        "...",
        "5 Text of 43.3.5",
        "6 Text of 43.3.6",
        "...",
        "8 Text of 43.3.8",
      ].join("\n"),
    );
    expect(copied[0]).not.toContain("43.3.4");
    expect(await screen.findByText("Copied John 3:3, 5–6, 8.")).toBeInTheDocument();
  });

  it("copies a link to the first verse chosen", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(18));
    fireEvent.click(await verse(16));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(copied).toEqual([`${window.location.origin}/bible?book=43&chapter=3&verse=16`]),
    );
  });

  describe("with Ctrl+C", () => {
    const press = (init: KeyboardEventInit = { ctrlKey: true }) =>
      fireEvent.keyDown(document.body, { key: "c", ...init });

    it("copies the selected verses and then clears the selection", async () => {
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      fireEvent.click(await verse(17));
      press();
      await waitFor(() =>
        expect(copied).toEqual(["John 3:16–17 (KJV)\n16 Text of 43.3.16\n17 Text of 43.3.17"]),
      );
      await waitFor(() => expect(toolbar()).not.toBeInTheDocument());
      expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
      expect(await screen.findByText("Copied John 3:16–17.")).toBeInTheDocument();
    });

    it("works with Command as well", async () => {
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      press({ metaKey: true });
      await waitFor(() => expect(copied).toHaveLength(1));
    });

    it("copies the reference or a link instead when Settings says so", async () => {
      window.localStorage.setItem(copyKindKey, "reference");
      const first = show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      press();
      await waitFor(() => expect(copied).toEqual(["John 3:16"]));
      first.unmount();

      window.localStorage.setItem(copyKindKey, "link");
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      press();
      await waitFor(() =>
        expect(copied[1]).toBe(`${window.location.origin}/bible?book=43&chapter=3&verse=16`),
      );
    });

    it("says on the toolbar which button the shortcut stands for", async () => {
      window.localStorage.setItem(copyKindKey, "reference");
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      const bar = within(toolbar()!);
      expect(bar.getByRole("button", { name: "Copy reference" })).toHaveAttribute(
        "aria-keyshortcuts",
      );
      expect(bar.getByRole("button", { name: "Copy text" })).not.toHaveAttribute(
        "aria-keyshortcuts",
      );
    });

    it("does nothing when no verse is selected", async () => {
      show("/bible?book=43&chapter=3");
      await verse(1);
      press();
      await act(async () => {});
      expect(copied).toEqual([]);
    });

    it("leaves the browser's own copy alone in a text box, for marked text, and for other chords", async () => {
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      fireEvent.keyDown(sidebar().getByRole("searchbox"), { key: "c", ctrlKey: true });
      press({ ctrlKey: true, shiftKey: true });
      fireEvent.keyDown(document.body, { key: "c" });
      const marked = vi.spyOn(window, "getSelection").mockReturnValue({
        toString: () => "some words",
      } as Selection);
      press();
      marked.mockRestore();
      await act(async () => {});
      expect(copied).toEqual([]);
      expect(toolbar()).toBeInTheDocument();
    });

    it("keeps the selection when the copy is refused", async () => {
      clipboardFails = true;
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      press();
      expect(await within(toolbar()!).findByRole("alert")).toBeInTheDocument();
      expect(await verse(16)).toHaveAttribute("aria-pressed", "true");
    });

    it("leaves the selection alone when a toolbar button does the copying", async () => {
      show("/bible?book=43&chapter=3");
      fireEvent.click(await verse(16));
      fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy text" }));
      await waitFor(() => expect(copied).toHaveLength(1));
      expect(toolbar()).toBeInTheDocument();
    });
  });

  it("says so when the browser refuses", async () => {
    clipboardFails = true;
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(16));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy text" }));
    expect(await within(toolbar()!).findByRole("alert")).toHaveTextContent(/could not be copied/);
    expect(copied).toEqual([]);
  });
});

describe("searching", () => {
  const type = (text: string, scope = sidebar()) => {
    const box = scope.getByRole("searchbox", { name: /Search the Bible/ });
    fireEvent.change(box, { target: { value: text } });
    fireEvent.submit(box.closest("form")!);
  };

  it("finds verses, shows where they are, and opens one at its verse", async () => {
    show("/bible?book=43&chapter=3");
    type("water");
    const results = within(await sidebar().findByRole("region", { name: "Search results" }));
    expect(await results.findByText("2 verses")).toBeInTheDocument();
    expect(results.getByText("John 4:10")).toBeInTheDocument();
    expect(results.getByText("water").tagName).toBe("MARK");

    fireEvent.click(results.getByRole("button", { name: /John 4:10/ }));
    expect(here()).toBe("/bible?book=43&chapter=4&verse=10");
    expect(await verse(10, 43, 4)).toHaveAttribute("aria-current", "location");
    // The results are still there to go on from.
    expect(sidebar().getByRole("region", { name: "Search results" })).toBeInTheDocument();
    expect(results.getByRole("button", { name: /John 4:10/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("fetches more on request, and returns to the books and back", async () => {
    show("/bible?book=43&chapter=3");
    type("water");
    fireEvent.click(await sidebar().findByRole("button", { name: "Show more" }));
    expect(await sidebar().findByText("Revelation 22:17")).toBeInTheDocument();
    expect(sidebar().queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    fireEvent.click(sidebar().getByRole("button", { name: "Books" }));
    expect(sidebar().getByRole("navigation", { name: "Books of the Bible" })).toBeInTheDocument();
    fireEvent.click(sidebar().getByRole("button", { name: "Back to results" }));
    expect(sidebar().getByText("Revelation 22:17")).toBeInTheDocument();
  });

  it("goes to a typed reference instead of searching for it", async () => {
    show("/bible?book=43&chapter=3");
    type("Romans 8:28");
    expect(here()).toBe("/bible?book=45&chapter=8&verse=28");
    expect(heading()).toHaveTextContent("Romans 8");
    expect(requests.some((url) => url.startsWith("/api/bible/search"))).toBe(false);
    expect(sidebar().getByText(/Opened Romans 8:28\./)).toBeInTheDocument();
    // The verse is pointed out, not selected.
    expect(await verse(28, 45, 8)).toHaveAttribute("aria-pressed", "false");
    expect(toolbar()).not.toBeInTheDocument();
  });

  it("still lets a word that is also a book be searched for", async () => {
    show("/bible?book=43&chapter=3");
    type("Jude");
    expect(here()).toBe("/bible?book=65&chapter=1");
    fireEvent.click(sidebar().getByRole("button", { name: /Search the text for “Jude” instead/ }));
    expect(await sidebar().findByRole("region", { name: "Search results" })).toBeInTheDocument();
    expect(requests.some((url) => url.startsWith("/api/bible/search?q=Jude"))).toBe(true);
  });

  it("returns to the books when the box is searched empty, and puts the last search away", async () => {
    show("/bible?book=43&chapter=3");
    type("water");
    expect(await sidebar().findByText("2 verses")).toBeInTheDocument();
    type("   ");
    expect(sidebar().getByRole("navigation", { name: "Books of the Bible" })).toBeInTheDocument();
    expect(sidebar().queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();
    expect(sidebar().queryByRole("button", { name: "Back to results" })).not.toBeInTheDocument();
    // It is not a mistake, so nothing is reported as one.
    expect(sidebar().queryByRole("alert")).not.toBeInTheDocument();
    expect(sidebar().getByRole("searchbox")).not.toHaveAttribute("aria-invalid");
  });

  it("says when nothing matches", async () => {
    show("/bible?book=43&chapter=3");
    type("nothing");
    expect(await sidebar().findByText(/No verses match/)).toBeInTheDocument();
  });

  it("refuses words that cannot be searched for, without asking the server", async () => {
    show("/bible?book=43&chapter=3");
    type("***");
    expect(await sidebar().findByRole("alert")).toBeInTheDocument();
    expect(sidebar().getByRole("searchbox")).toHaveAttribute("aria-invalid", "true");
    expect(requests.some((url) => url.startsWith("/api/bible/search"))).toBe(false);
  });

  it("offers another try when the search fails", async () => {
    show("/bible?book=43&chapter=3");
    await verse(1);
    failNext = true;
    type("water");
    const again = await sidebar().findByRole("button", { name: "Try again" });
    fireEvent.click(again);
    expect(await sidebar().findByText("2 verses")).toBeInTheDocument();
  });

  it("does not let a slow answer replace a newer one", async () => {
    show("/bible?book=43&chapter=3");
    let release = () => {};
    holdSearch = (resolve) => {
      release = resolve;
    };
    type("slow");
    await waitFor(() => expect(requests.some((url) => url.includes("q=slow"))).toBe(true));
    type("water");
    expect(await sidebar().findByText("2 verses")).toBeInTheDocument();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(sidebar().queryByText(/slow/)).not.toBeInTheDocument();
    expect(sidebar().getByText("John 4:10")).toBeInTheDocument();
  });

  it("keeps the results in the sheet for a narrow screen to return to", async () => {
    show("/bible?book=43&chapter=3");
    fireEvent.click(screen.getByRole("button", { name: "Browse and search the Bible" }));
    let sheet = within(await screen.findByRole("dialog", { name: "Bible" }));
    type("water", sheet);
    fireEvent.click(await sheet.findByRole("button", { name: /John 4:10/ }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Bible" })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse and search the Bible" }));
    sheet = within(await screen.findByRole("dialog", { name: "Bible" }));
    expect(sheet.getByRole("region", { name: "Search results" })).toBeInTheDocument();
    expect(sheet.getByRole("searchbox")).toHaveValue("water");
  });
});

describe("loading and failure", () => {
  it("shows a placeholder while the chapter is fetched, and never another chapter", () => {
    show("/bible?book=43&chapter=3");
    expect(screen.getByText("Loading the passage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^1\s*Text of/ })).not.toBeInTheDocument();
  });

  it("offers another try when the chapter cannot be loaded", async () => {
    failNext = true;
    show("/bible?book=43&chapter=3");
    expect(await screen.findByText("The passage could not be loaded.")).toBeInTheDocument();
    // There is nothing to select a chapter of yet.
    expect(screen.getByRole("button", { name: "Select chapter" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await verse(1)).toBeInTheDocument();
  });
});

describe("the Psalms", () => {
  it("renders a long psalm in full", async () => {
    show("/bible?book=19&chapter=119&verse=105");
    expect(heading()).toHaveTextContent("Psalm 119");
    expect(await verse(176, 19, 119)).toBeInTheDocument();
    expect(await verse(105, 19, 119)).toHaveAttribute("aria-current", "location");
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(176);
  });

  it("sets a psalm's title above verse 1, where it cannot be selected", async () => {
    const { container } = show("/bible?book=19&chapter=3");
    const first = await verse(1, 19, 3);
    const title = screen.getByText("A Psalm of David, when he fled.");
    expect(title.closest("button")).toBeNull();
    expect(title.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("[data-verse]")).toHaveLength(versesIn(19, 3));

    // Selecting the chapter selects its verses; the title is no part of what is copied.
    fireEvent.click(screen.getByRole("button", { name: "Select chapter" }));
    fireEvent.click(within(toolbar()!).getByRole("button", { name: "Copy text" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).not.toContain("A Psalm of David");
    expect(copied[0].startsWith("Psalm 3 (KJV)\n1 Text of 19.3.1")).toBe(true);
  });

  it("shows no title on a psalm that has none", async () => {
    const { container } = show("/bible?book=19&chapter=1");
    await verse(1, 19, 1);
    expect(container.querySelector("[data-superscription]")).toBeNull();
  });
});

/** A verse's row, however it is marked: a highlight or a star adds to what the row is called. */
const row = (number: number) =>
  document.querySelector<HTMLElement>(`[data-reader-text] [data-verse="${number}"]`)!;
const john = (...verses: number[]) =>
  verses.map((number) => ({ book: 43, chapter: 3, verse: number }));
const action = (name: string | RegExp) => within(toolbar()!).getByRole("button", { name });
const picker = () => screen.getByRole("group", { name: "Highlight color" });
const swatch = (name: string) => within(picker()).getByRole("button", { name });
const pickerStatus = () => within(picker().parentElement!).getByRole("status");
/** Opens the reader at John 3 with its marks arrived. */
async function john3() {
  show("/bible?book=43&chapter=3");
  await verse(1);
  await waitFor(() => expect(requests).toContain("/api/bible/43/3/marks"));
}
const highlightCalls = () => account.calls.filter((call) => call.action === "setHighlight");

describe("selecting a run with Shift", () => {
  it("takes every verse from the last one clicked to this one", async () => {
    await john3();
    fireEvent.click(await verse(16));
    fireEvent.click(await verse(18), { shiftKey: true });
    expect(within(toolbar()!).getByText("John 3:16–18")).toBeInTheDocument();
  });

  it("reaches backwards, and adds to what is already selected", async () => {
    await john3();
    fireEvent.click(await verse(3));
    fireEvent.click(await verse(10));
    fireEvent.click(await verse(8), { shiftKey: true });
    expect(within(toolbar()!).getByText("John 3:3, 8–10")).toBeInTheDocument();
  });

  it("is an ordinary click when nothing is selected to reach from", async () => {
    await john3();
    fireEvent.click(await verse(16), { shiftKey: true });
    expect(within(toolbar()!).getByText("John 3:16")).toBeInTheDocument();
    // Cleared, then Shift again: the verse clicked before the clearing is not reached from.
    fireEvent.click(action("Clear selection"));
    fireEvent.click(await verse(20), { shiftKey: true });
    expect(within(toolbar()!).getByText("John 3:20")).toBeInTheDocument();
  });
});

describe("highlighting", () => {
  it("offers nothing until a verse is selected, and never the whole chapter by default", async () => {
    await john3();
    expect(screen.queryByRole("button", { name: /^Highlight/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to favorites" })).not.toBeInTheDocument();
    expect(account.calls).toEqual([]);
  });

  it.each(["Yellow", "Green", "Blue", "Red"])("applies %s to the selected verse", async (name) => {
    await john3();
    fireEvent.click(await verse(16));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch(name));
    const color = name.toLowerCase();
    expect(row(16)).toHaveAttribute("data-highlight", color);
    expect(row(16)).toHaveAccessibleName(new RegExp(`Highlighted ${color}\\.`));
    await waitFor(() => expect(highlightCalls()).toHaveLength(1));
    expect(highlightCalls()[0].input).toEqual({ translation: "kjv", verses: john(16), color });
    // Selected and highlighted are two things, and the verse is still both.
    expect(row(16)).toHaveAttribute("aria-pressed", "true");
  });

  it("colors every selected verse in one request, and no other", async () => {
    await john3();
    for (const number of [16, 17, 18]) fireEvent.click(await verse(number));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Green"));
    for (const number of [16, 17, 18]) {
      expect(row(number)).toHaveAttribute("data-highlight", "green");
    }
    expect(row(15)).not.toHaveAttribute("data-highlight");
    expect(row(19)).not.toHaveAttribute("data-highlight");
    await waitFor(() => expect(highlightCalls()).toHaveLength(1));
    expect(highlightCalls()[0].input).toMatchObject({ verses: john(16, 17, 18), color: "green" });
  });

  it("shows highlights saved before, with the chapter, and again after a reload", async () => {
    highlighted(john(16), "yellow");
    highlighted(john(17), "red");
    const first = show("/bible?book=43&chapter=3");
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));
    expect(row(17)).toHaveAttribute("data-highlight", "red");
    expect(row(18)).not.toHaveAttribute("data-highlight");

    // A new page: nothing is remembered in the browser, and they are there again.
    first.unmount();
    clearChapterCache();
    clearMarksCache();
    show("/bible?book=43&chapter=3");
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));
  });

  it("paints the marks sent with the page from the first frame", async () => {
    const verses = Array.from({ length: versesIn(43, 3) }, (_, index) =>
      verseText(43, 3, index + 1),
    );
    show("/bible?book=43&chapter=3", {
      book: 43,
      chapter: 3,
      text: { verses, title: null },
      marks: { highlights: { 16: "blue" }, favorites: [] },
    });
    expect(row(16)).toHaveAttribute("data-highlight", "blue");
  });

  it("replaces one color with another: a verse holds one", async () => {
    highlighted(john(16), "yellow");
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));
    fireEvent.click(row(16));
    fireEvent.click(action("Highlight: yellow"));
    expect(swatch("Yellow")).toHaveAttribute("aria-pressed", "true");
    expect(pickerStatus()).toHaveTextContent("Highlighted yellow.");
    fireEvent.click(swatch("Blue"));
    expect(row(16)).toHaveAttribute("data-highlight", "blue");
    await waitFor(() => expect(account.highlights.get("43.3.16")).toBe("blue"));
    expect(account.highlights.size).toBe(1);
  });

  it("says a selection is mixed, and brings it to one color", async () => {
    highlighted(john(16), "yellow");
    highlighted(john(17), "blue");
    await john3();
    await waitFor(() => expect(row(17)).toHaveAttribute("data-highlight", "blue"));
    for (const number of [16, 17, 18]) fireEvent.click(row(number));
    fireEvent.click(action("Highlight: mixed"));
    // No one color is in force, so none is shown as chosen.
    for (const name of ["Yellow", "Green", "Blue", "Red"]) {
      expect(swatch(name)).toHaveAttribute("aria-pressed", "false");
    }
    expect(pickerStatus()).toHaveTextContent(
      "These verses are yellow and blue. A color here replaces them all.",
    );
    fireEvent.click(swatch("Red"));
    for (const number of [16, 17, 18]) expect(row(number)).toHaveAttribute("data-highlight", "red");
  });

  it("says when only some of the selected verses are highlighted", async () => {
    highlighted(john(16), "green");
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "green"));
    fireEvent.click(row(16));
    fireEvent.click(row(17));
    fireEvent.click(action("Highlight: mixed"));
    expect(pickerStatus()).toHaveTextContent("Some of these verses are green.");
  });

  it("removes a highlight, and offers to only where there is one", async () => {
    highlighted(john(16), "yellow");
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));

    fireEvent.click(row(20));
    fireEvent.click(action("Highlight"));
    expect(pickerStatus()).toHaveTextContent("Not highlighted.");
    expect(screen.queryByRole("button", { name: "Remove highlight" })).not.toBeInTheDocument();
    fireEvent.click(swatch("Green"));
    fireEvent.click(action("Clear selection"));

    fireEvent.click(row(16));
    fireEvent.click(action("Highlight: yellow"));
    fireEvent.click(screen.getByRole("button", { name: "Remove highlight" }));
    expect(row(16)).not.toHaveAttribute("data-highlight");
    expect(row(16)).toHaveAccessibleName(/^16\s*Text of 43\.3\.16$/);
    await waitFor(() => expect(account.highlights.has("43.3.16")).toBe(false));
    expect(highlightCalls().at(-1)!.input).toMatchObject({ verses: john(16), color: null });
    // The other verse keeps the color it was given.
    expect(row(20)).toHaveAttribute("data-highlight", "green");
  });

  it("takes a highlight back when the server will not keep it, and says so", async () => {
    highlighted(john(16), "yellow");
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));
    account.refuse = true;
    fireEvent.click(row(16));
    fireEvent.click(row(17));
    fireEvent.click(action("Highlight: mixed"));
    fireEvent.click(swatch("Blue"));
    expect(row(17)).toHaveAttribute("data-highlight", "blue");
    // Back to exactly what it was: yellow where it was yellow, bare where it was bare.
    await waitFor(() => expect(row(17)).not.toHaveAttribute("data-highlight"));
    expect(row(16)).toHaveAttribute("data-highlight", "yellow");
    expect(within(toolbar()!).getByRole("alert")).toHaveTextContent("The server said no.");
  });

  it("takes a highlight back when the request never arrives", async () => {
    await john3();
    account.unreachable = true;
    fireEvent.click(await verse(16));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Green"));
    await waitFor(() => expect(row(16)).not.toHaveAttribute("data-highlight"));
    expect(within(toolbar()!).getByRole("alert")).toHaveTextContent(/could not be saved/);
  });

  it("keeps quick changes in the order they were made", async () => {
    await john3();
    let release: (() => void) | null = null;
    account.hold = (go) => (release = go);
    fireEvent.click(await verse(16));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Yellow"));
    // A second color before the first has been answered.
    fireEvent.click(action(/^Highlight/));
    fireEvent.click(swatch("Red"));
    expect(row(16)).toHaveAttribute("data-highlight", "red");
    // The first is with the server, and held there; the second waits its turn behind it.
    await waitFor(() => expect(release).not.toBeNull());
    expect(highlightCalls()).toHaveLength(0);
    await act(async () => release!());
    await waitFor(() => expect(highlightCalls()).toHaveLength(2));
    expect(highlightCalls().map((call) => (call.input as { color: string }).color)).toEqual([
      "yellow",
      "red",
    ]);
    await waitFor(() => expect(account.highlights.get("43.3.16")).toBe("red"));
    expect(row(16)).toHaveAttribute("data-highlight", "red");
  });

  it("keeps a later change when an earlier one is refused", async () => {
    await john3();
    let release = () => {};
    account.hold = (go) => (release = go);
    account.refuse = true;
    fireEvent.click(await verse(16));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Yellow"));
    fireEvent.click(action("Clear selection"));
    fireEvent.click(await verse(20));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Green"));
    await act(async () => release());
    await waitFor(() => expect(row(16)).not.toHaveAttribute("data-highlight"));
    await waitFor(() => expect(account.highlights.get("43.3.20")).toBe("green"));
    expect(row(20)).toHaveAttribute("data-highlight", "green");
  });

  it("does not let an answer for a chapter that was left mark the one now shown", async () => {
    await john3();
    let release = () => {};
    account.hold = (go) => (release = go);
    fireEvent.click(await verse(16));
    fireEvent.click(action("Highlight"));
    fireEvent.click(swatch("Yellow"));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await verse(1, 43, 4);
    await act(async () => release());
    await waitFor(() => expect(account.highlights.get("43.3.16")).toBe("yellow"));
    expect(document.querySelectorAll("[data-reader-text] [data-highlight]")).toHaveLength(0);
    // And it is where it was put, on going back.
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    await waitFor(() => expect(row(16)).toHaveAttribute("data-highlight", "yellow"));
  });

  it("still shows the chapter when its marks cannot be read", async () => {
    marksFail = true;
    show("/bible?book=43&chapter=3");
    fireEvent.click(await verse(16));
    expect(action("Highlight")).toBeInTheDocument();
  });

  it("leaves a favorite alone when its highlight is removed", async () => {
    highlighted(john(16), "yellow");
    account.favorites.push({
      id: "favorite-kept",
      translation: "kjv",
      reference: "John 3:16",
      label: null,
      notes: null,
      verses: john(16),
    });
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-favorite"));
    fireEvent.click(row(16));
    fireEvent.click(action("Highlight: yellow"));
    fireEvent.click(screen.getByRole("button", { name: "Remove highlight" }));
    await waitFor(() => expect(account.highlights.size).toBe(0));
    expect(account.favorites).toHaveLength(1);
    expect(row(16)).toHaveAttribute("data-favorite");
  });
});

describe("favorites", () => {
  const saveCalls = () => account.calls.filter((call) => call.action === "saveFavorite");
  const updateCalls = () => account.calls.filter((call) => call.action === "updateFavorite");

  it("saves the selected verse with one click, and marks it", async () => {
    await john3();
    fireEvent.click(await verse(16));
    fireEvent.click(action("Add to favorites"));
    await waitFor(() => expect(row(16)).toHaveAttribute("data-favorite"));
    expect(saveCalls()[0].input).toEqual({ translation: "kjv", verses: john(16) });
    expect(row(16)).toHaveAccessibleName(/In your favorites\./);
    expect(row(17)).not.toHaveAttribute("data-favorite");
    // Said, with the way to where it is kept.
    const said = screen.getByText("Saved John 3:16.");
    expect(within(said.parentElement!).getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/library/scripture",
    );
    // A favorite is not a highlight.
    expect(row(16)).not.toHaveAttribute("data-highlight");
    expect(highlightCalls()).toEqual([]);
  });

  it("saves a passage as one favorite", async () => {
    await john3();
    for (const number of [16, 17, 18]) fireEvent.click(await verse(number));
    fireEvent.click(action("Add to favorites"));
    await waitFor(() => expect(account.favorites).toHaveLength(1));
    expect(account.favorites[0].reference).toBe("John 3:16–18");
    await waitFor(() => expect(row(18)).toHaveAttribute("data-favorite"));
    for (const number of [16, 17]) expect(row(number)).toHaveAttribute("data-favorite");
  });

  it("saves verses that are apart as one favorite", async () => {
    await john3();
    for (const number of [8, 3, 6, 5]) fireEvent.click(await verse(number));
    fireEvent.click(action("Add to favorites"));
    await waitFor(() => expect(account.favorites).toHaveLength(1));
    expect(account.favorites[0]).toMatchObject({
      reference: "John 3:3, 5–6, 8",
      verses: john(3, 5, 6, 8),
    });
  });

  it("does not save a selection twice: the button opens the one there is", async () => {
    await john3();
    fireEvent.click(await verse(16));
    fireEvent.click(action("Add to favorites"));
    const manage = await waitFor(() => action("Saved. Manage this favorite"));
    fireEvent.click(manage);
    const dialog = await screen.findByRole("dialog", { name: "Saved passage" });
    expect(within(dialog).getByLabelText("Passage")).toHaveValue("John 3:16");
    expect(saveCalls()).toHaveLength(1);
    expect(account.favorites).toHaveLength(1);
  });

  it("ignores a second click while the first is being saved", async () => {
    await john3();
    fireEvent.click(await verse(16));
    fireEvent.click(action("Add to favorites"));
    fireEvent.click(action("Add to favorites"));
    await waitFor(() => expect(row(16)).toHaveAttribute("data-favorite"));
    expect(saveCalls()).toHaveLength(1);
  });

  it("says so when a favorite cannot be saved, and marks nothing", async () => {
    await john3();
    account.refuse = true;
    fireEvent.click(await verse(16));
    fireEvent.click(action("Add to favorites"));
    expect(await within(toolbar()!).findByRole("alert")).toHaveTextContent("The server said no.");
    expect(row(16)).not.toHaveAttribute("data-favorite");
    expect(action("Add to favorites")).toBeInTheDocument();
  });

  it("names the favorites a selected verse belongs to, and opens one to be managed", async () => {
    account.favorites.push({
      id: "favorite-gospel",
      translation: "kjv",
      reference: "John 3:16–18",
      label: "The gospel",
      notes: "For Easter.",
      verses: john(16, 17, 18),
    });
    await john3();
    await waitFor(() => expect(row(17)).toHaveAttribute("data-favorite"));
    fireEvent.click(row(17));
    // One verse of it is not the favorite itself, so it can still be saved on its own.
    expect(action("Add to favorites")).toBeInTheDocument();
    const list = within(toolbar()!).getByRole("list", { name: "Favorites with these verses" });
    fireEvent.click(within(list).getByRole("button", { name: "Manage The gospel" }));
    const dialog = await screen.findByRole("dialog", { name: "Saved passage" });
    expect(within(dialog).getByLabelText("Passage")).toHaveValue("John 3:16–18");
    expect(within(dialog).getByLabelText(/^Label/)).toHaveValue("The gospel");
    expect(within(dialog).getByLabelText(/^Notes/)).toHaveValue("For Easter.");
  });

  async function manageJohn316() {
    account.favorites.push({
      id: "favorite-one",
      translation: "kjv",
      reference: "John 3:16",
      label: null,
      notes: null,
      verses: john(16),
    });
    await john3();
    await waitFor(() => expect(row(16)).toHaveAttribute("data-favorite"));
    fireEvent.click(row(16));
    fireEvent.click(action("Saved. Manage this favorite"));
    return screen.findByRole("dialog", { name: "Saved passage" });
  }
  const gone = () =>
    waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Saved passage" })).not.toBeInTheDocument(),
    );

  it("edits a label and notes without sending the verses", async () => {
    const dialog = await manageJohn316();
    fireEvent.change(within(dialog).getByLabelText(/^Label/), { target: { value: "The gospel" } });
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), { target: { value: "For Easter." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(account.favorites[0]).toMatchObject({ label: "The gospel", notes: "For Easter." }),
    );
    expect(updateCalls()[0].input).toEqual({
      id: "favorite-one",
      label: "The gospel",
      notes: "For Easter.",
    });
    await gone();
    expect(screen.getByText("Changes saved.")).toBeInTheDocument();
  });

  it("changes which verses a favorite holds, and moves its marks", async () => {
    const dialog = await manageJohn316();
    fireEvent.change(within(dialog).getByLabelText("Passage"), {
      target: { value: "John 3:17-18" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(account.favorites[0].reference).toBe("John 3:17–18"));
    await waitFor(() => expect(row(17)).toHaveAttribute("data-favorite"));
    expect(row(18)).toHaveAttribute("data-favorite");
    expect(row(16)).not.toHaveAttribute("data-favorite");
  });

  it("refuses a passage that does not exist, without asking the server", async () => {
    const dialog = await manageJohn316();
    const passage = within(dialog).getByLabelText("Passage");
    fireEvent.change(passage, { target: { value: "John 3:99" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/no verse 99/);
    expect(passage).toHaveAttribute("aria-invalid", "true");
    expect(updateCalls()).toEqual([]);
  });

  it("counts notes and will not save past the limit", async () => {
    const dialog = await manageJohn316();
    const notes = within(dialog).getByLabelText(/^Notes/);
    fireEvent.change(notes, { target: { value: "n".repeat(2000) } });
    expect(within(dialog).getByText(/2,000 of 2,000/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.change(notes, { target: { value: "n".repeat(2001) } });
    expect(notes).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("reports a clash with another favorite and changes neither", async () => {
    account.favorites.push({
      id: "favorite-other",
      translation: "kjv",
      reference: "John 3:17",
      label: "Other",
      notes: null,
      verses: john(17),
    });
    const dialog = await manageJohn316();
    fireEvent.change(within(dialog).getByLabelText("Passage"), { target: { value: "John 3:17" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(/already saved that passage/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Find the one you already have" }),
    ).toHaveAttribute("href", "/library/scripture?q=John+3%3A17");
    expect(account.favorites.map((favorite) => favorite.reference)).toEqual([
      "John 3:17",
      "John 3:16",
    ]);
    // What was typed is still there to be put right.
    expect(within(dialog).getByLabelText("Passage")).toHaveValue("John 3:17");
  });

  it("keeps the dialog and what was typed when a save fails", async () => {
    const dialog = await manageJohn316();
    account.refuse = true;
    fireEvent.change(within(dialog).getByLabelText(/^Label/), { target: { value: "Typed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("The server said no.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Label/)).toHaveValue("Typed");
    expect(account.favorites[0].label).toBeNull();
  });

  it("removes a favorite only after being asked, and leaves the highlight", async () => {
    highlighted(john(16), "yellow");
    const dialog = await manageJohn316();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    // Asked first, in the same dialog, and nothing has gone yet.
    const confirm = within(dialog).getByRole("alertdialog");
    expect(confirm).toHaveTextContent("Highlights on these verses stay");
    expect(account.favorites).toHaveLength(1);
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    expect(within(dialog).queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    fireEvent.click(
      within(within(dialog).getByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(account.favorites).toHaveLength(0));
    await waitFor(() => expect(row(16)).not.toHaveAttribute("data-favorite"));
    expect(row(16)).toHaveAttribute("data-highlight", "yellow");
    expect(account.highlights.get("43.3.16")).toBe("yellow");
    await gone();
    expect(action("Add to favorites")).toBeInTheDocument();
  });

  it("is made of buttons, so the keyboard works it", async () => {
    await john3();
    fireEvent.click(await verse(16));
    const star = action("Add to favorites");
    star.focus();
    expect(star).toHaveFocus();
    const highlighter = action("Highlight");
    expect(highlighter.tagName).toBe("BUTTON");
    fireEvent.click(highlighter);
    for (const name of ["Yellow", "Green", "Blue", "Red"]) {
      expect(swatch(name).tagName).toBe("BUTTON");
    }
  });
});
