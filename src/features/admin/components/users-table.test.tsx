import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DirectoryEntry } from "../clerk";

vi.mock("../actions", () => ({ setUserRole: vi.fn(), setUserStatus: vi.fn() }));

import { UsersTable } from "./users-table";

const base = { createdAt: new Date("2026-10-01T12:00:00Z"), updatedAt: new Date() };
const entries: DirectoryEntry[] = [
  {
    ...base,
    id: "1",
    clerkUserId: "user_1",
    role: "admin",
    status: "active",
    name: "Ada Admin",
    email: "ada@example.com",
    identityMissing: false,
  },
  {
    ...base,
    id: "2",
    clerkUserId: "user_2",
    role: "user",
    status: "disabled",
    name: null,
    email: null,
    identityMissing: true,
  },
];

describe("UsersTable", () => {
  it("shows each person's role, status, and date", () => {
    render(<UsersTable entries={entries} currentUserId="1" />);
    const row = screen.getByRole("row", { name: /Ada Admin/ });
    // Each badge is rendered twice: in its column, and folded under the name for narrow screens.
    expect(within(row).getAllByText("Admin")).toHaveLength(2);
    expect(within(row).getAllByText("Active")).toHaveLength(2);
    expect(within(row).getByText("Oct 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Sign-in identity removed")).toBeInTheDocument();
    expect(screen.getAllByText("Disabled")).toHaveLength(2);
  });

  it("offers actions for other people but not for the signed-in administrator", () => {
    render(<UsersTable entries={entries} currentUserId="1" />);
    expect(screen.getByRole("button", { name: "Actions for This person" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Ada Admin" })).not.toBeInTheDocument();
  });
});
