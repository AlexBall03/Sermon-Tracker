import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper is mocked, and the Clerk-backed sections are replaced by markers.
const state = vi.hoisted(() => ({
  access: "active" as "active" | "signed-out" | "denied",
  role: "user" as "user" | "admin",
  profile: {} as Record<string, unknown>,
  pathname: "/settings",
  replace: vi.fn(),
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
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/settings/components/account-sections", () => ({
  ProfileSettings: () => <div>profile controls</div>,
  SecuritySettings: () => <div>security controls</div>,
}));
vi.mock("@/features/settings/components/appearance-settings", () => ({
  AppearanceSettings: () => <div>appearance controls</div>,
}));
vi.mock("@/features/offline/components/offline-storage-settings", () => ({
  OfflineStorageSettings: () => <div>offline controls</div>,
}));
vi.mock("@/features/offline/components/sync-settings", () => ({
  SyncSettings: () => <div>sync status</div>,
}));
vi.mock("@/features/preferences/actions", () => ({
  updateProfile: vi.fn(),
  setLocale: vi.fn(),
  setBibleTranslation: vi.fn(),
}));

import { SettingsNav } from "@/features/settings/components/settings-nav";
import { testPreferences } from "@/features/preferences/testing";
import { I18nProvider } from "@/i18n/client";
import AccountSettingsPage from "./account/page";
import AppSettingsPage from "./app/page";
import AppearanceSettingsPage from "./appearance/page";
import BibleSettingsPage from "./bible/page";
import OfflineSettingsPage from "./offline/page";
import SettingsPage from "./page";
import ProfileSettingsPage from "./profile/page";
import SyncSettingsPage from "./sync/page";

const pages = [
  SettingsPage,
  ProfileSettingsPage,
  BibleSettingsPage,
  AppearanceSettingsPage,
  AppSettingsPage,
  OfflineSettingsPage,
  SyncSettingsPage,
  AccountSettingsPage,
];

/** A page as the settings layout frames it: in the language the account reads. */
function show(page: React.ReactNode) {
  return render(<I18nProvider locale={testPreferences.locale}>{page}</I18nProvider>);
}

beforeEach(() => {
  Object.assign(state, { access: "active", role: "user", profile: {}, pathname: "/settings" });
  state.replace.mockReset();
  window.history.replaceState(null, "", "/settings");
});

describe("Settings", () => {
  it("requires an active account on the overview and on every category", async () => {
    for (const Page of pages) {
      state.access = "signed-out";
      await expect(Page()).rejects.toThrow("redirect:/sign-in");
      state.access = "denied";
      await expect(Page()).rejects.toThrow("redirect:/access-denied");
    }
  });

  it("lists its seven categories on the overview, each leading to its page, then Help & Feedback", async () => {
    show(await SettingsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      [expect.stringContaining("Profile"), "/settings/profile"],
      [expect.stringContaining("Bible & Language"), "/settings/bible"],
      [expect.stringContaining("Appearance"), "/settings/appearance"],
      [expect.stringContaining("App & Experience"), "/settings/app"],
      [expect.stringContaining("Offline Storage"), "/settings/offline"],
      [expect.stringContaining("Synchronization"), "/settings/sync"],
      [expect.stringContaining("Account & Security"), "/settings/account"],
      [expect.stringContaining("Help & Feedback"), "/support"],
    ]);
  });

  it("names them in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    show(await SettingsPage());
    for (const name of [
      "Perfil",
      "Biblia e idioma",
      "Aplicación y experiencia",
      "Cuenta y seguridad",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("sends an address from the single page on to the category that holds it", async () => {
    window.history.replaceState(null, "", "/settings#install");
    show(await SettingsPage());
    expect(state.replace).toHaveBeenCalledWith("/settings/app#install");
  });

  it("stays on the overview for no hash or one it does not know", async () => {
    for (const hash of ["", "#nothing", "#constructor"]) {
      window.history.replaceState(null, "", `/settings${hash}`);
      const view = show(await SettingsPage());
      view.unmount();
    }
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("marks the category being shown in the sidebar, and none on the overview", () => {
    state.pathname = "/settings/offline";
    const view = render(
      <I18nProvider locale="en">
        <SettingsNav />
      </I18nProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Settings categories" });
    expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("Offline Storage");
    view.unmount();
    state.pathname = "/settings";
    render(
      <I18nProvider locale="en">
        <SettingsNav />
      </I18nProvider>,
    );
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("offers install, the tour again, and account setup again under App & Experience", async () => {
    show(await AppSettingsPage());
    expect(screen.getByRole("region", { name: "Install the app" })).toHaveAttribute(
      "id",
      "install",
    );
    // A button that starts the tour where it is shown; not a link, and not a form.
    expect(screen.getByRole("button", { name: "Restart Product Tour" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tour/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run Account Setup" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });

  it("shows the church, the ministry role, and preaching class as the account saved them", async () => {
    state.profile = {
      churchName: "Grace Baptist Church",
      ministryRole: "Evangelist",
      attendsPreachingClass: true,
    };
    show(await ProfileSettingsPage());
    expect(screen.getByText("profile controls")).toBeInTheDocument();
    const ministry = within(screen.getByRole("region", { name: "Church & Ministry" }));
    expect(ministry.getByLabelText("Church name (optional)")).toHaveValue("Grace Baptist Church");
    expect(ministry.getByLabelText("Ministry role (optional)")).toHaveValue("Evangelist");
    expect(ministry.getByRole("switch", { name: "I attend preaching class" })).toBeChecked();
  });

  it("starts an account that has said nothing with empty lines and the switch off", async () => {
    show(await ProfileSettingsPage());
    const ministry = within(screen.getByRole("region", { name: "Church & Ministry" }));
    expect(ministry.getByLabelText("Church name (optional)")).toHaveValue("");
    expect(ministry.getByRole("switch", { name: "I attend preaching class" })).not.toBeChecked();
  });

  it("keeps the language, the translation, and the reader's copy shortcut together", async () => {
    show(await BibleSettingsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Bible & Language" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Interface language" })).toBeInTheDocument();
    expect(screen.getByText("Bible translation", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Copy shortcut" })).toBeInTheDocument();
  });

  it("gives appearance and offline storage their own pages", async () => {
    show(await AppearanceSettingsPage());
    expect(screen.getByText("appearance controls")).toBeInTheDocument();
    show(await OfflineSettingsPage());
    expect(screen.getByText("offline controls")).toBeInTheDocument();
  });

  it("shows where this device's synchronization stands", async () => {
    show(await SyncSettingsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Synchronization" })).toBeInTheDocument();
    expect(screen.getByText("sync status")).toBeInTheDocument();
  });

  it("shows role, status, and joining date with nothing to change them", async () => {
    state.role = "admin";
    show(await AccountSettingsPage());
    const access = screen.getByRole("region", { name: "Your access" });
    expect(within(access).getByText("Administrator")).toBeInTheDocument();
    expect(within(access).getByText("Active")).toBeInTheDocument();
    expect(within(access).getByText("Oct 1, 2026")).toBeInTheDocument();
    // The sign-in controls are beside them (a marker here); nothing changes a role or a status.
    expect(screen.getByText("security controls")).toBeInTheDocument();
    for (const role of ["button", "textbox", "combobox", "checkbox", "radio", "switch", "link"]) {
      expect(within(access).queryAllByRole(role)).toHaveLength(0);
    }
  });

  it("leads back to the overview from a category on a narrow screen", async () => {
    show(await AppearanceSettingsPage());
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
