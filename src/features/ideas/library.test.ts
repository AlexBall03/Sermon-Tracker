// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { ideas, ideaTags, tags, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { searchIdeas } from "./ideas";
import { defaultLibraryQuery, type LibraryQuery } from "./library-query";
import { librarySorts, libraryPageSize } from "./model";

/*
 * The library query against a real in-memory PostgreSQL. Nothing here writes
 * after the set-up, so one database serves the whole file.
 */

let db: Database;
let me: string;
let other: string;
let bulk: string;
let nobody: string;
const tag: Record<string, string> = {};

const at = (value: string) => new Date(value);

beforeAll(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values(
      ["user_me", "user_other", "user_bulk", "user_nobody"].map((clerkUserId) => ({ clerkUserId })),
    )
    .returning();
  [me, other, bulk, nobody] = rows.map((row) => row.id);

  const mine = await db
    .insert(ideas)
    .values([
      {
        ownerId: me,
        kind: "sermon",
        title: "Faith that moves mountains",
        subject: "Prayer",
        notes: "Mark 11",
        status: "developing",
        sermonType: "topical",
        createdAt: at("2026-01-10T12:00:00Z"),
        updatedAt: at("2026-03-01T00:00:00Z"),
      },
      {
        ownerId: me,
        kind: "sermon",
        title: "The Lord's Prayer",
        notes: "Teach us to pray; FAITHfulness",
        status: "ready",
        sermonType: "expository",
        // The last instant of January and of 1 March.
        createdAt: at("2026-01-31T23:59:59.999Z"),
        updatedAt: at("2026-03-01T23:59:59.999Z"),
      },
      {
        ownerId: me,
        kind: "point",
        title: "Unfaithful servants",
        // Kept from when this was a sermon; a point shows neither.
        subject: "Prayer",
        sermonType: "topical",
        status: "captured",
        createdAt: at("2026-02-01T00:00:00Z"),
        updatedAt: at("2026-03-02T00:00:00Z"),
      },
      {
        ownerId: me,
        kind: "undecided",
        title: "100% committed",
        notes: "under_score and back\\slash",
        status: "captured",
        createdAt: at("2026-02-15T08:00:00Z"),
        updatedAt: at("2026-03-03T08:00:00Z"),
      },
      {
        ownerId: me,
        kind: "undecided",
        title: "Rest",
        notes: "it's a quote ' test",
        status: "developing",
        createdAt: at("2026-01-05T08:00:00Z"),
        updatedAt: at("2026-03-04T08:00:00Z"),
      },
    ])
    .returning();
  const [a, b, c] = mine.map((row) => row.id);

  const [theirs] = await db
    .insert(ideas)
    .values({
      ownerId: other,
      kind: "sermon",
      title: "Faith of another",
      subject: "Prayer",
      notes: "prayer",
      sermonType: "topical",
    })
    .returning();

  const made = await db
    .insert(tags)
    .values([
      { ownerId: me, name: "Faith" },
      { ownerId: me, name: "Prayer" },
      { ownerId: me, name: "Unused" },
      { ownerId: other, name: "Faith" },
    ])
    .returning();
  [tag.faith, tag.prayer, tag.unused, tag.theirs] = made.map((row) => row.id);
  await db.insert(ideaTags).values([
    { ideaId: a, tagId: tag.faith, ownerId: me },
    { ideaId: a, tagId: tag.prayer, ownerId: me },
    { ideaId: b, tagId: tag.prayer, ownerId: me },
    { ideaId: c, tagId: tag.faith, ownerId: me },
    { ideaId: theirs.id, tagId: tag.theirs, ownerId: other },
  ]);

  // 250 ideas with one timestamp between them, half of them with one title.
  const moment = at("2026-05-05T05:05:05Z");
  await db.insert(ideas).values(
    Array.from({ length: 250 }, (_, index) => ({
      ownerId: bulk,
      title: index % 2 ? "Same title" : `Idea ${String(index).padStart(3, "0")}`,
      createdAt: moment,
      updatedAt: moment,
    })),
  );
});

