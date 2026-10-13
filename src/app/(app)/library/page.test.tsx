import { fireEvent, render, screen, within } from "@testing-library/react";
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
  tags: [] as unknown[],
  listTags: vi.fn(),
  // How many of the account's ideas are archived.
  archived: 0,
  // The idea's latest preaching occasions, and how many it has in all when that is more.
  occasions: [] as unknown[],
  preached: undefined as number | undefined,
  listForSermon: vi.fn(),
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
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/features/ideas/tag-actions", () => ({
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
}));
vi.mock("@/features/ideas/tags", () => ({
  listTags: async (...args: unknown[]) => {
    state.listTags(...args);
    return state.tags;
  },
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/actions", () => ({
  updateIdea: vi.fn(),
  changeIdeaKind: vi.fn(),
  deleteIdea: vi.fn(),
  createIdea: vi.fn(),
  archiveIdea: vi.fn(),
  restoreIdea: vi.fn(),
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
  archivedCount: async () => state.archived,
}));
vi.mock("@/features/preaching/occurrences", () => ({
  listForSermon: async (...args: unknown[]) => {
    state.listForSermon(...args);
    return {
      items: state.occasions,
      total: state.preached ?? state.occasions.length,
      page: 1,
      pageSize: 5,
      totalPages: 1,
    };
  },
}));
vi.mock("@/features/preaching/venues", () => ({ listVenues: async () => [] }));
vi.mock("@/features/preaching/contexts", () => ({ listContexts: async () => [] }));
vi.mock("@/features/preaching/actions", () => ({
  recordOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  createVenue: vi.fn(),
  createContext: vi.fn(),
}));

import IdeaPage from "./[id]/page";
import { defaultLibraryQuery } from "@/features/ideas/library-query";
import { testPreferences } from "@/features/preferences/testing";
import OverviewPage from "./page";
import LibraryPage from "./sermon-ideas/page";

const id = "11111111-1111-4111-8111-111111111111";
const sermon = {
  id,
  ownerId: "owner-1",
  kind: "sermon",
  title: "His Grace is Sufficient",
  notes: "Paul's thorn.",
  status: "developing",
  intendedFormat: "unspecified",
  sermonType: "expository",
  archivedAt: null,
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
  tags: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Faith" }],
};
const faith = {
  ...sermon.tags[0],
  ideaCount: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const open = (value: string, searchParams: Record<string, string | string[]> = {}) =>
  IdeaPage({
    params: Promise.resolve({ id: value }),
    searchParams: Promise.resolve(searchParams),
  });
const library = (searchParams: Record<string, string | string[]>) =>
  LibraryPage({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    signedIn: true,
    ideas: [],
    paging: {},
    idea: null,
    tags: [],
    archived: 0,
    occasions: [],
    preached: undefined,
  });
});

