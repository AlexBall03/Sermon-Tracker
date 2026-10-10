import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper, Clerk, and the idea query are mocked: this covers what the page does with their answers.
const state = vi.hoisted(() => ({
  ideas: [] as unknown[],
  recentIdeas: vi.fn(),
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
}));

import DashboardPage from "./page";

const idea = (id: string, title: string, kind: string) => ({
  id,
  ownerId: "1",
  kind,
  title,
  notes: null,
  status: "captured",
  sermonType: null,
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
});

beforeEach(() => {
  Object.assign(state, {
    role: "user",
    firstName: "Ada",
    clerkDown: false,
    signedIn: true,
    ideas: [],
  });
  state.recentIdeas.mockClear();
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

  it("links to settings for everyone and to administration only for administrators", async () => {
    const { unmount } = render(await DashboardPage());
    expect(screen.getByRole("link", { name: /Account settings/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByRole("link", { name: /Administration/ })).not.toBeInTheDocument();
    unmount();

    state.role = "admin";
    render(await DashboardPage());
    expect(screen.getByRole("link", { name: /Administration/ })).toHaveAttribute("href", "/admin");
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
      "/library",
    );
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
