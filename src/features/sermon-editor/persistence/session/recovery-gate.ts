import type { JSONContent } from "@tiptap/core";

import {
  classifyRecovery,
  type RecoveryClassification,
  type RecoveryRecords,
} from "../recovery/classify";
import { DraftStorageError, inspectRecoveryRecords } from "../recovery/store";
import type { RecoveryBlock, RecoveryCandidate } from "./model";

/*
 * The recovery gate (A2.3B.3, A2.3C): whether this device holds work from
 * another editing session of the outline that the server's document does
 * not, before a new session may edit.
 *
 * A draft records what a session kept, never whether its save was sent or
 * answered: one left by a closed tab may be unsent, refused, or still on its
 * way to the server. So no draft is taken as settled because time passed or
 * its tab is gone, and none is restored, discarded, merged, or saved here.
 * - A draft whose content, in the browser's canonical form, is the server's
 *   document does not block: nothing in it is missing from the server. It is
 *   kept, and it proves nothing about its request, which may still arrive;
 *   the new session's saves stay conditional on the revision it read, so
 *   such a request lands as a conflict, never under the new session's words.
 * - A draft a confirmed restore came from (a readable cleanup marker names
 *   it, and it has not changed since) does not block: the server confirmed
 *   the work restored from it (A2.3C). `settleCleanups` removes it.
 * - Any other draft blocks: pending, refused (`conflict`), from a newer
 *   version of the application, or unreadable.
 * - Drafts that cannot be listed block: unknown is never "none".
 * The judgement is `classifyRecovery`'s, the same one resolution uses. It
 * reads only the owner's records of the one outline, and returns no content.
 */

export type RecoveryAssessment =
  | {
      clear: true;
      equivalent: string[];
      classification: RecoveryClassification;
      records: RecoveryRecords;
    }
  | ({
      clear: false;
      equivalent: string[];
      classification: RecoveryClassification | null;
      records: RecoveryRecords | null;
    } & RecoveryBlock);

export async function assessRecovery({
  owner,
  outlineId,
  base,
  revision,
  inspect = inspectRecoveryRecords,
}: {
  owner: string;
  outlineId: string;
  /** The server's document as just read, and its revision. */
  base: JSONContent;
  revision: number;
  inspect?: typeof inspectRecoveryRecords;
}): Promise<RecoveryAssessment> {
  let records: RecoveryRecords;
  try {
    records = await inspect(owner, outlineId);
  } catch (error) {
    const kind = error instanceof DraftStorageError ? error.kind : "failed";
    return {
      clear: false,
      equivalent: [],
      classification: null,
      records: null,
      reason: "inspection_failed",
      error: kind,
    };
  }

  const classification = classifyRecovery({ records, server: base, serverRevision: revision });
  const equivalent: string[] = [];
  const candidates: RecoveryCandidate[] = [];
  records.drafts.forEach(({ read }, index) => {
    const classified = classification.drafts[index];
    if (read.status === "unsupported") {
      candidates.push({ status: "unsupported", id: read.id, draftId: read.draftId });
      return;
    }
    if (read.status === "malformed") {
      candidates.push({ status: "unreadable", id: read.id, draftId: read.draftId });
      return;
    }
    if (classified.kind === "equivalent") {
      equivalent.push(read.draftId);
      return;
    }
    if (!classified.blocking) return;
    candidates.push({
      status: classified.status ?? "pending",
      draftId: read.draftId,
      sequence: read.draft.sequence,
      baseRevision: read.draft.baseRevision,
      updatedAt: read.updatedAt,
      provenance: classified.provenance,
    });
  });
  return candidates.length
    ? { clear: false, equivalent, classification, records, reason: "drafts", candidates }
    : { clear: true, equivalent, classification, records };
}
