import { z } from "zod";

import type { OfflineIdea } from "./ideas";

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
 * - `missing`: the idea is no longer in the account.
 * - `preached`: it has preaching history, so it is never deleted.
 * - `outline`: it has an outline the person was not told deleting would take.
 */
export type SyncConflict =
  | { reason: "missingTags"; missingTagIds: string[] }
  | { reason: "stale"; server: OfflineIdea }
  | { reason: "missing" }
  | { reason: "preached" }
  | { reason: "outline" };

export type SyncOutcome =
  /** `revision` is the idea's revision after the change, when it has one. */
  | { status: "applied"; entityId: string; revision?: number }
  | { status: "duplicate"; entityId: string }
  | { status: "conflict"; conflict: SyncConflict }
  | { status: "rejected"; reason: "validation" | "taken" | "unsupported"; message?: string }
  | { status: "auth" }
  | { status: "wrongAccount" };
