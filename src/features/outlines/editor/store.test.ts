// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OutlineActionResult } from "../actions";
import { createOutlineStore, type OutlineSnapshot, type SnapshotEntry } from "./store";

const point = (
  id: string,
  title: string,
  position: number,
  parentId: string | null = null,
  notes: string | null = null,
): SnapshotEntry => ({ id, parentId, type: "point", position, title, notes, revision: 1 });

/** One, with Sub under it, then Two. The outline's shape is at revision 3. */
const outline = (): OutlineSnapshot => ({
  id: "outline",
  revision: 3,
  numbering: { version: 1, preset: "traditional" },
  entries: [
    point("a", "One", 0),
    point("b", "Two", 1, null, "Its notes"),
    point("c", "Sub", 0, "a"),
  ],
});

type Input = Record<string, unknown>;

/** A stand-in for the server: it keeps the two revisions as the real actions do. */
function server(initial: OutlineSnapshot) {
  const entries = new Map(initial.entries.map((entry) => [entry.id, { ...entry }]));
  const held = { revision: initial.revision };
  const entryOf = (id: string) => ({
    ...entries.get(id)!,
    outlineId: initial.id,
    sourcePointId: null,
    references: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  const stale = (): OutlineActionResult => ({
    ok: false,
    code: "stale",
    message: "Changed elsewhere.",
    revision: held.revision,
  });
  const api = {
    addEntry: vi.fn(async (input: unknown, id?: unknown): Promise<OutlineActionResult> => {
      const entry = input as Input;
      const key = id as string;
      if (!entries.has(key)) {
        if (entry.expectedRevision !== held.revision) return stale();
        entries.set(key, {
          id: key,
          parentId: (entry.parentId as string | null) ?? null,
          type: entry.type as SnapshotEntry["type"],
          position: (entry.position as number) ?? 0,
          title: (entry.title as string) ?? "",
          notes: (entry.notes as string | null) ?? null,
          revision: 0,
        });
        held.revision += 1;
      }
      return { ok: true, message: "", revision: held.revision, entry: entryOf(key) };
    }),
    updateEntry: vi.fn(async (id: unknown, input: unknown): Promise<OutlineActionResult> => {
      const change = input as Input;
      const entry = entries.get(id as string);
      if (!entry) return { ok: false, code: "missing", message: "Gone." };
      if (change.expectedRevision !== entry.revision) {
        return {
          ok: false,
          code: "stale_entry",
          message: "Changed elsewhere.",
          entry: entryOf(entry.id),
        };
      }
      if (change.title !== undefined) entry.title = change.title as string;
      if (change.notes !== undefined) entry.notes = change.notes as string | null;
      entry.revision += 1;
      return { ok: true, message: "", entry: entryOf(entry.id) };
    }),
    moveEntry: vi.fn(async (_id: unknown, input: unknown): Promise<OutlineActionResult> => {
      if ((input as Input).expectedRevision !== held.revision) return stale();
      held.revision += 1;
      return { ok: true, message: "", revision: held.revision };
    }),
    removeEntry: vi.fn(async (id: unknown, expected?: unknown): Promise<OutlineActionResult> => {
      if (expected !== held.revision) return stale();
      entries.delete(id as string);
      held.revision += 1;
      return { ok: true, message: "", revision: held.revision };
    }),
    setOutlineNumbering: vi.fn(async (): Promise<OutlineActionResult> => ({
      ok: true,
      message: "",
      revision: held.revision,
    })),
  };
  return { api, entries, held };
}

const messages = { offline: "Offline.", reloadFailed: "Could not reload." };

function editor(initial = outline()) {
  const backend = server(initial);
  const reload = vi.fn();
  let next = 0;
  const store = createOutlineStore(initial, backend.api, {
    reload,
    messages,
    newId: () => `new-${(next += 1)}`,
  });
  const row = (id: string) => store.getState().rows.find((candidate) => candidate.id === id);
  return { ...backend, store, reload, row, status: () => store.getState().status };
}

/** A request that waits to be answered. */
function held<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (release = resolve));
  return { promise, release };
}

