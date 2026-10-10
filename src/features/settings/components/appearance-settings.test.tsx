import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AppearanceSettings } from "./appearance-settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  // jsdom has no matchMedia; this device prefers light and allows motion.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList;
});

function renderBoth() {
  render(
    <ThemeProvider>
      <header>
        <ThemeToggle />
      </header>
      <main>
        <AppearanceSettings />
      </main>
    </ThemeProvider>,
  );
  const radio = (landmark: "banner" | "main", name: string) =>
    within(screen.getByRole(landmark)).getByRole("radio", { name });
  return { radio };
}

describe("AppearanceSettings", () => {
  it("follows the device until a theme is chosen", async () => {
    const { radio } = renderBoth();
    await waitFor(() => expect(radio("main", "Light")).toBeChecked());
    expect(radio("banner", "Light")).toBeChecked();
    expect(screen.getByText(/Following your device/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use device setting" })).not.toBeInTheDocument();
  });

  it("stays in step with the bar's control in both directions, through one stored choice", async () => {
    const { radio } = renderBoth();

    fireEvent.click(radio("main", "Dark"));
    await waitFor(() => expect(radio("banner", "Dark")).toBeChecked());
    expect(radio("main", "Dark")).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(radio("banner", "Light"));
    await waitFor(() => expect(radio("main", "Light")).toBeChecked());
    expect(localStorage.getItem("theme")).toBe("light");
    // One key only: no second preference store.
    expect(Object.keys(localStorage)).toEqual(["theme"]);
  });

  it("can hand the choice back to the device", async () => {
    const { radio } = renderBoth();
    fireEvent.click(radio("main", "Dark"));
    fireEvent.click(await screen.findByRole("button", { name: "Use device setting" }));

    await waitFor(() => expect(radio("banner", "Light")).toBeChecked());
    expect(localStorage.getItem("theme")).toBe("system");
    expect(screen.queryByRole("button", { name: "Use device setting" })).not.toBeInTheDocument();
  });
});