const A = "Faith that moves mountains";
const B = "The Lord's Prayer";
const C = "Unfaithful servants";
const D = "100% committed";
const E = "Rest";

const query = (fields: Partial<LibraryQuery> = {}): LibraryQuery => ({
  ...defaultLibraryQuery,
  ...fields,
});

/** The titles a query finds for me, in the order returned. */
async function found(fields: Partial<LibraryQuery> = {}, owner = me) {
  const page = await searchIdeas(db, owner, query(fields));
  expect(page.total).toBe(page.items.length);
  return page.items.map((idea) => idea.title);
}
const sorted = (titles: string[]) => [...titles].sort();

describe("search", () => {
  it("finds a word in the title, the subject, or the notes", async () => {
    expect(await found({ q: "mountains" })).toEqual([A]);
    expect(await found({ q: "mark" })).toEqual([A]);
    // A is found by its subject, B by its title.
    expect(sorted(await found({ q: "prayer" }))).toEqual(sorted([A, B]));
  });

  it("ignores case and matches part of a word", async () => {
    expect(sorted(await found({ q: "FAITH" }))).toEqual(sorted([A, B, C]));
    expect(sorted(await found({ q: "faithf" }))).toEqual(sorted([B, C]));
    expect(await found({ q: "OUNTAIN" })).toEqual([A]);
  });

  it("requires every word, each in any field", async () => {
    // A has them in title and subject; B in notes and title.
    expect(sorted(await found({ q: "faith prayer" }))).toEqual(sorted([A, B]));
    expect(await found({ q: "faith mark" })).toEqual([A]);
    expect(await found({ q: "faith nowhere" })).toEqual([]);
  });

  it("does not search a subject kept on an idea that is no longer a sermon", async () => {
    expect(await found({ q: "prayer", kinds: ["point"] })).toEqual([]);
    expect(await found({ q: "unfaithful prayer" })).toEqual([]);
  });

  it("treats an empty or blank search as no search", async () => {
    expect(await found({ q: "" })).toHaveLength(5);
    expect(await found({ q: "  \t " })).toHaveLength(5);
  });

  it("is indifferent to spacing between words", async () => {
    expect(sorted(await found({ q: "   faith \n  prayer  " }))).toEqual(sorted([A, B]));
  });

  it("takes %, _ and \\ as the characters themselves", async () => {
    expect(await found({ q: "%" })).toEqual([D]);
    expect(await found({ q: "_" })).toEqual([D]);
    expect(await found({ q: "\\" })).toEqual([D]);
    expect(await found({ q: "100%" })).toEqual([D]);
    expect(await found({ q: "r_s" })).toEqual([D]);
    // As wildcards these would match "Rest".
    expect(await found({ q: "R%t" })).toEqual([]);
    expect(await found({ q: "R__t" })).toEqual([]);
  });

  it("treats quotes and SQL as text to look for", async () => {
    expect(await found({ q: "'" })).toEqual(expect.arrayContaining([B, E]));
    for (const q of [
      "' OR 1=1 --",
      "'; drop table ideas; --",
      "\"; delete from ideas where ''='",
      "faith') or ('1'='1",
      "\\' union select * from users --",
    ]) {
      expect(await found({ q })).toEqual([]);
    }
    expect(await found()).toHaveLength(5);
    expect(await found({}, other)).toEqual(["Faith of another"]);
  });

  it("bounds a long search instead of failing on it", async () => {
    expect(await found({ q: "x".repeat(50_000) })).toEqual([]);
    // Eight words are used; the ninth, which matches nothing, is not.
    expect(await found({ q: "faith that moves mountains mark 11 prayer fai zzzz" })).toEqual([A]);
    expect(await found({ q: "zzzz faith" })).toEqual([]);
  });

  it("never reaches another account's ideas", async () => {
    expect(await found({ q: "another" })).toEqual([]);
    expect(await found({ q: "faith" }, other)).toEqual(["Faith of another"]);
    expect(await found({ q: "mountains" }, other)).toEqual([]);
  });
});

