import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredProfile } from "@/features/preferences/preferences";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";

// The server action is mocked: this covers the form's own behavior.
const state = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock("@/features/preferences/actions", () => ({ updateProfile: state.updateProfile }));

import { ChurchMinistrySettings } from "./church-ministry-settings";

const empty: StoredProfile = { churchName: null, ministryRole: null, attendsPreachingClass: false };

const show = (profile: Partial<StoredProfile> = {}, locale: Locale = "en") =>
  render(
    <I18nProvider locale={locale}>
      <ChurchMinistrySettings profile={{ ...empty, ...profile }} />
    </I18nProvider>,
  );
const church = () => screen.getByLabelText("Church name (optional)");
const role = () => screen.getByLabelText("Ministry role (optional)");
const attendance = () => screen.getByRole("switch", { name: "I attend preaching class" });

beforeEach(() => {
  vi.clearAllMocks();
  state.updateProfile.mockResolvedValue({ ok: true, message: "Saved." });
});

describe("ChurchMinistrySettings", () => {
  it("starts from what the account has saved", () => {
    show({
      churchName: "Grace Baptist Church",
      ministryRole: "Pastor",
      attendsPreachingClass: true,
    });
    expect(church()).toHaveValue("Grace Baptist Church");
    expect(role()).toHaveValue("Pastor");
    expect(attendance()).toBeChecked();
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it("saves the two lines together, tidied, and says so", async () => {
    show();
    fireEvent.change(church(), { target: { value: "  Grace   Baptist Church " } });
    fireEvent.change(role(), { target: { value: "Evangelist" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.updateProfile).toHaveBeenCalledWith({
        churchName: "Grace Baptist Church",
        ministryRole: "Evangelist",
      }),
    );
    expect(await screen.findByText("Saved.")).toBeVisible();
    // The box shows what was saved.
    expect(church()).toHaveValue("Grace Baptist Church");
  });

  it("clears a line that is emptied", async () => {
    show({ churchName: "Grace Baptist Church", ministryRole: "Pastor" });
    fireEvent.change(church(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.updateProfile).toHaveBeenCalledWith({
        churchName: null,
        ministryRole: "Pastor",
      }),
    );
  });

  it("says what is wrong beside the line, and sends nothing", () => {
    show();
    fireEvent.change(role(), { target: { value: "r".repeat(81) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Use 80 characters or fewer for the ministry role.")).toBeVisible();
    expect(role()).toHaveAttribute("aria-invalid", "true");
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it("shows a refusal, and keeps what was typed", async () => {
    state.updateProfile.mockResolvedValue({
      ok: false,
      message: "Your details could not be saved. Try again.",
    });
    show();
    fireEvent.change(church(), { target: { value: "Grace" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Your details could not be saved. Try again.")).toBeVisible();
    expect(church()).toHaveValue("Grace");
  });

  it("saves the switch the moment it is pressed, and nothing else with it", async () => {
    show({ churchName: "Grace Baptist Church" });
    expect(attendance()).not.toBeChecked();
    fireEvent.click(attendance());
    expect(attendance()).toBeChecked();
    await waitFor(() =>
      expect(state.updateProfile).toHaveBeenCalledWith({ attendsPreachingClass: true }),
    );
    expect(await screen.findByText("Saved.")).toBeVisible();

    fireEvent.click(attendance());
    await waitFor(() =>
      expect(state.updateProfile).toHaveBeenLastCalledWith({ attendsPreachingClass: false }),
    );
    expect(attendance()).not.toBeChecked();
  });

  it("puts the switch back when the server refuses it, or cannot be reached", async () => {
    state.updateProfile.mockResolvedValueOnce({ ok: false, message: "Not this time." });
    show();
    fireEvent.click(attendance());
    expect(await screen.findByText("Not this time.")).toBeVisible();
    expect(attendance()).not.toBeChecked();

    state.updateProfile.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(attendance());
    expect(
      await screen.findByText(
        "That did not reach the server. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(attendance()).not.toBeChecked();
  });

  it("shows what was saved from elsewhere, and leaves what is being typed alone", () => {
    const { rerender } = show({ churchName: "Grace", ministryRole: "Pastor" });
    fireEvent.change(church(), { target: { value: "Grace Baptist" } });
    // Account setup saved a new role and the switch while this page was kept.
    rerender(
      <I18nProvider locale="en">
        <ChurchMinistrySettings
          profile={{ churchName: "Grace", ministryRole: "Evangelist", attendsPreachingClass: true }}
        />
      </I18nProvider>,
    );
    expect(role()).toHaveValue("Evangelist");
    expect(attendance()).toBeChecked();
    expect(church()).toHaveValue("Grace Baptist");
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it("is in Spanish for an account that reads Spanish", () => {
    show({}, "es");
    expect(screen.getByLabelText("Nombre de la iglesia (opcional)")).toBeVisible();
    expect(screen.getByLabelText("Función en el ministerio (opcional)")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Asisto a la clase de predicación" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
  });
});
