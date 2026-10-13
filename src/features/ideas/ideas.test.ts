// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, ideaScriptureReferences, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { normaliseReference, type ScriptureReference } from "@/features/scripture/reference";
import { createFavorite, deleteFavorite, getFavorite } from "@/features/scripture/saved/favorites";
import { versesToRuns } from "@/features/scripture/saved/verse-set";
import {
  attachReferences,
  createIdea,
  deleteIdea,
  getIdea,
  recentIdeas,
  setIdeaKind,
  updateIdea,
} from "./ideas";
import { attachInputSchema, ideaInputSchema, type IdeaReference } from "./schemas";

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
      status: "idea",
      notes: null,
      sermonType: "unspecified",
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
    expect(await recentIdeas(db, me, 10)).toHaveLength(1);
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
    expect(await recentIdeas(db, me, 10)).toEqual([]);
    expect(await updateIdea(db, me, id, input({ title: "Taken" }))).toBeNull();
    expect(await setIdeaKind(db, me, id, "sermon")).toBeNull();
    expect(await deleteIdea(db, me, id)).toBe("missing");

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
    expect((await recentIdeas(db, me, 10)).map((idea) => idea.title)).toEqual(["First", "Second"]);
    expect(await recentIdeas(db, me, 1)).toHaveLength(1);
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
    expect(await deleteIdea(db, me, idea!.id)).toBe("deleted");
    expect(await getIdea(db, me, idea!.id)).toBeNull();
    expect(await db.select().from(ideaScriptureReferences)).toEqual([]);
    expect(await deleteIdea(db, me, idea!.id)).toBe("missing");
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

