import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";
import {
  installNoticeKey,
  readInstallNotice,
  resetInstallNoticeForTests,
  storeInstallNotice,
} from "../install-notice";
import { resetPwaForTests } from "../pwa";
import { InstallNotice } from "./install-notice";

afterEach(() => {
  act(() => resetPwaForTests());
  window.localStorage.clear();
  resetInstallNoticeForTests();
  vi.restoreAllMocks();
});

const title = () => screen.queryByRole("heading", { name: "Install Sermon Tracker" });

describe("InstallNotice", () => {
  it("is shown at first, and sends the way to Settings where there is no prompt", () => {
    render(<InstallNotice />);
    expect(title()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How to install" })).toHaveAttribute(
      "href",
      "/settings#install",
    );
  });

  it("offers a real button where the browser gave its prompt", () => {
    act(() => resetPwaForTests({ canPrompt: true }));
    render(<InstallNotice />);
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "How to install" })).toBeNull();
  });

  it("is never shown in the installed application", () => {
    act(() => resetPwaForTests({ standalone: true }));
    render(<InstallNotice />);
    expect(title()).toBeNull();
  });

  it("goes once the application is installed from this browser", () => {
    render(<InstallNotice />);
    act(() => resetPwaForTests({ justInstalled: true }));
    expect(title()).toBeNull();
  });

  it("stays away once this browser dismissed it or installed from it", () => {
    for (const answer of ["dismissed", "installed"] as const) {
      window.localStorage.setItem(installNoticeKey, answer);
      const { unmount } = render(<InstallNotice />);
      expect(title()).toBeNull();
      unmount();
    }
  });

  it("remembers a dismissal, and folds away", () => {
    render(<InstallNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(readInstallNotice()).toBe("dismissed");
  });

  it("speaks the interface language", () => {
    render(
      <I18nProvider locale="es">
        <InstallNotice />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Instala Sermon Tracker" })).toBeInTheDocument();
  });
});

describe("the install notice preference", () => {
  it("keeps the answer for the page where storage refuses it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });
    storeInstallNotice("dismissed");
    expect(readInstallNotice()).toBeNull();
    render(<InstallNotice />);
    expect(title()).toBeNull();
  });
});