const pause = (ms = 900) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("saving words", () => {
  it("waits for a pause in the typing, then sends one request with the field that changed", async () => {
    const { store, api, status, row } = editor();
    expect(status()).toBe("saved");

    for (const title of ["O", "On", "One more"]) {
      store.setTitle("a", title);
      await pause(300);
    }
    expect(status()).toBe("unsaved");
    expect(api.updateEntry).not.toHaveBeenCalled();

    await pause();
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(api.updateEntry).toHaveBeenCalledWith("a", { title: "One more", expectedRevision: 1 });
    expect(status()).toBe("saved");
    expect(row("a")?.revision).toBe(2);
  });

  it("saves at once when the field is left, and shows the text as it is kept", async () => {
    const { store, api, status, row } = editor();
    store.setTitle("a", "  One   and  all ");
    store.setNotes("a", " A note \n");
    store.blur("a");
    expect(row("a")).toMatchObject({ title: "One and all", notes: "A note" });
    await pause(0);
    expect(api.updateEntry).toHaveBeenCalledWith("a", {
      title: "One and all",
      notes: "A note",
      expectedRevision: 1,
    });
    expect(status()).toBe("saved");
  });

  it("clears notes with null, and does not call a trailing space a change", async () => {
    const { store, api, status } = editor();
    store.setNotes("b", "   ");
    store.setTitle("a", "One ");
    await pause();
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(api.updateEntry).toHaveBeenCalledWith("b", { notes: null, expectedRevision: 1 });
    expect(status()).toBe("saved");
    // The space is still in the field: someone may be about to type the next word.
    expect(store.getState().rows.find((row) => row.id === "a")?.title).toBe("One ");
  });

  it("keeps what is typed while a request is away, and sends it next", async () => {
    const { store, api, status, row } = editor();
    const first = held<OutlineActionResult>();
    const real = api.updateEntry.getMockImplementation()!;
    api.updateEntry.mockImplementationOnce(async (id, input) => {
      await first.promise;
      return real(id, input);
    });

    store.setTitle("a", "First");
    await pause();
    expect(status()).toBe("saving");
    store.setTitle("a", "First and second");
    first.release({ ok: true, message: "" });
    await pause(0);

    // The answer to the first did not write over the second, and it is not called saved.
    expect(row("a")?.title).toBe("First and second");
    expect(status()).toBe("unsaved");

    await pause();
    expect(api.updateEntry).toHaveBeenLastCalledWith("a", {
      title: "First and second",
      expectedRevision: 2,
    });
    expect(status()).toBe("saved");
  });
});

describe("a save that fails", () => {
  it("is never shown as saved, is tried again by itself, and keeps the text", async () => {
    const { store, api, status, row } = editor();
    api.updateEntry.mockRejectedValueOnce(new Error("network"));
    store.setTitle("a", "Kept");
    await pause();
    expect(status()).toBe("failed");
    expect(store.getState().problem).toBe("Offline.");
    expect(row("a")?.title).toBe("Kept");

    await pause(2000);
    expect(api.updateEntry).toHaveBeenCalledTimes(2);
    expect(status()).toBe("saved");
  });

  it("stops trying after three more attempts, and tries again when asked", async () => {
    const { store, api, status } = editor();
    const down: OutlineActionResult = { ok: false, code: "failed", message: "Not saved." };
    api.updateEntry.mockResolvedValue(down);
    store.setTitle("a", "Kept");
    await pause();
    await pause(2000);
    await pause(5000);
    await pause(15000);
    await pause(60000);
    expect(api.updateEntry).toHaveBeenCalledTimes(4);
    expect(status()).toBe("failed");
    expect(store.getState().problem).toBe("Not saved.");

    api.updateEntry.mockReset();
    api.updateEntry.mockResolvedValue({
      ok: true,
      message: "",
      entry: { id: "a", title: "Kept", notes: null, revision: 2 } as never,
    });
    store.retry();
    await pause(0);
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(status()).toBe("saved");
  });

  it("does not retry by itself when the account is refused", async () => {
    const { store, api, status } = editor();
    api.updateEntry.mockResolvedValue({ ok: false, message: "Your session has ended." });
    store.setTitle("a", "Kept");
    await pause();
    await pause(60000);
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(status()).toBe("failed");
    expect(store.getState().problem).toBe("Your session has ended.");
  });

  it("sends an addition again with the same ID", async () => {
    const { store, api, status } = editor();
    api.addEntry.mockRejectedValueOnce(new Error("network"));
    const id = store.addPoint(null);
    await pause(0);
    expect(status()).toBe("failed");
    await pause(2000);
    expect(api.addEntry).toHaveBeenCalledTimes(2);
    expect(api.addEntry.mock.calls[0][1]).toBe(id);
    expect(api.addEntry.mock.calls[1][1]).toBe(id);
    expect(status()).toBe("saved");
  });
});

