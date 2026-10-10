import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper and Clerk are mocked: this covers what the page does with their answers.
const state = vi.hoisted(() => ({
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

import DashboardPage from "./page";

beforeEach(() => {
  Object.assign(state, { role: "user", firstName: "Ada", clerkDown: false, signedIn: true });
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
