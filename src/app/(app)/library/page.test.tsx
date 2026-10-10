import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper and the idea queries are mocked: this covers what the pages do with their answers.
const state = vi.hoisted(() => ({
  signedIn: true,
  ideas: [] as unknown[],
  // What the query reports beyond the ideas themselves; by default one page holding them all.
  paging: {} as { total?: number; page?: number; totalPages?: number },
  idea: null as unknown,
  searchIdeas: vi.fn(),
  getIdea: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return { id: "owner-1", role: "user", status: "active" };
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/actions", () => ({
  updateIdea: vi.fn(),
  changeIdeaKind: vi.fn(),
  deleteIdea: vi.fn(),
  createIdea: vi.fn(),
}));
vi.mock("@/features/ideas/ideas", () => ({
  searchIdeas: async (...args: unknown[]) => {
    state.searchIdeas(...args);
    return {
      items: state.ideas,
      total: state.ideas.length,
      page: 1,
      pageSize: 24,
      totalPages: state.ideas.length ? 1 : 0,
      ...state.paging,
    };
  },
  getIdea: async (...args: unknown[]) => {
    state.getIdea(...args);
    return state.idea;
  },
}));

import IdeaPage from "./[id]/page";
import { defaultLibraryQuery } from "@/features/ideas/library-query";
import LibraryPage from "./page";

const id = "11111111-1111-4111-8111-111111111111";
const sermon = {
  id,
  ownerId: "owner-1",
  kind: "sermon",
  title: "His Grace is Sufficient",
  notes: "Paul's thorn.",
  status: "developing",
  sermonType: "expository",
  subject: "Grace",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  references: [
    {
      book: 19,
      chapterStart: 23,
      verseStart: null,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: false,
    },
    { book: 47, chapterStart: 12, verseStart: 7, chapterEnd: null, verseEnd: 10, isPrimary: true },
  ],
};

const open = (value: string) => IdeaPage({ params: Promise.resolve({ id: value }) });
const library = (searchParams: Record<string, string | string[]>) =>
  LibraryPage({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { signedIn: true, ideas: [], paging: {}, idea: null });
});

describe("LibraryPage", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(LibraryPage()).rejects.toThrow("redirect:/sign-in");
    expect(state.searchIdeas).not.toHaveBeenCalled();
  });

  it("invites a first capture when the library is empty", async () => {
    render(await LibraryPage());
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Capture an idea" })).toBeVisible();
  });

  it("lists the signed-in owner's ideas with kind, status, and references", async () => {
    state.ideas = [
      sermon,
      { ...sermon, id: "b2", kind: "undecided", title: "A thought", references: [] },
    ];
    render(await LibraryPage());

    // The owner comes from the session; with no parameters the query is the default one.
    expect(state.searchIdeas).toHaveBeenCalledWith("database", "owner-1", defaultLibraryQuery);
    const [first, second] = within(screen.getByRole("list", { name: "Your ideas" })).getAllByRole(
      "listitem",
    );
    expect(within(first).getByRole("link", { name: sermon.title })).toHaveAttribute(
      "href",
      `/library/${id}`,
    );
    expect(first).toHaveTextContent("Sermon idea");
    expect(first).toHaveTextContent("Developing");
    expect(first).toHaveTextContent("Grace");
    // The main text leads.
    expect(
      within(first)
        .getAllByRole("button", { name: /preview the passage/ })
        .map((chip) => chip.textContent),
    ).toEqual(["2 Corinthians 12:7–10", "Psalm 23"]);
    expect(second).toHaveTextContent("Undecided");
    expect(screen.getByText("2 ideas, most recently changed first")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Library pages" })).not.toBeInTheDocument();
  });

  it("reads the search, filters, order, and page from the URL", async () => {
    state.ideas = [sermon];
    await library({
      q: "  grace   alone ",
      kind: "sermon",
      status: "ready",
      type: "expository",
      sort: "title-asc",
      page: "3",
      owner: "someone-else",
    });
    expect(state.searchIdeas).toHaveBeenCalledWith("database", "owner-1", {
      ...defaultLibraryQuery,
      q: "grace alone",
      kind: "sermon",
      status: "ready",
      sermonType: "expository",
      sort: "title-asc",
      page: 3,
    });
  });

  it("falls back to the defaults for parameters that make no sense", async () => {
    render(
      await library({ kind: "series", sort: "id; drop table ideas", page: "-4", tag: ["x", "y"] }),
    );
    expect(state.searchIdeas).toHaveBeenCalledWith("database", "owner-1", defaultLibraryQuery);
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  });

  it("says so when nothing matches, and offers the whole library", async () => {
    render(await library({ q: "nothing like this" }));
    expect(screen.getByRole("heading", { name: "No ideas match" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all ideas" })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("links to the pages on either side, keeping the search and filters", async () => {
    state.ideas = [sermon];
    state.paging = { total: 120, page: 2, totalPages: 5 };
    const { unmount } = render(await library({ q: "grace", kind: "sermon", page: "2" }));

    expect(screen.getByText(/^120 ideas found/)).toBeVisible();
    const pages = screen.getByRole("navigation", { name: "Library pages" });
    expect(pages).toHaveTextContent("Page 2 of 5");
    // Page 1 is the address without a page.
    expect(within(pages).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/library?q=grace&kind=sermon",
    );
    expect(within(pages).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/library?q=grace&kind=sermon&page=3",
    );
    unmount();

    // The page shown is the one the query returned, here the last, whatever was asked for.
    state.paging = { total: 120, page: 5, totalPages: 5 };
    render(await library({ page: "99" }));
    const last = screen.getByRole("navigation", { name: "Library pages" });
    expect(within(last).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/library?page=4",
    );
    expect(within(last).queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("IdeaPage", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(open(id)).rejects.toThrow("redirect:/sign-in");
    expect(state.getIdea).not.toHaveBeenCalled();
  });

  it("is not found for a malformed ID, without querying", async () => {
    for (const value of ["1", "not-a-uuid", `${id}'--`, ""]) {
      await expect(open(value)).rejects.toThrow("not-found");
    }
    expect(state.getIdea).not.toHaveBeenCalled();
  });

  it("is not found for an idea the owner-scoped query does not return", async () => {
    await expect(open(id)).rejects.toThrow("not-found");
    expect(state.getIdea).toHaveBeenCalledWith("database", "owner-1", id);
  });

  it("opens the idea for editing with everything it holds", async () => {
    state.idea = sermon;
    render(await open(id));
    expect(screen.getByRole("heading", { level: 1, name: "Sermon idea" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Idea" })).toHaveValue(sermon.title);
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Paul's thorn.");
    expect(screen.getByRole("textbox", { name: "Subject or theme" })).toHaveValue("Grace");
    expect(screen.getByRole("radio", { name: "Sermon" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Expository" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Developing" })).toBeChecked();
    expect(screen.getAllByRole("button", { name: /preview the passage/ })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
  });
});