describe("filters", () => {
  it("filters by each kind", async () => {
    expect(sorted(await found({ kinds: ["sermon"] }))).toEqual(sorted([A, B]));
    expect(await found({ kinds: ["point"] })).toEqual([C]);
    expect(sorted(await found({ kinds: ["undecided"] }))).toEqual(sorted([D, E]));
  });

  it("matches any of several kinds", async () => {
    expect(sorted(await found({ kinds: ["sermon", "point"] }))).toEqual(sorted([A, B, C]));
    expect(sorted(await found({ kinds: ["point", "undecided"] }))).toEqual(sorted([C, D, E]));
    expect(await found({ kinds: ["sermon", "point", "undecided"] })).toHaveLength(5);
    // The same kind twice is that kind once.
    expect(await found({ kinds: ["point", "point"] })).toEqual([C]);
  });

  it("filters by each status", async () => {
    expect(sorted(await found({ statuses: ["captured"] }))).toEqual(sorted([C, D]));
    expect(sorted(await found({ statuses: ["developing"] }))).toEqual(sorted([A, E]));
    expect(await found({ statuses: ["ready"] })).toEqual([B]);
  });

  it("matches any of several statuses", async () => {
    expect(sorted(await found({ statuses: ["developing", "ready"] }))).toEqual(sorted([A, B, E]));
    expect(sorted(await found({ statuses: ["captured", "ready"] }))).toEqual(sorted([B, C, D]));
  });

  it("filters by sermon type, among sermons only", async () => {
    // C is a point that still carries "topical".
    expect(await found({ sermonTypes: ["topical"] })).toEqual([A]);
    expect(await found({ sermonTypes: ["expository"] })).toEqual([B]);
    expect(await found({ sermonTypes: ["topical"], kinds: ["point"] })).toEqual([]);
  });

  it("matches either sermon type, and still only sermons", async () => {
    // Both types together are every sermon with a type, and never the point.
    expect(sorted(await found({ sermonTypes: ["topical", "expository"] }))).toEqual(sorted([A, B]));
    expect(await found({ sermonTypes: ["topical", "expository"], kinds: ["point"] })).toEqual([]);
    expect(
      await found({ sermonTypes: ["topical", "expository"], kinds: ["point", "undecided"] }),
    ).toEqual([]);
    // Asking for sermons and points as well changes nothing: a type is a sermon's.
    expect(sorted(await found({ sermonTypes: ["topical"], kinds: ["sermon", "point"] }))).toEqual([
      A,
    ]);
  });

  it("joins the values in a filter with or, and the filters with and", async () => {
    // (sermon or point) and (captured or ready): B is a ready sermon, C a captured point.
    expect(
      sorted(await found({ kinds: ["sermon", "point"], statuses: ["captured", "ready"] })),
    ).toEqual(sorted([B, C]));
    // (sermon) and (developing or ready) and (faith and prayer)
    expect(
      await found({
        kinds: ["sermon"],
        statuses: ["developing", "ready"],
        tagIds: [tag.faith, tag.prayer],
        tagMode: "all",
      }),
    ).toEqual([A]);
    // The same, with either tag: B has prayer alone.
    expect(
      sorted(
        await found({
          kinds: ["sermon"],
          statuses: ["developing", "ready"],
          tagIds: [tag.faith, tag.prayer],
          tagMode: "any",
        }),
      ),
    ).toEqual(sorted([A, B]));
    expect(await found({ kinds: ["undecided"], statuses: ["ready"] })).toEqual([]);
  });

  it("filters by one tag", async () => {
    expect(sorted(await found({ tagIds: [tag.faith] }))).toEqual(sorted([A, C]));
    expect(sorted(await found({ tagIds: [tag.prayer] }))).toEqual(sorted([A, B]));
    expect(await found({ tagIds: [tag.unused] })).toEqual([]);
  });

  it("matches any of several tags, and lists an idea with two of them once", async () => {
    const page = await searchIdeas(db, me, query({ tagIds: [tag.faith, tag.prayer] }));
    expect(page.total).toBe(3);
    expect(sorted(page.items.map((idea) => idea.title))).toEqual(sorted([A, B, C]));
  });

  it("requires every tag in all mode", async () => {
    // A has both; B has prayer alone; C has faith alone.
    expect(await found({ tagIds: [tag.faith, tag.prayer], tagMode: "all" })).toEqual([A]);
    // One tag is the same in either mode.
    expect(sorted(await found({ tagIds: [tag.faith], tagMode: "all" }))).toEqual(sorted([A, C]));
    expect(sorted(await found({ tagIds: [tag.prayer], tagMode: "all" }))).toEqual(sorted([A, B]));
    // A tag nothing carries cannot be among "every".
    expect(await found({ tagIds: [tag.faith, tag.unused], tagMode: "all" })).toEqual([]);
  });

  it("does not restrict by tag when none is chosen, in either mode", async () => {
    expect(await found({ tagIds: [], tagMode: "all" })).toHaveLength(5);
    expect(await found({ tagIds: [], tagMode: "any" })).toHaveLength(5);
  });

  it("treats a tag chosen twice as chosen once", async () => {
    expect(await found({ tagIds: [tag.faith, tag.faith, tag.prayer], tagMode: "all" })).toEqual([
      A,
    ]);
    expect(sorted(await found({ tagIds: [tag.faith, tag.faith], tagMode: "all" }))).toEqual(
      sorted([A, C]),
    );
    const any = await searchIdeas(db, me, query({ tagIds: [tag.faith, tag.faith, tag.prayer] }));
    expect(any.total).toBe(3);
  });

  it("is safe with a tag that does not exist", async () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    // Any: the unknown tag is on nothing, so the known one decides.
    expect(sorted(await found({ tagIds: [tag.faith, unknown] }))).toEqual(sorted([A, C]));
    expect(await found({ tagIds: [unknown] })).toEqual([]);
    // All: nothing can carry it.
    expect(await found({ tagIds: [tag.faith, unknown], tagMode: "all" })).toEqual([]);
    expect(await found({ tagIds: [unknown], tagMode: "all" })).toEqual([]);
  });

  it("counts and pages the ideas that match every tag", async () => {
    const page = await searchIdeas(
      db,
      me,
      query({ tagIds: [tag.faith, tag.prayer], tagMode: "all", page: 7 }),
      1,
    );
    expect(page).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(page.items.map((idea) => idea.title)).toEqual([A]);

    // Any of the two, one to a page: three ideas, three pages, no idea twice.
    const titles: string[] = [];
    for (const number of [1, 2, 3]) {
      const one = await searchIdeas(
        db,
        me,
        query({ tagIds: [tag.faith, tag.prayer], page: number }),
        1,
      );
      expect(one).toMatchObject({ total: 3, totalPages: 3, page: number });
      titles.push(...one.items.map((idea) => idea.title));
    }
    expect(sorted(titles)).toEqual(sorted([A, B, C]));
  });

  it("requires every kind of filter at once", async () => {
    expect(
      await found({
        kinds: ["sermon"],
        statuses: ["developing"],
        tagIds: [tag.faith, tag.prayer],
      }),
    ).toEqual([A]);
    expect(
      await found({ q: "pray", kinds: ["sermon"], statuses: ["ready"], tagIds: [tag.prayer] }),
    ).toEqual([B]);
    expect(await found({ kinds: ["sermon"], statuses: ["captured"] })).toEqual([]);
    // Tags with a search and a date: C is the only faith idea created in February.
    expect(
      await found({ q: "faith", tagIds: [tag.faith], tagMode: "all", createdFrom: "2026-02-01" }),
    ).toEqual([C]);
  });

  it("includes both ends of a date range, as UTC days", async () => {
    // B was created in the last millisecond of 31 January; C in the first of 1 February.
    expect(sorted(await found({ createdThrough: "2026-01-31" }))).toEqual(sorted([A, B, E]));
    expect(sorted(await found({ createdFrom: "2026-02-01" }))).toEqual(sorted([C, D]));
    expect(await found({ createdFrom: "2026-02-01", createdThrough: "2026-02-01" })).toEqual([C]);
    expect(await found({ createdFrom: "2026-01-31", createdThrough: "2026-01-31" })).toEqual([B]);

    expect(sorted(await found({ updatedThrough: "2026-03-01" }))).toEqual(sorted([A, B]));
    expect(sorted(await found({ updatedFrom: "2026-03-02" }))).toEqual(sorted([C, D, E]));
    expect(await found({ updatedFrom: "2026-03-01", updatedThrough: "2026-03-01" })).toHaveLength(
      2,
    );
    expect(
      await found({
        createdFrom: "2026-01-01",
        createdThrough: "2026-01-31",
        updatedFrom: "2026-03-04",
      }),
    ).toEqual([E]);
  });

  it("finds nothing for a range that ends before it starts", async () => {
    expect(await found({ createdFrom: "2026-03-01", createdThrough: "2026-01-01" })).toEqual([]);
  });

  it("is safe with values the parser would never produce", async () => {
    const page = await searchIdeas(db, me, {
      ...defaultLibraryQuery,
      createdFrom: "not a date",
      updatedThrough: "2026-02-31",
      sort: "id; drop table ideas" as never,
      page: Number.NaN,
    });
    expect(page).toMatchObject({ total: 5, page: 1 });
    expect(page.items.map((idea) => idea.title)).toEqual([E, D, C, B, A]);
  });

  it("never matches through another account's tag", async () => {
    expect(await found({ tagIds: [tag.theirs] })).toEqual([]);
    expect(await found({ tagIds: [tag.faith] }, other)).toEqual([]);
    expect(await found({ tagIds: [tag.theirs] }, other)).toEqual(["Faith of another"]);
    // In all mode someone else's tag is one no idea of mine can have.
    expect(await found({ tagIds: [tag.theirs], tagMode: "all" })).toEqual([]);
    expect(await found({ tagIds: [tag.faith, tag.theirs], tagMode: "all" })).toEqual([]);
    // In any mode it is ignored, and my own tag still decides.
    expect(sorted(await found({ tagIds: [tag.faith, tag.theirs] }))).toEqual(sorted([A, C]));
    expect(await found({ tagIds: [tag.faith, tag.theirs], tagMode: "all" }, other)).toEqual([]);
  });

  it("returns each idea's own tags and nothing of anyone else's", async () => {
    const page = await searchIdeas(db, me, query({ q: "mountains" }));
    expect(page.items[0].tags.map((item) => item.name)).toEqual(["Faith", "Prayer"]);
    expect(page.items[0].tags.map((item) => item.id)).toEqual([tag.faith, tag.prayer]);
  });
});

