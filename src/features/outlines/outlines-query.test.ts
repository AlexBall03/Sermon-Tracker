// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  defaultOutlinesQuery,
  isOutlinesSearch,
  newOutlineHref,
  outlineHref,
  outlinesHref,
  parseOutlinesQuery,
  serializeOutlinesQuery,
} from "./outlines-query";

describe("the overview's address", () => {
  it("reads nothing as the default: every outline, most recently worked on first", () => {
    for (const params of [undefined, null, {}, new URLSearchParams()]) {
      expect(parseOutlinesQuery(params)).toEqual(defaultOutlinesQuery);
    }
    expect(defaultOutlinesQuery).toEqual({ q: "", sort: "updated-desc", page: 1 });
  });

  it("reads the search, the order, and the page", () => {
    expect(parseOutlinesQuery({ q: "  amazing   grace ", sort: "title-asc", page: "3" })).toEqual({
      q: "amazing grace",
      sort: "title-asc",
      page: 3,
    });
    expect(parseOutlinesQuery(new URLSearchParams("q=grace&sort=created-desc&page=2"))).toEqual({
      q: "grace",
      sort: "created-desc",
      page: 2,
    });
  });

  it("never throws, and falls back for anything it does not understand", () => {
    expect(
      parseOutlinesQuery({
        q: ["first", "second"],
        sort: "updated_at; drop table ideas",
        page: "-4",
        status: "ready",
        archived: "all",
        constructor: "x",
      }),
    ).toEqual({ q: "first", sort: "updated-desc", page: 1 });
    expect(parseOutlinesQuery({ page: "0" }).page).toBe(1);
    expect(parseOutlinesQuery({ page: "2.5" }).page).toBe(1);
    expect(parseOutlinesQuery({ page: "99999999999" }).page).toBe(1);
    // A name every object has is not a parameter.
    expect(parseOutlinesQuery({ toString: "x" } as never)).toEqual(defaultOutlinesQuery);
  });

  it("writes one address for one query, with every default left out", () => {
    expect(outlinesHref()).toBe("/outlines");
    expect(outlinesHref({ q: "", sort: "updated-desc", page: 1 })).toBe("/outlines");
    expect(outlinesHref({ q: " Grace  and truth ", sort: "title-desc", page: 2 })).toBe(
      "/outlines?q=Grace+and+truth&sort=title-desc&page=2",
    );
    expect(serializeOutlinesQuery({ q: "", sort: "nonsense" as never, page: 1 }).toString()).toBe(
      "",
    );
  });

  it("reads back what it wrote", () => {
    const query = { q: "the cross", sort: "updated-asc", page: 4 } as const;
    expect(parseOutlinesQuery(serializeOutlinesQuery(query))).toEqual(query);
  });

  it("calls only a search a narrowing: the order and the page are not", () => {
    expect(isOutlinesSearch({ ...defaultOutlinesQuery, sort: "title-asc", page: 3 })).toBe(false);
    expect(isOutlinesSearch({ ...defaultOutlinesQuery, q: "grace" })).toBe(true);
  });

  it("names an outline's editor, and where a sermon is given an outline", () => {
    expect(outlineHref("abc")).toBe("/outlines/abc");
    expect(newOutlineHref("def")).toBe("/outlines/new?sermon=def");
  });
});
