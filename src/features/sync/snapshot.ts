import type { Database } from "@/db/types";
import { ideaManifest, ideasByIds } from "@/features/ideas/ideas";
import { listTags } from "@/features/ideas/tags";
import { outlineIdsForSermons } from "@/features/outlines/outlines";
import { occurrenceCounts } from "@/features/preaching/occurrences";
import { toOfflineIdea, type IdeaManifestResponse, type OfflineIdea } from "./ideas";

/*
 * What a device downloads to keep an account's ideas (Phase 5D.1), read
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
