import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The access helper is mocked: what it decides is tested in features/auth. This covers
// what the page asks of it, and what it shows each kind of account.
const state = vi.hoisted(() => ({
  access: "active" as "active" | "signed-out" | "denied",
  user: {} as Record<string, unknown>,
  requireActiveUser: vi.fn(),
  advanceOnboarding: vi.fn(),
  finishOnboarding: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: state.requireActiveUser,
  requireAccount: async () => {
    if (state.access === "signed-out") throw new Error("redirect:/sign-in");
    if (state.access === "denied") throw new Error("redirect:/access-denied");
    return {
      id: "1",
      clerkUserId: "user_1",
      role: "user",
      status: "active",
      churchName: null,
      ministryRole: null,
      attendsPreachingClass: false,
      onboardingStatus: "pending",
      onboardingStep: "welcome",
      ...state.user,
    };
  },
}));
vi.mock("@/features/onboarding/actions", () => ({
  advanceOnboarding: state.advanceOnboarding,
  finishOnboarding: state.finishOnboarding,
}));
vi.mock("@/features/preferences/actions", () => ({
  updateProfile: state.updateProfile,
  setLocale: vi.fn(),
  setBibleTranslation: vi.fn(),
}));
vi.mock("@/features/onboarding/components/setup-sign-out", () => ({
  SetupSignOut: () => <button type="button">Sign out</button>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { testPreferences } from "@/features/preferences/testing";
import OnboardingPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { access: "active", user: {} });
});

describe("OnboardingPage", () => {
  it("is closed to a guest and to an account without access", async () => {
    state.access = "signed-out";
    await expect(OnboardingPage()).rejects.toThrow("redirect:/sign-in");
    state.access = "denied";
    await expect(OnboardingPage()).rejects.toThrow("redirect:/access-denied");
  });

  it("asks for an account, never for one that has finished setup", async () => {
    render(await OnboardingPage());
    expect(state.requireActiveUser).not.toHaveBeenCalled();
  });

  it("shows a new account the first step, with no way round it", async () => {
    render(await OnboardingPage());
    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Exit setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("brings a new account back to the step it had reached, with what it saved", async () => {
    state.user = {
      onboardingStep: "ministry",
      churchName: "Grace Baptist Church",
      attendsPreachingClass: true,
    };
    render(await OnboardingPage());
    expect(screen.getByText("Step 2 of 4")).toBeVisible();
    expect(screen.getByLabelText("Church name (optional)")).toHaveValue("Grace Baptist Church");
    expect(screen.getByRole("switch", { name: "I attend preaching class" })).toBeChecked();
  });

  it.each(["completed", "grandfathered"])(
    "shows an account that is %s the steps from the start, to leave when it likes",
    async (onboardingStatus) => {
      // Wherever it once stopped, going through them again starts at the beginning.
      state.user = { onboardingStatus, onboardingStep: "finish", ministryRole: "Pastor" };
      render(await OnboardingPage());
      expect(screen.getByText("Step 1 of 4")).toBeVisible();
      expect(screen.getByRole("link", { name: "Exit setup" })).toHaveAttribute("href", "/settings/app");
      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
      // Opening it wrote nothing.
      expect(state.advanceOnboarding).not.toHaveBeenCalled();
      expect(state.finishOnboarding).not.toHaveBeenCalled();
      expect(state.updateProfile).not.toHaveBeenCalled();
    },
  );

  it("is in the account's language", async () => {
    testPreferences.locale = "es";
    render(await OnboardingPage());
    expect(screen.getByText("Paso 1 de 4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Comenzar" })).toBeVisible();
  });

  it("is in English while Spanish is switched off, whatever the account saved", async () => {
    Object.assign(testPreferences, { locale: "es", spanishEnabled: false });
    render(await OnboardingPage());
    expect(screen.getByRole("button", { name: "Get Started" })).toBeVisible();
  });
});
