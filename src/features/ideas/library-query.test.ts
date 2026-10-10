// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  defaultLibraryQuery,
  isFiltered,
  libraryHref,
  normaliseSearch,
  parseLibraryQuery,
  searchTerms,
  serializeLibraryQuery,
  startOfDay,
  startOfNextDay,
  type LibraryQuery,
} from "./library-query";
import { librarySorts, searchLimits, tagFilterLimit } from "./model";

const tagA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tagB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const full: LibraryQuery = {
  q: "faith prayer",
  kind: "sermon",
  status: "developing",
  sermonType: "topical",
  tagIds: [tagA, tagB],
  createdFrom: "2026-01-01",
  createdThrough: "2026-03-31",
  updatedFrom: "2026-02-01",
  updatedThrough: "2026-02-28",
  sort: "title-desc",
  page: 4,
};

describe("parseLibraryQuery", () => {
  it("is the default query when nothing is given", () => {
    for (const params of [undefined, null, {}, new URLSearchParams()]) {
      expect(parseLibraryQuery(params)).toEqual(defaultLibraryQuery);
    }
    expect(defaultLibraryQuery).toMatchObject({ q: "", sort: "updated-desc", page: 1 });
  });

  it("reads every parameter, from an object or from URLSearchParams", () => {
    const record = {
      q: "faith prayer",
      kind: "sermon",
      status: "developing",
      type: "topical",
      tag: [tagA, tagB],
      created_from: "2026-01-01",
      created_to: "2026-03-31",
      updated_from: "2026-02-01",
      updated_to: "2026-02-28",
      sort: "title-desc",
      page: "4",
    };
    expect(parseLibraryQuery(record)).toEqual(full);

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
      for (const item of [value].flat()) params.append(key, item);
    }
    expect(parseLibraryQuery(params)).toEqual(full);
  });

  it("accepts every permitted value", () => {
    for (const kind of ["sermon", "point", "undecided"]) {
      expect(parseLibraryQuery({ kind }).kind).toBe(kind);
    }
    for (const status of ["captured", "developing", "ready"]) {
      expect(parseLibraryQuery({ status }).status).toBe(status);
    }
    for (const type of ["topical", "expository"]) {
      expect(parseLibraryQuery({ type }).sermonType).toBe(type);
    }
    for (const sort of librarySorts) expect(parseLibraryQuery({ sort }).sort).toBe(sort);
  });

  it("replaces anything it does not recognise with the default", () => {
    expect(
      parseLibraryQuery({
        kind: "Sermon",
        status: "preached",
        type: "narrative",
        sort: "title; drop table ideas",
        created_from: "yesterday",
        created_to: "2026-02-30",
        updated_from: "2026-13-01",
        updated_to: "2026-1-1",
        tag: ["not-a-uuid", `${tagA}' or 1=1`],
      }),
    ).toEqual(defaultLibraryQuery);
  });

  it("bounds the page number", () => {
    const page = (value: string) => parseLibraryQuery({ page: value }).page;
    expect(page("7")).toBe(7);
    for (const value of ["0", "-1", "1.5", "2e3", "abc", "", " 2", "NaN", "99999999999"]) {
      expect(page(value)).toBe(1);
    }
    expect(page("9999999")).toBe(1_000_000);
  });

  it("ignores parameters it does not know, and inherited names", () => {
    expect(
      parseLibraryQuery({ owner: "x", ownerId: "x", constructor: "x", __proto__: "x", limit: "5" }),
    ).toEqual(defaultLibraryQuery);
    expect(parseLibraryQuery(new URLSearchParams("toString=1&pageSize=1000"))).toEqual(
      defaultLibraryQuery,
    );
  });

  it("uses the first value where one is expected", () => {
    expect(parseLibraryQuery({ kind: ["point", "sermon"], page: ["2", "9"] })).toMatchObject({
      kind: "point",
      page: 2,
    });
    // An invalid first value is not rescued by a later one.
    expect(parseLibraryQuery({ kind: ["series", "sermon"] }).kind).toBeNull();
  });

  it("keeps each tag once, in lower case, up to the limit", () => {
    expect(parseLibraryQuery({ tag: [tagA, tagA.toUpperCase(), tagB] }).tagIds).toEqual([
      tagA,
      tagB,
    ]);
    expect(parseLibraryQuery({ tag: tagA }).tagIds).toEqual([tagA]);
    const many = Array.from(
      { length: tagFilterLimit + 10 },
      (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    expect(parseLibraryQuery({ tag: many }).tagIds).toHaveLength(tagFilterLimit);
  });

  it("tidies and bounds the search text", () => {
    expect(parseLibraryQuery({ q: "  faith \t\n  prayer  " }).q).toBe("faith prayer");
    expect(parseLibraryQuery({ q: "   " }).q).toBe("");
    expect(parseLibraryQuery({ q: "x".repeat(5000) }).q).toHaveLength(searchLimits.query);
  });
});

describe("searchTerms", () => {
  it("splits on whitespace and drops repeats whatever their case", () => {
    expect(searchTerms("  Faith  prayer FAITH ")).toEqual(["Faith", "prayer"]);
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms(" \t ")).toEqual([]);
  });

  it("uses only the first few words", () => {
    const words = Array.from({ length: 30 }, (_, index) => `w${index}`);
    expect(searchTerms(words.join(" "))).toEqual(words.slice(0, searchLimits.terms));
  });

  it("leaves punctuation in a word alone", () => {
    expect(searchTerms("100% it's")).toEqual(["100%", "it's"]);
    expect(normaliseSearch("a  b")).toBe("a b");
  });
});

