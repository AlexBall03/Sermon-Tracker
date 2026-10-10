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
  activeFilterCount,
  clearFilters,
  ideaHref,
  invertedRange,
  libraryReturnHref,
  toggled,
} from "./library-query";
import { librarySorts, searchLimits, tagFilterLimit } from "./model";

const tagA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tagB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const full: LibraryQuery = {
  q: "faith prayer",
  kinds: ["sermon", "point"],
  statuses: ["developing"],
  sermonTypes: ["topical"],
  tagIds: [tagA, tagB],
  tagMode: "all",
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
      kind: ["sermon", "point"],
      status: "developing",
      type: "topical",
      tag: [tagA, tagB],
      tag_mode: "all",
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
      expect(parseLibraryQuery({ kind }).kinds).toEqual([kind]);
    }
    for (const status of ["captured", "developing", "ready"]) {
      expect(parseLibraryQuery({ status }).statuses).toEqual([status]);
    }
    for (const type of ["topical", "expository"]) {
      expect(parseLibraryQuery({ type }).sermonTypes).toEqual([type]);
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
        tag_mode: "every",
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
    expect(
      parseLibraryQuery({ sort: ["title-asc", "title-desc"], page: ["2", "9"], q: ["a", "b"] }),
    ).toMatchObject({ sort: "title-asc", page: 2, q: "a" });
    // An invalid first value is not rescued by a later one.
    expect(parseLibraryQuery({ sort: ["newest", "title-asc"] }).sort).toBe("updated-desc");
    expect(parseLibraryQuery({ tag_mode: ["every", "all"], tag: tagA }).tagMode).toBe("any");
  });

  it("still reads an address written before filters took several values", () => {
    expect(
      parseLibraryQuery(new URLSearchParams("kind=sermon&status=ready&type=expository")),
    ).toMatchObject({ kinds: ["sermon"], statuses: ["ready"], sermonTypes: ["expository"] });
    expect(parseLibraryQuery({ kind: "point" }).kinds).toEqual(["point"]);
  });

  it("reads a repeated filter as several values, each once, in one order", () => {
    const parsed = parseLibraryQuery(
      new URLSearchParams(
        "kind=undecided&kind=sermon&kind=undecided&status=ready&status=captured&type=expository&type=topical",
      ),
    );
    expect(parsed.kinds).toEqual(["sermon", "undecided"]);
    expect(parsed.statuses).toEqual(["captured", "ready"]);
    expect(parsed.sermonTypes).toEqual(["topical", "expository"]);
    expect(parseLibraryQuery({ kind: ["point", "sermon", "point"] }).kinds).toEqual([
      "sermon",
      "point",
    ]);
  });

  it("drops the values it does not know and keeps the rest", () => {
    expect(parseLibraryQuery({ kind: ["series", "sermon", "Point", ""] }).kinds).toEqual([
      "sermon",
    ]);
    expect(parseLibraryQuery({ status: ["preached"] }).statuses).toEqual([]);
    expect(parseLibraryQuery({ kind: [] }).kinds).toEqual([]);
  });

  it("reads the tag mode, and takes anything else as any", () => {
    expect(parseLibraryQuery({ tag: tagA, tag_mode: "all" }).tagMode).toBe("all");
    expect(parseLibraryQuery({ tag: tagA, tag_mode: "any" }).tagMode).toBe("any");
    for (const value of ["ALL", "both", "", "all "]) {
      expect(parseLibraryQuery({ tag: tagA, tag_mode: value }).tagMode).toBe("any");
    }
    expect(parseLibraryQuery({ tag: tagA }).tagMode).toBe("any");
  });

  it("keeps each tag once, in lower case, up to the limit", () => {
    expect(parseLibraryQuery({ tag: [tagA, tagA.toUpperCase(), tagB] }).tagIds).toEqual([
      tagA,
      tagB,
    ]);
    expect(parseLibraryQuery({ tag: tagA }).tagIds).toEqual([tagA]);
    // Whatever order they arrive in, they are held in one.
    expect(parseLibraryQuery({ tag: [tagB, tagA] }).tagIds).toEqual([tagA, tagB]);
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
      "kind",
      "status",
      "type",
      "tag",
      "tag",
      "tag_mode",
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

  it("gives one query one address, however its values were chosen", () => {
    const one = libraryHref({
      ...defaultLibraryQuery,
      kinds: ["undecided", "sermon"],
      statuses: ["ready", "captured"],
      tagIds: [tagB, tagA, tagA],
    });
    const other = libraryHref({
      ...defaultLibraryQuery,
      kinds: ["sermon", "undecided", "sermon"],
      statuses: ["captured", "ready"],
      tagIds: [tagA, tagB],
    });
    expect(one).toBe(other);
    expect(one).toBe(
      `/library?kind=sermon&kind=undecided&status=captured&status=ready&tag=${tagA}&tag=${tagB}`,
    );
  });

  it("writes the tag mode only when it is not the default and there is a tag", () => {
    const withTag = { ...defaultLibraryQuery, tagIds: [tagA] };
    expect(libraryHref({ ...withTag, tagMode: "all" })).toBe(`/library?tag=${tagA}&tag_mode=all`);
    expect(libraryHref({ ...withTag, tagMode: "any" })).toBe(`/library?tag=${tagA}`);
    expect(libraryHref({ ...defaultLibraryQuery, tagMode: "all" })).toBe("/library");
  });

  it("keeps every other part of the query when one part changes", () => {
    const next = parseLibraryQuery(
      new URL(libraryHref({ ...full, statuses: ["ready"], page: 1 }), "https://example.test")
        .searchParams,
    );
    expect(next).toEqual({ ...full, statuses: ["ready"], page: 1 });
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
    expect(isFiltered({ ...defaultLibraryQuery, kinds: ["point"] })).toBe(true);
    expect(isFiltered({ ...defaultLibraryQuery, tagMode: "all" })).toBe(false);
    expect(isFiltered({ ...defaultLibraryQuery, tagIds: [tagA] })).toBe(true);
    expect(isFiltered({ ...defaultLibraryQuery, updatedThrough: "2026-01-01" })).toBe(true);
  });
});