describe("the library overview", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(OverviewPage()).rejects.toThrow("redirect:/sign-in");
  });

  it("leads to the three sections, and marks none as the one being shown", async () => {
    render(await OverviewPage());
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    const sections = within(screen.getByRole("navigation", { name: "Library sections" }));
    const links = sections.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/library/sermon-ideas",
      "/library/saved-scripture",
      "/library/preaching-record",
    ]);
    for (const link of links) expect(link).not.toHaveAttribute("aria-current");
    expect(sections.getByRole("link", { name: /^Sermon Ideas/ })).toHaveTextContent(
      "Capture, organize, and develop sermons and point ideas.",
    );
    expect(sections.getByRole("link", { name: /^Saved Scripture/ })).toBeVisible();
    expect(sections.getByRole("link", { name: /^Preaching Record/ })).toBeVisible();
  });

  it("is for choosing a section: no way back to itself, no action, and no query", async () => {
    render(await OverviewPage());
    expect(screen.queryByRole("link", { name: "Back to Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(state.searchIdeas).not.toHaveBeenCalled();
  });

  it("sends an address from when the ideas were listed here on to them, query and all", async () => {
    await expect(
      OverviewPage({ searchParams: Promise.resolve({ q: "grace", kind: "sermon", page: "2" }) }),
    ).rejects.toThrow("redirect:/library/sermon-ideas?q=grace&kind=sermon&page=2");
    await expect(
      OverviewPage({ searchParams: Promise.resolve({ archived: "archived" }) }),
    ).rejects.toThrow("redirect:/library/sermon-ideas?archived=archived");
  });

  it("stays put for an address that asks for nothing the ideas understand", async () => {
    render(
      await OverviewPage({ searchParams: Promise.resolve({ utm_source: "mail", kind: "series" }) }),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  });

  it("is in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    render(await OverviewPage());
    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeVisible();
    expect(screen.getByRole("link", { name: /^Registro de predicación/ })).toHaveAttribute(
      "href",
      "/library/preaching-record",
    );
  });
});

describe("SermonIdeasPage", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(LibraryPage()).rejects.toThrow("redirect:/sign-in");
    expect(state.searchIdeas).not.toHaveBeenCalled();
  });

  it("invites a first capture when the library is empty", async () => {
    render(await LibraryPage());
    expect(screen.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
    // The way up is a link to the overview, wherever this page was reached from.
    expect(screen.getByRole("link", { name: "Back to Library" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getAllByRole("link", { name: "Back to Library" })).toHaveLength(1);
    expect(
      within(screen.getByRole("navigation", { name: "Library sections" })).getByRole("link", {
        name: "Sermon Ideas",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Capture an idea" })[0]).toBeVisible();
    // Nothing to search or filter yet.
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filters/ })).not.toBeInTheDocument();
  });

  it("says so when every idea is archived, and leads to them instead of to a new capture", async () => {
    state.archived = 2;
    render(await LibraryPage());
    expect(screen.getByRole("heading", { name: "Every idea is archived" })).toBeVisible();
    expect(screen.getByText(/2 archived ideas/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Show archived ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?archived=archived",
    );
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).not.toBeInTheDocument();
    // The library's controls are there, so the archive can be reached from them too.
    expect(screen.getByRole("button", { name: /^Filters/ })).toBeVisible();
  });

  it("says the archive is empty when it was asked for and holds nothing", async () => {
    render(await library({ archived: "archived" }));
    expect(screen.getByRole("heading", { name: "No archived ideas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to active ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
  });

  it("has a search box, filters, an order, a view, and tag management", async () => {
    state.ideas = [sermon];
    state.tags = [faith];
    render(await LibraryPage());
    expect(state.listTags).toHaveBeenCalledWith("database", "owner-1");
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("combobox", { name: "Sort ideas" })).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "Library view" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Manage tags" })).toBeVisible();
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
    // The ideas themselves, not the tags listed inside them.
    const [first, second] = Array.from(
      screen.getByRole("list", { name: "Your ideas" }).children,
    ) as HTMLElement[];
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
    expect(within(first).getByRole("list", { name: "Tags" })).toHaveTextContent("Faith");
    expect(second).toHaveTextContent("Undecided");
    expect(screen.getByText("2 ideas")).toBeVisible();
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
      kinds: ["sermon"],
      statuses: ["ready"],
      sermonTypes: ["expository"],
      sort: "title-asc",
      page: 3,
    });
  });

  it("reads several values for a filter, and the tag mode", async () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    state.ideas = [sermon];
    await library({
      kind: ["point", "sermon", "series"],
      status: ["ready", "idea"],
      type: ["topical", "expository"],
      tag: [b, a, a],
      tag_mode: "all",
    });
    expect(state.searchIdeas).toHaveBeenCalledWith("database", "owner-1", {
      ...defaultLibraryQuery,
      kinds: ["sermon", "point"],
      statuses: ["idea", "ready"],
      sermonTypes: ["topical", "expository"],
      tagIds: [a, b],
      tagMode: "all",
    });
  });

  it("shows the filters in force and how many ideas match", async () => {
    state.ideas = [sermon];
    state.tags = [faith];
    render(await library({ kind: "sermon", tag: faith.id, q: "grace" }));
    expect(screen.getByText("1 matching idea")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toHaveValue("grace");
    expect(
      within(screen.getByRole("list", { name: "Active filters" }))
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["KindSermon idea", "TagFaith"]);
    // Each idea remembers the library it was found in.
    expect(screen.getByRole("link", { name: sermon.title })).toHaveAttribute(
      "href",
      `/library/${id}?from=${encodeURIComponent(`q=grace&kind=sermon&tag=${faith.id}`)}`,
    );
  });

  it("falls back to the defaults for parameters that make no sense", async () => {
    render(
      await library({
        kind: "series",
        sort: "id; drop table ideas",
        page: "-4",
        tag: ["x", "y"],
        tag_mode: "every",
      }),
    );
    expect(state.searchIdeas).toHaveBeenCalledWith("database", "owner-1", defaultLibraryQuery);
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  });

  it("says so when a search finds nothing, and offers to clear it", async () => {
    render(await library({ q: "nothing like this", sort: "title-asc" }));
    expect(screen.getByRole("heading", { name: "No ideas match your search" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).not.toBeInTheDocument();
    expect(screen.getByText(/“nothing like this”/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?sort=title-asc",
    );
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
    // The controls stay, so the search can be changed where it is.
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toHaveValue(
      "nothing like this",
    );
  });

  it("says so when filters find nothing, without calling the library empty", async () => {
    render(await library({ kind: "point", status: "ready" }));
    expect(screen.getByRole("heading", { name: "No ideas match these filters" })).toBeVisible();
    expect(screen.getByText(/Your library has ideas, but none fits/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
    expect(screen.queryByRole("link", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("offers to clear the search or the filters separately when both are in force", async () => {
    render(await library({ q: "grace", kind: "point" }));
    // Clearing the filters keeps the search; clearing the search keeps the filters.
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?q=grace",
    );
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?kind=point",
    );
  });

  it("explains a date range that cannot match anything", async () => {
    render(await library({ created_from: "2026-03-01", created_to: "2026-01-01" }));
    expect(screen.getByText(/A date range ends before it starts/)).toBeVisible();
  });

  it("says which ideas are showing when there is more than one page", async () => {
    state.ideas = [sermon];
    state.paging = { total: 126, page: 2, totalPages: 6 };
    const { unmount } = render(await library({ page: "2" }));
    expect(screen.getByText("Showing 25–48 of 126 ideas")).toBeVisible();
    unmount();

    state.paging = { total: 126, page: 6, totalPages: 6 };
    render(await library({ page: "6", status: "ready" }));
    expect(screen.getByText("Showing 121–126 of 126 matching ideas")).toBeVisible();
  });

  it("links to the pages on either side, keeping the search and filters", async () => {
    state.ideas = [sermon];
    state.paging = { total: 120, page: 2, totalPages: 5 };
    const { unmount } = render(await library({ q: "grace", kind: "sermon", page: "2" }));

    expect(screen.getByText("Showing 25–48 of 120 matching ideas")).toBeVisible();
    const pages = screen.getByRole("navigation", { name: "Library pages" });
    expect(pages).toHaveTextContent("Page 2 of 5");
    expect(within(pages).getByRole("link", { name: "Page 4" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?q=grace&kind=sermon&page=4",
    );
    // Page 1 is the address without a page.
    expect(within(pages).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?q=grace&kind=sermon",
    );
    expect(within(pages).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?q=grace&kind=sermon&page=3",
    );
    unmount();

    // The page shown is the one the query returned, here the last, whatever was asked for.
    state.paging = { total: 120, page: 5, totalPages: 5 };
    render(await library({ page: "99" }));
    const last = screen.getByRole("navigation", { name: "Library pages" });
    expect(within(last).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?page=4",
    );
    expect(within(last).queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("recording from the library", () => {
  const point = {
    ...sermon,
    id: "22222222-2222-4222-8222-222222222222",
    kind: "point",
    title: "A point",
  };
  const kept = {
    ...sermon,
    id: "33333333-3333-4333-8333-333333333333",
    title: "An old favorite",
    archivedAt: new Date("2026-10-05T10:00:00Z"),
  };

  it("offers it on a sermon, archived or not, and on no other kind of idea", async () => {
    state.ideas = [sermon, point, kept];
    render(await library({ archived: "all" }));
    const card = (title: string) =>
      screen.getByRole("link", { name: title }).closest("li") as HTMLElement;
    const [first, second, third] = [sermon.title, "A point", "An old favorite"].map(card);
    expect(
      within(first).getByRole("button", { name: `Record preaching of ${sermon.title}` }),
    ).toBeVisible();
    expect(within(second).queryByRole("button", { name: /Record preaching/ })).toBeNull();
    expect(
      within(third).getByRole("button", { name: "Record preaching of An old favorite" }),
    ).toBeVisible();
    // Nothing about preaching is read to list ideas.
    expect(state.listForSermon).not.toHaveBeenCalled();
  });

  it("opens the form for that sermon without leaving the library", async () => {
    state.ideas = [sermon, kept];
    render(await library({ archived: "all" }));
    fireEvent.click(screen.getByRole("button", { name: "Record preaching of An old favorite" }));
    const dialog = await screen.findByRole("dialog", { name: "Record preaching" });
    expect(dialog).toHaveTextContent("An old favorite");
    expect(within(dialog).queryByRole("search")).not.toBeInTheDocument();
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
    // Its classifications, in one line until the section is opened.
    expect(screen.getByRole("button", { name: /Classification & Status/ })).toHaveTextContent(
      "Developing · Expository",
    );
    // Each reference is a row that opens its text in place, and leads to the Bible and back.
    expect(screen.getAllByRole("button", { name: /show the passage/ })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: /in the Bible$/ })) {
      expect(link.getAttribute("href")).toContain(`idea=${id}`);
    }
    expect(screen.getByRole("link", { name: "Back to Sermon Ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
    // The tags it has now are what the editor starts from.
    expect(state.listTags).toHaveBeenCalledWith("database", "owner-1");
    expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("Faith");
  });

  it("leads back to the library it was opened from", async () => {
    state.idea = sermon;
    render(await open(id, { from: "q=grace&kind=sermon&page=2" }));
    expect(screen.getByRole("link", { name: "Back to Sermon Ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?q=grace&kind=sermon&page=2",
    );
  });

  it("never leads anywhere but the library", async () => {
    state.idea = sermon;
    for (const from of ["https://evil.example", "//evil.example/x", "javascript:alert(1)"]) {
      const { unmount } = render(await open(id, { from }));
      expect(screen.getByRole("link", { name: "Back to Sermon Ideas" })).toHaveAttribute(
        "href",
        "/library/sermon-ideas",
      );
      unmount();
    }
    render(await open(id, { from: ["q=a", "q=b"] }));
    expect(screen.getByRole("link", { name: "Back to Sermon Ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
  });

  const occasion = (preachedOn: string, kind = "sermon") => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${preachedOn.replaceAll("-", "").padStart(12, "0")}`,
    ownerId: "owner-1",
    sermonId: id,
    preachedOn,
    timeOfDay: null,
    venueId: null,
    contextId: null,
    actualFormat: "unspecified",
    durationMinutes: null,
    notes: null,
    recordingUrl: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    sermon: { id, title: sermon.title, kind, archivedAt: null },
    venue: null,
    context: null,
  });
  const history = () => within(screen.getByRole("region", { name: "Preaching record" }));

  it("gives a sermon its preaching history, counted from the owner's own records", async () => {
    state.idea = sermon;
    state.occasions = [occasion("2026-10-04"), occasion("2026-09-27")];
    state.preached = 9;
    render(await open(id));
    // The latest few and the count come from one owner-scoped query.
    expect(state.listForSermon).toHaveBeenCalledTimes(1);
    expect(state.listForSermon).toHaveBeenCalledWith("database", "owner-1", id, 1, 5);
    expect(history().getByText("Preached 9 times, most recently on Oct 4, 2026.")).toBeVisible();
    expect(history().getAllByRole("listitem")).toHaveLength(2);
    expect(history().getByRole("button", { name: "Record preaching" })).toBeVisible();
    expect(history().getByRole("link", { name: "View all 9" })).toHaveAttribute(
      "href",
      `/library/preaching-record?sermon=${id}`,
    );
  });

  it("offers to record a sermon never preached, and one that is archived", async () => {
    state.idea = sermon;
    const first = render(await open(id));
    expect(history().getByText("Not recorded as preached yet.")).toBeVisible();
    expect(history().getByRole("button", { name: "Record preaching" })).toBeVisible();
    first.unmount();

    // Archived, it is still a sermon, and may still have been preached.
    state.idea = { ...sermon, archivedAt: new Date("2026-10-05T10:00:00Z") };
    state.occasions = [occasion("2026-10-04")];
    render(await open(id));
    expect(history().getByText("Preached once, on Oct 4, 2026.")).toBeVisible();
    expect(history().getByRole("button", { name: "Record preaching" })).toBeVisible();
  });

  it("offers to record a sermon from the head of its page, and nothing else", async () => {
    state.idea = sermon;
    const first = render(await open(id));
    const header = within(screen.getByRole("banner"));
    fireEvent.click(header.getByRole("button", { name: "Record preaching" }));
    // For this sermon: it is named, and there is no other to choose.
    const dialog = await screen.findByRole("dialog", { name: "Record preaching" });
    expect(dialog).toHaveTextContent(sermon.title);
    expect(within(dialog).queryByRole("search")).not.toBeInTheDocument();
    first.unmount();

    state.idea = { ...sermon, kind: "undecided" };
    render(await open(id));
    expect(screen.queryByRole("button", { name: "Record preaching" })).not.toBeInTheDocument();
  });

  it("shows no preaching history on an idea that is not a sermon and never was preached", async () => {
    state.idea = { ...sermon, kind: "point" };
    render(await open(id));
    expect(screen.queryByRole("region", { name: "Preaching record" })).not.toBeInTheDocument();
  });

  it("keeps the history of a sermon since refiled, and records nothing new on it", async () => {
    state.idea = { ...sermon, kind: "point" };
    state.occasions = [occasion("2026-10-04", "point")];
    render(await open(id));
    expect(history().getByText("Preached once, on Oct 4, 2026.")).toBeVisible();
    expect(history().getAllByRole("listitem")).toHaveLength(1);
    expect(history().queryByRole("button", { name: "Record preaching" })).not.toBeInTheDocument();
    expect(
      history().getByText(/new preaching cannot be recorded. Its record is kept./),
    ).toBeVisible();
  });
});
