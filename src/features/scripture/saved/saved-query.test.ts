import { describe, expect, it } from "vitest";

import {
  clearSavedFilters,
  defaultSavedQuery,
  isSavedFiltered,
  parseSavedQuery,
  savedFilterCount,
  savedHref,
} from "./saved-query";

const parse = (search: string) => parseSavedQuery(new URLSearchParams(search));

describe("parseSavedQuery", () => {
  it("reads nothing as the default", () => {
    expect(parse("")).toEqual(defaultSavedQuery);
    expect(parseSavedQuery(null)).toEqual(defaultSavedQuery);
    expect(parseSavedQuery(undefined)).toEqual(defaultSavedQuery);
  });

  it("reads every parameter", () => {
    expect(parse("q=grace&book=45&color=blue&color=yellow&sort=bible&page=3")).toEqual({
      q: "grace",
      book: 45,
      translation: null,
      colors: ["yellow", "blue"],
      sort: "bible",
      page: 3,
    });
  });

  it("reads Next's searchParams object, taking the first of a repeated single value", () => {
    expect(parseSavedQuery({ q: ["one", "two"], book: "1", color: "red" })).toMatchObject({
      q: "one",
      book: 1,
      translation: null,
      colors: ["red"],
    });
  });

  it.each(["book=0", "book=67", "book=abc", "book=4.5", "book=-1", "book=045", "book=1%3Bdrop"])(
    "falls back on %s",
    (search) => {
      expect(parse(search).book).toBeNull();
    },
  );

  it("drops colors it does not know and keeps the rest once", () => {
    expect(parse("color=pink&color=green&color=green&color=").colors).toEqual(["green"]);
  });

  it("falls back on an unknown sort and a bad page", () => {
    expect(parse("sort=created_at%3B--").sort).toBe("saved-desc");
    expect(parse("sort=constructor").sort).toBe("saved-desc");
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
    expect(parse("page=x").page).toBe(1);
    expect(parse("page=99999999999").page).toBe(1);
  });

  it("does not find inherited keys", () => {
    expect(parseSavedQuery({} as Record<string, string>).q).toBe("");
    expect(parse("constructor=1&__proto__=2")).toEqual(defaultSavedQuery);
  });

  it("tidies and caps the search", () => {
    expect(parse("q=%20%20living%20%20%20water%20").q).toBe("living water");
    expect(parse(`q=${"a".repeat(500)}`).q).toHaveLength(200);
  });
});

describe("savedHref", () => {
  it("leaves every default out", () => {
    expect(savedHref()).toBe("/library/saved-scripture");
    expect(savedHref(defaultSavedQuery)).toBe("/library/saved-scripture");
  });

  it("writes one address per query, in a fixed order", () => {
    const href = savedHref({
      q: "grace",
      book: 45,
      translation: null,
      colors: ["blue", "yellow"],
      sort: "bible",
      page: 2,
    });
    expect(href).toBe(
      "/library/saved-scripture?q=grace&book=45&color=yellow&color=blue&sort=bible&page=2",
    );
  });

  it("round-trips", () => {
    const query = {
      q: "the cross",
      book: 43,
      translation: null,
      colors: ["red" as const],
      sort: "updated-desc" as const,
      page: 4,
    };
    expect(parse(savedHref(query).split("?")[1])).toEqual(query);
  });

  it("never writes a value it would not read", () => {
    const href = savedHref({ ...defaultSavedQuery, book: 99, sort: "nonsense" as never });
    expect(href).toBe("/library/saved-scripture");
  });
});

describe("filters", () => {
  it("counts the book and each color, but not the search", () => {
    expect(savedFilterCount(parse("q=x"))).toBe(0);
    expect(savedFilterCount(parse("book=1&color=red&color=blue"))).toBe(3);
    expect(isSavedFiltered(parse("q=x"))).toBe(true);
    expect(isSavedFiltered(parse("sort=bible&page=2"))).toBe(false);
  });

  it("clears the filters and keeps the search and the order", () => {
    expect(clearSavedFilters(parse("q=x&book=1&color=red&sort=bible&page=3"))).toEqual({
      ...defaultSavedQuery,
      q: "x",
      sort: "bible",
    });
  });
});
