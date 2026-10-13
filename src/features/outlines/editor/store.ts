import type { OutlineActionResult } from "../actions";
import { outlineLimits, type EntryType, type SectionType } from "../model";
import type { NumberingConfig } from "../numbering";
import { planInsert, planMove, planRemove, subtreeIds, type Placement } from "../tree";

/*
 * The outline editor's state and its autosave, in one place and with no React
 * in it. The editor reads it with `useSyncExternalStore` and asks it for every
 * change; nothing else holds a copy of the outline.
 *
 * A change is shown at once and sent after. Changes of shape (add, move,
 * remove) are worked out here with the same `tree.ts` the server uses, and
 * are sent one at a time in the order they were made, each naming the
 * outline's revision from the answer before it. Words (a heading, notes) are
 * sent a moment after the typing stops, the fields that changed and no
 * others, naming the entry's own revision.
 *
 * What the server answers is never written over what is in a field. An answer
 * says what the server now holds; text typed while the request was away is
 * still unsaved and is sent next.
 *
 * The store goes on saving after the page that made it is hidden or left, so
 * leaving a moment after typing loses nothing.
 */

/** One entry as the editor holds it. `notes` is "" where there are none. */
export type EditorRow = {
  id: string;
  parentId: string | null;
  type: EntryType;
  position: number;
  title: string;
  notes: string;
  /** The entry's own revision, as the server last said it. */
  revision: number;
};

/** An entry as the page sends it. */
export type SnapshotEntry = Omit<EditorRow, "notes"> & { notes: string | null };

/** An outline as the page sends it: what the server held when the page was rendered. */
export type OutlineSnapshot = {
  id: string;
  revision: number;
  numbering: NumberingConfig;
  entries: SnapshotEntry[];
};

/** The server actions the store saves through. */
export type OutlineApi = {
  addEntry: (input: unknown, id?: unknown) => Promise<OutlineActionResult>;
  updateEntry: (id: unknown, input: unknown) => Promise<OutlineActionResult>;
  moveEntry: (id: unknown, input: unknown) => Promise<OutlineActionResult>;
  removeEntry: (id: unknown, expectedRevision?: unknown) => Promise<OutlineActionResult>;
  setOutlineNumbering: (id: unknown, numbering: unknown) => Promise<OutlineActionResult>;
};

export type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "conflict";

/** What the server holds in the fields of an entry that were changed in both places. */
export type Conflict = { title?: string; notes?: string };

/** Text that was never saved, from an entry that is no longer in the outline. */
export type LostDraft = { id: string; title: string; notes: string };

export type EditorState = {
  rows: EditorRow[];
  numbering: NumberingConfig;
  status: SaveStatus;
  /** Why the last save failed, in the account's language. */
  problem: string | null;
  /** By entry: open until the person chooses. */
  conflicts: Record<string, Conflict>;
  lost: LostDraft[];
  /** The outline was read again because it had changed somewhere else. */
  reloaded: boolean;
};

export type StoreOptions = {
  /** Asks the page for the outline again. The answer arrives through `adopt`. */
  reload: () => void;
  messages: { offline: string; reloadFailed: string };
  /** How long after the last keystroke words are sent. */
  delay?: number;
  newId?: () => string;
};

type Words = { title: string; notes: string };

type Op =
  | {
      kind: "add";
      id: string;
      type: EntryType;
      parentId: string | null;
      position: number;
    }
  | { kind: "move"; id: string; parentId: string | null; position: number }
  | { kind: "remove"; id: string }
  | { kind: "numbering"; config: NumberingConfig }
  | { kind: "words"; id: string };

/** The delays before a failed save is tried again by itself. After the last, it waits to be asked. */
const retryDelays = [2000, 5000, 15000];
/** How long a reload may take before it is called a failure. */
const reloadTimeout = 12000;

/** A heading as the server keeps it: one line, single spaces. */
export const tidyTitle = (value: string) => value.replace(/\s+/g, " ").trim();
/** Notes as the server keeps them. */
export const tidyNotes = (value: string) => value.trim();

