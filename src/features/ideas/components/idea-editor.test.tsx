import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdeaDraft } from "../schemas";

// The server actions and the router are mocked: this covers the editor's own behaviour.
const state = vi.hoisted(() => ({
  updateIdea: vi.fn(),
  changeIdeaKind: vi.fn(),
  deleteIdea: vi.fn(),
  createTag: vi.fn(),
  archiveIdea: vi.fn(),
  restoreIdea: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../tag-actions", () => ({ createTag: state.createTag }));
vi.mock("../actions", () => ({
  updateIdea: state.updateIdea,
  changeIdeaKind: state.changeIdeaKind,
  deleteIdea: state.deleteIdea,
  archiveIdea: state.archiveIdea,
  restoreIdea: state.restoreIdea,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));

import { IdeaEditor } from "./idea-editor";

const id = "11111111-1111-4111-8111-111111111111";
const initial: IdeaDraft = {
  kind: "sermon",
  title: "It is Well",
  notes: "2 Kings 4.",
  status: "idea",
  intendedFormat: "unspecified",
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
  tags: [],
};

const faith = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Faith" };
const prayer = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Prayer" };
const hope = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Hope" };

const editor = (fields: Partial<IdeaDraft> = {}, backHref?: string) => (
  <IdeaEditor
    id={id}
    initial={{ ...initial, ...fields }}
    allTags={[faith, hope, prayer]}
    backHref={backHref}
    createdAt={new Date(0)}
    updatedAt={new Date(0)}
  />
);
const edit = (fields: Partial<IdeaDraft> = {}, backHref?: string) =>
  render(editor(fields, backHref));
/** The tag IDs the last save sent. */
const sentTags = () => state.updateIdea.mock.calls.at(-1)?.[1].tagIds;
const title = () => screen.getByRole("textbox", { name: "Idea" });
const save = () => screen.getByRole("button", { name: "Save changes" });

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
const classification = () => screen.getByRole("button", { name: /Classification & Status/ });

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
    fireEvent.click(classification());
    await choose("Development status", "Ready");
    fireEvent.click(save());

    expect(await screen.findByText("Changes saved.")).toBeVisible();
    expect(state.updateIdea).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        title: "It is Well with My Soul",
        status: "ready",
        // What was not touched goes back as it was.
        intendedFormat: "unspecified",
        sermonType: "topical",
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
    expect(classification()).toHaveTextContent("Idea · Topical");
  });

  it("archives only once it is confirmed, and says that is not a deletion", async () => {
    state.archiveIdea.mockResolvedValue({ ok: true, message: "Idea archived." });
    edit();
    fireEvent.change(title(), { target: { value: "Edited but not saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Archive idea" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Archive this idea?" });
    expect(dialog).toHaveTextContent(/hidden from your library, not deleted/);
    expect(dialog).toHaveTextContent(/restore it at any time/);
    expect(state.archiveIdea).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalled());
    expect(state.archiveIdea).toHaveBeenCalledWith(id);
    // Nothing else was sent, and the unsaved edit is still here.
    expect(state.updateIdea).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    expect(title()).toHaveValue("Edited but not saved");
  });

  it("says so when archiving is refused, and does not pretend it happened", async () => {
    state.archiveIdea.mockResolvedValue({ ok: false, message: "The idea could not be archived." });
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Archive idea" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Archive" }),
    );
    expect(await screen.findByText("The idea could not be archived.")).toBeVisible();
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("marks an archived idea and offers to restore it in place of archiving it", async () => {
    state.restoreIdea.mockResolvedValue({ ok: true, message: "Idea restored." });
    render(
      <IdeaEditor
        id={id}
        initial={{ ...initial, status: "ready" }}
        createdAt={new Date(0)}
        updatedAt={new Date(0)}
        archivedAt={new Date("2026-10-05T10:00:00Z")}
      />,
    );
    expect(screen.getByText("Archived Oct 5, 2026.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Archive idea" })).not.toBeInTheDocument();
    // Archived is not a status: the idea is still Ready, and can still be edited.
    expect(classification()).toHaveTextContent("Ready · Topical");
    expect(title()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Restore idea" }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalled());
    expect(state.restoreIdea).toHaveBeenCalledWith(id);
    expect(state.updateIdea).not.toHaveBeenCalled();
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

describe("IdeaEditor tags", () => {
  it("shows the tags the idea already has", () => {
    edit({ tags: [faith, prayer] });
    const shown = within(screen.getByRole("list", { name: "Tags" })).getAllByRole("listitem");
    expect(shown.map((item) => item.textContent)).toEqual(["Faith", "Prayer"]);
    expect(save()).toBeDisabled();
  });

  it("sends the idea's existing tags back when only another field changes", async () => {
    edit({ tags: [faith, prayer] });
    fireEvent.change(title(), { target: { value: "It is Well with My Soul" } });
    fireEvent.click(save());
    expect(await screen.findByText("Changes saved.")).toBeVisible();
    // Not left out, and not empty: either would be wrong for an idea with tags.
    expect(sentTags()).toEqual([faith.id, prayer.id]);
  });

  it("sends an empty list for an idea that has no tags", async () => {
    edit();
    fireEvent.change(title(), { target: { value: "Changed" } });
    fireEvent.click(save());
    await screen.findByText("Changes saved.");
    expect(sentTags()).toEqual([]);
  });

  it("saves a removed tag as removed, and the rest as they were", async () => {
    edit({ tags: [faith, prayer] });
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Faith" }));
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(state.updateIdea).not.toHaveBeenCalled();
    fireEvent.click(save());
    await screen.findByText("Changes saved.");
    expect(sentTags()).toEqual([prayer.id]);
    expect(save()).toBeDisabled();
  });

  it("adds a tag from the account's list and saves it with the idea", async () => {
    edit({ tags: [prayer] });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("textbox", { name: "Find or create a tag" });
    fireEvent.click(
      within(screen.getByRole("list", { name: "Your tags" })).getByRole("button", {
        name: "Hope",
      }),
    );
    fireEvent.click(save());
    await screen.findByText("Changes saved.");
    expect(sentTags()).toEqual([hope.id, prayer.id]);
    expect(state.updateIdea).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ title: initial.title, notes: initial.notes }),
    );
  });

  it("creates a tag while editing and saves it with the idea", async () => {
    const mercy = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Mercy" };
    state.createTag.mockResolvedValue({ ok: true, message: "Tag created.", tag: mercy });
    edit({ tags: [faith] });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const box = await screen.findByRole("textbox", { name: "Find or create a tag" });
    fireEvent.change(box, { target: { value: "Mercy" } });
    fireEvent.click(screen.getByRole("button", { name: "Create “Mercy”" }));
    await waitFor(() => expect(screen.getByText("Unsaved changes")).toBeVisible());
    // Creating the tag did not save the idea.
    expect(state.updateIdea).not.toHaveBeenCalled();
    fireEvent.click(save());
    await screen.findByText("Changes saved.");
    expect(sentTags()).toEqual([faith.id, mercy.id]);
  });

  it("keeps the chosen tags on screen when the server refuses them", async () => {
    state.updateIdea.mockResolvedValueOnce({
      ok: false,
      message: "One of those tags no longer exists.",
    });
    edit({ tags: [faith, prayer] });
    fireEvent.change(title(), { target: { value: "Changed" } });
    fireEvent.click(save());
    expect(await screen.findByText("One of those tags no longer exists.")).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: "Tags" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Faith", "Prayer"]);
    expect(title()).toHaveValue("Changed");
    expect(save()).toBeEnabled();
  });

  it("does not touch tags when an idea is reclassified", async () => {
    edit({ tags: [faith] });
    fireEvent.click(screen.getByRole("radio", { name: "Point" }));
    await screen.findByText("Now filed as: Point idea.");
    expect(state.changeIdeaKind).toHaveBeenCalledWith(id, "point");
    expect(state.updateIdea).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("Faith");
  });

  it("returns to the library it was opened from after a deletion", async () => {
    edit({}, "/library?q=grace&page=2");
    fireEvent.click(screen.getByRole("button", { name: "Delete idea" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /^Delete/ }),
    );
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/library?q=grace&page=2"));
  });
});

describe("IdeaEditor Scripture", () => {
  const kings = initial.references[0];
  const john = {
    book: 43,
    chapterStart: 3,
    verseStart: 16,
    chapterEnd: null,
    verseEnd: 18,
    isPrimary: false,
  };
  const point = { kind: "point" as const, references: [{ ...kings, isPrimary: false }, john] };
  const rows = () =>
    within(screen.getByRole("list", { name: "References" })).getAllByRole("listitem");
  const sent = () => state.updateIdea.mock.calls.at(-1)?.[1].references;

  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const [book, chapter] = url.split("?")[0].split("/").slice(-2).map(Number);
      const verses = Array.from(
        { length: 60 },
        (_, index) => `Text of ${book}.${chapter}.${index + 1}`,
      );
      return { ok: true, status: 200, json: async () => ({ book, chapter, verses, title: null }) };
    });
    return () => vi.unstubAllGlobals();
  });

  it("shows each reference as a closed row, on a sermon and on a point alike", () => {
    edit(point);
    expect(rows()).toHaveLength(2);
    for (const name of ["2 Kings 4:26", "John 3:16–18"]) {
      expect(screen.getByRole("button", { name: `${name}: show the passage` })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    // Nothing is fetched for a reference nobody opened.
    expect(screen.queryByText(/^Text of/)).not.toBeInTheDocument();
    // Only a sermon has a main text.
    expect(screen.queryByRole("button", { name: /main text$/ })).not.toBeInTheDocument();
  });

  it("opens a reference's text in place, and closes it again", async () => {
    edit(point);
    fireEvent.click(screen.getByRole("button", { name: "John 3:16–18: show the passage" }));
    const toggle = screen.getByRole("button", { name: "John 3:16–18: hide the passage" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const text = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(await within(text).findByText("Text of 43.3.16")).toBeInTheDocument();
    expect(within(text).getByText("Text of 43.3.18")).toBeInTheDocument();
    expect(within(text).queryByText("Text of 43.3.19")).not.toBeInTheDocument();
    expect(text).not.toHaveAttribute("inert");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "John 3:16–18: show the passage" })).toBeVisible();
    // Closed, it is out of reach of the keyboard and of assistive technology.
    expect(text).toHaveAttribute("inert");
    // Reading is not editing.
    expect(save()).toBeDisabled();
  });

  it("leads to each passage in the Bible, with the way back to this idea", () => {
    edit(point);
    expect(screen.getByRole("link", { name: "Open John 3:16–18 in the Bible" })).toHaveAttribute(
      "href",
      `/bible?book=43&chapter=3&verse=16&through=18&idea=${id}`,
    );
    expect(screen.getByRole("link", { name: "Open 2 Kings 4:26 in the Bible" })).toHaveAttribute(
      "href",
      `/bible?book=12&chapter=4&verse=26&idea=${id}`,
    );
  });

  it("removes a reference only from this idea's draft, and only with Save", async () => {
    edit(point);
    fireEvent.click(screen.getByRole("button", { name: "Remove John 3:16–18" }));
    expect(rows()).toHaveLength(1);
    expect(state.updateIdea).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() => expect(state.updateIdea).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual([{ ...kings, isPrimary: false }]);
    // Everything else about the idea goes back as it was.
    expect(state.updateIdea.mock.calls[0][1]).toMatchObject({
      title: initial.title,
      notes: initial.notes,
      kind: "point",
    });
  });

  it("marks a sermon's main text in its row", () => {
    edit({ references: [kings, john] });
    expect(screen.getByRole("button", { name: "2 Kings 4:26: main text" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rows()[0]).toHaveTextContent("Main text");
    expect(rows()[1]).not.toHaveTextContent("Main text");
  });

  it("shows a passage added from the Bible when the idea comes back unedited", () => {
    const view = edit({ references: [kings] });
    expect(rows()).toHaveLength(1);
    view.rerender(editor({ references: [kings, john] }));
    expect(rows()).toHaveLength(2);
    // It is already saved: there is nothing here to save.
    expect(save()).toBeDisabled();
  });

  it("keeps a passage added from the Bible when there are unsaved edits, and saves it with them", async () => {
    const view = edit({ references: [kings] });
    fireEvent.change(title(), { target: { value: "It is Well with My Soul" } });
    view.rerender(editor({ references: [kings, john] }));
    expect(title()).toHaveValue("It is Well with My Soul");
    expect(rows()).toHaveLength(2);
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(state.updateIdea).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual([kings, john]);
  });

  it("does not bring back a passage that was taken off here before another arrived", () => {
    const view = edit({ references: [kings, john] });
    fireEvent.click(screen.getByRole("button", { name: "Remove John 3:16–18" }));
    const romans = { ...john, book: 45, chapterStart: 6, verseStart: 23, verseEnd: null };
    view.rerender(editor({ references: [kings, john, romans] }));
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("2 Kings 4:26"),
      expect.stringContaining("Romans 6:23"),
    ]);
  });
});
