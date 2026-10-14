import type { SyncOutcome } from "@/features/sync/model";
import { openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import { claimMutation, listMutations, recoverInterrupted, settleMutation } from "../queue";

/*
 * The one engine that sends an account's queued changes to the server
 * (Phase 5C). No React: the signed-in shell runs it (agent.tsx) and tests
 * drive it directly. Every kind of change goes through it; what differs per
 * kind is only the server's handler (features/sync/apply.ts).
 *
 * One run at a time on the device: a run holds a Web Lock, and a tab that
 * cannot have it leaves the work to the tab that does. Under the lock, a
 * change still marked `sending` was left by a run that never finished and is
 * sent again; the server answers a change it already applied as `duplicate`,
 * so a retry, a reload, or a second tab never writes twice.
 *
 * A failure never loses a change. One that may pass (no answer, a timeout, a
 * server error) waits longer each time and stops after `maxAutoAttempts`; one
 * that cannot pass is kept, failed, for the person; a conflict is kept until
 * the person chooses. Signed out, or another account in the session: the run
 * stops and leaves the change as it was.
 */

export type Sender = (record: MutationRecord) => Promise<SyncOutcome>;

type LockManagerLike = {
  request<T>(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: unknown) => Promise<T>,
  ): Promise<T>;
};

export type RunOptions = {
  /** The person asked: send what is waiting now, without waiting out a backoff. */
  manual?: boolean;
  /** How long one send may take before it counts as no answer. */
  timeoutMs?: number;
  /** Whether `owner` is still the account signed in here; asked before each change. */
  isCurrent?: (owner: string) => boolean;
  /** For tests: the lock manager standing in for `navigator.locks`. */
  locks?: LockManagerLike | null;
};

/**
 * - `idle`: everything due was sent (or nothing was due).
 * - `busy`: another run, in this tab or another, is sending.
 * - `paused`: the session refused or changed account; nothing was failed.
 */
export type RunResult = "idle" | "busy" | "paused";

export const lockName = "sermon-tracker-sync";
export const defaultTimeoutMs = 30_000;
const lastSyncKey = (owner: string) => `lastSync:${owner}`;

/** Runs in this tab when the browser has no Web Locks; the server still makes a double send harmless. */
const runningHere = new Set<string>();

class TimedOut extends Error {}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimedOut()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function defaultLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) return null;
  return navigator.locks as unknown as LockManagerLike;
}

export async function runSync(
  owner: string,
  send: Sender,
  options: RunOptions = {},
): Promise<RunResult> {
  if (!owner) return "paused";
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  if (locks) {
    return locks.request(`${lockName}:${owner}`, { ifAvailable: true }, async (lock) =>
      lock ? drain(owner, send, options) : "busy",
    );
  }
  if (runningHere.has(owner)) return "busy";
  runningHere.add(owner);
  try {
    return await drain(owner, send, options);
  } finally {
    runningHere.delete(owner);
  }
}

async function drain(owner: string, send: Sender, options: RunOptions): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  await recoverInterrupted(owner);
  const tried = new Set<string>();

  for (;;) {
    if (options.isCurrent && !options.isCurrent(owner)) return "paused";
    const now = Date.now();
    const next = (await listMutations(owner)).find(
      (record) =>
        record.status === "pending" &&
        !tried.has(record.opId) &&
        (options.manual || !record.nextAttemptAt || record.nextAttemptAt <= now),
    );
    if (!next) return "idle";
    tried.add(next.opId);

    const claimed = await claimMutation(owner, next.opId);
    if (!claimed) continue;

    let outcome: SyncOutcome;
    try {
      outcome = await within(send(claimed), timeoutMs);
    } catch (error) {
      await settleMutation(owner, claimed.opId, {
        outcome: "retry",
        kind: "network",
        message: error instanceof TimedOut ? "timeout" : undefined,
      });
      continue;
    }

    switch (outcome.status) {
      case "applied":
      case "duplicate":
        await settleMutation(owner, claimed.opId, { outcome: "done" });
        await markSynced(owner);
        break;
      case "conflict":
        await settleMutation(owner, claimed.opId, {
          outcome: "conflict",
          conflict: outcome.conflict,
        });
        break;
      case "rejected":
        await settleMutation(owner, claimed.opId, {
          outcome: "failed",
          kind: "validation",
          message: outcome.message ?? outcome.reason,
        });
        break;
      case "auth":
      case "wrongAccount":
        await settleMutation(owner, claimed.opId, { outcome: "release" });
        return "paused";
      default:
        // An answer this version does not know: kept, and tried again later.
        await settleMutation(owner, claimed.opId, { outcome: "retry", kind: "server" });
    }
  }
}

async function markSynced(owner: string) {
  const db = await openOfflineDb();
  await db.put("meta", Date.now(), lastSyncKey(owner));
}

/** When a change of the owner's was last acknowledged by the server, on this device. */
export async function lastSyncedAt(owner: string): Promise<number | null> {
  const db = await openOfflineDb();
  const value = await db.get("meta", lastSyncKey(owner));
  return typeof value === "number" ? value : null;
}

/** The earliest time a waiting change is due to be sent by itself, if any is waiting. */
export function nextDue(records: MutationRecord[]): number | null {
  const due = records
    .filter((record) => record.status === "pending")
    .map((record) => record.nextAttemptAt ?? 0);
  return due.length ? Math.min(...due) : null;
}

export type QueueCounts = Record<"waiting" | "sending" | "failed" | "conflict", number>;

export function countByStatus(records: MutationRecord[]): QueueCounts {
  const counts: QueueCounts = { waiting: 0, sending: 0, failed: 0, conflict: 0 };
  for (const record of records) {
    if (record.status === "pending") counts.waiting++;
    else if (record.status === "sending") counts.sending++;
    else if (record.status === "failed") counts.failed++;
    else if (record.status === "conflict") counts.conflict++;
  }
  return counts;
}
