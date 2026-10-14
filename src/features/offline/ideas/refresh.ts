import type { IdeaManifestResponse, IdeaRowsResponse, OfflineIdea } from "@/features/sync/ideas";
import { openOfflineDb } from "../db";
import { listMutations } from "../queue";
import {
  announceIdeasChange,
  ideaKind,
  ideaRecord,
  readIdeasState,
  writeIdeasState,
  writeLocalTags,
  type KeptIdea,
} from "./store";

/*
 * Downloads the account's ideas to this device, and keeps them current
 * (Phase 5D.1). From `/api/offline/ideas`: first every idea's revision and
 * what changes without it, then, a hundred at a time, only the ideas whose
 * revision this device does not have. So a refresh with nothing changed reads
 * one small list.
 *
 * Only the server's copy (`server`) is written. A copy changed here (`local`)
 * is the person's unsent work and is never touched; an idea the server no
 * longer has is forgotten only when nothing about it is queued.
 *
 * One refresh at a time per account on the device (a Web Lock), and only for
 * the account the server says it is: the session's, never the device's word.
 */

export type RefreshResult = "done" | "busy" | "failed" | "auth" | "wrongAccount";

const endpoint = "/api/offline/ideas";
const batch = 100;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type RefreshOptions = {
  fetcher?: Fetcher;
  /** For tests: the lock manager, or null for none. */
  locks?: LockManager | null;
};

class Stop extends Error {
  constructor(readonly result: RefreshResult) {
    super(result);
  }
}

async function ask<T>(fetcher: Fetcher, url: string, owner: string): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Stop("failed");
  }
  if (response.status === 401 || response.status === 403) throw new Stop("auth");
  if (!response.ok) throw new Stop("failed");
  const body = (await response.json().catch(() => null)) as (T & { owner?: string }) | null;
  if (!body) throw new Stop("failed");
  if (body.owner !== owner) throw new Stop("wrongAccount");
  return body;
}

export async function refreshIdeas(owner: string, options: RefreshOptions = {}) {
  if (!owner) return "failed" satisfies RefreshResult;
  const locks =
    options.locks === undefined
      ? typeof navigator !== "undefined" && "locks" in navigator
        ? navigator.locks
        : null
      : options.locks;
  const run = () => download(owner, options.fetcher ?? ((url, init) => fetch(url, init)));
  if (!locks) return run();
  return locks.request(`sermon-tracker-ideas:${owner}`, { ifAvailable: true }, (lock) =>
    lock ? run() : ("busy" as const),
  );
}

async function download(owner: string, fetcher: Fetcher): Promise<RefreshResult> {
  await writeIdeasState(owner, { status: "downloading", error: undefined });
  try {
    const manifest = await ask<IdeaManifestResponse>(fetcher, endpoint, owner);
    const queued = new Set((await listMutations(owner)).map((record) => record.entityId));
    await writeLocalTags(owner, manifest.tags);

    // What the device lacks or has out of date, and what the manifest alone brings up to date.
    const db = await openOfflineDb();
    const tx = db.transaction("accountData", "readwrite");
    const records = await tx.store.index("ownerKind").getAll([owner, ideaKind]);
    const kept = new Map(records.map((record) => [record.id, record.data as KeptIdea]));
    const listed = new Set<string>();
    const wanted: string[] = [];
    for (const item of manifest.ideas) {
      listed.add(item.id);
      const copy = kept.get(item.id);
      if (!copy?.server || copy.server.revision !== item.revision) {
        wanted.push(item.id);
        continue;
      }
      await tx.store.put(
        ideaRecord(owner, item.id, { ...copy, server: { ...copy.server, ...item } }),
      );
    }
    for (const [id, copy] of kept) {
      if (listed.has(id)) continue;
      // Gone from the account. Work queued about it stays; the server will say what became of it.
      if (queued.has(id)) {
        if (copy.server) await tx.store.put(ideaRecord(owner, id, { ...copy, server: null }));
      } else {
        await tx.store.delete([owner, ideaKind, id]);
      }
    }
    await tx.done;

    const total = manifest.ideas.length;
    let have = total - wanted.length;
    await writeIdeasState(owner, { total, have });
    for (let start = 0; start < wanted.length; start += batch) {
      const ids = wanted.slice(start, start + batch);
      const rows = await ask<IdeaRowsResponse>(fetcher, `${endpoint}?ids=${ids.join(",")}`, owner);
      await keep(owner, rows.ideas);
      // An idea deleted between the two requests is simply not among them.
      have += ids.length;
      await writeIdeasState(owner, { have: Math.min(have, total) });
    }

    await writeIdeasState(owner, {
      status: "idle",
      complete: true,
      completedAt: Date.now(),
      checkedAt: Date.now(),
      total,
      have: total,
    });
    return "done";
  } catch (error) {
    const result = error instanceof Stop ? error.result : "failed";
    await writeIdeasState(owner, {
      status: "failed",
      checkedAt: Date.now(),
      error:
        result === "auth" || result === "wrongAccount"
          ? "auth"
          : error instanceof Stop
            ? "network"
            : "storage",
    }).catch(() => {});
    return result;
  }
}

/** Writes the server's copies, leaving any copy changed here as it is. */
async function keep(owner: string, ideas: OfflineIdea[]) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  for (const idea of ideas) {
    const stored = await tx.store.get([owner, ideaKind, idea.id]);
    const local = stored ? (stored.data as KeptIdea).local : null;
    await tx.store.put(ideaRecord(owner, idea.id, { server: idea, local }));
  }
  await tx.done;
  announceIdeasChange();
}

/**
 * True when a download is worth starting by itself: none finished, or the
 * last check was a while ago. One left `downloading` by a closed tab counts
 * as not finished; the lock keeps two from running at once.
 */
export async function refreshDue(owner: string, everyMs: number) {
  const state = await readIdeasState(owner);
  return !state.complete || !state.checkedAt || Date.now() - state.checkedAt >= everyMs;
}
