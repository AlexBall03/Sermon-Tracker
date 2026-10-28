import type { JSONContent } from "@tiptap/core";

import { jsonEqual } from "../autosave/model";
import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { draftStatus } from "../recovery/model";
import { DraftStorageError, listDrafts } from "../recovery/store";
import type { RecoveryBlock, RecoveryCandidate } from "./model";

/*
 * The recovery gate (A2.3B.3): whether this device holds work from another
 * editing session of the outline that the server's document does not, before
 * a new session may edit.
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
 * - Any other draft blocks: pending, refused (`conflict`), from a newer
 *   version of the application, or unreadable.
 * - Drafts that cannot be listed block: unknown is never "none".
 * It reads only the owner's drafts of the one outline (`listDrafts` keys by
 * owner), and returns no content.
 */

export type RecoveryAssessment =
  { clear: true; equivalent: string[] } | ({ clear: false; equivalent: string[] } & RecoveryBlock);

export async function assessRecovery({
  owner,
  outlineId,
  base,
  list = listDrafts,
}: {
  owner: string;
  outlineId: string;
  /** The server's document as just read. */
  base: JSONContent;
  list?: typeof listDrafts;
}): Promise<RecoveryAssessment> {
  let drafts;
  try {
    drafts = await list(owner, outlineId);
  } catch (error) {
    const kind = error instanceof DraftStorageError ? error.kind : "failed";
    return { clear: false, equivalent: [], reason: "inspection_failed", error: kind };
  }

  const server = canonicalDocument(base);
  const candidates: RecoveryCandidate[] = [];
  const equivalent: string[] = [];
  for (const read of drafts) {
    if (read.status === "unsupported") {
      candidates.push({ status: "unsupported", id: read.id, draftId: read.draftId });
      continue;
    }
    if (read.status === "malformed") {
      candidates.push({ status: "unreadable", id: read.id, draftId: read.draftId });
      continue;
    }
    const kept = canonicalDocument(read.draft.content);
    if (server.ok && kept.ok && jsonEqual(kept.content as JsonValue, server.content as JsonValue)) {
      equivalent.push(read.draftId);
      continue;
    }
    candidates.push({
      status: draftStatus(read.draft),
      draftId: read.draftId,
      sequence: read.draft.sequence,
      baseRevision: read.draft.baseRevision,
      updatedAt: read.updatedAt,
    });
  }
  return candidates.length
    ? { clear: false, equivalent, reason: "drafts", candidates }
    : { clear: true, equivalent };
}
