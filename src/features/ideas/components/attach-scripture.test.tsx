import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScriptureReference } from "@/features/scripture/reference";
import type { IdeaMatch } from "../idea-search";

// The server actions are mocked and the search endpoint is faked: this covers
// what the dialog does around them. Both are tested on a database of their own.
const state = vi.hoisted(() => ({ attachScripture: vi.fn(), createIdea: vi.fn() }));
vi.mock("../actions", () => ({
  attachScripture: state.attachScripture,
  createIdea: state.createIdea,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ToastProvider } from "@/components/ui/toast";
import { AttachScripture } from "./attach-scripture";
import { QuickCaptureProvider } from "./quick-capture";

const passage = (
  book: number,
  chapterStart: number,
  verseStart: number | null = null,
  verseEnd: number | null = null,
): ScriptureReference => ({ book, chapterStart, verseStart, chapterEnd: null, verseEnd });
const john = passage(43, 3, 16, 18);

const idea = (fields: Partial<IdeaMatch> & { title: string }): IdeaMatch => ({
  id: `id-${fields.title}`,
  kind: "sermon",
  status: "idea",
  subject: null,
  references: [],
  archived: false,
  ...fields,
});
const library: IdeaMatch[] = [
  idea({ title: "Grace abounding", subject: "Grace", status: "developing" }),
  idea({ title: "Faith speaks first", kind: "point" }),
  idea({ title: "Something about water", kind: "undecided" }),
  idea({ title: "Loved", references: [{ ...john, isPrimary: true }] }),
];

const requests: string[] = [];
let ideas = library;
let total: number | null = null;
let fails = false;
/** Holds the answer to a search for these words until released. */
let hold: { q: string; release: () => void } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  requests.length = 0;
  ideas = library;
  total = null;
  fails = false;
  hold = null;
  state.attachScripture.mockImplementation(async ({ ideaId }: { ideaId: string }) => ({
    ok: true,
    id: ideaId,
    added: 1,
    message: "Added John 3:16–18 to “Grace abounding”.",
  }));
  state.createIdea.mockResolvedValue({ ok: true, message: "Saved to your library.", id: "new" });
  vi.stubGlobal("fetch", async (url: string, init?: { signal?: AbortSignal }) => {
    requests.push(url);
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const q = (params.get("q") ?? "").toLowerCase();
    const kind = params.get("kind");
    if (hold && hold.q === q) {
      await new Promise<void>((release) => (hold!.release = release));
    }
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (fails) {
      return { ok: false, status: 503, json: async () => ({ message: "The ideas are away." }) };
    }
    const items = ideas.filter(
      (item) => item.title.toLowerCase().includes(q) && (!kind || item.kind === kind),
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ items, total: total ?? items.length }),
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A page with one button that asks to put the passages on an idea. */
function Page({ references }: { references: ScriptureReference[] }) {
  const [attaching, setAttaching] = useState<ScriptureReference[] | null>(null);
  return (
    <ToastProvider>
      <QuickCaptureProvider>
        <button type="button" onClick={() => setAttaching(references)}>
          Add to idea
        </button>
        <AttachScripture references={attaching} onClose={() => setAttaching(null)} />
      </QuickCaptureProvider>
    </ToastProvider>
  );
}

async function open(references: ScriptureReference[] = [john]) {
  render(<Page references={references} />);
  // As a person would: the button has the focus when it is pressed.
  screen.getByRole("button", { name: "Add to idea" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Add to idea" }));
  const dialog = await screen.findByRole("dialog", { name: "Add to an idea" });
  return within(dialog);
}

const box = () => screen.getByRole("searchbox", { name: "Search your ideas" });
const closed = () =>
  waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Add to an idea" })).not.toBeInTheDocument(),
  );

describe("AttachScripture", () => {
  it("names the passage and lists the ideas changed most recently", async () => {
    const dialog = await open();
    expect(dialog.getByText("John 3:16–18")).toBeVisible();
    const list = await dialog.findByRole("list", { name: "Recently changed ideas" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(requests).toEqual(["/api/ideas/search"]);
    // Enough to tell one idea from another: its kind, where it stands, a sermon's subject.
    const grace = within(list).getByRole("button", {
      name: "Add John 3:16–18 to Grace abounding",
    });
    expect(grace).toHaveTextContent("Sermon idea");
    expect(grace).toHaveTextContent("Developing");
    expect(grace).toHaveTextContent("Grace");
    await waitFor(() => expect(box()).toHaveFocus());
  });

  it("names verses that are apart as the separate passages they are", async () => {
    const dialog = await open([passage(43, 3, 3), passage(43, 3, 5, 6), passage(43, 3, 8)]);
    expect(dialog.getByText("John 3:3, 5–6, 8")).toBeVisible();
  });

  it("searches after a pause in typing, not on every key", async () => {
    const dialog = await open();
    await dialog.findByRole("list", { name: "Recently changed ideas" });
    vi.useFakeTimers();
    fireEvent.change(box(), { target: { value: "f" } });
    fireEvent.change(box(), { target: { value: "fa" } });
    fireEvent.change(box(), { target: { value: "faith" } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(requests).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(100));
    vi.useRealTimers();
    expect(requests).toEqual(["/api/ideas/search", "/api/ideas/search?q=faith"]);
    const list = await dialog.findByRole("list", { name: "Matching ideas" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("Faith speaks first");
  });

  it("switches between sermon ideas and point ideas at once", async () => {
    const dialog = await open();
    await dialog.findByRole("list", { name: "Recently changed ideas" });
    fireEvent.click(dialog.getByRole("radio", { name: "Points" }));
    await waitFor(() => expect(requests.at(-1)).toBe("/api/ideas/search?kind=point"));
    await waitFor(() =>
      expect(dialog.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        expect.stringContaining("Faith speaks first"),
      ]),
    );
    fireEvent.click(dialog.getByRole("radio", { name: "Sermons" }));
    await waitFor(() => expect(requests.at(-1)).toBe("/api/ideas/search?kind=sermon"));
    await waitFor(() => expect(dialog.getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(dialog.getByRole("radio", { name: "All ideas" }));
    await waitFor(() => expect(dialog.getAllByRole("listitem")).toHaveLength(4));
  });

  it("drops the answer to a search that has been replaced", async () => {
    const dialog = await open();
    await dialog.findByRole("list", { name: "Recently changed ideas" });
    hold = { q: "grace", release: () => {} };
    fireEvent.change(box(), { target: { value: "grace" } });
    await waitFor(() => expect(requests).toContain("/api/ideas/search?q=grace"));
    fireEvent.change(box(), { target: { value: "water" } });
    await waitFor(() => expect(dialog.getAllByRole("listitem")).toHaveLength(1));
    // The slow one arrives last, and is not shown.
    await act(async () => hold!.release());
    expect(dialog.getAllByRole("listitem")).toHaveLength(1);
    expect(dialog.getByRole("list", { name: "Matching ideas" })).toHaveTextContent("water");
  });

  it("adds the passage to the idea chosen, closes, and offers the way to it", async () => {
    const dialog = await open();
    fireEvent.click(await dialog.findByRole("button", { name: /to Grace abounding$/ }));
    await closed();
    expect(state.attachScripture).toHaveBeenCalledTimes(1);
    expect(state.attachScripture).toHaveBeenCalledWith({
      ideaId: "id-Grace abounding",
      references: [john],
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Added John 3:16–18 to “Grace abounding”.",
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/library/id-Grace abounding",
    );
  });

  it("adds to a point idea the same way", async () => {
    const dialog = await open();
    fireEvent.click(dialog.getByRole("radio", { name: "Points" }));
    fireEvent.click(await dialog.findByRole("button", { name: /to Faith speaks first$/ }));
    await closed();
    expect(state.attachScripture).toHaveBeenCalledWith({
      ideaId: "id-Faith speaks first",
      references: [john],
    });
  });

  it("says an idea already has the passage, and does not offer to add it again", async () => {
    const dialog = await open();
    const held = await dialog.findByRole("button", { name: "Loved: already has John 3:16–18" });
    expect(held).toBeDisabled();
    expect(held).toHaveTextContent("Added");
    fireEvent.click(held);
    expect(state.attachScripture).not.toHaveBeenCalled();
  });

  it("still offers an idea that has only part of what is being added", async () => {
    const dialog = await open([john, passage(45, 6, 23)]);
    expect(
      await dialog.findByRole("button", { name: "Add John 3:16–18; Romans 6:23 to Loved" }),
    ).toBeEnabled();
  });

  it("sends one request however often the idea is pressed", async () => {
    let release = () => {};
    state.attachScripture.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, id: "x", added: 1, message: "Added." });
        }),
    );
    const dialog = await open();
    const grace = await dialog.findByRole("button", { name: /to Grace abounding$/ });
    fireEvent.click(grace);
    fireEvent.click(grace);
    fireEvent.click(dialog.getByRole("button", { name: /to Faith speaks first$/ }));
    expect(state.attachScripture).toHaveBeenCalledTimes(1);
    // Nothing else can be started, and the dialog cannot be closed, until it answers.
    expect(grace).toHaveAttribute("aria-busy", "true");
    expect(dialog.getByRole("button", { name: /to Faith speaks first$/ })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "New sermon idea" })).toBeDisabled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Add to an idea" })).toBeVisible();
    await act(async () => release());
    await closed();
  });

  it("stays open and says why when the server refuses", async () => {
    state.attachScripture.mockResolvedValue({ ok: false, message: "That idea no longer exists." });
    const dialog = await open();
    fireEvent.click(await dialog.findByRole("button", { name: /to Grace abounding$/ }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("That idea no longer exists.");
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
    // Another can be tried.
    expect(dialog.getByRole("button", { name: /to Faith speaks first$/ })).toBeEnabled();
  });

  it("stays open and says so when the request never arrives", async () => {
    state.attachScripture.mockRejectedValue(new Error("network"));
    const dialog = await open();
    fireEvent.click(await dialog.findByRole("button", { name: /to Grace abounding$/ }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(/did not reach the server/);
  });

  it("changes nothing when it is closed", async () => {
    const dialog = await open();
    await dialog.findByRole("list", { name: "Recently changed ideas" });
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    await closed();
    expect(state.attachScripture).not.toHaveBeenCalled();
    expect(state.createIdea).not.toHaveBeenCalled();
    // Focus goes back to where it was asked for.
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to idea" })).toHaveFocus());
  });

  it("closes on Escape", async () => {
    await open();
    await waitFor(() => expect(box()).toHaveFocus());
    fireEvent.keyDown(box(), { key: "Escape" });
    await closed();
    expect(state.attachScripture).not.toHaveBeenCalled();
  });

  it("says when a search finds nothing, and when there are no ideas at all", async () => {
    const dialog = await open();
    await dialog.findByRole("list", { name: "Recently changed ideas" });
    fireEvent.change(box(), { target: { value: "zzz" } });
    expect(await dialog.findByText("No ideas match “zzz”.")).toBeVisible();
    fireEvent.click(dialog.getByRole("radio", { name: "Points" }));
    expect(await dialog.findByText("No point ideas match “zzz”.")).toBeVisible();
    ideas = [];
    fireEvent.click(dialog.getByRole("button", { name: "Clear search" }));
    fireEvent.click(dialog.getByRole("radio", { name: "All ideas" }));
    expect(await dialog.findByText(/You have no ideas yet/)).toBeVisible();
  });

  it("says how many more there are than it shows", async () => {
    total = 31;
    const dialog = await open();
    expect(await dialog.findByText(/Showing 4 of 31/)).toBeVisible();
  });

  it("offers to try again when the ideas cannot be read", async () => {
    fails = true;
    const dialog = await open();
    expect(await dialog.findByRole("alert")).toHaveTextContent("The ideas are away.");
    fails = false;
    fireEvent.click(dialog.getByRole("button", { name: "Try again" }));
    expect(await dialog.findByRole("list", { name: "Recently changed ideas" })).toBeVisible();
  });

  it("will not add more passages than an idea can hold", async () => {
    const many = Array.from({ length: 26 }, (_, index) => passage(19, 119, index * 2 + 1));
    const dialog = await open(many);
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      /up to 25 references, and this is 26/,
    );
    expect(await dialog.findByRole("button", { name: /Grace abounding$/ })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "New point idea" })).toBeDisabled();
  });
});

describe("starting a new idea from Scripture", () => {
  const capture = () => screen.findByRole("dialog", { name: "Capture an idea" });

  it("hands the passage to quick capture as a sermon idea, saving nothing yet", async () => {
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "New sermon idea" }));
    const form = within(await capture());
    await closed();
    expect(form.getByRole("radio", { name: "Sermon" })).toBeChecked();
    expect(form.getByRole("list", { name: "References" })).toHaveTextContent("John 3:16–18");
    // A sermon's first passage is its main text.
    expect(form.getByRole("button", { name: "John 3:16–18: main text" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(state.createIdea).not.toHaveBeenCalled();
    expect(state.attachScripture).not.toHaveBeenCalled();
  });

  it("hands every passage of the selection to a new point idea", async () => {
    const apart = [passage(43, 3, 3), passage(43, 3, 5, 6)];
    const dialog = await open(apart);
    fireEvent.click(dialog.getByRole("button", { name: "New point idea" }));
    const form = within(await capture());
    expect(form.getByRole("radio", { name: "Point" })).toBeChecked();
    expect(
      within(form.getByRole("list", { name: "References" })).getAllByRole("listitem"),
    ).toHaveLength(2);

    fireEvent.change(form.getByRole("textbox", { name: "Idea" }), {
      target: { value: "Born of water and of the Spirit" },
    });
    fireEvent.submit(form.getByRole("textbox", { name: "Idea" }).closest("form")!);
    await waitFor(() => expect(state.createIdea).toHaveBeenCalledTimes(1));
    expect(state.createIdea.mock.calls[0][0]).toMatchObject({
      kind: "point",
      title: "Born of water and of the Spirit",
      references: apart.map((reference) => ({ ...reference, isPrimary: false })),
    });
  });

  it("leaves nothing behind when the new idea is abandoned untouched", async () => {
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "New point idea" }));
    const form = within(await capture());
    fireEvent.click(form.getByRole("button", { name: "Close capture" }));
    // There is nothing of the person's own to lose, so nothing is asked.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(state.createIdea).not.toHaveBeenCalled();
  });

  it("asks before throwing away what was written beyond the passage", async () => {
    const dialog = await open();
    fireEvent.click(dialog.getByRole("button", { name: "New sermon idea" }));
    const form = within(await capture());
    fireEvent.change(form.getByRole("textbox", { name: "Idea" }), {
      target: { value: "So loved" },
    });
    fireEvent.click(form.getByRole("button", { name: "Close capture" }));
    expect(await screen.findByRole("alertdialog", { name: "Discard this idea?" })).toBeVisible();
    expect(state.createIdea).not.toHaveBeenCalled();
  });
});
