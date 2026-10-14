import { z } from "zod";

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

export const syncTypes = ["idea.create"] as const;
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

export type SyncConflict = { reason: "missingTags"; missingTagIds: string[] };

export type SyncOutcome =
  | { status: "applied"; entityId: string }
  | { status: "duplicate"; entityId: string }
  | { status: "conflict"; conflict: SyncConflict }
  | { status: "rejected"; reason: "validation" | "taken" | "unsupported"; message?: string }
  | { status: "auth" }
  | { status: "wrongAccount" };
