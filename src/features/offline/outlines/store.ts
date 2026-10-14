import type { OfflineOutline } from "@/features/sync/outlines";
import { openOfflineDb } from "../db";
import { emptyIdeasState, type IdeasState } from "../ideas/store";
import type { AccountRecord } from "../model";

/*
 * An account's outlines as this device keeps them (Phase 5D.2), in the
 * `accountData` store under the account's user ID, beside its ideas. Every
 * function takes the owner and reads or writes only that owner's records.
 *
 * Each outline is two copies, as an idea is (ideas/store.ts):
 * - `server`: the outline as the server last sent it (refresh.ts). Never
 *   changed here but by a download, or once the server has acknowledged every
 *   change made here (sync.ts).
 * - `local`: the outline with the changes made on this device that the server
 *   has not acknowledged (operations.ts). Present only while such changes are
 *   queued; a download never touches it.
 * What is shown is `local` when there is one, and otherwise `server`.
 */

export const outlineKind = "outline";
const stateKind = "state";
const stateId = "outlines";

export type KeptOutline = {
  server: OfflineOutline | null;
  local: OfflineOutline | null;
  /** The server's copy is known to be behind: the next download reads it again. */
  behind?: boolean;
  /**
   * Moves when the copy shown changed other than by the editor's own change
   * (a conflict settled, changes discarded), so an open editor starts again
   * from it.
   */
  generation?: number;
};

/** How far the account's outlines are on this device: as for ideas. */
export type OutlinesState = IdeasState;
export const emptyOutlinesState: OutlinesState = emptyIdeasState;

type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null | undefined;

function tabs() {
  if (channel !== undefined) return channel;
  channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("sermon-tracker-outlines");
  channel?.addEventListener("message", () => listeners.forEach((listener) => listener()));
  return channel;
}

/** Tells this tab and the others that an account's kept outlines changed. */
export function announceOutlinesChange() {
  listeners.forEach((listener) => listener());
  tabs()?.postMessage("changed");
}

export function onOutlinesChange(listener: Listener) {
  tabs();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What is shown of a kept outline. */
export const shownOutline = (kept: KeptOutline | null | undefined): OfflineOutline | null =>
  kept?.local ?? kept?.server ?? null;

export const outlineRecord = (owner: string, id: string, data: KeptOutline): AccountRecord => ({
  owner,
  kind: outlineKind,
  id,
  data,
  updatedAt: Date.now(),
});

async function ofKind(owner: string, kind: string): Promise<AccountRecord[]> {
  if (!owner) return [];
  const db = await openOfflineDb();
  return db.getAllFromIndex("accountData", "ownerKind", [owner, kind]);
}

/** Every outline kept for the owner, by ID, as both copies. */
export async function readKeptOutlines(owner: string): Promise<Map<string, KeptOutline>> {
  const records = await ofKind(owner, outlineKind);
  return new Map(records.map((record) => [record.id, record.data as KeptOutline]));
}

/** The owner's outlines as they are shown here. */
export async function listLocalOutlines(owner: string): Promise<OfflineOutline[]> {
  const kept = await readKeptOutlines(owner);
  return [...kept.values()].map(shownOutline).filter((outline) => outline !== null);
}

export async function getKeptOutline(owner: string, id: string): Promise<KeptOutline | null> {
  if (!owner) return null;
  const db = await openOfflineDb();
  const record = await db.get("accountData", [owner, outlineKind, id]);
  return record && record.owner === owner ? (record.data as KeptOutline) : null;
}

/** Which kept outline is each sermon's: for the ways from a sermon to its outline. */
export async function keptOutlineIds(owner: string): Promise<Map<string, string>> {
  const outlines = await listLocalOutlines(owner);
  return new Map(outlines.map((outline) => [outline.sermonId, outline.id]));
}

export async function readOutlinesState(owner: string): Promise<OutlinesState> {
  if (!owner) return emptyOutlinesState;
  const db = await openOfflineDb();
  const record = await db.get("accountData", [owner, stateKind, stateId]);
  return record ? { ...emptyOutlinesState, ...(record.data as OutlinesState) } : emptyOutlinesState;
}

export async function writeOutlinesState(owner: string, change: Partial<OutlinesState>) {
  const next = { ...(await readOutlinesState(owner)), ...change };
  const db = await openOfflineDb();
  await db.put("accountData", {
    owner,
    kind: stateKind,
    id: stateId,
    data: next,
    updatedAt: Date.now(),
  });
  announceOutlinesChange();
  return next;
}

/** Roughly what the owner's kept outlines take up, in bytes of text. */
export async function keptOutlinesBytes(owner: string): Promise<number> {
  const records = await ofKind(owner, outlineKind);
  return records.reduce((sum, record) => sum + JSON.stringify(record.data).length, 0);
}

/**
 * Removes the owner's kept outlines, except those with changes still queued
 * (`keep`): those are the person's work and stay until sent or discarded.
 */
export async function removeKeptOutlines(owner: string, keep: ReadonlySet<string>) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  const index = tx.store.index("ownerKind");
  for (const record of await index.getAll([owner, outlineKind])) {
    if (!keep.has(record.id)) await tx.store.delete([owner, outlineKind, record.id]);
  }
  await tx.store.delete([owner, stateKind, stateId]);
  await tx.done;
  announceOutlinesChange();
}

/**
 * Changes one kept outline in one transaction. `next` returns the new record,
 * or null to forget it. With `restart`, an editor open on it starts again
 * from what is written (`generation`): for a change the person made outside
 * the editor, which the editor's own copy does not know of.
 */
export async function rewriteOutline(
  owner: string,
  id: string,
  next: (kept: KeptOutline) => KeptOutline | null,
  { restart = false }: { restart?: boolean } = {},
) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  const stored = await tx.store.get([owner, outlineKind, id]);
  if (stored && stored.owner === owner) {
    const kept = stored.data as KeptOutline;
    const written = next(kept);
    if (written) {
      const generation = (kept.generation ?? 0) + (restart ? 1 : 0);
      await tx.store.put(outlineRecord(owner, id, { ...written, generation }));
    } else await tx.store.delete([owner, outlineKind, id]);
  }
  await tx.done;
  announceOutlinesChange();
}