describe("changes of shape", () => {
  it("are shown at once and sent in order, each naming the revision the last one left", async () => {
    const { store, api, row, status } = editor();
    const first = held<void>();
    const real = api.addEntry.getMockImplementation()!;
    api.addEntry.mockImplementationOnce(async (input, id) => {
      await first.promise;
      return real(input, id);
    });

    const added = store.addPoint(null, 1)!;
    expect(row(added)).toMatchObject({ parentId: null, position: 1 });
    expect(row("b")?.position).toBe(2);
    expect(store.move("b", "a", 0)).toBe(true);
    expect(row("b")).toMatchObject({ parentId: "a", position: 0 });
    expect(row("c")?.position).toBe(1);
    store.remove("c");
    expect(row("c")).toBeUndefined();

    // One at a time: nothing follows until the first is answered.
    await pause(0);
    expect(api.addEntry).toHaveBeenCalledTimes(1);
    expect(api.moveEntry).not.toHaveBeenCalled();
    expect(status()).toBe("saving");

    first.release();
    await pause(0);
    expect(api.addEntry.mock.calls[0]).toEqual([
      {
        outlineId: "outline",
        type: "point",
        parentId: null,
        position: 1,
        title: "",
        notes: null,
        expectedRevision: 3,
      },
      added,
    ]);
    expect(api.moveEntry).toHaveBeenCalledWith("b", {
      parentId: "a",
      position: 0,
      expectedRevision: 4,
    });
    expect(api.removeEntry).toHaveBeenCalledWith("c", 5);
    expect(api.moveEntry.mock.invocationCallOrder[0]).toBeLessThan(
      api.removeEntry.mock.invocationCallOrder[0],
    );
    expect(status()).toBe("saved");
  });

  it("refuse a move that cannot be made, and send nothing", async () => {
    const { store, api, status } = editor();
    const section = store.addSection("introduction")!;
    await pause(0);
    expect(store.move("a", "c", 0)).toBe(false); // under its own subpoint
    expect(store.move("a", "a", 0)).toBe(false); // under itself
    expect(store.move(section, null, 0)).toBe(false); // a section stays put
    expect(store.move("a", section, 0)).toBe(false); // nothing goes under a section
    expect(store.move("a", null, 0)).toBe(false); // where it already is
    await pause(0);
    expect(api.moveEntry).not.toHaveBeenCalled();
    expect(status()).toBe("saved");
  });

  it("add one introduction and one conclusion, and no second of either", async () => {
    const { store, api } = editor();
    const introduction = store.addSection("introduction");
    expect(store.addSection("introduction")).toBe(introduction);
    const conclusion = store.addSection("conclusion");
    expect(store.addSection("conclusion")).toBe(conclusion);
    await pause(0);
    expect(api.addEntry).toHaveBeenCalledTimes(2);
    expect(api.addEntry.mock.calls.map(([input]) => (input as Input).type)).toEqual([
      "introduction",
      "conclusion",
    ]);
    expect(api.addEntry.mock.calls[0][0]).not.toHaveProperty("position");
  });

  it("remove a point with what is under it in one request, and drop its unsaved words", async () => {
    const { store, api, row, status } = editor();
    store.setTitle("c", "Never sent");
    store.remove("a");
    expect(row("a")).toBeUndefined();
    expect(row("c")).toBeUndefined();
    expect(row("b")?.position).toBe(0);
    await pause(2000);
    expect(api.removeEntry).toHaveBeenCalledTimes(1);
    expect(api.removeEntry).toHaveBeenCalledWith("a", 3);
    expect(api.updateEntry).not.toHaveBeenCalled();
    expect(status()).toBe("saved");
  });

  it("save what is typed in a new point once the point itself is saved", async () => {
    const { store, api, status } = editor();
    const id = store.addPoint("a")!;
    store.setTitle(id, "A new subpoint");
    await pause();
    expect(api.addEntry).toHaveBeenCalledTimes(1);
    expect(api.updateEntry).toHaveBeenCalledWith(id, {
      title: "A new subpoint",
      expectedRevision: 0,
    });
    expect(status()).toBe("saved");
  });

  it("send only the last numbering chosen while another change is away", async () => {
    const { store, api } = editor();
    const first = held<void>();
    const real = api.moveEntry.getMockImplementation()!;
    api.moveEntry.mockImplementationOnce(async (id, input) => {
      await first.promise;
      return real(id, input);
    });
    store.move("b", null, 0);
    store.setNumbering({ version: 1, preset: "decimal" });
    store.setNumbering({ version: 1, preset: "roman" });
    expect(store.getState().numbering).toEqual({ version: 1, preset: "roman" });
    first.release();
    await pause(0);
    expect(api.setOutlineNumbering).toHaveBeenCalledTimes(1);
    expect(api.setOutlineNumbering).toHaveBeenCalledWith("outline", {
      version: 1,
      preset: "roman",
    });
  });
});

