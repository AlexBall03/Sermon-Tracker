// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, ideaScriptureReferences, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { createIdea, deleteIdea, getIdea, listIdeas, setIdeaKind, updateIdea } from "./ideas";
import { ideaInputSchema, type IdeaReference } from "./schemas";

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

const john316: IdeaReference = {
  book: 43,
  chapterStart: 3,
  verseStart: 16,
  chapterEnd: null,
  verseEnd: null,
  isPrimary: true,
};
const psalm23: IdeaReference = {
  book: 19,
  chapterStart: 23,
  verseStart: null,
  chapterEnd: null,
  verseEnd: null,
  isPrimary: false,
};

const input = (fields: Record<string, unknown>) => ideaInputSchema.parse(fields);

describe("createIdea", () => {
  it("saves a bare thought with sensible defaults", async () => {
    const idea = await createIdea(db, me, input({ title: "  The story isn't over  " }));
    expect(idea).toMatchObject({
      ownerId: me,
      title: "The story isn't over",
      kind: "undecided",
      status: "captured",
      notes: null,
      sermonType: null,
      subject: null,
      references: [],
    });
    expect(idea?.createdAt).toBeInstanceOf(Date);
  });

  it("saves a sermon idea with its details and references in order", async () => {
    const idea = await createIdea(
      db,
      me,
      input({
        kind: "sermon",
        title: "His Grace is Sufficient",
        sermonType: "expository",
        subject: "Grace",
        notes: "Paul's thorn.",
        references: [john316, psalm23],
      }),
    );
    const saved = await getIdea(db, me, idea!.id);
    expect(saved).toMatchObject({ kind: "sermon", sermonType: "expository", subject: "Grace" });
    expect(saved?.references).toEqual([john316, psalm23]);
  });

  it("saves a point idea that belongs to no sermon", async () => {
    const idea = await createIdea(db, me, input({ kind: "point", title: "Faith speaks first" }));
    expect(idea?.kind).toBe("point");
  });

  it("treats a repeated submission with the same ID as one idea", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const first = await createIdea(db, me, input({ title: "Once" }), id);
    const second = await createIdea(db, me, input({ title: "Once, again" }), id);
    expect(second?.id).toBe(first?.id);
    expect(second?.title).toBe("Once");
    expect(await listIdeas(db, me)).toHaveLength(1);
  });

  it("does not reveal or overwrite another account's idea with the same ID", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    await createIdea(db, other, input({ title: "Theirs" }), id);
    expect(await createIdea(db, me, input({ title: "Mine" }), id)).toBeNull();
    expect((await getIdea(db, other, id))?.title).toBe("Theirs");
  });
});

describe("ownership", () => {
  it("keeps every operation inside the owner's own ideas", async () => {
    const theirs = await createIdea(db, other, input({ title: "Theirs", references: [john316] }));
    const id = theirs!.id;

    expect(await getIdea(db, me, id)).toBeNull();
    expect(await listIdeas(db, me)).toEqual([]);
    expect(await updateIdea(db, me, id, input({ title: "Taken" }))).toBeNull();
    expect(await setIdeaKind(db, me, id, "sermon")).toBeNull();
    expect(await deleteIdea(db, me, id)).toBe(false);

    // Nothing about it changed, references included.
    expect(await getIdea(db, other, id)).toMatchObject({
      title: "Theirs",
      kind: "undecided",
      references: [john316],
    });
  });

  it("lists only the owner's ideas, most recently changed first", async () => {
    const first = await createIdea(db, me, input({ title: "First" }));
    await createIdea(db, me, input({ title: "Second" }));
    await createIdea(db, other, input({ title: "Theirs" }));
    await db
      .update(ideas)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(ideas.id, first!.id));
    expect((await listIdeas(db, me)).map((idea) => idea.title)).toEqual(["First", "Second"]);
    expect(await listIdeas(db, me, 1)).toHaveLength(1);
  });
});

describe("updateIdea", () => {
  it("replaces the content and the references together", async () => {
    const idea = await createIdea(db, me, input({ title: "Draft", references: [john316] }));
    const updated = await updateIdea(
      db,
      me,
      idea!.id,
      input({ title: "Better", status: "developing", notes: "More.", references: [psalm23] }),
    );
    expect(updated).toMatchObject({ title: "Better", status: "developing", notes: "More." });
    expect((await getIdea(db, me, idea!.id))?.references).toEqual([psalm23]);
    expect(updated!.createdAt).toEqual(idea!.createdAt);
  });

  it("removes one reference without disturbing the rest", async () => {
    const idea = await createIdea(
      db,
      me,
      input({ title: "Two texts", notes: "Kept.", references: [john316, psalm23] }),
    );
    await updateIdea(
      db,
      me,
      idea!.id,
      input({ title: "Two texts", notes: "Kept.", references: [john316] }),
    );
    expect(await getIdea(db, me, idea!.id)).toMatchObject({
      notes: "Kept.",
      references: [john316],
    });
  });
});

