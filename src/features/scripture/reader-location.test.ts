import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  firstLocation,
  locationOfReference,
  parseReaderLocation,
  readerHref,
  readSavedLocation,
  referenceLocation,
  sameChapter,
  savedLocationKey,
  saveLocation,
  stepChapter,
} from "./reader-location";
import { parseReference } from "./reference";

const at = (book: number, chapter: number, verse: number | null = null) => ({
  book,
  chapter,
  verse,
});

describe("parseReaderLocation", () => {
  it("reads a chapter, and a verse in it", () => {
    expect(parseReaderLocation({ book: "43", chapter: "3" })).toEqual(at(43, 3));
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "16" })).toEqual(at(43, 3, 16));
    expect(parseReaderLocation(new URLSearchParams("book=19&chapter=119&verse=176"))).toEqual(
      at(19, 119, 176),
    );
  });

  it("finds no location without a real book", () => {
    for (const params of [
      undefined,
      null,
      {},
      { chapter: "3", verse: "16" },
      { book: "0", chapter: "1" },
      { book: "67", chapter: "1" },
      { book: "john", chapter: "3" },
      { book: "-1", chapter: "1" },
      { book: "4.5", chapter: "1" },
      { book: "43;drop", chapter: "3" },
      { book: "", chapter: "3" },
      { book: "0043", chapter: "3" },
    ]) {
      expect(parseReaderLocation(params)).toBeNull();
    }
  });

  it("opens a book at chapter 1 when the chapter is missing or is not one of its chapters", () => {
    expect(parseReaderLocation({ book: "43" })).toEqual(at(43, 1));
    expect(parseReaderLocation({ book: "43", chapter: "22" })).toEqual(at(43, 1));
    expect(parseReaderLocation({ book: "43", chapter: "0" })).toEqual(at(43, 1));
    expect(parseReaderLocation({ book: "43", chapter: "three" })).toEqual(at(43, 1));
    // The verse belonged to the chapter that was asked for, so it goes with it.
    expect(parseReaderLocation({ book: "43", chapter: "99", verse: "16" })).toEqual(at(43, 1));
  });

  it("drops a verse the chapter does not have", () => {
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "37" })).toEqual(at(43, 3));
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "0" })).toEqual(at(43, 3));
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "x" })).toEqual(at(43, 3));
  });

  it("uses the first of a repeated parameter and ignores every other parameter", () => {
    expect(
      parseReaderLocation({ book: ["43", "1"], chapter: ["3", "9"], q: "grace", sort: "x" }),
    ).toEqual(at(43, 3));
    expect(parseReaderLocation(new URLSearchParams("book=43&book=1&chapter=3&from=evil"))).toEqual(
      at(43, 3),
    );
  });
});

describe("readerHref", () => {
  it("gives one address for one place", () => {
    expect(readerHref(at(43, 3))).toBe("/bible?book=43&chapter=3");
    expect(readerHref(at(43, 3, 16))).toBe("/bible?book=43&chapter=3&verse=16");
  });

  it("reads back what it wrote", () => {
    for (const location of [at(1, 1), at(19, 119, 105), at(65, 1, 25), at(66, 22)]) {
      const query = readerHref(location).split("?")[1];
      expect(parseReaderLocation(new URLSearchParams(query))).toEqual(location);
    }
  });
});

describe("stepChapter", () => {
  it("moves within a book", () => {
    expect(stepChapter(at(43, 3, 16), 1)).toEqual(at(43, 4));
    expect(stepChapter(at(43, 3), -1)).toEqual(at(43, 2));
  });

  it("crosses from one book into the next, and back to the last chapter of the one before", () => {
    expect(stepChapter(at(1, 50), 1)).toEqual(at(2, 1));
    expect(stepChapter(at(2, 1), -1)).toEqual(at(1, 50));
    expect(stepChapter(at(39, 4), 1)).toEqual(at(40, 1));
  });

  it("passes through books of one chapter", () => {
    expect(stepChapter(at(64, 1), 1)).toEqual(at(65, 1));
    expect(stepChapter(at(65, 1), 1)).toEqual(at(66, 1));
    expect(stepChapter(at(65, 1), -1)).toEqual(at(64, 1));
  });

  it("stops at Genesis 1 and at Revelation 22", () => {
    expect(stepChapter(at(1, 1), -1)).toBeNull();
    expect(stepChapter(at(66, 22), 1)).toBeNull();
    expect(stepChapter(at(1, 1), 1)).toEqual(at(1, 2));
    expect(stepChapter(at(66, 22), -1)).toEqual(at(66, 21));
  });
});

describe("locationOfReference", () => {
  const typed = (text: string) => {
    const parsed = parseReference(text);
    if (!parsed.ok) throw new Error(parsed.message);
    return locationOfReference(parsed.reference);
  };

  it("is where the reference begins", () => {
    expect(typed("Romans 8:28")).toEqual(at(45, 8, 28));
    expect(typed("Romans 8:28-30")).toEqual(at(45, 8, 28));
    expect(typed("Psalm 23")).toEqual(at(19, 23));
    expect(typed("John 3:16-4:2")).toEqual(at(43, 3, 16));
    expect(typed("Jude 5")).toEqual(at(65, 1, 5));
  });
});

describe("sameChapter", () => {
  it("compares the chapter and not the verse", () => {
    expect(sameChapter(at(43, 3), at(43, 3, 16))).toBe(true);
    expect(sameChapter(at(43, 3), at(43, 4))).toBe(false);
    expect(sameChapter(null, at(43, 3))).toBe(false);
  });
});

