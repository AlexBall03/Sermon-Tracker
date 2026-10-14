// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  archiveIdea,
  attachReferences,
  classifyIdea,
  createIdea,
  getIdea,
  restoreIdea,
  revisitCutoff,
  revisitIdeas,
  searchIdeas,
  setIdeaKind,
  updateIdea,
} from "./ideas";
import { defaultLibraryQuery, type LibraryQuery } from "./library-query";
import { revisitAfterDays } from "./model";
import { ideaInputSchema, ideaUpdateSchema, type IdeaReference } from "./schemas";
import { createTag, setIdeaTags } from "./tags";
import { searchLocalIdeas } from "@/features/offline/ideas/search";

/*
 * What counts as developing an idea, which ideas are offered for revisiting,
 * and the library's two revisiting filters, against a real in-memory
 * PostgreSQL. "Now" is fixed, so nothing here depends on the day it runs.
 */

let db: Database;
let me: string;
let other: string;

const now = new Date("2026-10-12T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(now.getTime() - days * day);

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

/** A row written directly, so its dates can be anything. An unfinished sermon captured 90 days ago by default. */
async function stored(fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({
      ownerId: me,
      kind: "sermon",
      title: "A sermon",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90),
      ...fields,
    })
    .returning();
  return row.id;
}

const developedAt = async (id: string, owner = me) =>
  (await getIdea(db, owner, id))?.lastDevelopedAt ?? null;

