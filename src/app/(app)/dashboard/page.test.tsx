import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper, Clerk, and the idea query are mocked: this covers what the page does with their answers.
const state = vi.hoisted(() => ({
  ideas: [] as unknown[],
  revisit: [] as unknown[],
  recentIdeas: vi.fn(),
  revisitIdeas: vi.fn(),
  listVenues: vi.fn(),
  role: "user" as "user" | "admin",
  firstName: "Ada" as string | null,
  clerkDown: false,
  signedIn: true,
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return {
      id: "1",
      clerkUserId: "user_1",
      role: state.role,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () => {
    if (state.clerkDown) throw new Error("unreachable");
    return { firstName: state.firstName };
  },
}));

vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/ideas", () => ({
  recentIdeas: async (...args: unknown[]) => {
    state.recentIdeas(...args);
    return state.ideas;
  },
  revisitIdeas: async (...args: unknown[]) => {
    state.revisitIdeas(...args);
    return state.revisit;
  },
}));
vi.mock("@/features/preaching/venues", () => ({
  listVenues: async (...args: unknown[]) => {
    state.listVenues(...args);
    return [];
  },
}));
vi.mock("@/features/preaching/contexts", () => ({ listContexts: async () => [] }));
vi.mock("@/features/preaching/actions", () => ({
  recordOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  createVenue: vi.fn(),
  createContext: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import DashboardPage from "./page";

const idea = (id: string, title: string, kind: string) => ({
  id,
  ownerId: "1",
  kind,
  title,
  notes: null,
  status: "idea",
  sermonType: "unspecified",
  subject: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  references: [
    {
      book: 43,
      chapterStart: 3,
      verseStart: 16,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: false,
    },
  ],
  tags: [],
});

beforeEach(() => {
  Object.assign(state, {
    role: "user",
    firstName: "Ada",
    clerkDown: false,
    signedIn: true,
    ideas: [],
    revisit: [],
  });
  state.recentIdeas.mockClear();
  state.revisitIdeas.mockClear();
});

describe("DashboardPage", () => {
  it("refuses to render without an active account", async () => {
    state.signedIn = false;
    await expect(DashboardPage()).rejects.toThrow("redirect:/sign-in");
  });

  it("welcomes the person by first name", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Ada" })).toBeVisible();
  });

  it("falls back when there is no name, or the name cannot be read", async () => {
    state.firstName = null;
    const { unmount } = render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    unmount();

    Object.assign(state, { firstName: "Ada", clerkDown: true });
    render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });

  it("leaves settings and administration to the account menu, for an administrator too", async () => {
    state.role = "admin";
    render(await DashboardPage());
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Administration/ })).not.toBeInTheDocument();
  });

  it("offers to record preaching from here, with the sermon chosen in the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }))),
    );
    render(await DashboardPage());
    // The form's lists are the signed-in account's own.
    expect(state.listVenues).toHaveBeenCalledWith("database", "1");
    // One of the page's actions, beside its title.
    const header = within(screen.getByRole("banner"));
    fireEvent.click(header.getByRole("button", { name: "Record preaching" }));
    // The same form as the preaching record's, with no sermon chosen yet.
    const dialog = await screen.findByRole("dialog", { name: "Record preaching" });
    expect(within(dialog).getByRole("search")).toBeVisible();
    // The dashboard is still the page.
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back, Ada", hidden: true }),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("invites a first capture when there are no ideas", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("heading", { name: "No ideas yet" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Capture an idea" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Recent ideas" })).not.toBeInTheDocument();
  });

  it("lists the signed-in person's latest ideas, each linked to its page", async () => {
    state.ideas = [
      idea("a1", "His Grace is Sufficient", "sermon"),
      idea("b2", "Faith speaks", "point"),
    ];
    render(await DashboardPage());

    // The owner comes from the session, and only a handful are read.
    expect(state.recentIdeas).toHaveBeenCalledWith("database", "1", 5);
    const recent = screen.getByRole("list", { name: "Recent ideas" });
    expect(within(recent).getByRole("link", { name: "His Grace is Sufficient" })).toHaveAttribute(
      "href",
      "/library/a1",
    );
    expect(within(recent).getByRole("link", { name: "Faith speaks" })).toHaveAttribute(
      "href",
      "/library/b2",
    );
    expect(within(recent).getAllByRole("button", { name: /John 3:16/ })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open the library" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
  });

  it("offers the sermon ideas the server chose to revisit, each with its status and why", async () => {
    state.ideas = [idea("a1", "His Grace is Sufficient", "sermon")];
    state.revisit = [
      idea("a1", "His Grace is Sufficient", "sermon"),
      {
        ...idea("c3", "The Still Small Voice", "sermon"),
        status: "on_hold",
        lastDevelopedAt: new Date("2026-08-03T10:00:00Z"),
      },
    ];
    render(await DashboardPage());

    // The owner comes from the session; which ideas and how many is the query's business.
    expect(state.revisitIdeas).toHaveBeenCalledWith("database", "1");
    const section = within(screen.getByRole("region", { name: "Revisit an Idea" }));
    const [never, held] = within(
      section.getByRole("list", { name: "Revisit an Idea" }),
    ).getAllByRole("listitem");
    expect(within(never).getByRole("link", { name: "His Grace is Sufficient" })).toHaveAttribute(
      "href",
      "/library/a1",
    );
    expect(never).toHaveTextContent("Status: Idea");
    expect(never).toHaveTextContent(/Never developed.*created Oct 1, 2026/);
    expect(within(held).getByRole("link", { name: "The Still Small Voice" })).toHaveAttribute(
      "href",
      "/library/c3",
    );
    expect(held).toHaveTextContent("Status: On Hold");
    expect(held).toHaveTextContent("Last developed Aug 3, 2026");
    expect(section.getByRole("link", { name: "See all that need attention" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?revisit=attention",
    );
  });

  it("says so, and leads to the library, when no idea needs revisiting", async () => {
    state.ideas = [idea("b2", "Faith speaks", "point")];
    render(await DashboardPage());
    const section = within(screen.getByRole("region", { name: "Revisit an Idea" }));
    expect(section.getByText(/Nothing is waiting on you.*last 30 days/)).toBeVisible();
    expect(section.queryByRole("list")).not.toBeInTheDocument();
    expect(section.getByRole("link", { name: "Open Sermon Ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
  });

  it("leaves the section out when there is no active idea at all", async () => {
    render(await DashboardPage());
    expect(screen.queryByRole("region", { name: "Revisit an Idea" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No ideas yet" })).toBeVisible();
  });

  it("names the future figures without showing any number", async () => {
    render(await DashboardPage());
    const summary = screen.getByRole("region", { name: "At a glance" });
    for (const label of ["Sermon ideas", "Point ideas", "In development", "Times preached"]) {
      expect(summary).toHaveTextContent(label);
    }
    expect(summary.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole("link", { name: /analytics/i })).not.toBeInTheDocument();
  });
});