describe("the saved reading position", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is nothing until a chapter has been read", () => {
    expect(readSavedLocation()).toBeNull();
  });

  it("remembers the chapter, and not the verse", () => {
    saveLocation(at(43, 3, 16));
    expect(window.localStorage.getItem(savedLocationKey)).toBe("43.3");
    expect(readSavedLocation()).toEqual(at(43, 3));
  });

  it("keeps only the latest", () => {
    saveLocation(at(43, 3));
    saveLocation(at(19, 23));
    expect(readSavedLocation()).toEqual(at(19, 23));
  });

  it("ignores a stored value that is malformed or names no chapter", () => {
    for (const stored of [
      "",
      "john",
      "43",
      "43.",
      "43.3.16",
      "43,3",
      "0.1",
      "67.1",
      "43.22",
      "-1.1",
      '{"book":43,"chapter":3}',
      "43.3<script>",
    ]) {
      window.localStorage.setItem(savedLocationKey, stored);
      expect(readSavedLocation()).toBeNull();
    }
  });

  it("does not save a place that does not exist", () => {
    saveLocation(at(43, 22));
    saveLocation(at(0, 1));
    expect(window.localStorage.getItem(savedLocationKey)).toBeNull();
  });

  it("carries on when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readSavedLocation()).toBeNull();
    expect(() => saveLocation(at(43, 3))).not.toThrow();
  });

  it("falls back to Genesis 1 in the reader's order of preference", () => {
    expect(readSavedLocation() ?? firstLocation).toEqual(at(1, 1));
  });
});

describe("a passage and where it was opened from", () => {
  const idea = "11111111-1111-4111-8111-111111111111";
  const read = (text: string) => {
    const parsed = parseReference(text);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.reference;
  };

  it("reads how far a passage runs, in the chapter it starts in", () => {
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "16", through: "18" })).toEqual({
      book: 43,
      chapter: 3,
      verse: 16,
      through: 18,
    });
  });

  it("drops an end that is not after the start, is past the chapter, or has no start", () => {
    for (const through of ["16", "15", "0", "37", "x", "-18", ""]) {
      expect(parseReaderLocation({ book: "43", chapter: "3", verse: "16", through })).toEqual(
        at(43, 3, 16),
      );
    }
    expect(parseReaderLocation({ book: "43", chapter: "3", through: "18" })).toEqual(at(43, 3));
    expect(parseReaderLocation({ book: "43", chapter: "3", verse: "40", through: "41" })).toEqual(
      at(43, 3),
    );
  });

  it("reads the idea it was opened from only when that is an ID", () => {
    expect(parseReaderLocation({ book: "43", chapter: "3", idea })).toEqual({ ...at(43, 3), idea });
    expect(parseReaderLocation({ book: "43", chapter: "3", idea: idea.toUpperCase() })).toEqual({
      ...at(43, 3),
      idea,
    });
    for (const value of ["1", "../admin", "https://example.com", `${idea}'--`, ""]) {
      expect(parseReaderLocation({ book: "43", chapter: "3", idea: value })).toEqual(at(43, 3));
    }
    // An idea is no place: without a book there is still no location.
    expect(parseReaderLocation({ idea })).toBeNull();
  });

  it("writes one address for each, in a fixed order", () => {
    expect(readerHref({ book: 43, chapter: 3, verse: 16, through: 18, idea })).toBe(
      `/bible?book=43&chapter=3&verse=16&through=18&idea=${idea}`,
    );
    expect(readerHref({ book: 43, chapter: 3, verse: null, through: 18 })).toBe(
      "/bible?book=43&chapter=3",
    );
    expect(readerHref({ book: 43, chapter: 3, verse: 16, through: 16 })).toBe(
      "/bible?book=43&chapter=3&verse=16",
    );
    const href = readerHref({ book: 43, chapter: 3, verse: 16, through: 18, idea });
    expect(readerHref(parseReaderLocation(new URLSearchParams(href.split("?")[1]))!)).toBe(href);
  });

  it("opens a reference at its first verse and points out the rest of it", () => {
    expect(referenceLocation(read("John 3:16"))).toEqual(at(43, 3, 16));
    expect(referenceLocation(read("John 3:16-18"))).toEqual({ ...at(43, 3, 16), through: 18 });
    expect(referenceLocation(read("Romans 10:9-10"), idea)).toEqual({
      ...at(45, 10, 9),
      through: 10,
      idea,
    });
    // A whole chapter, or several, is opened at its head with nothing pointed out.
    expect(referenceLocation(read("Psalm 23"))).toEqual(at(19, 23));
    expect(referenceLocation(read("Genesis 1-2"))).toEqual(at(1, 1));
    // One that runs into the next chapter is pointed out to the end of its first.
    expect(referenceLocation(read("John 3:30-4:2"))).toEqual({ ...at(43, 3, 30), through: 36 });
    expect(referenceLocation(read("Jude 5-7"))).toEqual({ ...at(65, 1, 5), through: 7 });
  });

  it("carries no translation", () => {
    const href = readerHref(referenceLocation(read("Ephesians 2:8-9"), idea));
    expect(href).toBe(`/bible?book=49&chapter=2&verse=8&through=9&idea=${idea}`);
    expect(href).not.toMatch(/kjv|translation|version/i);
  });
});
