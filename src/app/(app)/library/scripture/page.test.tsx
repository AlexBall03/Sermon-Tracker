import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import type { ListedFavorite } from "@/features/scripture/saved/favorites";

// The access helper, the queries, and the actions are mocked: this covers what
// the page does with their answers. The queries themselves are tested on a database.
const state = vi.hoisted(() => ({
  signedIn: true,
  favorites: [] as unknown[],
  paging: {} as { total?: number; page?: number; totalPages?: number },
  saved: 0,
  searchFavorites: vi.fn(),
  countFavorites: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  updateFavorite: vi.fn(),
  deleteFavorite: vi.fn(),
  attachScripture: vi.fn(),
  createIdea: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return { id: "owner-1", role: "user", status: "active" };
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/actions", () => ({
  createIdea: state.createIdea,
  attachScripture: state.attachScripture,
}));
vi.mock("@/features/scripture/saved/actions", () => ({
  updateFavorite: state.updateFavorite,
  deleteFavorite: state.deleteFavorite,
  saveFavorite: vi.fn(),
  setHighlight: vi.fn(),
}));
vi.mock("@/features/scripture/saved/favorites", () => ({
  searchFavorites: async (...args: unknown[]) => {
    state.searchFavorites(...args);
    return {
      items: state.favorites,
      total: state.favorites.length,
      page: 1,
      pageSize: 24,
      totalPages: state.favorites.length ? 1 : 0,
      ...state.paging,
    };
  },
  countFavorites: async (...args: unknown[]) => {
    state.countFavorites(...args);
    return state.saved;
  },
}));

import { QuickCaptureProvider } from "@/features/ideas/components/quick-capture";
import SavedScripturePage from "./page";

const favorite = (fields: Partial<ListedFavorite> = {}): ListedFavorite => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  translation: "kjv",
  reference: "John 3:16–17",
  label: "The gospel",
  notes: "For Easter.",
  verses: [
    { book: 43, chapter: 3, verse: 16 },
    { book: 43, chapter: 3, verse: 17 },
  ],
  colors: ["yellow", "red"],
  preview: [
    { book: 43, chapter: 3, verse: 16, text: "For God so loved the world." },
    { book: 43, chapter: 3, verse: 17, text: "For God sent not his Son to condemn." },
  ],
  createdAt: new Date("2026-10-01T12:00:00Z"),
  updatedAt: new Date("2026-10-02T12:00:00Z"),
  ...fields,
});
const romans = favorite({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reference: "Romans 3:10, 23; 6:23",
  label: null,
  notes: null,
  verses: [
    { book: 45, chapter: 3, verse: 10 },
    { book: 45, chapter: 3, verse: 23 },
    { book: 45, chapter: 6, verse: 23 },
  ],
  colors: [],
  preview: [],
});

async function show(search = "") {
  const params = Object.fromEntries(new URLSearchParams(search));
  const page = await SavedScripturePage({ searchParams: Promise.resolve(params) });
  return render(
    <ToastProvider>
      <QuickCaptureProvider>{page}</QuickCaptureProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  state.signedIn = true;
  state.favorites = [];
  state.paging = {};
  state.saved = 0;
  for (const mock of [
    state.searchFavorites,
    state.countFavorites,
    state.push,
    state.replace,
    state.updateFavorite,
    state.deleteFavorite,
  ]) {
    mock.mockReset();
  }
});

