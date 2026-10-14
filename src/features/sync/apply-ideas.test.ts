// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, sermonOutlines, syncOperations, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  archiveIdea,
  attachReferences,
  classifyIdea,
  createIdea,
  deleteIdea,
  getIdea,
  markDeveloped,
  restoreIdea,
  setIdeaKind,
  updateIdea,
} from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createTag, deleteTag } from "@/features/ideas/tags";
import { createOutline } from "@/features/outlines/outlines";
import { createOccurrence } from "@/features/preaching/occurrences";
import { preachingSchemas } from "@/features/preaching/schemas";
import { applyMutation } from "./apply";
import type { SyncEnvelope, SyncType } from "./model";
import { manifestFor, offlineIdeas } from "./snapshot";

/*
 * Phase 5D.1: changes to existing ideas, queued on a device and applied once,
 * each against the revision it was made on.
 */

let db: Database;
let me: string;
let other: string;

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

async function idea(owner: string, fields: Record<string, unknown> = {}) {
  const created = await createIdea(
    db,
    owner,
    ideaInputSchema.parse({ kind: "sermon", title: "Grace", ...fields }),
  );
  return created!;
}

const revisionOf = async (id: string) =>
  (await db.select({ revision: ideas.revision }).from(ideas).where(eq(ideas.id, id)))[0]?.revision;

const change = (
  owner: string,
  type: SyncType,
  entityId: string,
  payload: unknown,
  baseRevision?: number,
): SyncEnvelope => ({
  opId: crypto.randomUUID(),
  owner,
  type,
  entityId,
  schemaVersion: 1,
  payload,
  baseRevision,
});

const draft = (fields: Record<string, unknown> = {}) =>
  ideaInputSchema.parse({ kind: "sermon", title: "Grace", ...fields });

describe("an idea's revision", () => {
  it("moves with what the idea says, and with nothing else", async () => {
    const { id } = await idea(me);
    expect(await revisionOf(id)).toBe(0);
    await updateIdea(db, me, id, draft({ title: "Grace abounding" }));
    expect(await revisionOf(id)).toBe(1);
    await classifyIdea(db, me, id, { status: "developing" });
    await setIdeaKind(db, me, id, "point");
    await attachReferences(db, me, id, [
      { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null },
    ]);
    expect(await revisionOf(id)).toBe(4);
    // Putting it away, outline work, and a passage it already has change nothing it says.
    await archiveIdea(db, me, id);
    await restoreIdea(db, me, id);
    await markDeveloped(db, me, id);
    await attachReferences(db, me, id, [
      { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null },
    ]);
    expect(await revisionOf(id)).toBe(4);
  });
});

describe("applying a queued edit", () => {
  it("writes it once, at the revision it was made on, and says the new one", async () => {
    const { id } = await idea(me);
    const edit = change(me, "idea.update", id, draft({ title: "Sufficient grace" }), 0);
    expect(await applyMutation(db, me, edit, "en")).toEqual({
      status: "applied",
      entityId: id,
      revision: 1,
    });
    expect((await applyMutation(db, me, edit, "en")).status).toBe("duplicate");
    expect(await revisionOf(id)).toBe(1);
    expect((await getIdea(db, me, id))?.title).toBe("Sufficient grace");
  });

  it("never writes over a change made since, and sends the server's copy instead", async () => {
    const { id } = await idea(me);
    await updateIdea(db, me, id, draft({ title: "Changed online" }));
    const edit = change(me, "idea.update", id, draft({ title: "Changed offline" }), 0);
    const outcome = await applyMutation(db, me, edit, "en");
    expect(outcome).toMatchObject({
      status: "conflict",
      conflict: { reason: "stale", server: { id, title: "Changed online", revision: 1 } },
    });
    expect((await getIdea(db, me, id))?.title).toBe("Changed online");
    // Nothing is recorded, so the person's choice is applied as its first time.
    const ledger = await db
      .select()
      .from(syncOperations)
      .where(and(eq(syncOperations.ownerId, me), eq(syncOperations.opId, edit.opId)));
    expect(ledger).toHaveLength(0);

    expect((await applyMutation(db, me, { ...edit, baseRevision: 1 }, "en")).status).toBe(
      "applied",
    );
    expect((await getIdea(db, me, id))?.title).toBe("Changed offline");
  });

  it("says an idea deleted since is missing, and a deleted tag is a conflict", async () => {
    const { id } = await idea(me);
    const tag = await createTag(db, me, "Hope");
    if (!tag.ok) throw new Error("tag not created");
    await deleteTag(db, me, tag.tag.id);
    const tagged = change(me, "idea.update", id, draft({ tagIds: [tag.tag.id] }), 0);
    expect(await applyMutation(db, me, tagged, "en")).toEqual({
      status: "conflict",
      conflict: { reason: "missingTags", missingTagIds: [tag.tag.id] },
    });

    await deleteIdea(db, me, id);
    const late = change(me, "idea.update", id, draft(), 0);
    expect(await applyMutation(db, me, late, "en")).toEqual({
      status: "conflict",
      conflict: { reason: "missing" },
    });
  });

  it("refuses an edit without its revision, and never touches another account's idea", async () => {
    const { id } = await idea(other);
    expect(
      (await applyMutation(db, me, change(me, "idea.update", id, draft(), undefined), "en")).status,
    ).toBe("rejected");
    expect(
      await applyMutation(db, me, change(me, "idea.update", id, draft({ title: "Mine" }), 0), "en"),
    ).toEqual({
      status: "conflict",
      conflict: { reason: "missing" },
    });
    expect((await getIdea(db, other, id))?.title).toBe("Grace");
  });
});

