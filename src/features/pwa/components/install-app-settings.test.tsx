import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "@/i18n/client";
import { resetPwaForTests } from "../pwa";
import { InstallAppSettings } from "./install-app-settings";

afterEach(() => {
  act(() => resetPwaForTests());
});

describe("InstallAppSettings", () => {
  it("offers a real button only where the browser gave its prompt", () => {
    act(() => resetPwaForTests({ canPrompt: true }));
    render(<InstallAppSettings />);
    expect(screen.getByRole("button", { name: "Install Sermon Tracker" })).toBeInTheDocument();
  });

  it("offers nothing once running installed", () => {
    act(() => resetPwaForTests({ standalone: true, canPrompt: true }));
    render(<InstallAppSettings />);
    expect(screen.getByText("You're using the installed app.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives steps where there is no prompt, in the interface language", () => {
    render(
      <I18nProvider locale="es">
        <InstallAppSettings />
      </I18nProvider>,
    );
    // jsdom's user agent is neither a phone nor a known browser: general directions.
    expect(screen.getByRole("list", { name: "Cómo instalarla" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