describe("an outline changed somewhere else", () => {
  /** What the page sends after the other change: Two is gone, and Sub was renamed. */
  const elsewhere = (): OutlineSnapshot => ({
    ...outline(),
    revision: 5,
    entries: [point("a", "One", 0), { ...point("c", "Renamed", 0, "a"), revision: 2 }],
  });

  it("reads the outline again on a stale change of shape, without sending it twice", async () => {
    const { store, api, held: backend, reload, status, row } = editor();
    backend.revision = 5;
    store.setTitle("a", "Mine, unsaved");
    store.move("b", "a", 0);
    await pause(0);

    expect(api.moveEntry).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(status()).toBe("saving");
    await pause(5000);
    expect(api.moveEntry).toHaveBeenCalledTimes(1);

    store.adopt(elsewhere());
    expect(store.getState().reloaded).toBe(true);
    expect(row("b")).toBeUndefined();
    expect(row("c")?.title).toBe("Renamed");
    // What was typed here is kept, and saved against the outline as it now is.
    expect(row("a")?.title).toBe("Mine, unsaved");
    await pause(0);
    expect(api.updateEntry).toHaveBeenCalledWith("a", {
      title: "Mine, unsaved",
      expectedRevision: 1,
    });
    expect(status()).toBe("saved");

    // The next change of shape names the revision that was read.
    store.move("c", null, 0);
    await pause(0);
    expect(api.moveEntry).toHaveBeenLastCalledWith("c", {
      parentId: null,
      position: 0,
      expectedRevision: 5,
    });
  });

  it("keeps the unsaved text of an entry that is no longer there, to put back or discard", async () => {
    const { store, api, held: backend, status, row } = editor();
    backend.revision = 5;
    store.setTitle("b", "Two, rewritten");
    store.adopt(elsewhere());
    expect(row("b")).toBeUndefined();
    expect(store.getState().lost).toEqual([
      { id: "b", title: "Two, rewritten", notes: "Its notes" },
    ]);
    expect(status()).toBe("conflict");

    const restored = store.restoreLost("b")!;
    expect(row(restored)).toMatchObject({ title: "Two, rewritten", parentId: null, position: 1 });
    expect(store.getState().lost).toEqual([]);
    await pause(0);
    expect(api.addEntry.mock.calls[0][0]).toMatchObject({
      title: "Two, rewritten",
      notes: "Its notes",
      expectedRevision: 5,
    });
    expect(status()).toBe("saved");
  });

  it("asks again when the outline does not come back, and says so meanwhile", async () => {
    const { store, held: backend, reload, status } = editor();
    backend.revision = 5;
    store.move("b", "a", 0);
    await pause(0);
    await pause(12000);
    expect(status()).toBe("failed");
    expect(store.getState().problem).toBe("Could not reload.");
    store.retry();
    expect(reload).toHaveBeenCalledTimes(2);
    store.adopt(elsewhere());
    expect(status()).toBe("saved");
  });

  it("reads the outline again when an entry it is saving has gone", async () => {
    const { store, entries, reload } = editor();
    entries.delete("b");
    store.setTitle("b", "Too late");
    await pause();
    expect(reload).toHaveBeenCalledTimes(1);
    store.adopt(elsewhere());
    expect(store.getState().lost).toEqual([{ id: "b", title: "Too late", notes: "Its notes" }]);
  });

  it("ignores a copy of the outline that is older, or that arrives while a change is on its way", async () => {
    const { store, api, row } = editor();
    const first = held<void>();
    const real = api.moveEntry.getMockImplementation()!;
    api.moveEntry.mockImplementationOnce(async (id, input) => {
      await first.promise;
      return real(id, input);
    });
    store.move("b", "a", 0);
    store.adopt(outline());
    expect(row("b")?.parentId).toBe("a");

    first.release();
    await pause(0);
    // The outline is now at 4 here; a copy from 3 is from before the move.
    store.adopt(outline());
    expect(row("b")?.parentId).toBe("a");
    expect(store.getState().reloaded).toBe(false);
  });
});

