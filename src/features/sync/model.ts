import { z } from "zod";

import type { OfflineIdea } from "./ideas";
import { outlineSyncTypes, type ServerEntry } from "./outlines";

/*
 * What a device sends to have one queued change applied, and what the server
 * answers (Phase 5C). Plain types and schemas, shared by the browser and the
 * server.
 *
 * The answer decides what the device does with its copy:
 * - `applied` and `duplicate`: the server has it; the device lets it go.
 * - `conflict`: the server's state and the change disagree in a way that is
 *   not safe to settle alone; the device keeps it until the person chooses.
 * - `rejected`: it can never be applied as it is; the device keeps it, failed,
 *   for the person to see, retry, or delete.
 * - `auth` and `wrongAccount`: not now, and not this change's fault: the
 *   device stops and leaves it as it was.
 * Anything else (no answer, an error) is passing, and is tried again later.
 */

export const syncTypes = [
  "idea.create",
  "idea.update",
  "idea.archive",
  "idea.restore",
  "idea.delete",
  // Phase 5D.2: changes to an outline (outlines.ts).
  ...outlineSyncTypes,
] as const;
export type SyncType = (typeof syncTypes)[number];

export const syncEnvelopeSchema = z.object({
  opId: z.uuid(),
  owner: z.uuid(),
  type: z.enum(syncTypes),
  entityId: z.uuid(),
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
  baseRevision: z.number().int().nonnegative().optional(),
});
export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;

/** `idea.delete`'s payload: whether the person was told the idea's outline would go with it. */
export const ideaDeletePayloadSchema = z.object({ outline: z.boolean().default(false) }).default({
  outline: false,
});

/**
 * Why the server would not apply a change as it stands:
 * - `missingTags`: tags it names were deleted.
 * - `stale`: the idea was changed since the change was made; `server` is it now.
 * - `missing`: the idea, or the outline, is no longer in the account.
 * - `preached`: it has preaching history, so it is never deleted.
 * - `outline`: it has an outline the person was not told deleting would take.
 * - `outlineStale`: the outline's shape was changed since; `revision` is it now.
 * - `entryStale`: an entry's words or passages were changed since, in the
 *   `fields` the device changed too, to something else; `entry` is it now.
 * - `entryMissing`: the entry was removed from the outline since.
 * - `placement`: where an entry was to go is no longer a place it can go.
 * - `documentAuthoritative`: the outline has become a sermon document (A2.2),
 *   so a change to its legacy entries or numbering can no longer be applied.
 *   Nothing was written; the device keeps the change, and its text, until the
 *   person discards it. It is not stale: trying again would be refused again.
 */
export type SyncConflict =
  | { reason: "missingTags"; missingTagIds: string[] }
  | { reason: "stale"; server: OfflineIdea }
  | { reason: "missing" }
  | { reason: "preached" }
  | { reason: "outline" }
  | { reason: "outlineStale"; revision: number }
  | { reason: "entryStale"; entry: ServerEntry; fields: ("title" | "notes" | "references")[] }
  | { reason: "entryMissing" }
  | { reason: "placement" }
  | { reason: "documentAuthoritative" };

export type SyncOutcome =
  /**
   * `revision` is the idea's revision after the change, when it has one; for
   * an outline, the outline's after a change of shape, and the entry's after
   * a change to its words or passages.
   */
  | { status: "applied"; entityId: string; revision?: number }
  | { status: "duplicate"; entityId: string }
  | { status: "conflict"; conflict: SyncConflict }
  | { status: "rejected"; reason: "validation" | "taken" | "unsupported"; message?: string }
  | { status: "auth" }
  | { status: "wrongAccount" };