describe("what counts as development", () => {
  const draft = {
    kind: "sermon",
    title: "His Grace is Sufficient",
    subject: "Grace",
    notes: "Paul's thorn.",
    references: [john316, psalm23],
  };
  const capture = async () => (await createIdea(db, me, ideaInputSchema.parse(draft)))!.id;

  it("is nothing yet for an idea that was only captured", async () => {
    expect(await developedAt(await capture())).toBeNull();
  });

  it("is a change to the title, the subject, the notes, or the passages", async () => {
    const changes = [
      { title: "His Grace is Enough" },
      { subject: "Weakness" },
      { subject: "" },
      { notes: "Paul's thorn, and ours." },
      { notes: "" },
      { references: [john316] },
      { references: [psalm23, john316] },
      { references: [john316, { ...psalm23, verseStart: 1 }] },
      {
        references: [
          { ...john316, isPrimary: false },
          { ...psalm23, isPrimary: true },
        ],
      },
    ];
    for (const change of changes) {
      const id = await capture();
      const before = Date.now();
      await updateIdea(db, me, id, ideaUpdateSchema.parse({ ...draft, ...change }));
      const at = await developedAt(id);
      expect(at, JSON.stringify(change)).toBeInstanceOf(Date);
      expect(at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
  });

  it("is not the same content saved again with another status, format, type, kind, or tags", async () => {
    const id = await capture();
    const tag = await createTag(db, me, "Faith");
    if (!tag.ok) throw new Error("the tag was not created");
    const saved = await updateIdea(
      db,
      me,
      id,
      ideaUpdateSchema.parse({
        ...draft,
        status: "developing",
        intendedFormat: "mini",
        sermonType: "expository",
        tagIds: [tag.tag.id],
      }),
    );
    expect(saved).toMatchObject({ status: "developing", lastDevelopedAt: null });
    expect(saved?.tags).toHaveLength(1);

    // The whole draft again, as the editor sends it, with nothing different.
    await updateIdea(db, me, id, ideaUpdateSchema.parse(draft));
    expect(await developedAt(id)).toBeNull();
  });

  it("is not a classification, a refiling, a tag, an archive, or a restore", async () => {
    const id = await capture();
    const tag = await createTag(db, me, "Faith");
    if (!tag.ok) throw new Error("the tag was not created");

    await classifyIdea(db, me, id, { status: "on_hold", sermonType: "topical" });
    await setIdeaKind(db, me, id, "point");
    await setIdeaKind(db, me, id, "sermon");
    await setIdeaTags(db, me, id, [tag.tag.id]);
    await archiveIdea(db, me, id);
    await restoreIdea(db, me, id);
    expect(await developedAt(id)).toBeNull();
  });

  it("is a passage added from elsewhere, and not one the idea already had", async () => {
    const id = await capture();
    await attachReferences(db, me, id, [john316]);
    expect(await developedAt(id)).toBeNull();

    await attachReferences(db, me, id, [{ ...psalm23, chapterStart: 24 }]);
    expect(await developedAt(id)).toBeInstanceOf(Date);
  });

  it("is never set by another account", async () => {
    const id = await capture();
    expect(
      await updateIdea(db, other, id, ideaUpdateSchema.parse({ ...draft, notes: "Theirs now." })),
    ).toBeNull();
    expect(await attachReferences(db, other, id, [{ ...psalm23, chapterStart: 24 }])).toEqual({
      status: "missing",
    });
    expect(await getIdea(db, me, id)).toMatchObject({
      notes: "Paul's thorn.",
      lastDevelopedAt: null,
    });
  });
});

describe("revisitIdeas", () => {
  const titles = async (limit?: number, owner = me) =>
    (await revisitIdeas(db, owner, limit, now)).map((idea) => idea.title);

  it("measures the wait in one place", () => {
    expect(revisitAfterDays).toBe(30);
    expect(revisitCutoff(now)).toEqual(daysAgo(30));
  });

  it("offers an idea once it has gone the whole wait without work, and not before", async () => {
    await stored({ title: "Captured just in time", createdAt: daysAgo(30) });
    await stored({
      title: "Captured a minute short",
      createdAt: new Date(daysAgo(30).getTime() + 60_000),
    });
    await stored({ title: "Captured last week", createdAt: daysAgo(7) });
    await stored({ title: "Developed long ago", lastDevelopedAt: daysAgo(45) });
    // Captured long ago, but worked on since.
    await stored({ title: "Developed last week", lastDevelopedAt: daysAgo(7) });

    expect(await titles(10)).toEqual(["Captured just in time", "Developed long ago"]);
  });

  it("leaves out archived ideas, finished ones, points, undecided ideas, and other accounts'", async () => {
    await stored({ title: "Archived", archivedAt: daysAgo(1) });
    await stored({ title: "Ready", status: "ready" });
    await stored({ title: "A point", kind: "point" });
    await stored({ title: "Undecided", kind: "undecided" });
    await stored({ title: "Theirs", ownerId: other });
    await stored({ title: "Mine" });

    expect(await titles(10)).toEqual(["Mine"]);
    expect(await titles(10, other)).toEqual(["Theirs"]);
  });

  it("returns nothing when nothing qualifies", async () => {
    expect(await titles()).toEqual([]);
    await stored({ title: "Ready", status: "ready" });
    await stored({ title: "Fresh", createdAt: daysAgo(2) });
    expect(await titles()).toEqual([]);
  });

  it("puts ideas never developed first, then those developed, then those on hold, the longest wait first", async () => {
    await stored({ title: "On hold, never developed", status: "on_hold", createdAt: daysAgo(400) });
    await stored({ title: "Developed 60 days ago", lastDevelopedAt: daysAgo(60) });
    await stored({
      title: "Developed 200 days ago",
      status: "developing",
      createdAt: daysAgo(300),
      lastDevelopedAt: daysAgo(200),
    });
    await stored({ title: "Never, 40 days", createdAt: daysAgo(40) });
    await stored({ title: "Never, 80 days", status: "developing", createdAt: daysAgo(80) });

    expect(await titles(10)).toEqual([
      "Never, 80 days",
      "Never, 40 days",
      "Developed 200 days ago",
      "Developed 60 days ago",
      "On hold, never developed",
    ]);
    // Three by default, and they are the first three.
    expect(await titles()).toEqual(["Never, 80 days", "Never, 40 days", "Developed 200 days ago"]);
  });

  it("keeps one order among ideas that tie", async () => {
    const ids = [
      "33333333-3333-4333-8333-333333333333",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    for (const id of ids) await stored({ id, title: id[0] });
    for (let run = 0; run < 3; run += 1) expect(await titles()).toEqual(["1", "2", "3"]);
    expect(await titles(2)).toEqual(["1", "2"]);
  });

  it("measures an idea from before the column existed from its creation, whatever is done to it since", async () => {
    const id = await stored({ title: "From before", createdAt: daysAgo(200) });
    // Administrative changes made today move `updated_at` and nothing else.
    await classifyIdea(db, me, id, { status: "developing" });
    await setIdeaKind(db, me, id, "sermon");
    const idea = await getIdea(db, me, id);
    expect(idea?.updatedAt.getTime()).toBeGreaterThan(daysAgo(1).getTime());
    expect(idea?.lastDevelopedAt).toBeNull();
    expect(await titles()).toEqual(["From before"]);

    // Real work takes it off the list.
    await updateIdea(
      db,
      me,
      id,
      ideaUpdateSchema.parse({ kind: "sermon", title: "From before", notes: "Begun at last." }),
    );
    expect((await revisitIdeas(db, me, 3, new Date())).map((row) => row.id)).toEqual([]);
  });
});

describe("the library's revisiting filters", () => {
  const query = (fields: Partial<LibraryQuery> = {}): LibraryQuery => ({
    ...defaultLibraryQuery,
    sort: "title-asc",
    ...fields,
  });
  const found = async (fields: Partial<LibraryQuery>, owner = me) => {
    const page = await searchIdeas(db, owner, query(fields), undefined, now);
    expect(page.total).toBe(page.items.length);
    return page.items.map((idea) => idea.title);
  };

  beforeEach(async () => {
    await stored({ title: "A never, old", notes: "grace" });
    await stored({ title: "B never, new", createdAt: daysAgo(3) });
    await stored({ title: "C never, ready", status: "ready" });
    await stored({ title: "D developed, old", status: "developing", lastDevelopedAt: daysAgo(50) });
    await stored({ title: "E developed, lately", notes: "grace", lastDevelopedAt: daysAgo(4) });
    await stored({ title: "F point", kind: "point" });
    await stored({ title: "G archived", archivedAt: daysAgo(2) });
    await stored({ title: "H on hold", status: "on_hold", lastDevelopedAt: daysAgo(31) });
    await stored({ title: "Theirs", ownerId: other });
  });

  it("asks nothing when neither is chosen", async () => {
    expect(await found({})).toHaveLength(7);
  });

  it("finds sermon ideas never developed, whatever their status or age", async () => {
    expect(await found({ revisit: "never" })).toEqual([
      "A never, old",
      "B never, new",
      "C never, ready",
    ]);
  });

  it("finds unfinished sermon ideas left for the whole wait", async () => {
    expect(await found({ revisit: "attention" })).toEqual([
      "A never, old",
      "D developed, old",
      "H on hold",
    ]);
  });

  it("holds together with the search, the status, the kind, and the tags", async () => {
    expect(await found({ revisit: "attention", q: "grace" })).toEqual(["A never, old"]);
    expect(await found({ revisit: "attention", statuses: ["developing", "on_hold"] })).toEqual([
      "D developed, old",
      "H on hold",
    ]);
    expect(await found({ revisit: "never", statuses: ["ready"] })).toEqual(["C never, ready"]);
    // Both are about sermons, so asking for points as well finds nothing.
    expect(await found({ revisit: "never", kinds: ["point"] })).toEqual([]);
    expect(await found({ revisit: "attention", kinds: ["sermon", "point"] })).toHaveLength(3);

    const tag = await createTag(db, me, "Faith");
    if (!tag.ok) throw new Error("the tag was not created");
    const [{ id }] = await db.select().from(ideas).where(eq(ideas.title, "D developed, old"));
    await setIdeaTags(db, me, id, [tag.tag.id]);
    // Tagging is not development: the idea is still found.
    expect(await found({ revisit: "attention", tagIds: [tag.tag.id] })).toEqual([
      "D developed, old",
    ]);
    expect(await found({ revisit: "never", tagIds: [tag.tag.id] })).toEqual([]);
  });

  it("follows the archive filter like every other", async () => {
    expect(await found({ revisit: "attention", archive: "archived" })).toEqual(["G archived"]);
    expect(await found({ revisit: "never", archive: "all" })).toHaveLength(4);
  });

  it("never reaches another account's ideas", async () => {
    expect(await found({ revisit: "never" }, other)).toEqual(["Theirs"]);
    expect(await found({ revisit: "attention" }, other)).toEqual(["Theirs"]);
  });

  it("counts and pages what it finds", async () => {
    const page = await searchIdeas(db, me, query({ revisit: "attention" }), 2, now);
    expect(page).toMatchObject({ total: 3, totalPages: 2, page: 1 });
    expect(page.items.map((idea) => idea.title)).toEqual(["A never, old", "D developed, old"]);
  });

  // The offline library (Phase 5D.1) answers every query as this one does,
  // the revisiting rule (`needsAttentionAt`) included.
  it("is answered the same by the device's copy", async () => {
    const all = (await searchIdeas(db, me, query({ archive: "all" }), 100, now)).items;
    const queries: Partial<LibraryQuery>[] = [
      {},
      { revisit: "never" },
      { revisit: "attention" },
      { revisit: "attention", archive: "all" },
      { q: "grace" },
      { q: "NEVER old" },
      { archive: "archived" },
      { archive: "all", sort: "created-desc" },
      { kinds: ["point"], archive: "all" },
      { statuses: ["developing", "on_hold"] },
      { createdFrom: "2026-10-01", archive: "all" },
      { createdThrough: "2026-10-01", sort: "updated-asc" },
    ];
    for (const fields of queries) {
      const local = searchLocalIdeas(all, query(fields), now);
      expect(
        local.items.map((idea) => idea.title),
        JSON.stringify(fields),
      ).toEqual(await found(fields));
    }
  });
});