describe("the saved Scripture section", () => {
  it("checks access itself, before reading anything", async () => {
    state.signedIn = false;
    await expect(SavedScripturePage({})).rejects.toThrow("redirect:/sign-in");
    expect(state.searchFavorites).not.toHaveBeenCalled();
  });

  it("asks for the signed-in account's passages with the query from the address", async () => {
    state.favorites = [favorite()];
    await show("q=grace&book=45&color=yellow&sort=bible&page=2&owner=someone-else");
    expect(state.searchFavorites).toHaveBeenCalledWith("database", "owner-1", {
      q: "grace",
      book: 45,
      colors: ["yellow"],
      sort: "bible",
      page: 2,
    });
  });

  it("reads a nonsense address as the default query", async () => {
    state.favorites = [favorite()];
    await show("book=999&color=pink&sort=drop&page=-1");
    expect(state.searchFavorites).toHaveBeenCalledWith("database", "owner-1", {
      q: "",
      book: null,
      colors: [],
      sort: "saved-desc",
      page: 1,
    });
  });

  it("belongs to the library: its heading, and the way between its sections", async () => {
    state.favorites = [favorite()];
    await show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Library");
    const sections = within(screen.getByRole("navigation", { name: "Library sections" }));
    expect(sections.getByRole("link", { name: "Ideas" })).toHaveAttribute("href", "/library");
    const here = sections.getByRole("link", { name: "Saved Scripture" });
    expect(here).toHaveAttribute("href", "/library/scripture");
    expect(here).toHaveAttribute("aria-current", "page");
    expect(sections.getByRole("link", { name: "Ideas" })).not.toHaveAttribute("aria-current");
  });

  it("lists each passage with its text, notes, colors, and the way to it in the Bible", async () => {
    state.favorites = [favorite(), romans];
    await show();
    const list = within(screen.getByRole("list", { name: "Your saved Scripture" }));
    const [gospel, road] = list.getAllByRole("listitem");

    expect(within(gospel).getByRole("heading", { level: 3 })).toHaveTextContent("The gospel");
    expect(within(gospel).getByRole("link", { name: /John 3:16–17/ })).toHaveAttribute(
      "href",
      "/bible?book=43&chapter=3&verse=16",
    );
    expect(gospel).toHaveTextContent("For God so loved the world.");
    expect(gospel).toHaveTextContent("For Easter.");
    // The colors are named, not only shown.
    expect(gospel).toHaveTextContent("Highlighted Yellow, Red");
    expect(gospel).toHaveTextContent("Saved Oct 1, 2026");

    // Without a label the reference is the heading, and still the link.
    expect(within(road).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Romans 3:10, 23; 6:23",
    );
    expect(within(road).getByRole("link", { name: /Romans 3:10, 23; 6:23/ })).toHaveAttribute(
      "href",
      "/bible?book=45&chapter=3&verse=10",
    );
    expect(road).not.toHaveTextContent("Highlighted");
    expect(screen.getByText("2 saved passages")).toHaveAttribute("role", "status");
  });

  it("says how many verses of a long passage are not shown", async () => {
    const verses = Array.from({ length: 6 }, (_, index) => ({
      book: 19,
      chapter: 23,
      verse: index + 1,
    }));
    state.favorites = [
      favorite({
        reference: "Psalm 23:1–6",
        verses,
        preview: verses.slice(0, 3).map((verse) => ({ ...verse, text: `Verse ${verse.verse}.` })),
      }),
    ];
    await show();
    expect(screen.getByText("and 3 more verses")).toBeInTheDocument();
  });

  it("counts a filtered page, and a page among several", async () => {
    state.favorites = [favorite()];
    state.paging = { total: 60, page: 2, totalPages: 3 };
    await show("q=grace&page=2");
    expect(screen.getByText("Showing 25–48 of 60 matching passages")).toBeInTheDocument();
    const pages = within(screen.getByRole("navigation", { name: "Saved Scripture pages" }));
    expect(pages.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "href",
      "/library/scripture?q=grace&page=3",
    );
    expect(pages.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/library/scripture?q=grace",
    );
  });

  it("invites reading when nothing has been saved, with no controls", async () => {
    await show();
    expect(screen.getByRole("heading", { name: "No Scripture saved yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the Bible" })).toHaveAttribute("href", "/bible");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    // The sections are still there, so the ideas are one click away.
    expect(screen.getByRole("navigation", { name: "Library sections" })).toBeInTheDocument();
    expect(state.countFavorites).not.toHaveBeenCalled();
  });

  it("says a search found nothing, and keeps the controls", async () => {
    state.saved = 4;
    await show("q=zebra");
    expect(
      screen.getByRole("heading", { name: "No passages match your search" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing you have saved has “zebra”/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/library/scripture",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("zebra");
  });

  it("says filters found nothing, without calling the section empty", async () => {
    state.saved = 4;
    await show("book=66&sort=bible");
    expect(
      screen.getByRole("heading", { name: "No passages match these filters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You have saved Scripture, but nothing from Revelation."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library/scripture?sort=bible",
    );
  });

  it("treats a search over nothing saved as nothing saved", async () => {
    state.saved = 0;
    await show("q=zebra");
    expect(screen.getByRole("heading", { name: "No Scripture saved yet" })).toBeInTheDocument();
    expect(state.countFavorites).toHaveBeenCalledWith("database", "owner-1");
  });
});

describe("the saved Scripture controls", () => {
  beforeEach(() => {
    state.favorites = [favorite(), romans];
  });

  it("show the filters in force and change only the address", async () => {
    await show("color=yellow&book=43");
    const colors = within(screen.getByRole("group", { name: "Highlight color" }));
    expect(colors.getByRole("button", { name: "Yellow" })).toHaveAttribute("aria-pressed", "true");
    expect(colors.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Book" })).toHaveTextContent("John");

    fireEvent.click(colors.getByRole("button", { name: "Blue" }));
    expect(state.push).toHaveBeenLastCalledWith(
      "/library/scripture?book=43&color=yellow&color=blue",
      { scroll: false },
    );
  });

  // Building one change on the last, across requests still on their way, is
  // `useQueryNavigation`, shared with the ideas and tested with their controls.
  it("keep the search and return to page 1 when a filter changes", async () => {
    await show("q=grace&color=green&page=3");
    const colors = within(screen.getByRole("group", { name: "Highlight color" }));
    fireEvent.click(colors.getByRole("button", { name: "Red" }));
    expect(state.push).toHaveBeenLastCalledWith(
      "/library/scripture?q=grace&color=green&color=red",
      { scroll: false },
    );
    // Taking a color off is the same control again.
    fireEvent.click(colors.getByRole("button", { name: "Green" }));
    expect(state.push.mock.calls.at(-1)![0]).not.toContain("color=green");
  });

  it("lift every filter at once and keep the search", async () => {
    await show("q=grace&book=43&color=red&sort=bible");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(state.push).toHaveBeenLastCalledWith("/library/scripture?q=grace&sort=bible", {
      scroll: false,
    });
  });

  it("offer no way to clear filters when there are none", async () => {
    await show("q=grace");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("search at once on Enter", async () => {
    await show();
    const box = screen.getByRole("searchbox", { name: "Search saved Scripture" });
    fireEvent.change(box, { target: { value: "  living   water " } });
    fireEvent.submit(box.closest("form")!);
    expect(state.push).toHaveBeenLastCalledWith("/library/scripture?q=living+water", {
      scroll: false,
    });
  });
});

describe("managing a saved passage from the library", () => {
  beforeEach(() => {
    state.favorites = [favorite()];
  });

  it("opens it with what it holds, and saves a change", async () => {
    state.updateFavorite.mockResolvedValue({
      ok: true,
      message: "Changes saved.",
      favorite: { ...favorite(), label: "Renamed" },
    });
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Edit The gospel" }));
    const dialog = await screen.findByRole("dialog", { name: "Saved passage" });
    expect(within(dialog).getByLabelText("Passage")).toHaveValue("John 3:16–17");
    expect(within(dialog).getByLabelText(/^Notes/)).toHaveValue("For Easter.");
    expect(within(dialog).getByRole("link", { name: "Open in Bible" })).toHaveAttribute(
      "href",
      "/bible?book=43&chapter=3&verse=16",
    );

    fireEvent.change(within(dialog).getByLabelText(/^Label/), { target: { value: "Renamed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.updateFavorite).toHaveBeenCalledWith(favorite().id, {
        label: "Renamed",
        notes: "For Easter.",
      }),
    );
    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
  });

  it("removes it only after being asked, saying what is kept", async () => {
    state.deleteFavorite.mockResolvedValue({
      ok: true,
      message: "Removed from your saved Scripture.",
    });
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Remove The gospel" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Remove The gospel?");
    expect(confirm).toHaveTextContent("Highlights on these verses stay, and so do your ideas.");
    expect(state.deleteFavorite).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(state.deleteFavorite).toHaveBeenCalledWith(favorite().id));
    expect(await screen.findByText("Removed from your saved Scripture.")).toBeInTheDocument();
  });

  it("can be thought better of", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Remove The gospel" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(state.deleteFavorite).not.toHaveBeenCalled();
  });

  it("says so when a removal fails, and when it never arrives", async () => {
    state.deleteFavorite.mockResolvedValueOnce({
      ok: false,
      message: "That saved passage no longer exists.",
    });
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Remove The gospel" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That saved passage no longer exists.",
    );

    state.deleteFavorite.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Remove The gospel" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That did not reach the server."),
    );
  });
});

describe("putting a saved passage on an idea", () => {
  const found = [
    {
      id: "idea-1",
      title: "So loved",
      kind: "sermon",
      status: "captured",
      subject: null,
      references: [],
    },
    {
      id: "idea-2",
      title: "The wages of sin",
      kind: "point",
      status: "captured",
      subject: null,
      references: [],
    },
  ];
  const attach = async (name: string) => {
    fireEvent.click(screen.getByRole("button", { name: `Add ${name} to an idea` }));
    return within(await screen.findByRole("dialog", { name: "Add to an idea" }));
  };

  beforeEach(() => {
    state.attachScripture.mockReset();
    state.createIdea.mockReset();
    state.attachScripture.mockResolvedValue({
      ok: true,
      id: "idea-1",
      added: 1,
      message: "Added.",
    });
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: found, total: found.length }),
    }));
    return () => vi.unstubAllGlobals();
  });

  it("adds a saved passage as one reference, through the reader's own dialog", async () => {
    state.favorites = [favorite()];
    state.saved = 1;
    await show();
    const dialog = await attach("The gospel");
    expect(dialog.getByText("John 3:16–17")).toBeVisible();
    fireEvent.click(await dialog.findByRole("button", { name: "Add John 3:16–17 to So loved" }));
    await waitFor(() => expect(state.attachScripture).toHaveBeenCalledTimes(1));
    expect(state.attachScripture).toHaveBeenCalledWith({
      ideaId: "idea-1",
      references: [{ book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: 17 }],
    });
    // Only its verses went: the favorite itself was neither changed nor removed.
    expect(state.updateFavorite).not.toHaveBeenCalled();
    expect(state.deleteFavorite).not.toHaveBeenCalled();
    expect(await screen.findByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/library/idea-1",
    );
  });

  it("adds a grouped passage whole, each run of verses a reference of its own", async () => {
    state.favorites = [romans];
    state.saved = 1;
    await show();
    const dialog = await attach("Romans 3:10, 23; 6:23");
    fireEvent.click(await dialog.findByRole("button", { name: /to The wages of sin$/ }));
    await waitFor(() => expect(state.attachScripture).toHaveBeenCalledTimes(1));
    const single = (chapterStart: number, verseStart: number) => ({
      book: 45,
      chapterStart,
      verseStart,
      chapterEnd: null,
      verseEnd: null,
    });
    expect(state.attachScripture).toHaveBeenCalledWith({
      ideaId: "idea-2",
      references: [single(3, 10), single(3, 23), single(6, 23)],
    });
  });

  it("begins a new idea with the whole saved passage", async () => {
    state.favorites = [romans];
    state.saved = 1;
    await show();
    const dialog = await attach("Romans 3:10, 23; 6:23");
    fireEvent.click(dialog.getByRole("button", { name: "New point idea" }));
    const capture = within(await screen.findByRole("dialog", { name: "Capture an idea" }));
    expect(capture.getByRole("radio", { name: "Point" })).toBeChecked();
    expect(
      within(capture.getByRole("list", { name: "References" })).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(state.createIdea).not.toHaveBeenCalled();
    expect(state.attachScripture).not.toHaveBeenCalled();
  });
});
