import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdeaDraft } from "../schemas";

// The server actions and the router are mocked: this covers the editor's own behaviour.
const state = vi.hoisted(() => ({
  updateIdea: vi.fn(),
  changeIdeaKind: vi.fn(),
  deleteIdea: vi.fn(),
  push: vi.fn(),
}));
vi.mock("../actions", () => ({
  updateIdea: state.updateIdea,
  changeIdeaKind: state.changeIdeaKind,
  deleteIdea: state.deleteIdea,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import { IdeaEditor } from "./idea-editor";

const id = "11111111-1111-4111-8111-111111111111";
const initial: IdeaDraft = {
  kind: "sermon",
  title: "It is Well",
  notes: "2 Kings 4.",
  status: "captured",
  sermonType: "topical",
  subject: "Faith",
  references: [
    {
      book: 12,
      chapterStart: 4,
      verseStart: 26,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: true,
    },
  ],
};

const edit = () =>
  render(<IdeaEditor id={id} initial={initial} createdAt={new Date(0)} updatedAt={new Date(0)} />);
const title = () => screen.getByRole("textbox", { name: "Idea" });
const save = () => screen.getByRole("button", { name: "Save changes" });

beforeEach(() => {
  vi.clearAllMocks();
  state.updateIdea.mockResolvedValue({ ok: true, message: "Changes saved." });
  state.changeIdeaKind.mockResolvedValue({ ok: true, message: "Now filed as: Point idea." });
  state.deleteIdea.mockResolvedValue({ ok: true, message: "Idea deleted." });
});

describe("IdeaEditor", () => {
  it("has nothing to save until something changes", () => {
    edit();
    expect(save()).toBeDisabled();
    fireEvent.change(title(), { target: { value: "It is Well with My Soul" } });
    expect(save()).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("saves the whole idea and then has nothing left to save", async () => {
    edit();
    fireEvent.change(title(), { target: { value: "It is Well with My Soul" } });
    fireEvent.click(screen.getByRole("radio", { name: "Ready" }));
    fireEvent.click(save());

    expect(await screen.findByText("Changes saved.")).toBeVisible();
    expect(state.updateIdea).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        title: "It is Well with My Soul",
        status: "ready",
        notes: "2 Kings 4.",
        references: initial.references,
      }),
    );
    expect(save()).toBeDisabled();
  });

  it("keeps the edits when a save is refused", async () => {
    state.updateIdea.mockResolvedValueOnce({ ok: false, message: "That idea no longer exists." });
    edit();
    fireEvent.change(title(), { target: { value: "Changed" } });
    fireEvent.click(save());
    expect(await screen.findByText("That idea no longer exists.")).toBeVisible();
    expect(title()).toHaveValue("Changed");
    expect(save()).toBeEnabled();
  });

  it("will not save an idea with no words", () => {
    edit();
    fireEvent.change(title(), { target: { value: "  " } });
    fireEvent.click(save());
    expect(screen.getAllByText(/Write the idea first/)[0]).toBeVisible();
    expect(state.updateIdea).not.toHaveBeenCalled();
  });

  it("reclassifies at once, touching only the kind, and keeps unsaved edits", async () => {
    edit();
    fireEvent.change(title(), { target: { value: "Edited but not saved" } });
    fireEvent.click(screen.getByRole("radio", { name: "Point" }));

    expect(await screen.findByText("Now filed as: Point idea.")).toBeVisible();
    expect(state.changeIdeaKind).toHaveBeenCalledWith(id, "point");
    expect(state.updateIdea).not.toHaveBeenCalled();
    expect(title()).toHaveValue("Edited but not saved");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("2 Kings 4.");
    // Sermon details are hidden for a point, not discarded.
    expect(screen.queryByRole("textbox", { name: "Subject or theme" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Sermon" }));
    expect(await screen.findByRole("textbox", { name: "Subject or theme" })).toHaveValue("Faith");
    expect(screen.getByRole("radio", { name: "Topical" })).toBeChecked();
  });

  it("puts the kind back when reclassifying fails", async () => {
    state.changeIdeaKind.mockResolvedValueOnce({
      ok: false,
      message: "The idea could not be reclassified. Try again.",
    });
    edit();
    fireEvent.click(screen.getByRole("radio", { name: "Undecided" }));
    expect(await screen.findByText(/could not be reclassified/)).toBeVisible();
    expect(screen.getByRole("radio", { name: "Sermon" })).toBeChecked();
  });

  it("asks before a link is followed with unsaved edits, and leaving throws them away", async () => {
    const view = edit();
    const link = document.createElement("a");
    link.href = "/dashboard";
    link.textContent = "Dashboard";
    view.container.append(link);
    const followed = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", followed);

    // Nothing changed: the link is simply followed.
    fireEvent.click(link);
    expect(followed).toHaveBeenCalledTimes(1);

    fireEvent.change(title(), { target: { value: "Edited but not saved" } });
    fireEvent.click(link);
    expect(followed).toHaveBeenCalledTimes(1);
    const question = await screen.findByRole("alertdialog", { name: "Leave without saving?" });

    fireEvent.click(within(question).getByRole("button", { name: "Stay on this page" }));
    expect(title()).toHaveValue("Edited but not saved");

    fireEvent.click(link);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave without saving",
      }),
    );
    expect(state.push).toHaveBeenCalledWith("/dashboard");
    // Should the page be shown again, it holds the idea as it was last saved.
    expect(title()).toHaveValue("It is Well");
    expect(state.updateIdea).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation, then returns to the library", async () => {
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this idea?" });
    expect(dialog).toHaveTextContent("It is Well");
    expect(state.deleteIdea).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(state.deleteIdea).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete sermon idea",
      }),
    );
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/library"));
    expect(state.deleteIdea).toHaveBeenCalledWith(id);
  });
});