describe("archiving and restoring from the queue", () => {
  it("are what the idea should be, so a repeat or a late one is harmless", async () => {
    const { id } = await idea(me);
    await updateIdea(db, me, id, draft({ title: "Edited since" }));
    const archive = change(me, "idea.archive", id, null, 0);
    expect((await applyMutation(db, me, archive, "en")).status).toBe("applied");
    expect((await applyMutation(db, me, archive, "en")).status).toBe("duplicate");
    expect((await getIdea(db, me, id))?.archivedAt).not.toBeNull();
    expect(
      (await applyMutation(db, me, change(me, "idea.restore", id, null, 0), "en")).status,
    ).toBe("applied");
    expect((await getIdea(db, me, id))?.archivedAt).toBeNull();
    expect(await revisionOf(id)).toBe(1);
  });
});

describe("deleting from the queue", () => {
  it("deletes once, and an idea already gone is nothing to lose", async () => {
    const { id } = await idea(me);
    const remove = change(me, "idea.delete", id, { outline: false }, 0);
    expect((await applyMutation(db, me, remove, "en")).status).toBe("applied");
    expect(await getIdea(db, me, id)).toBeNull();
    expect((await applyMutation(db, me, remove, "en")).status).toBe("duplicate");
    const again = change(me, "idea.delete", id, { outline: false }, 0);
    expect((await applyMutation(db, me, again, "en")).status).toBe("applied");
  });

  it("never erases a change made since, an outline nobody was told of, or preaching history", async () => {
    const { id } = await idea(me);
    await updateIdea(db, me, id, draft({ notes: "Written online" }));
    const stale = change(me, "idea.delete", id, { outline: false }, 0);
    expect(await applyMutation(db, me, stale, "en")).toMatchObject({
      status: "conflict",
      conflict: { reason: "stale", server: { notes: "Written online" } },
    });

    const outlined = await createOutline(db, me, id);
    expect(outlined.status).toBe("created");
    expect(
      await applyMutation(db, me, change(me, "idea.delete", id, { outline: false }, 1), "en"),
    ).toEqual({
      status: "conflict",
      conflict: { reason: "outline" },
    });
    expect(await getIdea(db, me, id)).not.toBeNull();

    const schemas = preachingSchemas("en", "2026-10-12");
    await createOccurrence(
      db,
      me,
      schemas.occurrenceInput.parse({ sermonId: id, preachedOn: "2026-10-11" }),
    );
    expect(
      await applyMutation(db, me, change(me, "idea.delete", id, { outline: true }, 1), "en"),
    ).toEqual({
      status: "conflict",
      conflict: { reason: "preached" },
    });
    expect(await getIdea(db, me, id)).not.toBeNull();
  });

  it("takes the outline when the person was told of it", async () => {
    const { id } = await idea(me);
    await createOutline(db, me, id);
    expect(
      (await applyMutation(db, me, change(me, "idea.delete", id, { outline: true }, 0), "en"))
        .status,
    ).toBe("applied");
    expect(await db.select().from(sermonOutlines).where(eq(sermonOutlines.sermonId, id))).toEqual(
      [],
    );
  });
});

describe("what a device downloads", () => {
  it("lists only the account's ideas, with their marks, and reads only its own", async () => {
    const mine = await idea(me);
    const theirs = await idea(other);
    await createOutline(db, me, mine.id);
    const manifest = await manifestFor(db, me);
    expect(manifest.ideas).toEqual([
      expect.objectContaining({ id: mine.id, revision: 0, hasOutline: true, preached: false }),
    ]);
    const rows = await offlineIdeas(db, me, [mine.id, theirs.id]);
    expect(rows.map((row) => row.id)).toEqual([mine.id]);
    expect(rows[0]).toMatchObject({ title: "Grace", tagIds: [], hasOutline: true });
  });
});