describe("dates", () => {
  it("reads a day as a UTC day, inclusive at the end", () => {
    expect(startOfDay("2026-03-31")?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(startOfNextDay("2026-03-31")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(startOfNextDay("2026-12-31")?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(startOfDay("2028-02-29")).not.toBeNull();
  });

  it("refuses anything that is not a real calendar day", () => {
    for (const value of [
      "2026-02-29",
      "2026-00-10",
      "2026-04-31",
      "26-04-01",
      "2026-04-01T00:00",
    ]) {
      expect(startOfDay(value)).toBeNull();
      expect(startOfNextDay(value)).toBeNull();
    }
  });
});

describe("serializeLibraryQuery", () => {
  it("leaves every default out", () => {
    expect(serializeLibraryQuery(defaultLibraryQuery).toString()).toBe("");
    expect(libraryHref(defaultLibraryQuery)).toBe("/library");
  });

  it("writes a full query in a fixed order and reads it back unchanged", () => {
    const params = serializeLibraryQuery(full);
    expect([...params.keys()]).toEqual([
      "q",
      "kind",
      "status",
      "type",
      "tag",
      "tag",
      "created_from",
      "created_to",
      "updated_from",
      "updated_to",
      "sort",
      "page",
    ]);
    expect(parseLibraryQuery(params)).toEqual(full);
    expect(
      parseLibraryQuery(new URL(libraryHref(full), "https://example.test").searchParams),
    ).toEqual(full);
  });

  it("encodes search text safely", () => {
    const query = { ...defaultLibraryQuery, q: "faith & works = 100% ?" };
    const href = libraryHref(query);
    expect(href).not.toContain(" ");
    expect(parseLibraryQuery(new URL(href, "https://example.test").searchParams)).toEqual(query);
  });
});

describe("isFiltered", () => {
  it("is true for a search or any filter, and false for order and page alone", () => {
    expect(isFiltered(defaultLibraryQuery)).toBe(false);
    expect(isFiltered({ ...defaultLibraryQuery, sort: "title-asc", page: 3 })).toBe(false);
    expect(isFiltered({ ...defaultLibraryQuery, q: "faith" })).toBe(true);
    expect(isFiltered({ ...defaultLibraryQuery, kind: "point" })).toBe(true);
    expect(isFiltered({ ...defaultLibraryQuery, tagIds: [tagA] })).toBe(true);
    expect(isFiltered({ ...defaultLibraryQuery, updatedThrough: "2026-01-01" })).toBe(true);
  });
});
