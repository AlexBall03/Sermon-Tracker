import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper and the idea queries are mocked: this covers what the pages do with their answers.
const state = vi.hoisted(() => ({
  signedIn: true,
  ideas: [] as unknown[],
  idea: null as unknown,
  listIdeas: vi.fn(),
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
  libraryLimit: 200,
  listIdeas: async (...args: unknown[]) => {
    state.listIdeas(...args);
    return state.ideas;
  },
  getIdea: async (...args: unknown[]) => {
    state.getIdea(...args);
    return state.idea;
  },
}));

import IdeaPage from "./[id]/page";
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

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { signedIn: true, ideas: [], idea: null });
});

describe("LibraryPage", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(LibraryPage()).rejects.toThrow("redirect:/sign-in");
    expect(state.listIdeas).not.toHaveBeenCalled();
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

    expect(state.listIdeas).toHaveBeenCalledWith("database", "owner-1");
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
