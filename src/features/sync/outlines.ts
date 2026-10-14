import { z } from "zod";

import type { IdeaKind, IdeaStatus } from "@/features/ideas/model";
import type { SnapshotEntry } from "@/features/outlines/editor/store";
import { entryTypes } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import type { ScriptureReference } from "@/features/scripture/reference";

/*
 * An outline as a device keeps it (Phase 5D.2), as the server sends it, and
 * the changes a device queues for one. Plain values only, so they go through
 * JSON and IndexedDB unchanged; dates are ISO strings. Shared by the browser
 * and the server, with no code of either.
 *
 * Every queued change to an outline names the outline as its `entityId`, so
 * the engine sends one outline's changes strictly in the order they were
 * made (offline/queue.ts, `sendable`): an entry's addition always goes before
 * its words. The entry a change is about is in its payload.
 */

/** One entry as the editor holds it, with `notes` null where there are none. */
export type OfflineOutlineEntry = SnapshotEntry;

/** The sermon an outline is of, as it was when the outline was downloaded. */
export type OfflineOutlineSermon = {
  id: string;
  title: string;
  kind: IdeaKind;
  status: IdeaStatus;
  archivedAt: string | null;
};

export type OfflineOutline = {
  id: string;
  sermonId: string;
  /** `sermon_outlines.revision`: how often its shape has changed. */
  revision: number;
  numbering: NumberingConfig;
  createdAt: string;
  updatedAt: string;
  sermon: OfflineOutlineSermon;
  /** The sermon's own passages, main text first, offered on each entry. */
  sermonReferences: ScriptureReference[];
  entries: OfflineOutlineEntry[];
};

/** What says whether a device's copy of an outline is current, for every outline of the account. */
export type OutlineManifestItem = Pick<
  OfflineOutline,
  "id" | "sermonId" | "revision" | "createdAt" | "updatedAt" | "sermon"
>;

/** `GET /api/offline/outlines`: every outline's manifest item. */
export type OutlineManifestResponse = { owner?: string; outlines: OutlineManifestItem[] };

/** `GET /api/offline/outlines?ids=…`: those outlines, whole. */
export type OutlineRowsResponse = { owner?: string; outlines: OfflineOutline[] };

/** The most outlines one request may ask for whole. */
export const outlinesByIdsLimit = 25;

export const outlineSyncTypes = [
  "outline.entry.add",
  "outline.entry.update",
  "outline.entry.references",
  "outline.entry.move",
  "outline.entry.remove",
  "outline.numbering",
] as const;
export type OutlineSyncType = (typeof outlineSyncTypes)[number];

/** A change of shape, made against the outline's revision; the rest name an entry's or none. */
export const outlineShapeTypes: readonly OutlineSyncType[] = [
  "outline.entry.add",
  "outline.entry.move",
  "outline.entry.remove",
];

const uuid = z.uuid();
const reference = z.object({
  book: z.number(),
  chapterStart: z.number(),
  verseStart: z.number().nullable(),
  chapterEnd: z.number().nullable(),
  verseEnd: z.number().nullable(),
});

/**
 * The payload of each type, as the device writes it. The words and passages
 * are checked again with the outline's own schemas when the change is applied.
 * A change to words or passages carries what they were before it (`base`), so
 * the server can tell which fields the device changed.
 */
export const outlinePayloadSchemas = {
  "outline.entry.add": z.object({
    entryId: uuid,
    type: z.enum(entryTypes),
    parentId: uuid.nullable(),
    position: z.number().int().min(0).optional(),
    title: z.string().optional(),
    notes: z.string().nullable().optional(),
    sourcePointId: uuid.optional(),
    /** Only a change settled as "add as a new point" carries passages. */
    references: z.array(reference).optional(),
  }),
  "outline.entry.update": z.object({
    entryId: uuid,
    title: z.string().optional(),
    notes: z.string().nullable().optional(),
    base: z.object({ title: z.string().optional(), notes: z.string().nullable().optional() }),
  }),
  "outline.entry.references": z.object({
    entryId: uuid,
    references: z.array(reference),
    base: z.array(reference),
  }),
  "outline.entry.move": z.object({
    entryId: uuid,
    parentId: uuid.nullable(),
    position: z.number().int().min(0),
  }),
  "outline.entry.remove": z.object({ entryId: uuid }),
  "outline.numbering": z.object({ numbering: z.unknown() }),
} satisfies Record<OutlineSyncType, z.ZodType>;

export type OutlinePayload<T extends OutlineSyncType> = z.infer<(typeof outlinePayloadSchemas)[T]>;

/** An entry's words and passages as the server holds them, for a conflict. */
export type ServerEntry = {
  title: string;
  notes: string | null;
  references: ScriptureReference[];
  revision: number;
};

/** The entry a queued change to an outline is about, if any. */
export function entryOf(payload: unknown): string | null {
  const entryId = (payload as { entryId?: unknown } | null)?.entryId;
  return typeof entryId === "string" ? entryId : null;
}
