import type { Database } from "@/db/types";
import { ideaManifest, ideasByIds } from "@/features/ideas/ideas";
import { listTags } from "@/features/ideas/tags";
import { getOutline, outlineIdsForSermons, outlineManifest } from "@/features/outlines/outlines";
import { occurrenceCounts } from "@/features/preaching/occurrences";
import { toOfflineIdea, type IdeaManifestResponse, type OfflineIdea } from "./ideas";
import type { OfflineOutline, OfflineOutlineSermon, OutlineManifestResponse } from "./outlines";

/*
 * What a device downloads to keep an account's ideas (Phase 5D.1) and
 * outlines (Phase 5D.2), read
 * through each feature's own owner-scoped queries. Server only.
 */

type Reader = Pick<Database, "select">;

/** Which of these ideas have an outline, and which have been preached. */
async function flagsFor(db: Reader, ownerId: string, ids: string[]) {
  const [outlines, preached] = await Promise.all([
    outlineIdsForSermons(db, ownerId, ids),
    occurrenceCounts(db, ownerId, ids),
  ]);
  return (id: string) => ({ hasOutline: outlines.has(id), preached: preached.has(id) });
}

export async function manifestFor(db: Reader, ownerId: string): Promise<IdeaManifestResponse> {
  const [rows, tags] = await Promise.all([ideaManifest(db, ownerId), listTags(db, ownerId)]);
  const flags = await flagsFor(
    db,
    ownerId,
    rows.map((row) => row.id),
  );
  return {
    ideas: rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      lastDevelopedAt: row.lastDevelopedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      ...flags(row.id),
    })),
    tags: tags.map(({ id, name }) => ({ id, name })),
  };
}

export async function offlineIdeas(
  db: Reader,
  ownerId: string,
  ids: string[],
): Promise<OfflineIdea[]> {
  const found = await ideasByIds(db, ownerId, ids);
  const flags = await flagsFor(
    db,
    ownerId,
    found.map((idea) => idea.id),
  );
  return found.map((idea) => toOfflineIdea(idea, flags(idea.id)));
}

/** The sermon as a device keeps it beside its outline. */
const sermonOf = (sermon: {
  id: string;
  title: string;
  kind: OfflineOutlineSermon["kind"];
  status: OfflineOutlineSermon["status"];
  archivedAt: Date | null;
}): OfflineOutlineSermon => ({
  id: sermon.id,
  title: sermon.title,
  kind: sermon.kind,
  status: sermon.status,
  archivedAt: sermon.archivedAt?.toISOString() ?? null,
});

/** What a device compares with its copies of the account's outlines (Phase 5D.2). */
export async function outlineManifestFor(
  db: Reader,
  ownerId: string,
): Promise<OutlineManifestResponse> {
  const rows = await outlineManifest(db, ownerId);
  return {
    outlines: rows.map((row) => ({
      id: row.id,
      sermonId: row.sermonId,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sermon: sermonOf(row.sermon),
    })),
  };
}

/** These outlines of the owner's, whole, with their sermons' passages. Another's are not among them. */
export async function offlineOutlines(
  db: Reader,
  ownerId: string,
  ids: string[],
): Promise<OfflineOutline[]> {
  const found = (await Promise.all(ids.map((id) => getOutline(db, ownerId, id)))).filter(
    (outline) => outline !== null,
  );
  const sermons = new Map(
    (
      await ideasByIds(
        db,
        ownerId,
        found.map((outline) => outline.sermonId),
      )
    ).map((idea) => [idea.id, idea]),
  );
  return found.map((outline) => {
    const sermon = sermons.get(outline.sermonId);
    return {
      id: outline.id,
      sermonId: outline.sermonId,
      revision: outline.revision,
      numbering: outline.numbering,
      createdAt: outline.createdAt.toISOString(),
      updatedAt: outline.updatedAt.toISOString(),
      sermon: sermonOf({
        ...outline.sermon,
        status: sermon?.status ?? "idea",
      }),
      sermonReferences: [...(sermon?.references ?? [])]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map(({ book, chapterStart, verseStart, chapterEnd, verseEnd }) => ({
          book,
          chapterStart,
          verseStart,
          chapterEnd,
          verseEnd,
        })),
      entries: outline.entries.map((entry) => ({
        id: entry.id,
        parentId: entry.parentId,
        type: entry.type,
        position: entry.position,
        title: entry.title,
        notes: entry.notes,
        revision: entry.revision,
        references: entry.references,
        sourcePointId: entry.sourcePointId,
      })),
    };
  });
}