const tidy = (row: Words): Words => ({ title: tidyTitle(row.title), notes: tidyNotes(row.notes) });

const isShape = (op: Op) => op.kind === "add" || op.kind === "move" || op.kind === "remove";

function applied(rows: EditorRow[], placements: Placement[]): EditorRow[] {
  if (placements.length === 0) return rows;
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  return rows.map((row) => {
    const placement = byId.get(row.id);
    return placement ? { ...row, parentId: placement.parentId, position: placement.position } : row;
  });
}

export type OutlineStore = ReturnType<typeof createOutlineStore>;

export function createOutlineStore(
  snapshot: OutlineSnapshot,
  api: OutlineApi,
  options: StoreOptions,
) {
  const outlineId = snapshot.id;
  const delay = options.delay ?? 900;
  const newId = options.newId ?? (() => crypto.randomUUID());

  let rows: EditorRow[] = snapshot.entries.map((entry) => ({ ...entry, notes: entry.notes ?? "" }));
  let numbering = snapshot.numbering;
  /** The outline's shape revision, from the last answer. */
  let revision = snapshot.revision;
  /** The words the server holds for each entry it has acknowledged. */
  const acknowledged = new Map<string, Words>(rows.map((row) => [row.id, tidy(row)]));

  let queue: Op[] = [];
  let current: Op | null = null;
  let running = false;
  let failure: { message: string } | null = null;
  let attempts = 0;
  let awaitingReload = false;
  let reloaded = false;
  let conflicts: Record<string, Conflict> = {};
  let lost: LostDraft[] = [];
  let disposed = false;

  let wordsTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<() => void>();
  let state: EditorState;

  const find = (id: string) => rows.find((row) => row.id === id);

  /** True when the entry's words differ from what the server has acknowledged. */
  function dirty(row: EditorRow) {
    const held = acknowledged.get(row.id);
    if (!held) return false;
    const mine = tidy(row);
    return mine.title !== held.title || mine.notes !== held.notes;
  }

  function status(): SaveStatus {
    if (Object.keys(conflicts).length > 0 || lost.length > 0) return "conflict";
    if (failure) return "failed";
    if (running || awaitingReload) return "saving";
    if (queue.length > 0 || wordsTimer !== null || rows.some(dirty)) return "unsaved";
    return "saved";
  }

  function emit() {
    state = {
      rows,
      numbering,
      status: status(),
      problem: failure?.message ?? null,
      conflicts,
      lost,
      reloaded,
    };
    listeners.forEach((notify) => notify());
  }

  const blocked = () => disposed || failure !== null || awaitingReload;

  function clear(timer: ReturnType<typeof setTimeout> | null) {
    if (timer !== null) clearTimeout(timer);
    return null;
  }

  /** Queues the words of every entry that has unsaved ones, and sends. */
  function flush() {
    wordsTimer = clear(wordsTimer);
    for (const row of rows) {
      if (!dirty(row) || conflicts[row.id]) continue;
      const waiting = queue.some((op) => op.kind === "words" && op.id === row.id && op !== current);
      if (!waiting) queue.push({ kind: "words", id: row.id });
    }
    emit();
    void run();
  }

  function schedule() {
    wordsTimer = clear(wordsTimer);
    wordsTimer = setTimeout(() => {
      wordsTimer = null;
      flush();
    }, delay);
  }

  function fail(message: string, again: boolean) {
    failure = { message };
    if (again && attempts < retryDelays.length) {
      retryTimer = clear(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        retry(false);
      }, retryDelays[attempts]);
      attempts += 1;
    }
  }

  /** Tries again what could not be saved. Asked for by a person, it starts the count of tries over. */
  function retry(asked = true) {
    if (disposed) return;
    retryTimer = clear(retryTimer);
    if (asked) attempts = 0;
    failure = null;
    if (awaitingReload) {
      askForOutline();
      emit();
      return;
    }
    emit();
    void run();
  }

  function askForOutline() {
    awaitingReload = true;
    reloadTimer = clear(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      failure = { message: options.messages.reloadFailed };
      emit();
    }, reloadTimeout);
    options.reload();
  }

  /**
   * What this browser holds no longer matches the server's outline. Nothing
   * more is sent against it: the outline is read again, and what is still
   * unsaved is worked out afresh from what comes back.
   */
  function reloadOutline() {
    queue = [];
    askForOutline();
  }

  async function send(op: Op): Promise<OutlineActionResult> {
    switch (op.kind) {
      case "add": {
        const words = tidy(find(op.id) ?? { title: "", notes: "" });
        return api.addEntry(
          {
            outlineId,
            type: op.type,
            parentId: op.parentId,
            ...(op.type === "point" ? { position: op.position } : {}),
            title: words.title,
            notes: words.notes || null,
            expectedRevision: revision,
          },
          op.id,
        );
      }
      case "move":
        return api.moveEntry(op.id, {
          parentId: op.parentId,
          position: op.position,
          expectedRevision: revision,
        });
      case "remove":
        return api.removeEntry(op.id, revision);
      case "numbering":
        return api.setOutlineNumbering(outlineId, op.config);
      case "words": {
        const row = find(op.id)!;
        const held = acknowledged.get(op.id)!;
        const mine = tidy(row);
        return api.updateEntry(op.id, {
          ...(mine.title !== held.title ? { title: mine.title } : {}),
          ...(mine.notes !== held.notes ? { notes: mine.notes || null } : {}),
          expectedRevision: row.revision,
        });
      }
    }
  }

  /** The server's entry is now what this one's words are measured against. */
  function acknowledge(entry: NonNullable<OutlineActionResult["entry"]>) {
    acknowledged.set(entry.id, { title: entry.title, notes: entry.notes ?? "" });
    rows = rows.map((row) => (row.id === entry.id ? { ...row, revision: entry.revision } : row));
  }

  /**
   * The entry's words were changed somewhere else since this browser read
   * them. Each field is settled by itself: changed only there, it is taken;
   * changed only here, it is kept and sent again; changed in both to different
   * text, it is left for the person to choose.
   */
  function merge(entry: NonNullable<OutlineActionResult["entry"]>) {
    const row = find(entry.id);
    const base = acknowledged.get(entry.id);
    if (!row || !base) return;
    const theirs: Words = { title: entry.title, notes: entry.notes ?? "" };
    const mine = tidy(row);
    const conflict: Conflict = {};
    const next = { title: row.title, notes: row.notes };
    for (const field of ["title", "notes"] as const) {
      const changedHere = mine[field] !== base[field];
      const changedThere = theirs[field] !== base[field];
      if (changedHere && changedThere && mine[field] !== theirs[field]) {
        conflict[field] = theirs[field];
      } else if (changedThere && !changedHere) {
        next[field] = theirs[field];
      }
    }
    rows = rows.map((other) => (other.id === entry.id ? { ...other, ...next } : other));
    acknowledge(entry);
    if (conflict.title !== undefined || conflict.notes !== undefined) {
      conflicts = { ...conflicts, [entry.id]: conflict };
    }
  }

  /** What became of one request: sent and settled, or to be tried again, or the outline is to be read again. */
  function settle(op: Op, result: OutlineActionResult): "done" | "halt" {
    if (result.ok) {
      attempts = 0;
      if (result.revision !== undefined && op.kind !== "words") revision = result.revision;
      if (result.entry && find(result.entry.id)) acknowledge(result.entry);
      return "done";
    }
    // Refused before anything was looked at: signed out, or the account disabled.
    if (result.code === undefined) {
      fail(result.message, false);
      return "halt";
    }
    if (result.code === "failed") {
      fail(result.message, true);
      return "halt";
    }
    if (op.kind === "words") {
      if (result.code === "stale_entry" && result.entry) {
        merge(result.entry);
        return "done";
      }
      if (result.code === "invalid") {
        fail(result.message, false);
        return "halt";
      }
    }
    // Stale, missing, or refused for where it was to go: this browser's outline is out of date.
    reloadOutline();
    return "halt";
  }

  async function run() {
    if (running || blocked()) return;
    running = true;
    emit();
    while (queue.length > 0 && !blocked()) {
      const op = queue[0];
      // Words that were saved, removed, or put in question while they waited.
      if (op.kind === "words") {
        const row = find(op.id);
        if (!row || !dirty(row) || conflicts[op.id]) {
          queue.shift();
          continue;
        }
      }
      current = op;
      let result: OutlineActionResult;
      try {
        result = await send(op);
      } catch {
        current = null;
        if (disposed) break;
        fail(options.messages.offline, true);
        break;
      }
      current = null;
      if (disposed) break;
      if (settle(op, result) === "halt") break;
      if (queue[0] === op) queue.shift();
      emit();
    }
    running = false;
    // Typed while a request was away: still unsaved, and sent after the usual pause.
    if (!blocked() && wordsTimer === null && rows.some((row) => dirty(row) && !conflicts[row.id])) {
      schedule();
    }
    emit();
  }

  function setWords(id: string, change: Partial<Words>) {
    if (!find(id)) return;
    rows = rows.map((row) => (row.id === id ? { ...row, ...change } : row));
    schedule();
    emit();
  }

  /** Adds a point and says its ID, or null when the outline is full or the place is not one. */
  function addPoint(parentId: string | null, index?: number, words?: Partial<Words>) {
    if (rows.length >= outlineLimits.entries) return null;
    const plan = planInsert(rows, parentId, index);
    if (!plan.ok) return null;
    const id = newId();
    rows = [
      ...applied(rows, plan.placements),
      {
        id,
        parentId,
        type: "point",
        position: plan.position,
        title: words?.title ?? "",
        notes: words?.notes ?? "",
        revision: 0,
      },
    ];
    queue.push({ kind: "add", id, type: "point", parentId, position: plan.position });
    emit();
    void run();
    return id;
  }

  /** Adds the introduction or the conclusion, or says the one there is. */
  function addSection(type: SectionType) {
    const existing = rows.find((row) => row.type === type);
    if (existing) return existing.id;
    if (rows.length >= outlineLimits.entries) return null;
    const id = newId();
    rows = [...rows, { id, parentId: null, type, position: 0, title: "", notes: "", revision: 0 }];
    queue.push({ kind: "add", id, type, parentId: null, position: 0 });
    emit();
    void run();
    return id;
  }

  /**
   * Moves a point, with what is under it, to `parentId` at `index` among the
   * points it will be beside. False when it cannot go there or is there already.
   */
  function move(id: string, parentId: string | null, index: number) {
    const plan = planMove(rows, id, parentId, index);
    if (!plan.ok || plan.placements.length === 0) return false;
    rows = applied(rows, plan.placements);
    queue.push({ kind: "move", id, parentId, position: plan.position });
    emit();
    void run();
    return true;
  }

  /** Removes an entry and everything under it. */
  function remove(id: string) {
    if (!find(id)) return;
    const gone = new Set(subtreeIds(rows, id));
    const placements = planRemove(rows, id);
    rows = applied(
      rows.filter((row) => !gone.has(row.id)),
      placements,
    );
    conflicts = Object.fromEntries(Object.entries(conflicts).filter(([key]) => !gone.has(key)));
    queue = queue.filter((op) => op === current || op.kind !== "words" || !gone.has(op.id));
    queue.push({ kind: "remove", id });
    emit();
    void run();
  }

  function setNumbering(config: NumberingConfig) {
    numbering = config;
    // Only the last choice is worth sending.
    queue = queue.filter((op) => op === current || op.kind !== "numbering");
    queue.push({ kind: "numbering", config });
    emit();
    void run();
  }

  /**
   * Takes the outline as the server now has it. Words still unsaved here are
   * kept; an entry that is no longer there leaves its unsaved text as a draft
   * to put back or discard. A copy older than what this browser knows, or one
   * that arrives while changes of shape are still on their way, is ignored.
   */
  function adopt(next: OutlineSnapshot) {
    if (disposed || next.id !== outlineId) return;
    if (!awaitingReload) {
      if (queue.some(isShape) || next.revision < revision) return;
    }
    const before = new Map(rows.map((row) => [row.id, row]));
    const arriving = new Set(next.entries.map((entry) => entry.id));

    const drafts: LostDraft[] = [];
    for (const row of rows) {
      if (arriving.has(row.id)) continue;
      const mine = tidy(row);
      const unsaved = acknowledged.has(row.id)
        ? dirty(row)
        : mine.title !== "" || mine.notes !== "";
      if (unsaved) drafts.push({ id: row.id, ...mine });
      acknowledged.delete(row.id);
    }

    rows = next.entries.map((entry) => {
      const theirs = { ...entry, notes: entry.notes ?? "" };
      const local = before.get(entry.id);
      const held = local && acknowledged.get(entry.id);
      // Unsaved here, or saved here since this copy was made: this browser's words stand.
      if (local && held && (dirty(local) || local.revision > entry.revision)) {
        return { ...theirs, title: local.title, notes: local.notes, revision: local.revision };
      }
      acknowledged.set(entry.id, tidy(theirs));
      // The same words, perhaps with a space still being typed after them.
      if (
        local &&
        tidyTitle(local.title) === theirs.title &&
        tidyNotes(local.notes) === theirs.notes
      ) {
        return { ...theirs, title: local.title, notes: local.notes };
      }
      return theirs;
    });

    revision = next.revision;
    if (!queue.some((op) => op.kind === "numbering")) numbering = next.numbering;
    conflicts = Object.fromEntries(Object.entries(conflicts).filter(([key]) => arriving.has(key)));
    queue = queue.filter((op) => op === current || op.kind !== "words" || arriving.has(op.id));
    if (drafts.length > 0) lost = [...lost, ...drafts];

    if (awaitingReload) {
      awaitingReload = false;
      reloadTimer = clear(reloadTimer);
      retryTimer = clear(retryTimer);
      failure = null;
      reloaded = true;
    }
    flush();
  }

  /** Settles a conflict: this browser's words are saved over the others, or the others are taken. */
  function resolveConflict(id: string, keep: "mine" | "theirs") {
    const conflict = conflicts[id];
    if (!conflict) return;
    if (keep === "theirs") {
      rows = rows.map((row) => (row.id === id ? { ...row, ...conflict } : row));
    }
    conflicts = Object.fromEntries(Object.entries(conflicts).filter(([key]) => key !== id));
    flush();
  }

  /** Puts a lost draft back as a new main point, last. */
  function restoreLost(id: string) {
    const draft = lost.find((item) => item.id === id);
    if (!draft) return null;
    const added = addPoint(null, undefined, { title: draft.title, notes: draft.notes });
    if (added) discardLost(id);
    return added;
  }

  function discardLost(id: string) {
    lost = lost.filter((item) => item.id !== id);
    emit();
  }

  emit();

  return {
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    getState: () => state,
    setTitle: (id: string, title: string) => setWords(id, { title }),
    setNotes: (id: string, notes: string) => setWords(id, { notes }),
    /** Leaving a field: its text is shown as it will be kept, and saved without waiting. */
    blur(id: string) {
      const row = find(id);
      if (!row) return;
      const mine = tidy(row);
      if (mine.title !== row.title || mine.notes !== row.notes) {
        rows = rows.map((other) => (other.id === id ? { ...other, ...mine } : other));
      }
      flush();
    },
    addPoint,
    addSection,
    move,
    remove,
    setNumbering,
    adopt,
    flush,
    retry: () => retry(true),
    resolveConflict,
    restoreLost,
    discardLost,
    dismissReloaded() {
      reloaded = false;
      emit();
    },
    /** Stops for good: the outline was deleted. Nothing more is sent. */
    dispose() {
      disposed = true;
      queue = [];
      wordsTimer = clear(wordsTimer);
      retryTimer = clear(retryTimer);
      reloadTimer = clear(reloadTimer);
    },
  };
}