describe("attachReferences", () => {
  const passage = (
    book: number,
    chapterStart: number,
    verseStart: number | null = null,
    verseEnd: number | null = null,
  ): ScriptureReference => ({ book, chapterStart, verseStart, chapterEnd: null, verseEnd });
  const verse16 = passage(43, 3, 16);
  const verses16to18 = passage(43, 3, 16, 18);
  /** The idea's references as they are stored, without the main-text mark. */
  const held = async (id: string, owner = me) =>
    (await getIdea(db, owner, id))!.references.map(normaliseReference);

  it("adds one verse to an idea that had none", async () => {
    const idea = await createIdea(db, me, input({ title: "Loved", kind: "sermon" }));
    const outcome = await attachReferences(db, me, idea!.id, [verse16]);
    expect(outcome).toEqual({
      status: "attached",
      idea: { id: idea!.id, title: "Loved", kind: "sermon" },
      added: [verse16],
      already: [],
    });
    expect(await held(idea!.id)).toEqual([verse16]);
  });

  it("adds a passage to a point idea that belongs to no sermon", async () => {
    const point = await createIdea(
      db,
      me,
      input({ title: "Believing is receiving", kind: "point" }),
    );
    await attachReferences(db, me, point!.id, [verses16to18]);
    expect(await held(point!.id)).toEqual([verses16to18]);
    expect((await getIdea(db, me, point!.id))?.kind).toBe("point");
  });

  it("keeps verses that are apart as the separate references they are", async () => {
    const idea = await createIdea(db, me, input({ title: "Born again" }));
    const apart = [passage(43, 3, 3), passage(43, 3, 5, 6), passage(43, 3, 8)];
    await attachReferences(db, me, idea!.id, apart);
    expect(await held(idea!.id)).toEqual(apart);
  });

  it("adds after what is there, leaving it, its order, and its main text alone", async () => {
    const idea = await createIdea(
      db,
      me,
      input({ title: "Grace", kind: "sermon", notes: "Keep.", references: [john316, psalm23] }),
    );
    await attachReferences(db, me, idea!.id, [passage(45, 8, 28)]);
    const saved = await getIdea(db, me, idea!.id);
    expect(saved?.references).toEqual([
      john316,
      psalm23,
      { ...passage(45, 8, 28), isPrimary: false },
    ]);
    expect(saved).toMatchObject({ title: "Grace", notes: "Keep.", kind: "sermon" });
    const positions = await db
      .select({ position: ideaScriptureReferences.position })
      .from(ideaScriptureReferences)
      .where(eq(ideaScriptureReferences.ideaId, idea!.id));
    expect(positions.map((row) => row.position).sort()).toEqual([0, 1, 2]);
  });

  it("does not add a passage the idea already has, however often it is asked", async () => {
    const idea = await createIdea(db, me, input({ title: "Once" }));
    await attachReferences(db, me, idea!.id, [verse16]);
    const again = await attachReferences(db, me, idea!.id, [verse16]);
    expect(again).toMatchObject({ status: "attached", added: [], already: [verse16] });
    expect(await held(idea!.id)).toEqual([verse16]);
  });

  it("adds what is new and says what was there, when a request holds both", async () => {
    const idea = await createIdea(db, me, input({ title: "Both" }));
    await attachReferences(db, me, idea!.id, [verse16]);
    const outcome = await attachReferences(db, me, idea!.id, [
      verse16,
      passage(45, 6, 23),
      verse16,
    ]);
    expect(outcome).toMatchObject({ added: [passage(45, 6, 23)], already: [verse16] });
    expect(await held(idea!.id)).toEqual([verse16, passage(45, 6, 23)]);
  });

  it("keeps a passage that only overlaps another: they are different passages", async () => {
    const idea = await createIdea(db, me, input({ title: "Overlap" }));
    await attachReferences(db, me, idea!.id, [verse16]);
    const outcome = await attachReferences(db, me, idea!.id, [verses16to18, passage(43, 3)]);
    expect(outcome).toMatchObject({ added: [verses16to18, passage(43, 3)], already: [] });
    expect(await held(idea!.id)).toEqual([verse16, verses16to18, passage(43, 3)]);
  });

  it("adds nothing at all when there is not room for everything", async () => {
    const full = Array.from({ length: 24 }, (_, index) => ({
      ...passage(19, index + 1),
      isPrimary: false,
    }));
    const idea = await createIdea(db, me, input({ title: "Nearly full", references: full }));
    const before = (await getIdea(db, me, idea!.id))!.updatedAt;
    expect(await attachReferences(db, me, idea!.id, [verse16, verses16to18])).toEqual({
      status: "full",
      room: 1,
    });
    expect(await held(idea!.id)).toHaveLength(24);
    expect((await getIdea(db, me, idea!.id))!.updatedAt).toEqual(before);
    // One does fit, and one already there costs no room.
    expect(await attachReferences(db, me, idea!.id, [verse16, passage(19, 1)])).toMatchObject({
      status: "attached",
      added: [verse16],
    });
    expect(await attachReferences(db, me, idea!.id, [verses16to18])).toEqual({
      status: "full",
      room: 0,
    });
  });

  it("counts as a change to the idea only when something was added", async () => {
    const idea = await createIdea(db, me, input({ title: "Changed" }));
    const old = new Date(Date.now() - 86_400_000);
    await db.update(ideas).set({ updatedAt: old }).where(eq(ideas.id, idea!.id));
    await attachReferences(db, me, idea!.id, [verse16]);
    const after = (await getIdea(db, me, idea!.id))!.updatedAt;
    expect(after.getTime()).toBeGreaterThan(old.getTime());

    await db.update(ideas).set({ updatedAt: old }).where(eq(ideas.id, idea!.id));
    await attachReferences(db, me, idea!.id, [verse16]);
    expect((await getIdea(db, me, idea!.id))!.updatedAt).toEqual(old);
  });

  it("adds each passage once when two requests arrive together", async () => {
    const idea = await createIdea(db, me, input({ title: "Twice at once" }));
    const [first, second] = await Promise.all([
      attachReferences(db, me, idea!.id, [verse16, passage(45, 6, 23)]),
      attachReferences(db, me, idea!.id, [verse16, passage(49, 2, 8, 9)]),
    ]);
    expect(first.status).toBe("attached");
    expect(second.status).toBe("attached");
    const references = await held(idea!.id);
    expect(references).toHaveLength(3);
    expect(
      references.filter((item) => item.verseStart === 16 && item.verseEnd === null),
    ).toHaveLength(1);
  });

  it("finds no idea for another account's ID or one that does not exist, and writes nothing", async () => {
    const theirs = await createIdea(db, other, input({ title: "Theirs", references: [john316] }));
    for (const id of [theirs!.id, "88888888-8888-4888-8888-888888888888"]) {
      expect(await attachReferences(db, me, id, [verses16to18])).toEqual({ status: "missing" });
    }
    expect((await getIdea(db, other, theirs!.id))?.references).toEqual([john316]);
    expect(await db.select().from(ideaScriptureReferences)).toHaveLength(1);
  });

  it("takes its references with the idea when the idea is deleted", async () => {
    const idea = await createIdea(db, me, input({ title: "Gone" }));
    await attachReferences(db, me, idea!.id, [verse16, verses16to18]);
    await deleteIdea(db, me, idea!.id);
    expect(await db.select().from(ideaScriptureReferences)).toEqual([]);
  });

  describe("from a favorite", () => {
    const verses = [
      { book: 45, chapter: 3, verse: 10 },
      { book: 45, chapter: 3, verse: 23 },
      { book: 45, chapter: 6, verse: 23 },
    ];
    const save = async (chosen: typeof verses, label: string | null = null) =>
      (await createFavorite(db, me, {
        translation: "kjv",
        verses: chosen,
        label,
        notes: null,
      }))!.favorite;

    it("puts a single saved verse and a grouped passage on an idea as references", async () => {
      const single = await save([{ book: 43, chapter: 3, verse: 16 }]);
      const grouped = await save(verses);
      const idea = await createIdea(db, me, input({ title: "All have sinned" }));
      await attachReferences(db, me, idea!.id, versesToRuns(single.verses));
      await attachReferences(db, me, idea!.id, versesToRuns(grouped.verses));
      expect(await held(idea!.id)).toEqual([
        verse16,
        passage(45, 3, 10),
        passage(45, 3, 23),
        passage(45, 6, 23),
      ]);
    });

    it("leaves the idea's references when the favorite is removed", async () => {
      const favorite = await save(verses);
      const idea = await createIdea(db, me, input({ title: "Kept" }));
      await attachReferences(db, me, idea!.id, versesToRuns(favorite.verses));
      expect(await deleteFavorite(db, me, favorite.id)).toBe(true);
      expect(await held(idea!.id)).toHaveLength(3);
    });

    it("leaves the favorite when the references come off the idea, or the idea goes", async () => {
      const favorite = await save(verses, "Romans road");
      const idea = await createIdea(db, me, input({ title: "Shortened" }));
      await attachReferences(db, me, idea!.id, versesToRuns(favorite.verses));
      await updateIdea(db, me, idea!.id, input({ title: "Shortened", references: [] }));
      expect(await getFavorite(db, me, favorite.id)).toMatchObject({
        label: "Romans road",
        verses,
      });
      await deleteIdea(db, me, idea!.id);
      expect(await getFavorite(db, me, favorite.id)).toMatchObject({ verses });
    });
  });
});

