import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { versesIn } from "../books";
import { copyKindKey } from "../copy-preference";
import { savedLocationKey } from "../reader-location";
import { sidebarKey } from "../reader-sidebar";
import { clearChapterCache } from "../use-chapter";
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

// The Bible endpoints are faked: every verse says where it is from, Psalm 3
// has a title, and a search for "water" finds two verses on two pages.
const requests: string[] = [];
let failNext = false;
let holdSearch: ((release: () => void) => void) | null = null;
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
    const foot = () => within(screen.getByRole("navigation", { name: "Neighbouring chapters" }));
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
    const neighbours = within(screen.getByRole("navigation", { name: "Neighbouring chapters" }));
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
