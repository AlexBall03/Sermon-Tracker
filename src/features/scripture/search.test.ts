// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bibleVerses } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The access helper is mocked; searches run on a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: true, user: { id: "1" } } as unknown,
  db: undefined as unknown,
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "@/app/api/bible/search/route";
import { searchVerses } from "./search-verses";
import { formatReferences, versesToReferences } from "./reference";
import { buildSearchQuery, parseScope, scopeBooks, splitHit } from "./search";

const query = (input: string) => {
  const built = buildSearchQuery(input);
  if (!built.ok) throw new Error(built.message);
  return built.tsquery;
};

describe("buildSearchQuery", () => {
  it("turns what is typed into a query of letters, digits, and its own operators", () => {
    expect(query("grace")).toBe("(grace)");
    expect(query("Grace  Mercy")).toBe("(grace & mercy)");
    expect(query('"living water"')).toBe("((living <-> water))");
    expect(query("“living water” well")).toBe("((living <-> water) & well)");
    expect(query("faith OR hope")).toBe("(faith) | (hope)");
    expect(query("faith | hope charity")).toBe("(faith) | (hope & charity)");
    expect(query("shepherd -sheep")).toBe("(shepherd & !sheep)");
    expect(query('faith -"works of the law"')).toBe("(faith & !(works <-> of <-> the <-> law))");
    expect(query("lov*")).toBe("(lov:*)");
    expect(query('"be not afr*"')).toBe("((be <-> not <-> afr:*))");
    expect(query("LORD's")).toBe("((lord <-> s))");
    expect(query("Ænon")).toBe("(ænon)");
  });

  it("lets nothing else through", () => {
    for (const input of [
      "a & b | !c",
      "it's:* <-> x",
      "'); drop table bible_verses; --",
      "a\\b(c)",
    ]) {
      expect(query(input)).toMatch(/^[\p{L}\p{N} ()&|!<>:*-]+$/u);
      expect(query(input)).not.toMatch(/[';\\]/);
    }
    // Operators typed as text are words or nothing; they never act as operators.
    expect(query("grace & mercy")).toBe("(grace & mercy)");
    expect(query("grace <-> mercy")).toBe("(grace & mercy)");
    expect(query("grace !mercy")).toBe("(grace & mercy)");
    expect(query("or")).toBe("(or)");
  });

  it("refuses a search with nothing to look for", () => {
    for (const [input, reason] of [
      ["", /Type a word/],
      ['  "" ', /Type a word/],
      ["?!", /Type a word/],
      ["OR", /Type a word/],
      ["a*", /Type a word/],
      ["-law", /Add a word to look for/],
      ["x".repeat(201), /too long/],
      [Array(17).fill("word").join(" "), /too many words/],
    ] as const) {
      const built = buildSearchQuery(input);
      expect(built.ok, input).toBe(false);
      if (!built.ok) expect(built.message).toMatch(reason);
    }
  });
});

describe("scopes and hits", () => {
  it("reads a scope and the books it covers", () => {
    expect(parseScope(null)).toBe("all");
    expect(parseScope("old")).toBe("old");
    expect(parseScope("43")).toBe(43);
    expect(parseScope("67")).toBeNull();
    expect(parseScope("0")).toBeNull();
    expect(parseScope("john")).toBeNull();
    expect(scopeBooks("all")).toEqual([1, 66]);
    expect(scopeBooks("old")).toEqual([1, 39]);
    expect(scopeBooks("new")).toEqual([40, 66]);
    expect(scopeBooks(43)).toEqual([43, 43]);
  });

  it("splits a hit into plain and matched runs", () => {
    expect(splitHit("the [[Lord]]’[[s]] supper")).toEqual(["the ", "Lord", "’", "s", " supper"]);
    expect(splitHit("no match")).toEqual(["no match"]);
  });
});

describe("versesToReferences", () => {
  it("makes one passage of each unbroken run, in order", () => {
    expect(formatReferences(versesToReferences(19, 23, []))).toBe("Psalm 23");
    expect(formatReferences(versesToReferences(19, 23, [4]))).toBe("Psalm 23:4");
    expect(formatReferences(versesToReferences(19, 23, [3, 1, 2]))).toBe("Psalm 23:1–3");
    expect(formatReferences(versesToReferences(1, 1, [9, 1, 2, 3, 4, 7, 10, 7]))).toBe(
      "Genesis 1:1–4, 7, 9–10",
    );
    expect(versesToReferences(1, 1, [1, 2, 5])).toHaveLength(2);
  });

  it("writes passages from different places in full", () => {
    expect(
      formatReferences([...versesToReferences(43, 3, [16]), ...versesToReferences(19, 23, [])]),
    ).toBe("John 3:16; Psalm 23");
  });
});

describe("searchVerses and GET /api/bible/search", () => {
  let db: Database;
  const verses = [
    [1, 1, 1, "In the beginning God created the heaven and the earth."],
    [19, 23, 1, "The LORD is my shepherd; I shall not want."],
    [23, 40, 11, "He shall feed his flock like a shepherd: he shall gather the lambs."],
    [43, 4, 10, "he would have given thee living water."],
    [43, 10, 11, "I am the good shepherd: the good shepherd giveth his life for the sheep."],
    [46, 11, 20, "this is not to eat the Lord’s supper."],
    [66, 22, 17, "let him take the water of life freely."],
  ] as const;
  const found = async (input: string, scope: Parameters<typeof searchVerses>[2] = "all") =>
    (await searchVerses(db, query(input), scope)).hits.map(
      (hit) => `${hit.book}.${hit.chapter}.${hit.verse}`,
    );
  const request = (params: Record<string, string>) =>
    GET(new Request(`http://localhost/api/bible/search?${new URLSearchParams(params)}`));

  beforeEach(async () => {
    db = await createTestDatabase();
    state.db = db;
    state.access = { ok: true, user: { id: "1" } };
    await db
      .insert(bibleVerses)
      .values(verses.map(([book, chapter, verse, text]) => ({ book, chapter, verse, text })));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("finds words, phrases, alternatives, exclusions, and beginnings, in canonical order", async () => {
    expect(await found("shepherd")).toEqual(["19.23.1", "23.40.11", "43.10.11"]);
    expect(await found("SHEPHERD lord")).toEqual(["19.23.1"]);
    expect(await found('"living water"')).toEqual(["43.4.10"]);
    expect(await found('"water living"')).toEqual([]);
    expect(await found("beginning OR supper")).toEqual(["1.1.1", "46.11.20"]);
    expect(await found("shepherd -sheep")).toEqual(["19.23.1", "23.40.11"]);
    expect(await found("giv*")).toEqual(["43.4.10", "43.10.11"]);
    expect(await found("lord's supper")).toEqual(["46.11.20"]);
    // Words are matched whole unless a star asks otherwise.
    expect(await found("shep")).toEqual([]);
  });

  it("keeps to the scope, pages, and marks what matched", async () => {
    expect(await found("shepherd", "old")).toEqual(["19.23.1", "23.40.11"]);
    expect(await found("shepherd", "new")).toEqual(["43.10.11"]);
    expect(await found("water", 66)).toEqual(["66.22.17"]);

    const page = await searchVerses(db, query("shepherd"), "all", 1, 1);
    expect(page.total).toBe(3);
    expect(page.hits).toEqual([
      {
        book: 23,
        chapter: 40,
        verse: 11,
        text: "He shall feed his flock like a [[shepherd]]: he shall gather the lambs.",
      },
    ]);
  });

  it("serves a page of results to a signed-in account", async () => {
    const response = await request({ q: "living water", in: "new" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/^private/);
    expect(await response.json()).toEqual({
      total: 1,
      hits: [
        { book: 43, chapter: 4, verse: 10, text: "he would have given thee [[living]] [[water]]." },
      ],
    });
  });

  it("refuses anyone without access, before searching", async () => {
    state.access = { ok: false, message: "Your session has ended. Sign in again." };
    state.db = undefined;
    expect((await request({ q: "shepherd" })).status).toBe(401);
  });

  it("answers 400 for a search or a page it cannot use", async () => {
    state.db = undefined;
    for (const params of [
      {},
      { q: "  " },
      { q: "-law" },
      { q: "shepherd", in: "apocrypha" },
      { q: "shepherd", offset: "-1" },
      { q: "shepherd", offset: "999999" },
      { q: "shepherd", offset: "1;select" },
    ] as Record<string, string>[]) {
      expect((await request(params)).status, JSON.stringify(params)).toBe(400);
    }
  });

  it("treats hostile input as words to look for", async () => {
    const response = await request({ q: "'); drop table bible_verses; --" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total: 0, hits: [] });
    expect(await found("shepherd")).toHaveLength(3);
  });

  it("answers 503 with a fixed message when the search fails", async () => {
    state.db = {
      select: () => {
        throw new Error("postgres://user:secret@host/db refused");
      },
    };
    const response = await request({ q: "shepherd" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: "The search could not be run. Try again." });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});
