// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, syncOperations, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { createIdea, deleteIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createTag, deleteTag } from "@/features/ideas/tags";
import { applyMutation } from "./apply";
import type { SyncEnvelope } from "./model";

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

const capture = (owner: string, payload: unknown = { title: "A thought" }): SyncEnvelope => {
  const id = crypto.randomUUID();
  return { opId: id, owner, type: "idea.create", entityId: id, schemaVersion: 1, payload };
};

const count = async (owner: string) =>
  (await db.select().from(ideas).where(eq(ideas.ownerId, owner))).length;

describe("applying a queued capture", () => {
  it("saves it once however often it is delivered", async () => {
    const change = capture(me);
    expect(await applyMutation(db, me, change, "en")).toMatchObject({
      status: "applied",
      entityId: change.entityId,
    });
    expect((await applyMutation(db, me, change, "en")).status).toBe("duplicate");
    expect((await applyMutation(db, me, change, "en")).status).toBe("duplicate");
    expect(await count(me)).toBe(1);
  });

  it("is one idea when the first send was saved but its answer was lost", async () => {
    const change = capture(me);
    // The capture reached the server before the ledger knew of it (Phase 5B).
    await createIdea(db, me, ideaInputSchema.parse(change.payload), change.entityId);
    expect((await applyMutation(db, me, change, "en")).status).toBe("applied");
    expect(await count(me)).toBe(1);
  });

  it("never brings back an idea deleted after it was saved", async () => {
    const change = capture(me);
    await applyMutation(db, me, change, "en");
    await deleteIdea(db, me, change.entityId);
    expect((await applyMutation(db, me, change, "en")).status).toBe("duplicate");
    expect(await count(me)).toBe(0);
  });

  it("refuses an ID that is another account's idea, and writes nothing", async () => {
    const change = capture(other);
    await applyMutation(db, other, change, "en");
    const mine = { ...change, owner: me };
    expect(await applyMutation(db, me, mine, "en")).toEqual({
      status: "rejected",
      reason: "taken",
    });
    expect(await count(me)).toBe(0);
    const ledger = await db.select().from(syncOperations).where(eq(syncOperations.ownerId, me));
    expect(ledger).toHaveLength(0);
  });

  it("answers a conflict, naming the tags that are gone, and can be applied once settled", async () => {
    const kept = await createTag(db, me, "Hope");
    const gone = await createTag(db, me, "Grace");
    if (!kept.ok || !gone.ok) throw new Error("tags not created");
    await deleteTag(db, me, gone.tag.id);
    const change = capture(me, { title: "Tagged", tagIds: [kept.tag.id, gone.tag.id] });
    expect(await applyMutation(db, me, change, "en")).toMatchObject({
      status: "conflict",
      conflict: { reason: "missingTags", missingTagIds: [gone.tag.id] },
    });
    expect(await count(me)).toBe(0);
    const settled = { ...change, payload: { title: "Tagged", tagIds: [kept.tag.id] } };
    expect((await applyMutation(db, me, settled, "en")).status).toBe("applied");
  });

  it("rejects a payload that is no longer valid, and can be tried again later", async () => {
    const change = capture(me, { title: "" });
    expect((await applyMutation(db, me, change, "en")).status).toBe("rejected");
    expect(await count(me)).toBe(0);
    const fixed = { ...change, payload: { title: "Now valid" } };
    expect((await applyMutation(db, me, fixed, "en")).status).toBe("applied");
  });
});
