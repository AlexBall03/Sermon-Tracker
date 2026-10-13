import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";
import { numberingPresetIds } from "../model";
import type { NumberingConfig } from "../numbering";
import { NumberingDialog } from "./numbering-dialog";

const onApply = vi.fn();
const onOpenChange = vi.fn();

function open(value: NumberingConfig = { version: 1, preset: "traditional" }) {
  render(
    <I18nProvider locale="en">
      <NumberingDialog open onOpenChange={onOpenChange} value={value} onApply={onApply} />
    </I18nProvider>,
  );
  return screen.getByRole("dialog", { name: "Numbering" });
}

/** The sample outline's labels, in order. */
const preview = () =>
  [...screen.getByRole("region", { name: "Preview" }).querySelectorAll("li")].map(
    (item) => item.querySelector(".tabular-nums")?.textContent ?? "",
  );

const style = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
const apply = () => screen.getByRole("button", { name: "Apply" });
const field = (name: string) => screen.getByRole("textbox", { name });

/** Picks a value in one of the dropdowns, as a pointer does. */
async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const item = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(item, { pointerType: "mouse" });
  fireEvent.mouseMove(item);
  fireEvent.pointerUp(item, { pointerType: "mouse" });
  fireEvent.mouseUp(item);
  fireEvent.click(item);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the numbering dialog", () => {
  it("offers every built-in style and a custom one, with the outline's own chosen", () => {
    const dialog = open({ version: 1, preset: "roman" });
    const names = within(dialog)
      .getAllByRole("radio")
      .map((radio) => (radio as HTMLInputElement).value);
    expect(names).toEqual([...numberingPresetIds, "custom"]);
    expect(style("Roman")).toBeChecked();
    // Each says what it looks like before it is chosen.
    expect(style("Traditional").closest("label")).toHaveTextContent("I. A. 1. a.");
    expect(style("Decimal").closest("label")).toHaveTextContent("1. 1.1. 1.1.1. 1.1.1.1.");
    expect(style("None").closest("label")).toHaveTextContent("No numbers");
  });

  it("previews a style before anything is saved, and applies it when asked", () => {
    open();
    expect(preview()).toEqual(["I.", "A.", "1.", "a.", "2.", "B.", "II.", "A."]);
    fireEvent.click(style("Decimal"));
    expect(preview()).toEqual(["1.", "1.1.", "1.1.1.", "1.1.1.1.", "1.1.2.", "1.2.", "2.", "2.1."]);
    fireEvent.click(style("Bullets"));
    expect(preview()).toEqual(["•", "◦", "▪", "•", "▪", "◦", "•", "◦"]);
    fireEvent.click(style("None"));
    expect(preview()).toEqual(["", "", "", "", "", "", "", ""]);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(style("Alphabetic"));
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ version: 1, preset: "alphabetic" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("starts a custom style from the one in force, and writes it level by level", async () => {
    open({ version: 1, preset: "numeric" });
    fireEvent.click(style("Custom"));
    // Numeric is one level, "1.", kept for every level below.
    expect(preview()).toEqual(["1.", "1.", "1.", "1.", "2.", "2.", "2.", "1."]);

    fireEvent.change(field("Level 1: Before"), { target: { value: "POINT " } });
    fireEvent.change(field("Level 1: After"), { target: { value: "" } });
    await choose("Level 1 counts with", "I, II, III");
    fireEvent.click(screen.getByRole("button", { name: "Add a level" }));
    await choose("Level 2 counts with", "A, B, C");
    fireEvent.click(screen.getAllByRole("radio", { name: "Small" })[1]);
    fireEvent.change(field("Level 2: Before"), { target: { value: "(" } });
    fireEvent.change(field("Level 2: After"), { target: { value: ")" } });
    expect(preview()).toEqual(["POINT I", "(a)", "(a)", "(a)", "(b)", "(b)", "POINT II", "(a)"]);

    await choose("Deeper levels", "No number");
    expect(preview()).toEqual(["POINT I", "(a)", "", "", "", "(b)", "POINT II", "(a)"]);

    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({
      version: 1,
      preset: "custom",
      overflow: "none",
      repeatFrom: 0,
      levels: [
        expect.objectContaining({ counter: "roman", case: "upper", prefix: "POINT ", suffix: "" }),
        expect.objectContaining({ counter: "alpha", case: "lower", prefix: "(", suffix: ")" }),
      ],
    });
  });

  it("joins the levels above when asked, with the separator given", () => {
    open({ version: 1, preset: "numeric" });
    fireEvent.click(style("Custom"));
    fireEvent.click(screen.getByRole("button", { name: "Add a level" }));
    fireEvent.click(screen.getByRole("switch", { name: "Include the levels above" }));
    fireEvent.change(field("Level 2: Between levels"), { target: { value: "-" } });
    expect(preview().slice(0, 3)).toEqual(["1.", "1-1.", "1-1-1."]);
    // The first level has nothing above it to include.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("removes a level, and keeps where the repeat starts inside what is left", async () => {
    open({ version: 1, preset: "traditional" });
    fireEvent.click(style("Custom"));
    // Traditional repeats from its sixth level of eight.
    for (const level of [8, 7, 6, 5]) {
      fireEvent.click(screen.getByRole("button", { name: `Remove level ${level}` }));
    }
    fireEvent.click(apply());
    expect(onApply.mock.calls[0][0]).toMatchObject({ overflow: "repeat", repeatFrom: 3 });
    expect(onApply.mock.calls[0][0].levels).toHaveLength(4);
  });

  it("shows what was typed around a number as text, and refuses angle brackets", () => {
    open({ version: 1, preset: "numeric" });
    fireEvent.click(style("Custom"));
    fireEvent.change(field("Level 1: Before"), { target: { value: "<b>" } });
    expect(field("Level 1: Before")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("without the characters < and >");
    expect(apply()).toBeDisabled();
    // Text, and nothing else: no element was made of it.
    expect(preview()[0]).toBe("<b>1.");
    expect(screen.getByRole("region", { name: "Preview" }).querySelector("b")).toBeNull();
    fireEvent.submit(apply().closest("form")!);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.change(field("Level 1: Before"), { target: { value: "§ " } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apply()).toBeEnabled();
  });

  it("stops at twelve levels", () => {
    open({ version: 1, preset: "numeric" });
    fireEvent.click(style("Custom"));
    const add = screen.getByRole("button", { name: "Add a level" });
    for (let level = 1; level < 12; level += 1) fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Level 12" })).toBeInTheDocument();
  });
});
