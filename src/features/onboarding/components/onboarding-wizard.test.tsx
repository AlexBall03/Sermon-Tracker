import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredProfile } from "@/features/preferences/preferences";
import { resolvePreferences, type StoredPreferences } from "@/features/preferences/resolve";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";

// The server actions are mocked: this covers what the wizard asks of them, and when.
const state = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  setLocale: vi.fn(),
  setBibleTranslation: vi.fn(),
  advanceOnboarding: vi.fn(),
  finishOnboarding: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
}));
vi.mock("@/features/preferences/actions", () => ({
  updateProfile: state.updateProfile,
  setLocale: state.setLocale,
  setBibleTranslation: state.setBibleTranslation,
}));
vi.mock("../actions", () => ({
  advanceOnboarding: state.advanceOnboarding,
  finishOnboarding: state.finishOnboarding,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: state.setTheme }),
}));

import type { OnboardingStep } from "../model";
import { OnboardingWizard } from "./onboarding-wizard";

const empty: StoredProfile = { churchName: null, ministryRole: null, attendsPreachingClass: false };

type Options = {
  mode?: "required" | "review";
  step?: OnboardingStep;
  profile?: Partial<StoredProfile>;
  stored?: Partial<StoredPreferences>;
  spanishEnabled?: boolean;
  locale?: Locale;
};

function show({
  mode = "required",
  step,
  profile = {},
  stored = {},
  spanishEnabled = true,
  locale = "en",
}: Options = {}) {
  const preferences = resolvePreferences(
    { locale, bibleTranslation: null, ...stored },
    spanishEnabled,
  );
  return render(
    <I18nProvider locale={preferences.locale}>
      <OnboardingWizard
        mode={mode}
        initialStep={step}
        profile={{ ...empty, ...profile }}
        preferences={preferences}
        signOut={<button type="button">Sign out</button>}
      />
    </I18nProvider>,
  );
}

const heading = (name: string) => screen.getByRole("heading", { level: 2, name });
const church = () => screen.getByLabelText("Church name (optional)");
const role = () => screen.getByLabelText("Ministry role (optional)");
const attendance = () => screen.getByRole("switch", { name: "I attend preaching class" });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const current = () => screen.getByRole("listitem", { current: "step" });

beforeEach(() => {
  vi.clearAllMocks();
  // The theme control asks whether motion is reduced before it changes the theme.
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  state.updateProfile.mockResolvedValue({ ok: true, message: "Saved." });
  state.setLocale.mockResolvedValue({ ok: true, message: "Saved." });
  state.setBibleTranslation.mockResolvedValue({ ok: true, message: "Saved." });
  state.advanceOnboarding.mockResolvedValue({ ok: true, message: "Progress saved." });
  state.finishOnboarding.mockResolvedValue({ ok: true, message: "Setup is complete." });
});

