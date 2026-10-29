import type { ClassifiedDraft } from "../recovery/classify";
import type { DraftStorageErrorKind } from "../recovery/store";
import type { RestoredWork, VerificationFailure, VerifiedBase } from "./model";

/*
 * Recovery resolution's contract with the host (A2.3C), for A3's recovery
 * dialog: what `inspectRecovery` shows, and what `restore` and `discard`
 * answer. Pure types and no content, except where said: the recovered
 * document is given only by `previewRecovered`, the server's is the
 * session's `base`, and both are full documents to show read only (owner's
 * decision B: switchable previews, no diff, no merge).
 *
 * A token is the only way to name a draft to the session. It is made by the
 * session's own inspection, is good only until the session changes course
 * (any recheck, restore, discard, or end), and carries the exact record the
 * person reviewed: a draft ID alone is never enough to restore or remove
 * anything.
 */

/** Opaque: given by `inspectRecovery`, taken back by `previewRecovered`, `restore`, and `discard`. */
export type RecoveryToken = { readonly recovery: unique symbol };

/** A record as the person sees it. `recordId` identifies it; the token acts on it. */
export type CandidateView = ClassifiedDraft & { token: RecoveryToken };

/**
 * What the person resolves as one (`RecoveryUnit`): a draft, or a restored
 * draft (`head`) with the drafts it came from (`ancestors`, kept with it).
 * Restoring is offered on the head only, and only while `restorable`.
 */
export type UnitView = {
  head: CandidateView;
  ancestors: CandidateView[];
  blocking: boolean;
  restorable: boolean;
};

export type RecoveryInspection =
  | {
      ok: true;
      /** The server's document the comparison was made with (the session's `base`). */
      server: VerifiedBase;
      /** What blocks, and every restored draft with what it came from. */
      units: UnitView[];
      /** Every record of the outline here, blocking or not (equivalent ones can be discarded too). */
      drafts: CandidateView[];
      /** Exactly one unit blocks: its head may be restored now. With more, the others are resolved first. */
      single: boolean;
    }
  | {
      ok: false;
      /** `state`: not `recovery_required`. `identity`/`lock`: the session ended. */
      reason: "state" | "identity" | "lock" | "inspection_failed";
      error?: DraftStorageErrorKind;
    };

export type RestoreResult =
  /** Kept on the device as this session's own draft; the session is `ready` with `restored`. */
  | { outcome: "restored"; restored: RestoredWork }
  | {
      outcome:
        /** The token is not this session's current one (inspect again). */
        | "unknown_token"
        /** Not `recovery_required`, or the session changed course meanwhile. */
        | "state"
        | "identity"
        | "lock"
        /** The draft, or another draft of the outline, is not the one reviewed any more. */
        | "changed"
        /** The server's document moved on since the review: the session checks again by itself. */
        | "server_changed"
        /** It now says what the server says: nothing to restore. */
        | "equivalent"
        /** Another unit still blocks: resolve it first (owner's decision). */
        | "other_candidates"
        /** Not a draft that can be restored: refused by the core, unreadable, or part of another's restore. */
        | "not_restorable"
        /** The session ended after the draft was kept: it is on the device for the next session. */
        | "interrupted";
    }
  | { outcome: "read_failed"; reason: VerificationFailure }
  | { outcome: "storage_failed"; error: DraftStorageErrorKind };

export type DiscardResult =
  /** Removed; the session checks recovery again by itself. */
  | { outcome: "discarded" | "ignored" }
  | { outcome: "unknown_token" | "state" | "identity" | "lock" | "changed" }
  | { outcome: "storage_failed"; error: DraftStorageErrorKind };
