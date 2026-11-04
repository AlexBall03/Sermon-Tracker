import { jsonEqual } from "@/features/sermon-editor/persistence/autosave/model";
import type { JsonValue } from "@/features/sermon-editor/persistence/json";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";

/*
 * After a change whose answer never came (a timeout, a lost connection), the
 * request may or may not have been carried out. A4.2C must not send it again
 * blindly: it reads the preset (`getAppearancePreset`) and asks here what
 * that read proves. Pure. Creates and duplicates need none of this: sending
 * the same operation again is safe, and the ledger answers it.
 *
 * - `applied`: the read is exactly what the request would have left.
 * - `not_applied`: the preset is still at the revision the request named, so
 *   the request wrote nothing (it can still be sent again at that revision,
 *   where the server's own revision check decides).
 * - `superseded`: something else changed it since; the request's outcome
 *   cannot be told, and the person sees the preset as it now is.
 */

export type Settled = "applied" | "not_applied" | "superseded";

type Current = { revision: number; name: string; appearance?: AppearanceSnapshot } | null;

export function settledRename(
  sent: { expectedRevision: number; name: string },
  current: Current,
): Settled {
  if (!current) return "superseded";
  if (current.revision === sent.expectedRevision) {
    return current.name === sent.name ? "applied" : "not_applied";
  }
  return current.revision === sent.expectedRevision + 1 && current.name === sent.name
    ? "applied"
    : "superseded";
}

/** `sent.appearance` is what the server stores: the materialized snapshot (`prepareAppearance`). */
export function settledReplace(
  sent: { expectedRevision: number; appearance: AppearanceSnapshot },
  current: Current,
): Settled {
  if (!current?.appearance) return "superseded";
  const same = jsonEqual(current.appearance as JsonValue, sent.appearance as JsonValue);
  if (current.revision === sent.expectedRevision) return same ? "applied" : "not_applied";
  return current.revision === sent.expectedRevision + 1 && same ? "applied" : "superseded";
}

/**
 * A delete: gone is `applied` (nothing else removes a preset but its owner's
 * delete or account deletion); still at the revision named is `not_applied`;
 * changed since is `superseded`, and a delete at that revision would be
 * refused anyway.
 */
export function settledDelete(sent: { expectedRevision: number }, current: Current): Settled {
  if (!current) return "applied";
  return current.revision === sent.expectedRevision ? "not_applied" : "superseded";
}
