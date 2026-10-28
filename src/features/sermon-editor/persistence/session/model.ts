import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

import type { ServerSaveStatus } from "../autosave/model";
import type { DraftStorageErrorKind } from "../recovery/store";

/*
 * Editor sessions (A2.3B.3): the contract between one browser tab's editor and
 * the persistence it may use. Pure: no React, no editor, no browser API.
 *
 * Two conditions must both hold before a session may edit or save, and
 * neither stands in for the other:
 * 1. Exclusive ownership: this session holds the outline's Web Lock in this
 *    browser profile, and the account signed in is still the one it opened for.
 * 2. Recovery clearance: the server's document was read (the GET route), and
 *    no recovery draft on this device from another session says something
 *    the server does not (`assessRecovery`).
 * A free lock never proves that an earlier session's save finished, and a
 * clear device never proves that no other tab is editing. The server's
 * conditional revision stays the authority over every write.
 */

/** Waiting limits, never evidence: a request still pending when one passes may still be written. */
export const ownershipTiming = {
  /**
   * How long the editing tab, asked to hand over, waits for a save to settle
   * before it decides. Longer than the save timeout (15 s), so a save that
   * gets no answer is classified by the coordinator first.
   */
  relinquishSaveMs: 20_000,
  /** How long a tab asking to edit waits for the lock before it gives up (`unanswered`). */
  takeoverAnswerMs: 25_000,
};
export type OwnershipTiming = typeof ownershipTiming;

/** The lock that makes one editing session per account and outline in a browser profile. */
export const lockName = (owner: string, outlineId: string) =>
  `sermon-tracker-editor:${owner}:${outlineId}`;

/** The channel that carries takeover requests and answers: identifiers only, never content. */
export const channelName = "sermon-tracker-editor";

/** A server document a session verified: canonical, at a revision. */
export type VerifiedBase = { content: JSONContent; revision: number };

/**
 * A recovery draft that blocks editing. Never its content: A2.3C reads the
 * draft itself (`readDraft`) when the person chooses.
 */
export type RecoveryCandidate =
  | {
      /** Holds words the server is not known to have (a save of them may still land). */
      status: "pending" | "conflict";
      draftId: string;
      sequence: number;
      baseRevision: number;
      updatedAt: number;
    }
  /** Written by a newer version of the application: kept, never guessed at. */
  | { status: "unsupported"; id: string; draftId: string }
  /** Not a draft this code can read: kept as it is. */
  | { status: "unreadable"; id: string; draftId: string | null };

/** Why the session will not edit until the person resolves recovery (A2.3C). */
export type RecoveryBlock =
  /** Drafts from other sessions that differ from the server's document, or cannot be read. */
  | { reason: "drafts"; candidates: RecoveryCandidate[] }
  /** The device's drafts could not be listed: unknown is never "none". */
  | { reason: "inspection_failed"; error: DraftStorageErrorKind };

export type VerificationFailure = "offline" | "failed" | "missing" | "unauthorized" | "unreadable";

/**
 * Where a session stands. Only `active` may edit (`canEdit`) and only
 * `active` and `relinquishing` may save. Terminal: `lost`,
 * `identity_invalidated`, `unavailable`, `disposed`; a host that wants to edit
 * again makes a new session.
 */
export type EditorSessionState =
  /** Asking for the lock. */
  | { kind: "acquiring" }
  /** Holding the lock; reading the server's document and the device's drafts. */
  | { kind: "verifying" }
  /**
   * Holding the lock, both conditions met: open the editor from `base`
   * (read only), then `attach`.
   */
  | { kind: "ready"; base: VerifiedBase }
  /** Editing and saving. */
  | { kind: "active"; base: VerifiedBase }
  /** Asked to hand over: editing is off; the newest words are being kept and, if possible, saved. */
  | { kind: "relinquishing" }
  /**
   * Another session edits this outline here. `available`: "Edit here" may be
   * offered. `declined`: the editing tab would not hand over (its words are
   * not kept anywhere else yet). `unanswered`: no answer in time.
   */
  | {
      kind: "read_only";
      takeover: "available" | "declined" | "unanswered";
      reason?: "unprotected" | "starting";
    }
  /** "Edit here" was pressed: waiting for the editing tab to hand over. */
  | { kind: "takeover_pending" }
  /**
   * Holding the lock, but recovery is not clear: nothing is edited or saved
   * until the person resolves it and `recheck()` finds it clear. `base` is the
   * server's document as read (for showing it, and for A2.3C to compare).
   */
  | ({ kind: "recovery_required"; base: VerifiedBase } & RecoveryBlock)
  /** Holding the lock, but the server's document could not be read. Only `recheck()` tries again. */
  | { kind: "verification_failed"; reason: VerificationFailure }
  /**
   * The session ended. `handedOff`: another tab took over. `suspended`: the
   * page was hidden for good or put in the back-forward cache. `lockLost`: the
   * browser took the lock away.
   */
  | { kind: "lost"; reason: "handedOff" | "suspended" | "lockLost" }
  /** The account signed in is no longer the one this session opened for. */
  | { kind: "identity_invalidated" }
  /** Web Locks are missing or failed: never an editor without them. */
  | { kind: "unavailable"; reason: "unsupported" | "failed" }
  | { kind: "disposed" };

export type EditorSessionKind = EditorSessionState["kind"];

const terminalKinds: ReadonlySet<EditorSessionKind> = new Set([
  "lost",
  "identity_invalidated",
  "unavailable",
  "disposed",
]);

export const isTerminal = (state: EditorSessionState) => terminalKinds.has(state.kind);

/**
 * Whether a page showing this status holds work that is not yet safe to
 * leave (for `holdUnsavedWork`, src/lib/unsaved-work.ts): anything not
 * confirmed by the server or kept on this device. `local` is on the device;
 * `saving`, `unresolved`, `blocked`, `failed`, `stalled`, and `offline` are not
 * known to be on the server and always hold (A2.3B.2A and B.2C's open item).
 */
export function holdsUnsavedWork(status: ServerSaveStatus): boolean {
  return !(
    status === "saved" ||
    status === "local" ||
    status === "unchanged" ||
    status === "disposed"
  );
}

const uuid = z.uuid();
const scope = { owner: z.string().min(1).max(200), outlineId: uuid };

/** What a tab may say on the channel (version 1). Anything else is ignored. */
export const ownershipMessage = z.discriminatedUnion("type", [
  z
    .object({ v: z.literal(1), type: z.literal("takeover_request"), ...scope, requestId: uuid })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal("takeover_answer"),
      ...scope,
      requestId: uuid,
      answer: z.enum(["releasing", "declined"]),
      reason: z.enum(["unprotected", "starting"]).optional(),
    })
    .strict(),
]);
export type OwnershipMessage = z.infer<typeof ownershipMessage>;
