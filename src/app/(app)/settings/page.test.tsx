import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper is mocked, and the Clerk-backed sections are replaced by markers.
const state = vi.hoisted(() => ({
  access: "active" as "active" | "signed-out" | "denied",
  role: "user" as "user" | "admin",
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (state.access === "signed-out") throw new Error("redirect:/sign-in");
    if (state.access === "denied") throw new Error("redirect:/access-denied");
    return {
      id: "1",
      clerkUserId: "user_1",
      role: state.role,
      status: "active",
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date(),
    };
  },
}));
vi.mock("@/features/settings/components/account-sections", () => ({
  ProfileSettings: () => <div>profile controls</div>,
  SecuritySettings: () => <div>security controls</div>,
}));
vi.mock("@/features/settings/components/appearance-settings", () => ({
  AppearanceSettings: () => <div>appearance controls</div>,
}));

import SettingsPage from "./page";

beforeEach(() => {
  Object.assign(state, { access: "active", role: "user" });
});

describe("SettingsPage", () => {
  it("requires an active account", async () => {
    state.access = "signed-out";
    await expect(SettingsPage()).rejects.toThrow("redirect:/sign-in");
    state.access = "denied";
    await expect(SettingsPage()).rejects.toThrow("redirect:/access-denied");
  });

  it("has its five sections", async () => {
    render(await SettingsPage());
    for (const name of ["Profile", "Security", "Appearance", "Bible", "Account"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("shows role, status, and joining date with nothing to change them", async () => {
    state.role = "admin";
    render(await SettingsPage());
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("Administrator")).toBeInTheDocument();
    expect(within(account).getByText("Active")).toBeInTheDocument();
    expect(within(account).getByText("Oct 1, 2026")).toBeInTheDocument();
    for (const role of ["button", "textbox", "combobox", "checkbox", "radio", "link"]) {
      expect(within(account).queryAllByRole(role)).toHaveLength(0);
    }
  });
});
