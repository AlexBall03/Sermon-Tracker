import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Clerk is mocked. `openUserProfile` is a spy so the test can prove it is never used.
const state = vi.hoisted(() => ({
  pathname: "/admin",
  openUserProfile: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      fullName: "Ada Admin",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
      hasImage: false,
      imageUrl: "",
    },
  }),
  useClerk: () => ({ openUserProfile: state.openUserProfile, signOut: state.signOut }),
}));

import { initialsOf } from "./account-menu";
import { AppHeader } from "./app-header";

beforeEach(() => {
  vi.clearAllMocks();
  state.pathname = "/admin";
});

describe("AppHeader", () => {
  it("shows the admin link only to administrators", () => {
    const { unmount } = render(<AppHeader isAdmin={false} />);
    const nav = () => screen.getByRole("navigation", { name: "Application" });
    expect(within(nav()).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    unmount();

    render(<AppHeader isAdmin />);
    expect(within(nav()).getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("has labelled account, theme, and mobile menu controls", () => {
    render(<AppHeader isAdmin />);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Colour theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("lists only destinations that exist", () => {
    render(<AppHeader isAdmin />);
    for (const name of [/library/i, /history/i, /analytics/i]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("sends account management to our settings page from the mobile menu", () => {
    state.pathname = "/settings";
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Manage account")).not.toBeInTheDocument();

    // jsdom cannot navigate; the panel's own click handler still runs.
    settings.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(settings);
    expect(state.openUserProfile).not.toHaveBeenCalled();
    // Following the link closes the panel.
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("still signs out from the mobile menu, and Escape closes it", () => {
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(state.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });

    fireEvent.keyDown(document, { key: "Escape" });
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("keeps a closing mobile menu inert until its exit animation ends", () => {
    vi.useFakeTimers();
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const panel = document.getElementById("app-mobile-nav")!;
    expect(panel).toHaveClass("animate-menu");
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(panel).toHaveClass("animate-menu-out");
    expect(panel).toHaveAttribute("inert");

    // Reopening mid-exit keeps the same panel and cancels the removal.
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    act(() => void vi.advanceTimersByTime(500));
    expect(panel).toBeInTheDocument();
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    act(() => void vi.advanceTimersByTime(500));
    expect(panel).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("sends account management to our settings page from the account menu", async () => {
    render(<AppHeader isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const settings = await screen.findByRole("menuitem", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /manage account/i })).not.toBeInTheDocument();
  });
});

describe("initialsOf", () => {
  it("takes up to two initials from a name or an email address", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("ada@example.com")).toBe("AE");
    expect(initialsOf("")).toBe("?");
  });
});
