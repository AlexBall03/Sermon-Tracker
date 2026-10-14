import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";
import { resetPwaForTests, setRegistrationForTests } from "../pwa";
import { UpdateNotice } from "./update-notice";

let controllerChange: (() => void) | undefined;
const waiting = { postMessage: vi.fn() };
const reload = vi.fn();

beforeEach(() => {
  waiting.postMessage.mockClear();
  reload.mockClear();
  controllerChange = undefined;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (_type: string, listener: () => void) => {
        controllerChange = listener;
      },
    },
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  setRegistrationForTests({ waiting } as unknown as ServiceWorkerRegistration);
});

afterEach(() => {
  act(() => resetPwaForTests());
});

describe("UpdateNotice", () => {
  it("shows nothing until a new version is waiting", () => {
    render(<UpdateNotice />);
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("refuses while work is unsaved, and says why", () => {
    act(() => resetPwaForTests({ updateReady: true }));
    setRegistrationForTests({ waiting } as unknown as ServiceWorkerRegistration);
    const key = {};
    holdUnsavedWork(key);
    try {
      render(<UpdateNotice />);
      fireEvent.click(screen.getByRole("button", { name: "Update" }));
      expect(waiting.postMessage).not.toHaveBeenCalled();
      expect(screen.getByText(/not saved yet/)).toBeInTheDocument();
    } finally {
      releaseUnsavedWork(key);
    }
  });

  it("takes the new version and reloads once, when nothing is unsaved", () => {
    act(() => resetPwaForTests({ updateReady: true }));
    setRegistrationForTests({ waiting } as unknown as ServiceWorkerRegistration);
    render(<UpdateNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    controllerChange?.();
    controllerChange?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("can be put off, and speaks Spanish", () => {
    act(() => resetPwaForTests({ updateReady: true }));
    render(
      <I18nProvider locale="es">
        <UpdateNotice />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Más tarde" }));
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
  });
});