describe("setIdeaKind", () => {
  it("reclassifies without losing anything, in either direction", async () => {
    const idea = await createIdea(
      db,
      me,
      input({
        kind: "sermon",
        title: "It is Well",
        notes: "2 Kings 4.",
        sermonType: "topical",
        subject: "Faith",
        status: "developing",
        references: [john316, psalm23],
      }),
    );
    const id = idea!.id;

    expect((await setIdeaKind(db, me, id, "point"))?.kind).toBe("point");
    const asPoint = await getIdea(db, me, id);
    expect(asPoint).toMatchObject({
      title: "It is Well",
      notes: "2 Kings 4.",
      status: "developing",
      sermonType: "topical",
      subject: "Faith",
      references: [john316, psalm23],
    });
    expect(asPoint!.createdAt).toEqual(idea!.createdAt);

    await setIdeaKind(db, me, id, "sermon");
    expect(await getIdea(db, me, id)).toMatchObject({ kind: "sermon", sermonType: "topical" });
  });
});

describe("deleteIdea", () => {
  it("deletes the idea and its references", async () => {
    const idea = await createIdea(db, me, input({ title: "Gone", references: [john316] }));
    expect(await deleteIdea(db, me, idea!.id)).toBe(true);
    expect(await getIdea(db, me, idea!.id)).toBeNull();
    expect(await db.select().from(ideaScriptureReferences)).toEqual([]);
    expect(await deleteIdea(db, me, idea!.id)).toBe(false);
  });
});

describe("constraints", () => {
  const insert = (values: Partial<typeof ideas.$inferInsert>) =>
    db.insert(ideas).values({ ownerId: me, title: "Fine", ...values });

  it("rejects values the application would never send", async () => {
    await expect(insert({ title: "   " })).rejects.toThrow();
    await expect(insert({ title: "x".repeat(201) })).rejects.toThrow();
    await expect(insert({ kind: "series" as never })).rejects.toThrow();
    await expect(insert({ status: "preached" as never })).rejects.toThrow();
    await expect(insert({ sermonType: "narrative" as never })).rejects.toThrow();
    await expect(insert({ ownerId: "44444444-4444-4444-8444-444444444444" })).rejects.toThrow();
  });

  it("rejects malformed references and a second main text", async () => {
    const idea = await createIdea(db, me, input({ title: "Texts", references: [john316] }));
    const add = (values: Partial<typeof ideaScriptureReferences.$inferInsert>) =>
      db
        .insert(ideaScriptureReferences)
        .values({ ideaId: idea!.id, position: 5, book: 43, chapterStart: 3, ...values });
    await expect(add({ book: 67 })).rejects.toThrow();
    await expect(add({ chapterStart: 0 })).rejects.toThrow();
    await expect(add({ chapterEnd: 2 })).rejects.toThrow();
    await expect(add({ verseEnd: 4 })).rejects.toThrow();
    await expect(add({ verseStart: 16, verseEnd: 12 })).rejects.toThrow();
    await expect(add({ isPrimary: true })).rejects.toThrow();
    await expect(add({ position: 0 })).rejects.toThrow();
    await expect(add({ verseStart: 1, verseEnd: 5 })).resolves.toBeDefined();
  });

  it("keeps an account that still owns ideas from being deleted", async () => {
    await createIdea(db, me, input({ title: "Mine" }));
    await expect(db.delete(users).where(eq(users.id, me))).rejects.toThrow();
  });
});

describe("ideaInputSchema", () => {
  it("drops unknown keys, including any attempt to name an owner", () => {
    const parsed = input({ title: "Mine", ownerId: other, id: "x", createdAt: "2001-01-01" });
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("createdAt");
  });

  it("requires only the idea itself", () => {
    expect(ideaInputSchema.safeParse({ title: " " }).success).toBe(false);
    expect(ideaInputSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(ideaInputSchema.safeParse({ title: "Enough" }).success).toBe(true);
  });

  it("validates references against the Bible and allows one main text", () => {
    const bad = { ...john316, verseStart: 37 };
    expect(ideaInputSchema.safeParse({ title: "T", references: [bad] }).success).toBe(false);
    expect(
      ideaInputSchema.safeParse({
        title: "T",
        references: [john316, { ...psalm23, isPrimary: true }],
      }).success,
    ).toBe(false);
    expect(input({ title: "T", references: [john316, john316] }).references).toHaveLength(1);
    expect(
      ideaInputSchema.safeParse({ title: "T", references: Array(26).fill(psalm23) }).success,
    ).toBe(false);
  });
});