describe("filter helpers", () => {
  it("counts each chosen value, and each date range once", () => {
    expect(activeFilterCount(defaultLibraryQuery)).toBe(0);
    expect(activeFilterCount({ ...defaultLibraryQuery, q: "faith", sort: "title-asc" })).toBe(0);
    expect(activeFilterCount(full)).toBe(8);
    expect(activeFilterCount({ ...defaultLibraryQuery, createdFrom: "2026-01-01" })).toBe(1);
  });

  it("clears the filters and keeps the search and the order", () => {
    expect(clearFilters(full)).toEqual({ ...defaultLibraryQuery, q: full.q, sort: full.sort });
  });

  it("toggles a value in a list", () => {
    expect(toggled(["sermon"], "point")).toEqual(["sermon", "point"]);
    expect(toggled(["sermon", "point"], "sermon")).toEqual(["point"]);
  });

  it("recognises a range that ends before it starts", () => {
    expect(invertedRange("2026-03-01", "2026-01-01")).toBe(true);
    expect(invertedRange("2026-01-01", "2026-01-01")).toBe(false);
    expect(invertedRange("2026-01-01", null)).toBe(false);
    expect(invertedRange(null, "2026-01-01")).toBe(false);
  });
});

describe("the way back from an idea", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("carries the library's query on the idea's address", () => {
    expect(ideaHref(id)).toBe(`/library/${id}`);
    expect(ideaHref(id, defaultLibraryQuery)).toBe(`/library/${id}`);
    const href = ideaHref(id, full);
    const from = new URL(href, "https://example.test").searchParams.get("from") ?? "";
    expect(parseLibraryQuery(new URLSearchParams(from))).toEqual(full);
    expect(libraryReturnHref(from)).toBe(libraryHref(full));
  });

  it("only ever leads back to the library", () => {
    expect(libraryReturnHref(undefined)).toBe("/library");
    expect(libraryReturnHref(["q=a", "q=b"])).toBe("/library");
    for (const from of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "next=https://evil.example&q=faith",
    ]) {
      const href = libraryReturnHref(from);
      expect(href.startsWith("/library")).toBe(true);
      expect(href).not.toContain("evil");
    }
    expect(libraryReturnHref("q=faith&page=3&owner=x")).toBe("/library?q=faith&page=3");
  });
});
