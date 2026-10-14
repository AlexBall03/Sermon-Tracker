import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { lastLocaleKey } from "@/i18n/client";
import { OfflineMessage } from "./offline-message";

beforeEach(() => localStorage.clear());

describe("OfflineMessage", () => {
  it("says the page needs a connection, without claiming anyone was signed out", () => {
    render(<OfflineMessage />);
    expect(screen.getByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByText(/have not been signed out/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // No way to the public page.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("follows the last language the interface was shown in on this device", () => {
    localStorage.setItem(lastLocaleKey, "es");
    render(<OfflineMessage />);
    expect(screen.getByRole("heading", { name: "Estás sin conexión" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
  });
});