describe("attachInputSchema", () => {
  const ideaId = "99999999-9999-4999-8999-999999999999";
  const reference = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };

  it("takes passages that exist, each once, and nothing that names an owner", () => {
    const parsed = attachInputSchema.parse({
      ideaId,
      ownerId: other,
      references: [reference, { ...reference, isPrimary: true, text: "For God so loved" }],
    });
    expect(parsed).toEqual({ ideaId, references: [reference] });
  });

  it("refuses an empty selection, a passage the Bible does not have, and too many", () => {
    const refused = (value: unknown) => attachInputSchema.safeParse(value).success === false;
    expect(refused({ ideaId, references: [] })).toBe(true);
    expect(refused({ ideaId })).toBe(true);
    expect(refused({ ideaId: "not-an-id", references: [reference] })).toBe(true);
    expect(refused({ ideaId, references: [{ ...reference, verseStart: 37 }] })).toBe(true);
    expect(refused({ ideaId, references: [{ ...reference, book: 67 }] })).toBe(true);
    expect(refused({ ideaId, references: ["John 3:16"] })).toBe(true);
    const many = Array.from({ length: 26 }, (_, index) => ({
      ...reference,
      verseStart: index + 1,
    }));
    expect(refused({ ideaId, references: many })).toBe(true);
  });
});