describe("an entry changed somewhere else", () => {
  it("takes the other field and saves its own again", async () => {
    const { store, api, entries, row, status } = editor();
    Object.assign(entries.get("b")!, { notes: "Notes from elsewhere", revision: 2 });
    store.setTitle("b", "My heading");
    await pause();
    expect(row("b")).toMatchObject({ title: "My heading", notes: "Notes from elsewhere" });
    expect(store.getState().conflicts).toEqual({});
    await pause();
    expect(api.updateEntry).toHaveBeenLastCalledWith("b", {
      title: "My heading",
      expectedRevision: 2,
    });
    expect(entries.get("b")).toMatchObject({ title: "My heading", notes: "Notes from elsewhere" });
    expect(status()).toBe("saved");
  });

  it("is no conflict when both wrote the same thing", async () => {
    const { store, api, entries, status } = editor();
    Object.assign(entries.get("a")!, { title: "Agreed", revision: 2 });
    store.setTitle("a", "Agreed");
    await pause();
    expect(store.getState().conflicts).toEqual({});
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(status()).toBe("saved");
  });

  it("asks which to keep when both changed the same field, and writes nothing until told", async () => {
    const { store, api, entries, row, status } = editor();
    Object.assign(entries.get("a")!, { title: "Theirs", revision: 2 });
    store.setTitle("a", "Mine");
    await pause();
    expect(store.getState().conflicts).toEqual({ a: { title: "Theirs" } });
    expect(status()).toBe("conflict");
    expect(row("a")?.title).toBe("Mine");
    await pause(60000);
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(entries.get("a")?.title).toBe("Theirs");

    store.resolveConflict("a", "mine");
    await pause(0);
    expect(api.updateEntry).toHaveBeenLastCalledWith("a", { title: "Mine", expectedRevision: 2 });
    expect(entries.get("a")?.title).toBe("Mine");
    expect(status()).toBe("saved");
  });

  it("takes the other version when asked, and has nothing left to save", async () => {
    const { store, api, entries, row, status } = editor();
    Object.assign(entries.get("a")!, { title: "Theirs", revision: 2 });
    store.setTitle("a", "Mine");
    await pause();
    store.resolveConflict("a", "theirs");
    await pause();
    expect(row("a")?.title).toBe("Theirs");
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(status()).toBe("saved");
  });

  it("is shown when the page sends it, unless this browser has unsaved words for it", async () => {
    const { store, row } = editor();
    store.setTitle("a", "Mine, unsaved");
    store.adopt({
      ...outline(),
      entries: [
        { ...point("a", "Theirs", 0), revision: 2 },
        { ...point("b", "Two, elsewhere", 1), revision: 2 },
        point("c", "Sub", 0, "a"),
      ],
    });
    expect(row("a")?.title).toBe("Mine, unsaved");
    expect(row("b")).toMatchObject({ title: "Two, elsewhere", notes: "", revision: 2 });
    // Its own revision is kept too, so the save that follows is checked against what it read.
    expect(row("a")?.revision).toBe(1);
  });
});

describe("stopping", () => {
  it("sends nothing more once the outline is deleted", async () => {
    const { store, api } = editor();
    store.setTitle("a", "Never sent");
    store.dispose();
    await pause(60000);
    expect(api.updateEntry).not.toHaveBeenCalled();
  });
});
