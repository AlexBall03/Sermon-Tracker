import type { IdeaTag } from "@/features/ideas/tags";
import type { OfflineIdea } from "@/features/sync/ideas";
import { openOfflineDb } from "../db";
import type { AccountRecord } from "../model";

/*
 * An account's ideas as this device keeps them (Phase 5D.1), in the
 * `accountData` store under the account's user ID. Every function takes the
 * owner and reads or writes only that owner's records.
 *
 * Each idea is two copies:
 * - `server`: the idea as the server last sent it (refresh.ts). Never
 *   changed here but by a download, or once the server has acknowledged the
 *   change it now holds (sync.ts).
 * - `local`: the idea with the changes made on this device that the server
 *   has not acknowledged (operations.ts). Present only while such changes
 *   are queued; a download never touches it.
 * What is shown is `local` when there is one, and otherwise `server`.
 */

export const ideaKind = "idea";
const tagsKind = "tags";
const stateKind = "state";

/** The device's copy with what was changed here; `deleted` hides one deleted here. */
export type LocalIdea = OfflineIdea & { deleted?: boolean };
export type KeptIdea = { server: OfflineIdea | null; local: LocalIdea | null };

/**
 * How far the account's ideas are on this device.
 * - `complete`: a whole download has finished at least once (`completedAt`);
 *   until then what is here is only part of the library, `have` of `total`.
 * - `status`: what the latest download is doing, and `error` why it stopped.
 */
export type IdeasState = {
  status: "idle" | "downloading" | "failed";
  complete: boolean;
  total: number;
  have: number;
  completedAt?: number;
  checkedAt?: number;
  error?: "network" | "auth" | "storage";
};

export const emptyIdeasState: IdeasState = { status: "idle", complete: false, total: 0, have: 0 };

type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null | undefined;

function tabs() {
  if (channel !== undefined) return channel;
  channel =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("sermon-tracker-ideas");
  channel?.addEventListener("message", () => listeners.forEach((listener) => listener()));
  return channel;
}

/** Tells this tab and the others that an account's kept ideas changed. */
export function announceIdeasChange() {
  listeners.forEach((listener) => listener());
  tabs()?.postMessage("changed");
}

export function onIdeasChange(listener: Listener) {
  tabs();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What is shown of a kept idea; null when it was deleted here or holds nothing. */
export function shown(kept: KeptIdea | null | undefined): OfflineIdea | null {
  const idea = kept?.local ?? kept?.server ?? null;
  if (!idea || (idea as LocalIdea).deleted) return null;
  return withoutDeletion(idea);
}

/** The idea without the mark that it was deleted here. */
export function withoutDeletion(idea: LocalIdea): OfflineIdea {
  const copy: LocalIdea = { ...idea };
  delete copy.deleted;
  return copy;
}

export const ideaRecord = (owner: string, id: string, data: KeptIdea): AccountRecord => ({
  owner,
  kind: ideaKind,
  id,
  data,
  updatedAt: Date.now(),
});

async function ofKind(owner: string, kind: string): Promise<AccountRecord[]> {
  if (!owner) return [];
  const db = await openOfflineDb();
  return db.getAllFromIndex("accountData", "ownerKind", [owner, kind]);
}

/** Every idea kept for the owner, by ID, as both copies. */
export async function readKeptIdeas(owner: string): Promise<Map<string, KeptIdea>> {
  const records = await ofKind(owner, ideaKind);
  return new Map(records.map((record) => [record.id, record.data as KeptIdea]));
}

/** The owner's ideas as they are shown here, deleted ones left out. */
export async function listLocalIdeas(owner: string): Promise<OfflineIdea[]> {
  const kept = await readKeptIdeas(owner);
  return [...kept.values()].map(shown).filter((idea): idea is OfflineIdea => idea !== null);
}

export async function getKeptIdea(owner: string, id: string): Promise<KeptIdea | null> {
  if (!owner) return null;
  const db = await openOfflineDb();
  const record = await db.get("accountData", [owner, ideaKind, id]);
  return record && record.owner === owner ? (record.data as KeptIdea) : null;
}

export async function readLocalTags(owner: string): Promise<IdeaTag[]> {
  if (!owner) return [];
  const db = await openOfflineDb();
  const record = await db.get("accountData", [owner, tagsKind, "all"]);
  return Array.isArray(record?.data) ? (record.data as IdeaTag[]) : [];
}

export async function writeLocalTags(owner: string, tags: IdeaTag[]) {
  const db = await openOfflineDb();
  await db.put("accountData", {
    owner,
    kind: tagsKind,
    id: "all",
    data: tags.map(({ id, name }) => ({ id, name })),
    updatedAt: Date.now(),
  });
}

export async function readIdeasState(owner: string): Promise<IdeasState> {
  if (!owner) return emptyIdeasState;
  const db = await openOfflineDb();
  const record = await db.get("accountData", [owner, stateKind, "ideas"]);
  return record ? { ...emptyIdeasState, ...(record.data as IdeasState) } : emptyIdeasState;
}

export async function writeIdeasState(owner: string, change: Partial<IdeasState>) {
  const next = { ...(await readIdeasState(owner)), ...change };
  const db = await openOfflineDb();
  await db.put("accountData", {
    owner,
    kind: stateKind,
    id: "ideas",
    data: next,
    updatedAt: Date.now(),
  });
  announceIdeasChange();
  return next;
}

/** Roughly what the owner's kept ideas take up, in bytes of text. */
export async function keptIdeasBytes(owner: string): Promise<number> {
  const records = await ofKind(owner, ideaKind);
  return records.reduce((sum, record) => sum + JSON.stringify(record.data).length, 0);
}

/**
 * Removes the owner's kept ideas, except those with changes still queued
 * (`keep`): those are the person's work and stay until sent or deleted.
 */
export async function removeKeptIdeas(owner: string, keep: ReadonlySet<string>) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  const index = tx.store.index("ownerKind");
  for (const kind of [ideaKind, tagsKind, stateKind]) {
    const records = await index.getAll([owner, kind]);
    for (const record of records) {
      if (kind === ideaKind && keep.has(record.id)) continue;
      await tx.store.delete([owner, kind, record.id]);
    }
  }
  await tx.done;
  announceIdeasChange();
}
