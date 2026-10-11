import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { copyKindKey, readCopyKind } from "@/features/scripture/copy-preference";
import { BibleSettings } from "./bible-settings";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("BibleSettings", () => {
  it("starts on the verse text", () => {
    render(<BibleSettings />);
    expect(screen.getByRole("group", { name: "Copy shortcut" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Verse text" })).toBeChecked();
  });

  it("shows the choice already made in this browser", () => {
    window.localStorage.setItem(copyKindKey, "link");
    render(<BibleSettings />);
    expect(screen.getByRole("radio", { name: "Link" })).toBeChecked();
  });

  it("remembers a new choice", () => {
    render(<BibleSettings />);
    fireEvent.click(screen.getByRole("radio", { name: "Reference" }));
    expect(screen.getByRole("radio", { name: "Reference" })).toBeChecked();
    expect(window.localStorage.getItem(copyKindKey)).toBe("reference");
    expect(readCopyKind()).toBe("reference");
  });

  it("falls back to the verse text for a stored value it does not know, or no storage", () => {
    window.localStorage.setItem(copyKindKey, "everything");
    expect(readCopyKind()).toBe("text");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readCopyKind()).toBe("text");
  });
});
