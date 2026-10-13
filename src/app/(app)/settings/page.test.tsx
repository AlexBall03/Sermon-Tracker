import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper is mocked, and the Clerk-backed sections are replaced by markers.
const state = vi.hoisted(() => ({
  access: "active" as "active" | "signed-out" | "denied",
  role: "user" as "user" | "admin",
  profile: {} as Record<string, unknown>,
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
      ...state.profile,
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

vi.mock("@/features/preferences/actions", () => ({
  updateProfile: vi.fn(),
  setLocale: vi.fn(),
  setBibleTranslation: vi.fn(),
}));

import { testPreferences } from "@/features/preferences/testing";
import SettingsPage from "./page";

beforeEach(() => {
  Object.assign(state, { access: "active", role: "user", profile: {} });
});

describe("SettingsPage", () => {
  it("requires an active account", async () => {
    state.access = "signed-out";
    await expect(SettingsPage()).rejects.toThrow("redirect:/sign-in");
    state.access = "denied";
    await expect(SettingsPage()).rejects.toThrow("redirect:/access-denied");
  });

  it("has its five sections, in order", async () => {
    render(await SettingsPage());
    expect(
      screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby")),
    ).toEqual([
      "personal-heading",
      "ministry-heading",
      "bible-language-heading",
      "appearance-heading",
      "account-heading",
    ]);
    for (const name of [
      "Personal Information",
      "Church & Ministry",
      "Bible & Language",
      "Appearance & Experience",
      "Account",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("names them in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    render(await SettingsPage());
    for (const name of [
      "Información personal",
      "Iglesia y ministerio",
      "Biblia e idioma",
      "Apariencia y experiencia",
      "Cuenta",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("shows the church, the ministry role, and preaching class as the account saved them", async () => {
    state.profile = {
      churchName: "Grace Baptist Church",
      ministryRole: "Evangelist",
      attendsPreachingClass: true,
    };
    render(await SettingsPage());
    const ministry = within(screen.getByRole("region", { name: "Church & Ministry" }));
    expect(ministry.getByLabelText("Church name (optional)")).toHaveValue("Grace Baptist Church");
    expect(ministry.getByLabelText("Ministry role (optional)")).toHaveValue("Evangelist");
    expect(ministry.getByRole("switch", { name: "I attend preaching class" })).toBeChecked();
  });

  it("starts an account that has said nothing with empty lines and the switch off", async () => {
    render(await SettingsPage());
    const ministry = within(screen.getByRole("region", { name: "Church & Ministry" }));
    expect(ministry.getByLabelText("Church name (optional)")).toHaveValue("");
    expect(ministry.getByRole("switch", { name: "I attend preaching class" })).not.toBeChecked();
  });

  it("keeps the language, the translation, and the reader's copy shortcut together", async () => {
    render(await SettingsPage());
    const bible = within(screen.getByRole("region", { name: "Bible & Language" }));
    expect(bible.getByRole("group", { name: "Interface language" })).toBeInTheDocument();
    expect(bible.getByText("Bible translation", { selector: "p" })).toBeInTheDocument();
    expect(bible.getByRole("group", { name: "Copy shortcut" })).toBeInTheDocument();
  });

  it("shows role, status, and joining date with nothing to change them", async () => {
    state.role = "admin";
    render(await SettingsPage());
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("Administrator")).toBeInTheDocument();
    expect(within(account).getByText("Active")).toBeInTheDocument();
    expect(within(account).getByText("Oct 1, 2026")).toBeInTheDocument();
    // The sign-in controls are beside them (a marker here); nothing changes a role or a status.
    expect(within(account).getByText("security controls")).toBeInTheDocument();
    for (const role of ["button", "textbox", "combobox", "checkbox", "radio", "switch", "link"]) {
      expect(within(account).queryAllByRole(role)).toHaveLength(0);
    }
  });
});
