// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  clearHistoryFilters,
  historyFilterCount,
  historyHref,
  isHistoryFiltered,
  parseHistoryQuery,
  sermonHistoryHref,
  serializeHistoryQuery,
} from "./history-query";
import { historyFilterLimit } from "./model";
import { defaultHistoryQuery } from "./schemas";

const sermon = "11111111-1111-4111-8111-111111111111";
const venue = "22222222-2222-4222-8222-222222222222";
const venue2 = "33333333-3333-4333-8333-333333333333";
const context = "44444444-4444-4444-8444-444444444444";

const read = (search: string) => parseHistoryQuery(new URLSearchParams(search));

describe("the history query in the address", () => {
  it("is everything, newest first, when the address says nothing", () => {
    expect(read("")).toEqual(defaultHistoryQuery);
    expect(parseHistoryQuery(undefined)).toEqual(defaultHistoryQuery);
    expect(parseHistoryQuery(null)).toEqual(defaultHistoryQuery);
    expect(defaultHistoryQuery.sort).toBe("date-desc");
    expect(historyHref()).toBe("/library/preaching-record");
  });

  it("reads a search, every filter, the order, and the page", () => {
    expect(
      read(
        `q=%20Grace%20%20abounding&sermon=${sermon}&from=2026-01-01&to=2026-06-30` +
          `&venue=${venue}&venue=${venue2}&context=${context}` +
          "&format=mini&format=full_length&time=pm&time=unspecified&sort=date-asc&page=3",
      ),
    ).toEqual({
      q: "Grace abounding",
      sermonId: sermon,
      from: "2026-01-01",
      through: "2026-06-30",
      venueIds: [venue, venue2],
      contextIds: [context],
      // In the model's order, whatever order the address gave them in.
      formats: ["full_length", "mini"],
      timesOfDay: ["pm", "unspecified"],
      sort: "date-asc",
      page: 3,
    });
  });

  it("reads the record form Next gives a page, and takes the first of a repeated single value", () => {
    expect(
      parseHistoryQuery({ q: ["grace", "faith"], venue: [venue, venue], page: "2", sort: "x" }),
    ).toEqual({ ...defaultHistoryQuery, q: "grace", venueIds: [venue], page: 2 });
  });

  it("never throws, and drops whatever it cannot use", () => {
    const nonsense =
      "sermon=nope&from=2026-02-30&to=tomorrow&venue=1&venue=drop%20table&context=" +
      "&format=long&time=noon&sort=title&page=-4&owner=someone&constructor=x";
    expect(read(nonsense)).toEqual(defaultHistoryQuery);
    expect(parseHistoryQuery({ constructor: "x", __proto__: "y" } as never)).toEqual(
      defaultHistoryQuery,
    );
    expect(read("page=99999999").page).toBe(1);
    expect(read("page=9999999").page).toBe(1_000_000);
  });

  it("lowers the case of an ID and filters by no more than the limit allows", () => {
    expect(read(`venue=${venue.toUpperCase()}&sermon=${sermon.toUpperCase()}`)).toMatchObject({
      venueIds: [venue],
      sermonId: sermon,
    });
    const many = Array.from(
      { length: historyFilterLimit + 5 },
      (_, index) => `venue=00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ).join("&");
    expect(read(many).venueIds).toHaveLength(historyFilterLimit);
  });

  it("writes the address in one order, with every default left out", () => {
    const query = read(
      `page=2&sort=date-asc&time=am&format=mini&context=${context}&venue=${venue}` +
        `&to=2026-06-30&from=2026-01-01&sermon=${sermon}&q=grace`,
    );
    expect(serializeHistoryQuery(query).toString()).toBe(
      `q=grace&sermon=${sermon}&from=2026-01-01&to=2026-06-30&venue=${venue}` +
        `&context=${context}&format=mini&time=am&sort=date-asc&page=2`,
    );
    // What is written is read back as the same query.
    expect(parseHistoryQuery(serializeHistoryQuery(query))).toEqual(query);
    expect(historyHref({ ...defaultHistoryQuery, page: 1, sort: "date-desc" })).toBe(
      "/library/preaching-record",
    );
    expect(sermonHistoryHref(sermon)).toBe(`/library/preaching-record?sermon=${sermon}`);
  });

  it("counts the filters, and not the search, the order, or the page", () => {
    expect(historyFilterCount(defaultHistoryQuery)).toBe(0);
    expect(isHistoryFiltered(read("sort=date-asc&page=4"))).toBe(false);
    expect(historyFilterCount(read("q=grace"))).toBe(0);
    expect(isHistoryFiltered(read("q=grace"))).toBe(true);
    // The two ends of the dates are one filter.
    expect(historyFilterCount(read("from=2026-01-01&to=2026-06-30"))).toBe(1);
    expect(historyFilterCount(read("to=2026-06-30"))).toBe(1);
    expect(
      historyFilterCount(
        read(
          `sermon=${sermon}&venue=${venue}&venue=${venue2}&context=${context}&time=am&format=mini`,
        ),
      ),
    ).toBe(6);
  });

  it("lifts every filter and keeps the search and the order", () => {
    const query = read(`q=grace&sermon=${sermon}&venue=${venue}&time=am&sort=date-asc&page=5`);
    expect(clearHistoryFilters(query)).toEqual({
      ...defaultHistoryQuery,
      q: "grace",
      sort: "date-asc",
    });
  });
});