describe("sorting", () => {
  it("orders by each option", async () => {
    expect(await found({ sort: "updated-desc" })).toEqual([E, D, C, B, A]);
    expect(await found({ sort: "updated-asc" })).toEqual([A, B, C, D, E]);
    expect(await found({ sort: "created-desc" })).toEqual([D, C, B, A, E]);
    expect(await found({ sort: "created-asc" })).toEqual([E, A, B, C, D]);
    expect(await found({ sort: "title-asc" })).toEqual([D, A, E, B, C]);
    expect(await found({ sort: "title-desc" })).toEqual([C, B, E, A, D]);
  });

  it("defaults to most recently updated", async () => {
    expect(await found()).toEqual(await found({ sort: "updated-desc" }));
  });

  it("orders a filtered search too", async () => {
    expect(await found({ q: "faith", sort: "title-asc" })).toEqual([A, B, C]);
    expect(await found({ q: "faith", sort: "title-desc" })).toEqual([C, B, A]);
  });
});

describe("pagination", () => {
  const pages = Math.ceil(250 / libraryPageSize);

  async function everyPage(fields: Partial<LibraryQuery>) {
    const all = [];
    for (let page = 1; page <= pages; page += 1) {
      const result = await searchIdeas(db, bulk, query({ ...fields, page }));
      expect(result).toMatchObject({
        total: 250,
        page,
        pageSize: libraryPageSize,
        totalPages: pages,
      });
      all.push(...result.items);
    }
    return all;
  }

  it("has no ceiling: every idea is on exactly one page, for every order", async () => {
    for (const sort of librarySorts) {
      const all = await everyPage({ sort });
      expect(all).toHaveLength(250);
      expect(new Set(all.map((idea) => idea.id)).size).toBe(250);
    }
  });

  it("keeps ideas with one timestamp in a fixed order", async () => {
    const ids = (await everyPage({ sort: "updated-asc" })).map((idea) => idea.id);
    expect(ids).toEqual([...ids].sort());
    const newest = (await everyPage({ sort: "created-desc" })).map((idea) => idea.id);
    expect(newest).toEqual([...ids].reverse());
  });

  it("keeps ideas with one title in a fixed order", async () => {
    const all = await everyPage({ sort: "title-asc" });
    const same = all.filter((idea) => idea.title === "Same title").map((idea) => idea.id);
    expect(same).toHaveLength(125);
    expect(same).toEqual([...same].sort());
    // The titles themselves ascend, ignoring case.
    const titles = all.map((idea) => idea.title.toLowerCase());
    expect(titles).toEqual([...titles].sort());
    // "Same title" follows every "Idea NNN", so it fills the last pages unbroken.
    expect(all.slice(125).every((idea) => idea.title === "Same title")).toBe(true);
  });

  it("returns the first, a middle, and the last page", async () => {
    const first = await searchIdeas(db, bulk, query());
    const middle = await searchIdeas(db, bulk, query({ page: 6 }));
    const last = await searchIdeas(db, bulk, query({ page: pages }));
    expect(first.items).toHaveLength(libraryPageSize);
    expect(middle.items).toHaveLength(libraryPageSize);
    expect(last.items).toHaveLength(250 - libraryPageSize * (pages - 1));
    expect(last).toMatchObject({ page: pages, totalPages: pages, total: 250 });
  });

  it("counts what matches, not what is on the page", async () => {
    const page = await searchIdeas(db, bulk, query({ q: "same" }));
    expect(page).toMatchObject({ total: 125, totalPages: Math.ceil(125 / libraryPageSize) });
    expect(page.items).toHaveLength(libraryPageSize);
  });

  it("returns the last page for one past the end, and the first for one before the start", async () => {
    const past = await searchIdeas(db, bulk, query({ page: 9999 }));
    const last = await searchIdeas(db, bulk, query({ page: pages }));
    expect(past.page).toBe(pages);
    expect(past.items.map((idea) => idea.id)).toEqual(last.items.map((idea) => idea.id));

    const first = await searchIdeas(db, bulk, query());
    for (const page of [0, -3, 1.9, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const result = await searchIdeas(db, bulk, query({ page }));
      expect(result.page).toBe(1);
      expect(result.items[0].id).toBe(first.items[0].id);
    }
  });

  it("bounds the page size", async () => {
    expect((await searchIdeas(db, bulk, query(), 10_000)).items).toHaveLength(100);
    expect((await searchIdeas(db, bulk, query(), 5)).items).toHaveLength(5);
    for (const size of [0, -1, Number.NaN]) {
      const result = await searchIdeas(db, bulk, query(), size);
      expect(result.pageSize).toBeGreaterThanOrEqual(1);
      expect(result.pageSize).toBeLessThanOrEqual(libraryPageSize);
    }
  });

  it("answers an empty library plainly", async () => {
    expect(await searchIdeas(db, nobody, query({ page: 3 }))).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: libraryPageSize,
      totalPages: 0,
    });
  });
});
