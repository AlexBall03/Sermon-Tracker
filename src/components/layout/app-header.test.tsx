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

// jsdom has no matchMedia. The listeners are kept so a test can cross the breakpoint.
const mediaListeners = new Set<(event: { matches: boolean }) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  state.pathname = "/admin";
  mediaListeners.clear();
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.delete(listener),
    }) as unknown as MediaQueryList;
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

  it("has labelled account controls for both layouts", () => {
    render(<AppHeader isAdmin />);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open account menu" })).toHaveAttribute(
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

  it("shows the tab bar only when there is more than one destination", () => {
    const { unmount } = render(<AppHeader isAdmin={false} />);
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
    unmount();

    render(<AppHeader isAdmin />);
    const tabs = screen.getByRole("navigation", { name: "Sections" });
    expect(within(tabs).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(within(tabs).getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers administration from the mobile account sheet to administrators only", () => {
    const { unmount } = render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
    unmount();

    render(<AppHeader isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  });

  it("sends account management to our settings page from the mobile account sheet", () => {
    state.pathname = "/settings";
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Manage account")).not.toBeInTheDocument();

    // jsdom cannot navigate; the panel's own click handler still runs.
    settings.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(settings);
    expect(state.openUserProfile).not.toHaveBeenCalled();
    // Following the link closes the panel.
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeInTheDocument();
  });

  it("still signs out from the mobile account sheet, and Escape closes it", () => {
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(state.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });

    fireEvent.keyDown(document, { key: "Escape" });
    const toggle = screen.getByRole("button", { name: "Open account menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("keeps a closing mobile sheet inert until its exit animation ends", () => {
    vi.useFakeTimers();
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    const panel = document.getElementById("app-account-sheet")!;
    expect(panel).toHaveClass("animate-sheet");
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close account menu" }));
    expect(panel).toHaveClass("animate-sheet-out");
    expect(panel).toHaveAttribute("inert");

    // Reopening mid-exit keeps the same panel and cancels the removal.
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    act(() => void vi.advanceTimersByTime(500));
    expect(panel).toBeInTheDocument();
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close account menu" }));
    act(() => void vi.advanceTimersByTime(500));
    expect(panel).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("closes the mobile account sheet when the window widens past the breakpoint", () => {
    render(<AppHeader isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(document.getElementById("app-account-sheet")).toBeInTheDocument();

    act(() => mediaListeners.forEach((listener) => listener({ matches: true })));
    // Removed at once: a hidden panel would keep the bar opaque.
    expect(document.getElementById("app-account-sheet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open account menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
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
    // The theme is chosen here on desktop; the bar has no separate control.
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Colour theme" })).not.toBeInTheDocument();
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
