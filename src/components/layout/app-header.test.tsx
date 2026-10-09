import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: { fullName: "Ada Admin", primaryEmailAddress: { emailAddress: "ada@example.com" } },
  }),
  useClerk: () => ({ openUserProfile: vi.fn(), signOut: vi.fn() }),
}));

import { AppHeader } from "./app-header";

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
});
