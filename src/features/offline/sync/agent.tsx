"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { syncMutation } from "@/features/sync/actions";
import type { MutationRecord } from "../model";
import { listMutations, onQueueChange, resolveMutation, retryMutation } from "../queue";
import { lastSyncedAt, nextDue, runSync, type RunResult } from "./engine";

export type SyncState = {
  /** A run is sending from this tab. */
  running: boolean;
  /** How the last run in this tab ended; `paused` means the session refused. */
  last: RunResult | null;
  /** When a change was last acknowledged by the server, on this device. */
  lastSyncAt: number | null;
  /** Send what is waiting now. */
  syncNow: () => void;
  /** Send a failed or conflicting change again, as it is. */
  retry: (opId: string) => Promise<void>;
  /** Settle a conflict with what the change should now say, and send it. */
  resolve: (opId: string, payload: unknown) => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

/** The engine's state in the signed-in shell; `null` elsewhere (the offline page), where nothing is sent. */
export function useSync() {
  return useContext(SyncContext);
}

/** One queued change as the server's action takes it. */
const send = (record: MutationRecord) =>
  syncMutation({
    opId: record.opId,
    owner: record.owner,
    type: record.type,
    entityId: record.entityId,
    schemaVersion: record.schemaVersion,
    payload: record.payload,
    baseRevision: record.baseRevision,
  });

/**
 * Runs the sync engine for the signed-in account (Phase 5C): when the shell
 * opens, when the browser comes back online or to the front, when work is
 * queued (in any tab), when a backoff is due, and when the person asks. It
 * draws nothing. A queued change is durable, so nothing here holds unsaved
 * work: a reload in the middle of a send only means it is sent again.
 */
export function SyncAgent({ account, children }: { account: string; children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const current = useRef(account);
  const state = useRef({ running: false, again: false, manual: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    current.current = account;
  }, [account]);

  const kick = useCallback(
    (manual = false) => {
      const run = state.current;
      run.manual ||= manual;
      if (run.running) {
        run.again = true;
        return;
      }
      run.running = true;
      setRunning(true);
      void (async () => {
        try {
          do {
            run.again = false;
            const asked = run.manual;
            run.manual = false;
            const result = await runSync(account, send, {
              manual: asked,
              isCurrent: (owner) => current.current === owner,
            }).catch((): RunResult => "idle");
            setLast(result);
            if (result === "paused") break;
          } while (run.again && current.current === account);
          setLastSyncAt(await lastSyncedAt(account).catch(() => null));
          // Wake again when the next backoff is due.
          const due = nextDue(await listMutations(account).catch(() => []));
          clearTimeout(timer.current);
          if (due !== null) {
            timer.current = setTimeout(() => kick(), Math.max(1_000, due - Date.now()));
          }
        } finally {
          run.running = false;
          setRunning(false);
        }
      })();
    },
    [account],
  );

  useEffect(() => {
    kick();
    const online = () => kick();
    const visible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    const stop = onQueueChange(() => {
      // A change this run made itself is already in hand; new work is sent once it ends.
      if (!state.current.running) kick();
    });
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      stop();
      clearTimeout(timer.current);
    };
  }, [kick]);

  const value = useMemo<SyncState>(
    () => ({
      running,
      last,
      lastSyncAt,
      syncNow: () => kick(true),
      retry: async (opId) => {
        await retryMutation(account, opId);
        kick(true);
      },
      resolve: async (opId, payload) => {
        await resolveMutation(account, opId, payload);
        kick(true);
      },
    }),
    [account, kick, last, lastSyncAt, running],
  );

  return <SyncContext value={value}>{children}</SyncContext>;
}
