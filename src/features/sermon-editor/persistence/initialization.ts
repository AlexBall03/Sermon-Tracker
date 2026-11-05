import type { JSONContent } from "@tiptap/core";

import { latestPresetRevision, type UserPresetId } from "@/features/editor-lab/styles/model";
import { snapshotStyles, type AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { legacyToDocument } from "@/features/sermon-editor/document";
import { prepareDocument } from "./canonical";
import type { DocumentRefusal } from "./model";

/*
 * The first sermon document of a genuinely new outline (A4.2C), made in the
 * same transaction as the outline itself while conversion is on (the owner's
 * decision). Pure: no database, account, or React, so a preview in the
 * browser builds exactly what the server would store.
 *
 * It is what converting the empty outline would make (`legacyToDocument`
 * with no entries, through `prepareDocument`), with the starting appearance
 * written in explicitly:
 *
 *   - a built-in preset: its id and the latest revision, as choosing it does;
 *   - a personal preset: its stored snapshot (already materialized when it
 *     was saved), styles and numbering both, copied. Nothing in the document
 *     names the preset, so changing or deleting it later restyles nothing.
 *
 * Existing outlines, conversions, recovery drafts, and kept copies never pass
 * through here.
 */

export type OutlineStart =
  { kind: "builtin"; preset: UserPresetId } | { kind: "snapshot"; snapshot: AppearanceSnapshot };

export type InitialDocument =
  { ok: true; content: JSONContent } | ({ ok: false } & DocumentRefusal);

/** The outline as it was just inserted: its ID, shape revision, and stored numbering. */
export type NewOutline = { id: string; revision: number; numbering: unknown };

export function initialDocument(outline: NewOutline, start: OutlineStart): InitialDocument {
  const numbering = start.kind === "snapshot" ? start.snapshot.numbering : outline.numbering;
  const converted = legacyToDocument({
    id: outline.id,
    revision: outline.revision,
    numbering: numbering as never,
    entries: [],
  });
  if (!converted.ok || converted.issues.length > 0) {
    return { ok: false, status: "invalid", problems: [] };
  }
  const empty = prepareDocument(converted.doc);
  if (!empty.ok) return empty;

  const styles =
    start.kind === "snapshot"
      ? snapshotStyles(start.snapshot)
      : { version: 1 as const, preset: start.preset, presetRevision: latestPresetRevision };
  return prepareDocument({
    ...empty.content,
    attrs: { ...empty.content.attrs, styles },
  });
}
