import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createTag: vi.fn() }));
vi.mock("../tag-actions", () => ({ createTag: state.createTag }));

import type { IdeaTag } from "../tags";
import { TagPicker } from "./tag-picker";

const faith = { id: "a", name: "Faith" };
const prayer = { id: "b", name: "Prayer" };
const advent = { id: "c", name: "Advent" };
const options = [advent, faith, prayer];

let latest: IdeaTag[] = [];
function Picker({ start = [], max }: { start?: IdeaTag[]; max?: number }) {
  const [value, setValue] = useState(start);
  useEffect(() => {
    latest = value;
  }, [value]);
  return <TagPicker value={value} onChange={setValue} options={options} max={max} />;
}

const names = () => latest.map((tag) => tag.name);
const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Add/ }));
  return screen.findByRole("textbox", { name: "Find or create a tag" });
};
const flush = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
});

describe("TagPicker", () => {
  it("says so when the idea has no tags", () => {
    render(<Picker />);
    expect(screen.getByText("No tags on this idea.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add tags" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("shows the idea's tags and removes one", () => {
    render(<Picker start={[faith, prayer]} />);
    const shown = within(screen.getByRole("list", { name: "Tags" })).getAllByRole("listitem");
    expect(shown.map((item) => item.textContent)).toEqual(["Faith", "Prayer"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Faith" }));
    expect(names()).toEqual(["Prayer"]);
    expect(screen.getByRole("status")).toHaveTextContent("Faith removed.");
  });

  it("adds a tag from the account's list, keeping them in order", async () => {
    render(<Picker start={[prayer]} />);
    await open();
    const list = screen.getByRole("list", { name: "Your tags" });
    expect(within(list).getByRole("button", { name: "Prayer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(list).getByRole("button", { name: "Advent" }));
    expect(names()).toEqual(["Advent", "Prayer"]);
    // Choosing one that is on takes it off.
    fireEvent.click(within(list).getByRole("button", { name: "Prayer" }));
    expect(names()).toEqual(["Advent"]);
  });

  it("finds a tag by part of its name, whatever its case", async () => {
    render(<Picker />);
    const box = await open();
    fireEvent.change(box, { target: { value: "ray" } });
    const list = screen.getByRole("list", { name: "Your tags" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((item) => item.textContent),
    ).toEqual(["Prayer"]);
    // A name that exists, in any case, is chosen and not created again.
    fireEvent.change(box, { target: { value: "  FAITH " } });
    expect(screen.queryByRole("button", { name: /^Create/ })).not.toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(names()).toEqual(["Faith"]);
    expect(state.createTag).not.toHaveBeenCalled();
  });

  it("creates a tag that does not exist and puts it on the idea", async () => {
    state.createTag.mockResolvedValue({
      ok: true,
      message: "Tag created.",
      tag: { id: "d", name: "Hope" },
    });
    render(<Picker start={[faith]} />);
    const box = await open();
    fireEvent.change(box, { target: { value: "Hope" } });
    fireEvent.click(screen.getByRole("button", { name: "Create “Hope”" }));
    await flush();
    expect(state.createTag).toHaveBeenCalledWith("Hope");
    expect(names()).toEqual(["Faith", "Hope"]);
    expect(box).toHaveValue("");
    // It is in the list from now on.
    expect(
      within(screen.getByRole("list", { name: "Your tags" })).getByRole("button", { name: "Hope" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the name and changes nothing when the tag cannot be created", async () => {
    state.createTag.mockResolvedValue({
      ok: false,
      message: "You already have a tag with that name.",
    });
    render(<Picker start={[faith]} />);
    const box = await open();
    fireEvent.change(box, { target: { value: "Hope" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("You already have a tag with that name.");
    expect(box).toHaveValue("Hope");
    expect(names()).toEqual(["Faith"]);
  });

  it("does not submit the form around it on Enter", async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <Picker />
      </form>,
    );
    const box = await open();
    fireEvent.change(box, { target: { value: "Faith" } });
    const notPrevented = fireEvent.keyDown(box, { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("holds no more than the limit", async () => {
    render(<Picker start={[faith]} max={1} />);
    await open();
    const list = screen.getByRole("list", { name: "Your tags" });
    expect(within(list).getByRole("button", { name: "Advent" })).toBeDisabled();
    expect(within(list).getByRole("button", { name: "Faith" })).toBeEnabled();
    expect(names()).toEqual(["Faith"]);
  });
});
