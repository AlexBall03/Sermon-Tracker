import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { versesIn } from "../books";
import { parseReference, type ScriptureReference } from "../reference";
import { clearChapterCache } from "../use-chapter";
import { PassageText } from "./passage-text";
import { ReferenceChip } from "./reference-chip";
import { ScriptureBrowser } from "./scripture-browser";
import { ScriptureField, type FieldReference } from "./scripture-field";
import { ScriptureProvider } from "./scripture-provider";

const ref = (typed: string): ScriptureReference => {
  const result = parseReference(typed);
  if (!result.ok) throw new Error(result.message);
  return result.reference;
};

// The Bible endpoints are faked: every verse says where it is from, and a
// search for "water" finds two verses, the second on a further page.
const requests: string[] = [];
let failNext = false;
const hits = [
  { book: 43, chapter: 4, verse: 10, text: "the gift of living [[water]]." },
  { book: 66, chapter: 22, verse: 17, text: "take the [[water]] of life freely." },
];

beforeEach(() => {
  clearChapterCache();
  requests.length = 0;
  failNext = false;
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (failNext) {
      failNext = false;
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (url.startsWith("/api/bible/search")) {
      const params = new URLSearchParams(url.split("?")[1]);
      if (params.get("q") === "nothing") {
        return { ok: true, status: 200, json: async () => ({ total: 0, hits: [] }) };
      }
      const offset = Number(params.get("offset"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ total: 2, hits: hits.slice(offset, offset + 1) }),
      };
    }
    const [book, chapter] = url.split("/").slice(-2).map(Number);
    const verses = Array.from(
      { length: versesIn(book, chapter) },
      (_, index) => `Text of ${book}.${chapter}.${index + 1}`,
    );
    return { ok: true, status: 200, json: async () => ({ book, chapter, verses }) };
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

/** Picks an option from one of the custom dropdowns. */
async function choose(scope: ReturnType<typeof within>, label: string, option: string) {
  fireEvent.click(scope.getByRole("combobox", { name: label }));
  const item = await screen.findByRole("option", { name: option });
  // A real click starts with the pointer going down on the option.
  fireEvent.pointerDown(item);
  fireEvent.click(item);
}

describe("PassageText", () => {
  const verses = ["One.", "Two.", "Three.", "Four."];

  it("shows the requested verses with their numbers", () => {
    render(<PassageText verses={verses} show={{ from: 2, to: 3 }} />);
    expect(screen.queryByText("One.")).not.toBeInTheDocument();
    expect(screen.getByText("Two.")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marks selected verses, adjacent or not, and reports a tap", () => {
    const onSelect = vi.fn();
    render(<PassageText verses={verses} selected={[4, 2]} onSelectVerse={onSelect} />);
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed.map((button) => button.dataset.verse)).toEqual(["2", "4"]);
    fireEvent.click(screen.getByRole("button", { name: /Three\./ }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe("ScriptureBrowser", () => {
  function browse(initial?: ScriptureReference) {
    const onAttach = vi.fn();
    const onDone = vi.fn();
    const view = render(
      <ScriptureBrowser
        initial={initial}
        attach={{ label: "Add to idea", onAttach }}
        onDone={onDone}
        header={<h2>Scripture</h2>}
      />,
    );
    return { onAttach, onDone, page: within(view.container) };
  }
  const selection = () => document.querySelector("[data-selection]")!;
  const tap = (verse: string) =>
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Text of ${verse}$`) }));
  const pressed = () =>
    screen.queryAllByRole("button", { pressed: true }).map((button) => button.dataset.verse);

  it("opens on the given passage with it selected, loading only that chapter", async () => {
    browse(ref("John 3:16-18"));
    expect(await screen.findByText("Text of 43.3.16")).toBeVisible();
    expect(requests).toEqual(["/api/bible/43/3"]);
    expect(selection()).toHaveTextContent("John 3:16–18");
    expect(pressed()).toEqual(["16", "17", "18"]);
  });

  it("selects any number of verses, and unselects one that is tapped again", async () => {
    const { onAttach, onDone } = browse(ref("Psalm 23"));
    await screen.findByText("Text of 19.23.1");
    expect(selection()).toHaveTextContent("Psalm 23");

    for (const verse of ["19.23.1", "19.23.2", "19.23.3", "19.23.6"]) tap(verse);
    expect(pressed()).toEqual(["1", "2", "3", "6"]);
    expect(selection()).toHaveTextContent("Psalm 23:1–3, 6");

    tap("19.23.2");
    expect(pressed()).toEqual(["1", "3", "6"]);
    expect(selection()).toHaveTextContent("Psalm 23:1, 3, 6");

    tap("19.23.2");
    tap("19.23.6");
    fireEvent.click(screen.getByRole("button", { name: "Add to idea" }));
    // Each unbroken run is one passage.
    expect(onAttach).toHaveBeenCalledWith([ref("Psalm 23:1-3")]);
    expect(onDone).toHaveBeenCalled();
  });

  it("attaches separate runs of verses as separate passages", async () => {
    const { onAttach } = browse(ref("Psalm 23"));
    await screen.findByText("Text of 19.23.1");
    for (const verse of ["19.23.4", "19.23.1", "19.23.5"]) tap(verse);
    fireEvent.click(screen.getByRole("button", { name: "Add to idea" }));
    expect(onAttach).toHaveBeenCalledWith([ref("Psalm 23:1"), ref("Psalm 23:4-5")]);
  });

  it("goes back to the whole chapter when the last verse is unselected or cleared", async () => {
    const { onAttach } = browse(ref("Psalm 23:4"));
    await screen.findByText("Text of 19.23.1");
    tap("19.23.4");
    expect(pressed()).toEqual([]);
    expect(selection()).toHaveTextContent("Psalm 23");

    tap("19.23.2");
    fireEvent.click(screen.getByRole("button", { name: "Clear, and use the whole chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to idea" }));
    expect(onAttach).toHaveBeenCalledWith([ref("Psalm 23")]);
  });

  it("stays open for the next passage when the idea is beside it, and closes when it is not", async () => {
    const onAttach = vi.fn();
    const onDone = vi.fn();
    const panel = (besideIdea: boolean, repeatable: boolean) => (
      <ScriptureBrowser
        initial={ref("Psalm 23")}
        attach={{ label: "Add to idea", onAttach, repeatable }}
        besideIdea={besideIdea}
        onDone={onDone}
        header={<h2>Scripture</h2>}
      />
    );
    const add = () => fireEvent.click(screen.getByRole("button", { name: "Add to idea" }));

    const view = render(panel(true, true));
    await screen.findByText("Text of 19.23.1");
    tap("19.23.1");
    tap("19.23.2");
    add();
    expect(onAttach).toHaveBeenLastCalledWith([ref("Psalm 23:1-2")]);
    expect(onDone).not.toHaveBeenCalled();
    // The slate is clean for the next one, and it says what happened.
    expect(pressed()).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("Psalm 23:1–2 added.");

    tap("19.23.6");
    expect(screen.queryByText(/added\./)).not.toBeInTheDocument();
    add();
    expect(onAttach).toHaveBeenLastCalledWith([ref("Psalm 23:6")]);
    expect(onDone).not.toHaveBeenCalled();

    // Covering the idea (a narrow screen): attaching returns to it.
    view.rerender(panel(false, true));
    add();
    expect(onDone).toHaveBeenCalledTimes(1);

    // Replacing one reference is finished once it is done, wherever the panel is.
    view.rerender(panel(true, false));
    add();
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("goes to a passage with the book, chapter, and verse filters", async () => {
    const { page } = browse();
    await screen.findByText("Text of 1.1.1");

    await choose(page, "Book", "Romans");
    expect(await screen.findByText("Text of 45.1.1")).toBeVisible();
    await choose(page, "Chapter", "12");
    expect(await screen.findByText("Text of 45.12.1")).toBeVisible();
    expect(selection()).toHaveTextContent("Romans 12");

    await choose(page, "Verse", "2");
    expect(pressed()).toEqual(["2"]);
    expect(selection()).toHaveTextContent("Romans 12:2");
    await choose(page, "Verse", "All");
    expect(pressed()).toEqual([]);
  });

  it("moves with the arrows, across a book boundary, and stops at the end", async () => {
    const { page } = browse(ref("Malachi 4"));
    await screen.findByText("Text of 39.4.1");
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(await screen.findByText("Text of 40.1.1")).toBeVisible();
    expect(selection()).toHaveTextContent("Matthew 1");

    await choose(page, "Book", "Revelation");
    await choose(page, "Chapter", "22");
    expect(await screen.findByText("Text of 66.22.21")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next chapter" })).toBeDisabled();
  });

  it("searches the text for words and opens a result at its verse", async () => {
    browse(ref("Psalm 23"));
    await screen.findByText("Text of 19.23.1");
    const box = screen.getByRole("searchbox", { name: "Search the Bible" });
    fireEvent.change(box, { target: { value: '"living water"' } });
    fireEvent.submit(box.closest("form")!);

    const results = await screen.findByRole("region", { name: "Search results" });
    expect(await within(results).findByText("2 verses")).toBeVisible();
    expect(requests.at(-1)).toBe(
      `/api/bible/search?${new URLSearchParams({ q: '"living water"', in: "all", offset: "0" })}`,
    );
    const hit = within(results).getByRole("button", { name: /John 4:10/ });
    // The matched word is marked, not bracketed.
    expect(within(hit).getByText("water").tagName).toBe("MARK");
    expect(hit).not.toHaveTextContent("[[");

    fireEvent.click(within(results).getByRole("button", { name: "Show more" }));
    expect(await within(results).findByRole("button", { name: /Revelation 22:17/ })).toBeVisible();
    expect(within(results).queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    fireEvent.click(hit);
    expect(await screen.findByText("Text of 43.4.10")).toBeVisible();
    expect(pressed()).toEqual(["10"]);
    expect(selection()).toHaveTextContent("John 4:10");
    // The results are still there to go back to.
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(screen.getByRole("region", { name: "Search results" })).toBeVisible();
  });

  it("narrows a search to a testament or the open book", async () => {
    const { page } = browse(ref("John 4"));
    await screen.findByText("Text of 43.4.1");
    const box = screen.getByRole("searchbox", { name: "Search the Bible" });
    fireEvent.change(box, { target: { value: "water" } });
    fireEvent.submit(box.closest("form")!);
    await screen.findByText("2 verses");

    await choose(page, "Search in", "John");
    await waitFor(() => expect(requests.at(-1)).toContain("in=43"));
    await choose(page, "Search in", "New Testament");
    await waitFor(() => expect(requests.at(-1)).toContain("in=new"));
  });

  it("explains an empty or unusable search without sending it", async () => {
    browse();
    await screen.findByText("Text of 1.1.1");
    const box = screen.getByRole("searchbox", { name: "Search the Bible" });
    const before = requests.length;

    fireEvent.submit(box.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Type a word or a phrase");
    fireEvent.change(box, { target: { value: "-law" } });
    fireEvent.submit(box.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Add a word to look for");
    expect(requests).toHaveLength(before);

    fireEvent.change(box, { target: { value: "nothing" } });
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByText(/No verses match/)).toBeVisible();
  });

  it("offers the passage when a reference is typed into the search box", async () => {
    browse();
    await screen.findByText("Text of 1.1.1");
    const box = screen.getByRole("searchbox", { name: "Search the Bible" });
    fireEvent.change(box, { target: { value: "Romans 12:1-2" } });
    fireEvent.submit(box.closest("form")!);

    fireEvent.click(await screen.findByRole("button", { name: "Go to Romans 12:1–2" }));
    expect(await screen.findByText("Text of 45.12.1")).toBeVisible();
    expect(pressed()).toEqual(["1", "2"]);
  });

  it("lists the search options on request", async () => {
    browse();
    const toggle = screen.getByRole("button", { name: "Search options" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    // In a popover over the passage, which is placed a moment after it opens.
    await waitFor(() => expect(screen.getByText('"living water"')).toBeVisible());
    expect(screen.getByText("lov*")).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("offers another try when a chapter cannot be loaded", async () => {
    failNext = true;
    browse(ref("Jude 5"));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Text of 65.1.5")).toBeVisible();
  });
});

describe("ReferenceChip", () => {
  it("previews the passage, then carries it into the panel", async () => {
    render(
      <ScriptureProvider>
        <ReferenceChip reference={ref("Genesis 1")} />
      </ScriptureProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Genesis 1: preview the passage" }));

    const preview = await screen.findByRole("dialog", { name: "Genesis 1" });
    expect(await within(preview).findByText("Text of 1.1.1")).toBeVisible();
    // A preview is short; the rest is one step away.
    expect(within(preview).queryByText("Text of 1.1.7")).not.toBeInTheDocument();
    expect(within(preview).getByText("And 25 more verses.")).toBeVisible();

    fireEvent.click(within(preview).getByRole("button", { name: "Read all" }));
    const panel = await screen.findByRole("dialog", { name: "Scripture" });
    expect(await within(panel).findByText("Text of 1.1.31")).toBeVisible();
    // Reading only: nothing to attach, and the chapter was fetched once.
    expect(
      within(panel).queryByRole("button", { name: /Add to idea|Update/ }),
    ).not.toBeInTheDocument();
    expect(requests).toEqual(["/api/bible/1/1"]);
  });
});

describe("ScriptureField", () => {
  function Form({ allowPrimary = false }: { allowPrimary?: boolean }) {
    const [value, setValue] = useState<FieldReference[]>([]);
    return (
      <ScriptureProvider>
        <ScriptureField value={value} onChange={setValue} allowPrimary={allowPrimary} max={3} />
      </ScriptureProvider>
    );
  }
  const entry = () => screen.getByRole("textbox", { name: "Scripture" });
  const add = (typed: string) => {
    fireEvent.change(entry(), { target: { value: typed } });
    fireEvent.keyDown(entry(), { key: "Enter" });
  };
  const chips = () =>
    screen.getAllByRole("button", { name: /preview the passage/ }).map((chip) => chip.textContent);

  it("adds typed references, ignores a repeat, and stops at its limit", () => {
    render(<Form />);
    add("John 3:16");
    add("john 3.16");
    expect(screen.getByText("John 3:16 is already here.")).toBeVisible();
    add("Psalm 23");
    add("Romans 12:1-2");
    expect(chips()).toEqual(["John 3:16", "Psalm 23", "Romans 12:1–2"]);
    add("Jude 5");
    expect(screen.getByText("An idea can hold up to 3 references.")).toBeVisible();
    expect(chips()).toHaveLength(3);
  });

  it("marks one main text for a sermon, and only one", () => {
    render(<Form allowPrimary />);
    add("John 3:16");
    add("Psalm 23");
    const main = (name: string) => screen.getByRole("button", { name: `${name}: main text` });
    expect(main("John 3:16")).toHaveAttribute("aria-pressed", "true");
    expect(main("Psalm 23")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(main("Psalm 23"));
    expect(main("John 3:16")).toHaveAttribute("aria-pressed", "false");
    expect(main("Psalm 23")).toHaveAttribute("aria-pressed", "true");
  });

  it("browses for verses and adds each run that is chosen", async () => {
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    const panel = await screen.findByRole("dialog", { name: "Scripture" });
    await within(panel).findByText("Text of 1.1.1");
    for (const verse of ["1", "2", "5"]) {
      fireEvent.click(
        within(panel).getByRole("button", { name: new RegExp(`Text of 1\\.1\\.${verse}$`) }),
      );
    }
    fireEvent.click(within(panel).getByRole("button", { name: "Add to idea" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(chips()).toEqual(["Genesis 1:1–2", "Genesis 1:5"]);
    expect(screen.getByText("Genesis 1:1–2, 5 added.")).toBeVisible();
  });

  it("keeps a side panel open across several additions on a wide screen", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    const panel = await screen.findByRole("dialog", { name: "Scripture" });
    const verse = (number: number) =>
      within(panel).getByRole("button", { name: new RegExp(`Text of 1\\.1\\.${number}$`) });
    await within(panel).findByText("Text of 1.1.1");

    fireEvent.click(verse(1));
    fireEvent.click(within(panel).getByRole("button", { name: "Add to idea" }));
    fireEvent.click(verse(3));
    fireEvent.click(within(panel).getByRole("button", { name: "Add to idea" }));
    // The same passage again is recognised, because the panel sees the list as it is now.
    fireEvent.click(verse(3));
    fireEvent.click(within(panel).getByRole("button", { name: "Add to idea" }));

    expect(screen.getByRole("dialog", { name: "Scripture" })).toBeInTheDocument();
    expect(chips()).toEqual(["Genesis 1:1", "Genesis 1:3"]);
    expect(screen.getByText("Genesis 1:3 is already here.")).toBeInTheDocument();
  });

  it("changes a reference in place, keeping its position and main-text mark", async () => {
    render(<Form allowPrimary />);
    add("John 3:16");
    add("Psalm 23");
    fireEvent.click(screen.getByRole("button", { name: "John 3:16: preview the passage" }));
    const preview = await screen.findByRole("dialog", { name: "John 3:16" });
    fireEvent.click(within(preview).getByRole("button", { name: "Read or change" }));

    const panel = await screen.findByRole("dialog", { name: "Scripture" });
    fireEvent.click(await within(panel).findByRole("button", { name: /Text of 43\.3\.17$/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "Update reference" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(chips()).toEqual(["John 3:16–17", "Psalm 23"]);
    expect(screen.getByRole("button", { name: "John 3:16–17: main text" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
