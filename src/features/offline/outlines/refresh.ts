import type {
  OfflineOutline,
  OutlineManifestResponse,
  OutlineRowsResponse,
} from "@/features/sync/outlines";
import { outlinesByIdsLimit } from "@/features/sync/outlines";
import { openOfflineDb } from "../db";
import { listMutations } from "../queue";
import {
  announceOutlinesChange,
  outlineKind,
  outlineRecord,
  readOutlinesState,
  writeOutlinesState,
  type KeptOutline,
} from "./store";

/*
 * Downloads the account's outlines to this device, and keeps them current
 * (Phase 5D.2), as refreshIdeas does for its ideas. From
 * `/api/offline/outlines`: first every outline's revision and when it was last
 * worked on, with its sermon as it is now; then, a few at a time, only the
 * outlines this device does not have as they are. So a refresh with nothing
 * changed reads one small list.
 *
 * Only the server's copy (`server`) is written. A copy changed here (`local`)
 * is the person's unsent work and is never touched; an outline the server no
 * longer has is forgotten only when nothing about it is queued.
 *
 * One refresh at a time per account on the device (a Web Lock), and only for
 * the account the server says it is: the session's, never the device's word.
 */

export type RefreshResult = "done" | "busy" | "failed" | "auth" | "wrongAccount";

const endpoint = "/api/offline/outlines";

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

export async function refreshOutlines(owner: string, options: RefreshOptions = {}) {
  if (!owner) return "failed" satisfies RefreshResult;
  const locks =
    options.locks === undefined
      ? typeof navigator !== "undefined" && "locks" in navigator
        ? navigator.locks
        : null
      : options.locks;
  const run = () => download(owner, options.fetcher ?? ((url, init) => fetch(url, init)));
  if (!locks) return run();
  return locks.request(`sermon-tracker-outlines:${owner}`, { ifAvailable: true }, (lock) =>
    lock ? run() : ("busy" as const),
  );
}

async function download(owner: string, fetcher: Fetcher): Promise<RefreshResult> {
  await writeOutlinesState(owner, { status: "downloading", error: undefined });
  try {
    const manifest = await ask<OutlineManifestResponse>(fetcher, endpoint, owner);
    const queued = new Set((await listMutations(owner)).map((record) => record.entityId));

    // What the device lacks or has out of date, and what the manifest alone brings up to date.
    const db = await openOfflineDb();
    const tx = db.transaction("accountData", "readwrite");
    const records = await tx.store.index("ownerKind").getAll([owner, outlineKind]);
    const kept = new Map(records.map((record) => [record.id, record.data as KeptOutline]));
    const listed = new Set<string>();
    const wanted: string[] = [];
    for (const item of manifest.outlines) {
      listed.add(item.id);
      const copy = kept.get(item.id);
      if (
        !copy?.server ||
        copy.behind ||
        copy.server.revision !== item.revision ||
        copy.server.updatedAt !== item.updatedAt
      ) {
        wanted.push(item.id);
        continue;
      }
      // Only its sermon may have changed (renamed, archived, refiled).
      await tx.store.put(
        outlineRecord(owner, item.id, { ...copy, server: { ...copy.server, sermon: item.sermon } }),
      );
    }
    for (const [id, copy] of kept) {
      if (listed.has(id)) continue;
      // Gone from the account. Work queued about it stays; the server will say what became of it.
      if (queued.has(id)) {
        if (copy.server) await tx.store.put(outlineRecord(owner, id, { ...copy, server: null }));
      } else {
        await tx.store.delete([owner, outlineKind, id]);
      }
    }
    await tx.done;

    const total = manifest.outlines.length;
    let have = total - wanted.length;
    await writeOutlinesState(owner, { total, have });
    for (let start = 0; start < wanted.length; start += outlinesByIdsLimit) {
      const ids = wanted.slice(start, start + outlinesByIdsLimit);
      const rows = await ask<OutlineRowsResponse>(
        fetcher,
        `${endpoint}?ids=${ids.join(",")}`,
        owner,
      );
      await keep(owner, rows.outlines);
      // An outline deleted between the two requests is simply not among them.
      have += ids.length;
      await writeOutlinesState(owner, { have: Math.min(have, total) });
    }

    await writeOutlinesState(owner, {
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
    await writeOutlinesState(owner, {
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
async function keep(owner: string, outlines: OfflineOutline[]) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  for (const outline of outlines) {
    const stored = await tx.store.get([owner, outlineKind, outline.id]);
    const before = stored && stored.owner === owner ? (stored.data as KeptOutline) : null;
    await tx.store.put(
      outlineRecord(owner, outline.id, {
        server: outline,
        local: before?.local ?? null,
        generation: before?.generation,
      }),
    );
  }
  await tx.done;
  announceOutlinesChange();
}

/**
 * True when a download is worth starting by itself: none finished, or the
 * last check was a while ago.
 */
export async function refreshOutlinesDue(owner: string, everyMs: number) {
  const state = await readOutlinesState(owner);
  return !state.complete || !state.checkedAt || Date.now() - state.checkedAt >= everyMs;
}