describe("the welcome step", () => {
  it("says what the application is for, and asks for nothing", () => {
    show();
    expect(heading("One place for every sermon you are working toward")).toBeVisible();
    for (const feature of [
      "Capture",
      "Organize and revisit",
      "Study Scripture",
      "Outline",
      "Record preaching",
    ]) {
      expect(screen.getByText(feature)).toBeVisible();
    }
    expect(
      screen.getByText(/does not replace the place where you write your manuscript/),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    expect(current()).toHaveTextContent("Welcome");
  });

  it("records the next step before showing it", async () => {
    show();
    press("Get Started");
    const next = await screen.findByRole("heading", { name: "Your church and ministry" });
    // The new step is announced by moving to its heading.
    await waitFor(() => expect(next).toHaveFocus());
    expect(state.advanceOnboarding).toHaveBeenCalledExactlyOnceWith("ministry");
    expect(screen.getByText("Step 2 of 4")).toBeVisible();
  });

  it("stays where it is, and says why, when the step cannot be recorded", async () => {
    state.advanceOnboarding.mockResolvedValue({ ok: false, message: "Could not save." });
    show();
    press("Get Started");
    expect(await screen.findByText("Could not save.")).toBeVisible();
    expect(current()).toHaveTextContent("Welcome");
  });
});

describe("the church and ministry step", () => {
  it("starts from what the account has saved, and saves nothing by being shown", () => {
    show({
      step: "ministry",
      profile: {
        churchName: "Grace Baptist Church",
        ministryRole: "Pastor",
        attendsPreachingClass: true,
      },
    });
    expect(church()).toHaveValue("Grace Baptist Church");
    expect(role()).toHaveValue("Pastor");
    expect(attendance()).toBeChecked();
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it("goes on with everything left blank, without sending the blanks", async () => {
    show({ step: "ministry" });
    expect(attendance()).not.toBeChecked();
    press("Continue");
    expect(await screen.findByRole("heading", { name: "Your preferences" })).toBeVisible();
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(state.advanceOnboarding).toHaveBeenCalledExactlyOnceWith("preferences");
  });

  it("saves the three together, tidied, and only then records the step", async () => {
    const order: string[] = [];
    state.updateProfile.mockImplementation(async () => {
      order.push("save");
      return { ok: true, message: "Saved." };
    });
    state.advanceOnboarding.mockImplementation(async () => {
      order.push("advance");
      return { ok: true, message: "Progress saved." };
    });
    show({ step: "ministry" });
    fireEvent.change(church(), { target: { value: "  Grace   Baptist Church " } });
    fireEvent.change(role(), { target: { value: "Evangelist" } });
    fireEvent.click(attendance());
    // Nothing is saved as it is typed or switched.
    expect(state.updateProfile).not.toHaveBeenCalled();
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    expect(state.updateProfile).toHaveBeenCalledExactlyOnceWith({
      churchName: "Grace Baptist Church",
      ministryRole: "Evangelist",
      attendsPreachingClass: true,
    });
    expect(order).toEqual(["save", "advance"]);
  });

  it("keeps what was typed and does not go on when the save is refused", async () => {
    state.updateProfile.mockResolvedValue({
      ok: false,
      message: "Your details could not be saved.",
    });
    show({ step: "ministry" });
    fireEvent.change(church(), { target: { value: "Grace" } });
    press("Continue");
    expect(await screen.findByText("Your details could not be saved.")).toBeVisible();
    expect(church()).toHaveValue("Grace");
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
    expect(current()).toHaveTextContent("Church & Ministry");

    // Corrected and sent again, it goes through.
    state.updateProfile.mockResolvedValue({ ok: true, message: "Saved." });
    press("Continue");
    expect(await screen.findByRole("heading", { name: "Your preferences" })).toBeVisible();
    expect(state.updateProfile).toHaveBeenCalledTimes(2);
  });

  it("keeps what was typed when the server cannot be reached", async () => {
    state.updateProfile.mockRejectedValue(new Error("network"));
    show({ step: "ministry" });
    fireEvent.change(role(), { target: { value: "Pastor" } });
    press("Continue");
    expect(await screen.findByText(/did not reach the server/)).toBeVisible();
    expect(role()).toHaveValue("Pastor");
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
  });

  it("says what is wrong beside the line, without sending", () => {
    show({ step: "ministry" });
    fireEvent.change(role(), { target: { value: "x".repeat(81) } });
    press("Continue");
    expect(screen.getByText("Use 80 characters or fewer for the ministry role.")).toBeVisible();
    expect(role()).toHaveAttribute("aria-invalid", "true");
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
  });

  it("does not save again when Back and Continue are pressed with nothing changed", async () => {
    show({ step: "ministry" });
    fireEvent.change(church(), { target: { value: "Grace" } });
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    press("Back");
    // Back shows what was saved, and writes nothing.
    expect(church()).toHaveValue("Grace");
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    expect(state.updateProfile).toHaveBeenCalledTimes(1);
  });
});

describe("the preferences step", () => {
  it("offers the language, the translation, and the theme", () => {
    show({ step: "preferences" });
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Español" })).not.toBeChecked();
    expect(screen.getByText("Bible translation", { selector: "p" })).toBeVisible();
    for (const theme of ["System", "Light", "Dark"]) {
      expect(screen.getByRole("radio", { name: theme })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
  });

  it("saves a language through the settings action, and a theme in the browser only", async () => {
    show({ step: "preferences" });
    fireEvent.click(screen.getByRole("radio", { name: "Español" }));
    await waitFor(() => expect(state.setLocale).toHaveBeenCalledExactlyOnceWith("es"));
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(state.setTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
  });

  it("offers no Spanish while an administrator has it switched off", () => {
    show({
      step: "preferences",
      spanishEnabled: false,
      stored: { locale: "es", bibleTranslation: "rvg" },
    });
    expect(screen.queryByRole("radio", { name: "Español" })).not.toBeInTheDocument();
    expect(screen.queryByText(/RVG/)).not.toBeInTheDocument();
    // The wizard itself is in English, whatever is stored.
    expect(heading("Your preferences")).toBeVisible();
    // The theme is still there to choose, and the step can be passed.
    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("goes on with the defaults untouched", async () => {
    show({ step: "preferences" });
    press("Continue");
    expect(await screen.findByRole("heading", { name: "You are all set" })).toBeVisible();
    expect(state.advanceOnboarding).toHaveBeenCalledExactlyOnceWith("finish");
    expect(state.setLocale).not.toHaveBeenCalled();
    expect(state.setBibleTranslation).not.toHaveBeenCalled();
  });
});

describe("the last step", () => {
  it("finishes setup on the server, and only then opens the dashboard", async () => {
    show({ step: "finish" });
    expect(screen.getByText(/change any of them later in Settings/)).toBeVisible();
    expect(state.finishOnboarding).not.toHaveBeenCalled();
    press("Open Dashboard");
    await waitFor(() => expect(state.replace).toHaveBeenCalledExactlyOnceWith("/dashboard"));
    expect(state.finishOnboarding).toHaveBeenCalledTimes(1);
  });

  it("stays, and says why, when setup could not be finished", async () => {
    state.finishOnboarding.mockResolvedValue({
      ok: false,
      message: "Finish the earlier steps first.",
    });
    show({ step: "finish" });
    press("Open Dashboard");
    expect(await screen.findByText("Finish the earlier steps first.")).toBeVisible();
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open Dashboard" })).toBeEnabled();
  });
});

describe("a new account", () => {
  it("resumes at the step it had reached, and has no way round setup", () => {
    show({ step: "preferences" });
    expect(heading("Your preferences")).toBeVisible();
    expect(screen.getByText("Step 3 of 4")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Exit setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("goes back without writing, and keeps what the step before saved", async () => {
    show({ step: "preferences", profile: { churchName: "Grace" } });
    press("Back");
    expect(await screen.findByRole("heading", { name: "Your church and ministry" })).toBeVisible();
    expect(church()).toHaveValue("Grace");
    press("Back");
    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent("One place");
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
    expect(state.updateProfile).not.toHaveBeenCalled();
  });
});

describe("an account that owes no setup", () => {
  it("goes through every step without anything about its setup being written", async () => {
    show({ mode: "review", profile: { churchName: "Grace", attendsPreachingClass: true } });
    expect(screen.getByRole("link", { name: "Exit setup" })).toHaveAttribute("href", "/settings/app");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

    press("Get Started");
    await screen.findByRole("heading", { name: "Your church and ministry" });
    expect(church()).toHaveValue("Grace");
    expect(attendance()).toBeChecked();
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    press("Continue");
    await screen.findByRole("heading", { name: "You are all set" });

    expect(screen.getByRole("link", { name: "Open Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
      "href",
      "/settings/app",
    );
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
    expect(state.finishOnboarding).not.toHaveBeenCalled();
    // Opening the steps overwrote nothing either.
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it("saves what it deliberately changes, through the same action", async () => {
    show({ mode: "review", step: "ministry", profile: { churchName: "Grace" } });
    fireEvent.change(church(), { target: { value: "" } });
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    expect(state.updateProfile).toHaveBeenCalledExactlyOnceWith({
      churchName: null,
      ministryRole: null,
      attendsPreachingClass: false,
    });
    expect(state.advanceOnboarding).not.toHaveBeenCalled();
  });
});

describe("when Settings saved something while the steps were kept open", () => {
  it("shows it, and does not send the old value back over it", async () => {
    const preferences = resolvePreferences({ locale: "en", bibleTranslation: null }, true);
    const wizard = (profile: StoredProfile) => (
      <I18nProvider locale="en">
        <OnboardingWizard
          mode="review"
          initialStep="ministry"
          profile={profile}
          preferences={preferences}
        />
      </I18nProvider>
    );
    const { rerender } = render(wizard({ ...empty, ministryRole: "Pastor" }));
    rerender(wizard({ ...empty, ministryRole: "Evangelist" }));
    expect(role()).toHaveValue("Evangelist");
    press("Continue");
    await screen.findByRole("heading", { name: "Your preferences" });
    expect(state.updateProfile).not.toHaveBeenCalled();
  });
});

describe("in Spanish", () => {
  it("is written in Spanish throughout", async () => {
    show({ locale: "es" });
    expect(screen.getByText("Paso 1 de 4")).toBeVisible();
    press("Comenzar");
    expect(await screen.findByRole("heading", { name: "Tu iglesia y ministerio" })).toBeVisible();
    expect(screen.getByLabelText("Nombre de la iglesia (opcional)")).toBeVisible();
    press("Continuar");
    expect(await screen.findByRole("heading", { name: "Tus preferencias" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeInTheDocument();
  });
});
