import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The router and the tag actions are mocked: this covers what the controls ask for.
const state = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  // Set by the page under test: going to an address renders the library for it.
  arrive: (() => {}) as (href: string) => void,
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
}));
vi.mock("../../tag-actions", () => ({
  createTag: state.createTag,
  renameTag: state.renameTag,
  deleteTag: state.deleteTag,
}));

import { defaultLibraryQuery, parseLibraryQuery, type LibraryQuery } from "../../library-query";
import type { TagSummary } from "../../tags";
import { FilterChips } from "./filter-chips";
import { LibraryFilters } from "./library-filters";
import { LibrarySearch, searchDebounceMs } from "./library-search";
import { LibraryProvider } from "./library-state";
import { LibraryToolbar } from "./library-toolbar";
import { libraryViewKey } from "./library-view";
import { TagManager } from "./tag-manager";

const faith = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const prayer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tag = (id: string, name: string, ideaCount: number): TagSummary => ({
  id,
  name,
  ideaCount,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
const tags = [tag(faith, "Faith", 3), tag(prayer, "Prayer", 1)];

const query = (fields: Partial<LibraryQuery> = {}): LibraryQuery => ({
  ...defaultLibraryQuery,
  ...fields,
});

/**
 * The controls on a page that behaves as the real one does: going to an
 * address renders the library again with the query read from that address.
 * `at` is where it starts, and where the address is moved to from outside.
 */
const nowhere = query();
function Library({ at = nowhere, having = tags }: { at?: LibraryQuery; having?: TagSummary[] }) {
  const [given, setGiven] = useState(at);
  const [current, setCurrent] = useState(at);
  if (given !== at) {
    setGiven(at);
    setCurrent(at);
  }
  useEffect(() => {
    state.arrive = (href) =>
      setCurrent(parseLibraryQuery(new URL(href, "https://example.test").searchParams));
  }, []);
  return (
    <LibraryProvider query={current} tags={having}>
      <LibrarySearch />
      <LibraryToolbar />
      <LibraryFilters />
      <FilterChips />
      <TagManager />
    </LibraryProvider>
  );
}

const box = () => screen.getByRole("searchbox", { name: "Search ideas" });
const type = (value: string) => fireEvent.change(box(), { target: { value } });
const wait = (ms = searchDebounceMs) => act(() => vi.advanceTimersByTime(ms));
const went = (mock: typeof state.push) => mock.mock.calls.map(([href]) => href);
const openFilters = () => fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

beforeEach(() => {
  vi.clearAllMocks();
  state.push.mockImplementation((href: string) => state.arrive(href));
  state.replace.mockImplementation((href: string) => state.arrive(href));
  vi.useFakeTimers();
  localStorage.clear();
  delete document.documentElement.dataset.libraryView;
});
afterEach(() => vi.useRealTimers());

describe("search", () => {
  it("waits for a pause in typing, then asks once", () => {
    render(<Library />);
    expect(box()).toHaveAttribute("placeholder", "Search titles, subjects, and notes...");
    type("g");
    type("gr");
    type("grace");
    wait(searchDebounceMs - 1);
    expect(state.push).not.toHaveBeenCalled();
    wait(1);
    expect(went(state.push)).toEqual(["/library?q=grace"]);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("adds one history entry for a spell of typing and rewrites it after that", () => {
    render(<Library />);
    type("grace");
    wait();
    type("grace alone");
    wait();
    expect(went(state.push)).toEqual(["/library?q=grace"]);
    expect(went(state.replace)).toEqual(["/library?q=grace+alone"]);
  });

  it("asks at once on Enter, and not a second time when the pause ends", () => {
    render(<Library />);
    type("  faith   works ");
    fireEvent.submit(screen.getByRole("search"));
    expect(went(state.push)).toEqual(["/library?q=faith+works"]);
    wait(searchDebounceMs * 2);
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("clears at once, removing only the search", () => {
    render(<Library at={query({ q: "grace", kinds: ["sermon"], sort: "title-asc", page: 3 })} />);
    expect(box()).toHaveValue("grace");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box()).toHaveValue("");
    // The filter and the order stay; the page goes back to the first.
    expect(went(state.push)).toEqual(["/library?kind=sermon&sort=title-asc"]);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("has no clear button when there is nothing to clear", () => {
    render(<Library />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("returns to the first page and keeps the filters", () => {
    render(<Library at={query({ statuses: ["ready"], tagIds: [faith], page: 4 })} />);
    type("hope");
    wait();
    expect(went(state.push)).toEqual([`/library?q=hope&status=ready&tag=${faith}`]);
  });

  it("does not undo a filter chosen while the search was waiting", () => {
    render(<Library />);
    openFilters();
    type("faith");
    fireEvent.click(screen.getByRole("button", { name: "Sermon idea" }));
    expect(went(state.push)).toEqual(["/library?kind=sermon"]);
    wait();
    expect(went(state.push).at(-1)).toBe("/library?q=faith&kind=sermon");
  });

  it("follows the address when it changes from outside", () => {
    const { rerender } = render(<Library at={query({ q: "grace" })} />);
    rerender(<Library at={query({ q: "mercy" })} />);
    expect(box()).toHaveValue("mercy");
    rerender(<Library at={query({ q: "" })} />);
    expect(box()).toHaveValue("");
    wait(searchDebounceMs * 2);
    expect(state.push).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });
});

describe("filters", () => {
  it("opens and closes without touching the address", () => {
    render(<Library at={query({ page: 3 })} />);
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    fireEvent.click(toggle);
    expect(panel).not.toBeVisible();
    expect(state.push).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("chooses several values in a group, one click at a time", () => {
    render(<Library at={query({ page: 2 })} />);
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Point idea" }));
    fireEvent.click(screen.getByRole("button", { name: "Sermon idea" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    fireEvent.click(screen.getByRole("button", { name: "Expository" }));
    expect(went(state.push)).toEqual([
      "/library?kind=point",
      "/library?kind=sermon&kind=point",
      "/library?kind=sermon&kind=point&status=ready",
      "/library?kind=sermon&kind=point&status=ready&type=expository",
    ]);
    // What was chosen shows as chosen at once.
    expect(screen.getByRole("button", { name: "Sermon idea" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Undecided" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("takes a value out again", () => {
    render(<Library at={query({ kinds: ["sermon", "point"] })} />);
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Sermon idea" }));
    expect(went(state.push)).toEqual(["/library?kind=point"]);
  });

  it("filters by tags, and switches between any and all without losing them", () => {
    render(<Library />);
    openFilters();
    const all = screen.getByRole("radio", { name: "All" });
    // With no tag chosen there is nothing for the mode to apply to.
    expect(all).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /^Faith/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Prayer/ }));
    expect(went(state.push).at(-1)).toBe(`/library?tag=${faith}&tag=${prayer}`);

    expect(all).toBeEnabled();
    fireEvent.click(all);
    expect(went(state.push).at(-1)).toBe(`/library?tag=${faith}&tag=${prayer}&tag_mode=all`);
    expect(screen.getByText("Ideas that have every chosen tag.")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Any" }));
    expect(went(state.push).at(-1)).toBe(`/library?tag=${faith}&tag=${prayer}`);
  });

  it("resets the page when the tag mode changes", () => {
    render(<Library at={query({ tagIds: [faith, prayer], page: 5 })} />);
    openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(went(state.push)).toEqual([`/library?tag=${faith}&tag=${prayer}&tag_mode=all`]);
  });

  it("sets either end of a date range", () => {
    render(<Library />);
    openFilters();
    const created = screen.getByRole("group", { name: "Created" });
    fireEvent.change(within(created).getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(within(created).getByLabelText("To"), { target: { value: "2026-03-31" } });
    const changed = screen.getByRole("group", { name: "Last changed" });
    fireEvent.change(within(changed).getByLabelText("To"), { target: { value: "2026-02-28" } });
    expect(went(state.push)).toEqual([
      "/library?created_from=2026-01-01",
      "/library?created_from=2026-01-01&created_to=2026-03-31",
      "/library?created_from=2026-01-01&created_to=2026-03-31&updated_to=2026-02-28",
    ]);
    // Each end limits the other, so a range cannot be turned inside out here.
    expect(within(created).getByLabelText("To")).toHaveAttribute("min", "2026-01-01");
    expect(within(created).getByLabelText("From")).toHaveAttribute("max", "2026-03-31");
  });

  it("says so when the address holds a range that ends before it starts", () => {
    render(<Library at={query({ createdFrom: "2026-03-01", createdThrough: "2026-01-01" })} />);
    openFilters();
    expect(screen.getByRole("alert")).toHaveTextContent("ends before it starts");
  });

  it("offers to create a tag when there are none", () => {
    render(<Library having={[]} />);
    openFilters();
    expect(screen.getByText(/You have no tags yet/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create a tag" }));
    expect(screen.getByRole("dialog", { name: "Manage tags" })).toBeVisible();
  });

  it("counts the filters in force on its button", () => {
    render(<Library at={query({ kinds: ["sermon", "point"], tagIds: [faith], q: "x" })} />);
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveTextContent("3 active");
  });
});

describe("active filters", () => {
  const busy = query({
    q: "grace",
    kinds: ["sermon"],
    statuses: ["developing", "ready"],
    sermonTypes: ["topical"],
    tagIds: [faith, prayer],
    tagMode: "all",
    createdFrom: "2026-01-01",
    updatedThrough: "2026-02-28",
    sort: "title-asc",
    page: 2,
  });

  it("shows each one, with the panel closed", () => {
    render(<Library at={busy} />);
    const chips = within(screen.getByRole("list", { name: "Active filters" }))
      .getAllByRole("button")
      .map((chip) => chip.textContent);
    expect(chips).toEqual([
      "KindSermon idea",
      "StatusDeveloping",
      "StatusReady",
      "Sermon typeTopical",
      "TagFaith",
      "TagPrayer",
      "Createdfrom Jan 1, 2026",
      "Changedto Feb 28, 2026",
    ]);
    expect(screen.getByText("Matching all tags")).toBeVisible();
  });

  it("removes one and leaves the rest", () => {
    render(<Library at={busy} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Status Ready" }));
    expect(went(state.push)).toEqual([
      `/library?q=grace&kind=sermon&status=developing&type=topical&tag=${faith}&tag=${prayer}&tag_mode=all&created_from=2026-01-01&updated_to=2026-02-28&sort=title-asc`,
    ]);
  });

  it("clears every filter and keeps the search and the order", () => {
    render(<Library at={busy} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(went(state.push)).toEqual(["/library?q=grace&sort=title-asc"]);
  });

  it("names a tag it cannot find, and still lets it be removed", () => {
    const gone = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    render(<Library at={query({ tagIds: [gone] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Tag Unknown tag" }));
    expect(went(state.push)).toEqual(["/library"]);
  });

  it("shows nothing when no filter is in force", () => {
    render(<Library at={query({ q: "grace", sort: "title-asc" })} />);
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });
});

describe("sorting", () => {
  it("offers the six orders by name and goes back to the first page", async () => {
    vi.useRealTimers();
    render(<Library at={query({ q: "grace", page: 3 })} />);
    const sort = screen.getByRole("combobox", { name: "Sort ideas" });
    expect(sort).toHaveTextContent("Recently updated");
    fireEvent.click(sort);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Recently updated",
      "Oldest updated",
      "Recently created",
      "Oldest created",
      "Title A–Z",
      "Title Z–A",
    ]);
    const option = screen.getByRole("option", { name: "Title A–Z" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.mouseMove(option);
    fireEvent.pointerUp(option, { pointerType: "mouse" });
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    expect(went(state.push)).toEqual(["/library?q=grace&sort=title-asc"]);
  });
});

describe("view", () => {
  const cards = () => screen.getByRole("radio", { name: "Cards view" });
  const list = () => screen.getByRole("radio", { name: "List view" });

  it("starts as cards and remembers a change without touching the address", () => {
    const { unmount } = render(<Library at={query({ q: "grace", page: 2 })} />);
    expect(cards()).toBeChecked();
    fireEvent.click(list());
    expect(list()).toBeChecked();
    expect(localStorage.getItem(libraryViewKey)).toBe("list");
    expect(document.documentElement.dataset.libraryView).toBe("list");
    expect(state.push).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    unmount();

    // A later visit, with no HTML load to run the inline script, is drawn the same way.
    delete document.documentElement.dataset.libraryView;
    render(<Library />);
    expect(list()).toBeChecked();
    expect(document.documentElement.dataset.libraryView).toBe("list");
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem(libraryViewKey, "table");
    render(<Library />);
    expect(cards()).toBeChecked();
    expect(document.documentElement.dataset.libraryView).toBe("cards");
  });

  it("moves between the two with the arrow keys", () => {
    render(<Library />);
    cards().focus();
    fireEvent.keyDown(cards(), { key: "ArrowRight" });
    expect(list()).toBeChecked();
    expect(list()).toHaveFocus();
  });
});

describe("tag management", () => {
  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: "Manage tags" }));
    return screen.getByRole("dialog", { name: "Manage tags" });
  };
  const flush = () => act(async () => {});

  beforeEach(() => {
    vi.useRealTimers();
    state.createTag.mockResolvedValue({ ok: true, message: "Tag created." });
    state.renameTag.mockResolvedValue({ ok: true, message: "Tag renamed." });
    state.deleteTag.mockResolvedValue({ ok: true, message: "Tag deleted." });
  });

  it("shows each tag's use", () => {
    render(<Library />);
    const rows = within(within(open()).getByRole("list", { name: "Your tags" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.textContent)).toEqual(["FaithOn 3 ideas", "PrayerOn 1 idea"]);
  });

  it("explains tags when there are none", () => {
    render(<Library having={[]} />);
    expect(within(open()).getByText("No tags yet")).toBeVisible();
  });

  it("creates a tag and empties the box once the server has it", async () => {
    render(<Library />);
    const dialog = open();
    const name = within(dialog).getByRole("textbox", { name: "New tag" });
    const create = within(dialog).getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    fireEvent.change(name, { target: { value: "Hope" } });
    fireEvent.click(create);
    await flush();
    expect(state.createTag).toHaveBeenCalledWith("Hope");
    expect(within(dialog).getByText("Tag created.")).toBeVisible();
    expect(name).toHaveValue("");
  });

  it("keeps what was typed when a name is refused", async () => {
    state.createTag.mockResolvedValueOnce({
      ok: false,
      message: "You already have a tag with that name.",
    });
    render(<Library />);
    const dialog = open();
    const name = within(dialog).getByRole("textbox", { name: "New tag" });
    fireEvent.change(name, { target: { value: "faith" } });
    fireEvent.submit(name.closest("form")!);
    await flush();
    expect(within(dialog).getByText("You already have a tag with that name.")).toBeVisible();
    expect(name).toHaveValue("faith");
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("reports a failure to reach the server without losing the name", async () => {
    state.createTag.mockRejectedValueOnce(new Error("network"));
    render(<Library />);
    const dialog = open();
    const name = within(dialog).getByRole("textbox", { name: "New tag" });
    fireEvent.change(name, { target: { value: "Hope" } });
    fireEvent.submit(name.closest("form")!);
    await flush();
    expect(within(dialog).getByText(/Check your connection/)).toBeVisible();
    expect(name).toHaveValue("Hope");
  });

  it("renames a tag in place", async () => {
    render(<Library />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Faith" }));
    const field = within(dialog).getByRole("textbox", { name: "New name for Faith" });
    expect(field).toHaveValue("Faith");
    fireEvent.change(field, { target: { value: "Trust" } });
    fireEvent.submit(field.closest("form")!);
    await flush();
    expect(state.renameTag).toHaveBeenCalledWith(faith, "Trust");
    expect(within(dialog).getByText("Tag renamed.")).toBeVisible();
    expect(within(dialog).queryByRole("textbox", { name: /New name/ })).not.toBeInTheDocument();
  });

  it("keeps the rename open, with the name typed, when it is refused", async () => {
    state.renameTag.mockResolvedValueOnce({
      ok: false,
      message: "You already have a tag with that name.",
    });
    render(<Library />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Faith" }));
    const field = within(dialog).getByRole("textbox", { name: "New name for Faith" });
    fireEvent.change(field, { target: { value: "Prayer" } });
    fireEvent.submit(field.closest("form")!);
    await flush();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "You already have a tag with that name.",
    );
    expect(within(dialog).getByRole("textbox", { name: "New name for Faith" })).toHaveValue(
      "Prayer",
    );
  });

  it("does not ask the server to rename a tag to the name it has", async () => {
    render(<Library />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Faith" }));
    const field = within(dialog).getByRole("textbox", { name: "New name for Faith" });
    fireEvent.submit(field.closest("form")!);
    await flush();
    expect(state.renameTag).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Rename Faith" })).toBeVisible();
  });

  it("cancels a rename", () => {
    render(<Library />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Faith" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(dialog).getByRole("button", { name: "Rename Faith" })).toBeVisible();
    expect(state.renameTag).not.toHaveBeenCalled();
  });

  it("asks before deleting, and says what happens to the ideas", async () => {
    render(<Library />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Faith" }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete the tag “Faith”?");
    expect(confirm).toHaveTextContent("It will come off 3 ideas. The ideas themselves are kept.");
    expect(state.deleteTag).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Delete tag" }));
    await flush();
    expect(state.deleteTag).toHaveBeenCalledWith(faith);
    expect(within(dialog).getByText("Tag deleted.")).toBeVisible();
    // Nothing was filtered by it, so the address is left alone.
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("does nothing when the deletion is cancelled", () => {
    render(<Library />);
    fireEvent.click(within(open()).getByRole("button", { name: "Delete Prayer" }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("It will come off 1 idea. The idea itself is kept.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(state.deleteTag).not.toHaveBeenCalled();
  });

  it("takes a deleted tag out of the filter", async () => {
    render(<Library at={query({ tagIds: [faith, prayer], tagMode: "all", page: 2 })} />);
    fireEvent.click(within(open()).getByRole("button", { name: "Delete Faith" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete tag" }),
    );
    await flush();
    expect(went(state.replace)).toEqual([`/library?tag=${prayer}&tag_mode=all`]);
  });

  it("leaves the tag in place when the server refuses to delete it", async () => {
    state.deleteTag.mockResolvedValueOnce({ ok: false, message: "That tag no longer exists." });
    render(<Library at={query({ tagIds: [faith] })} />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Faith" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete tag" }),
    );
    await flush();
    expect(within(dialog).getByText("That tag no longer exists.")).toBeVisible();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(<Library />);
    const dialog = open();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Manage tags" })).not.toBeInTheDocument();
  });
});
