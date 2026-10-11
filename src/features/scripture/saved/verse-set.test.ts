import { describe, expect, it } from "vitest";

import { versesIn } from "../books";
import { selectionReferences, selectVerses, wholeChapter } from "../selection";
import {
  canonicalKey,
  formatVerseSet,
  normaliseVerses,
  parseVerseSet,
  referencesToVerses,
  sameVerses,
  versesInChapter,
  versesToRuns,
  type VerseRef,
} from "./verse-set";

const v = (book: number, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });
const john = (...verses: number[]) => verses.map((verse) => v(43, 3, verse));

describe("normaliseVerses", () => {
  it("keeps one verse as it is", () => {
    expect(normaliseVerses(john(16))).toEqual(john(16));
  });

  it("puts a passage in order and keeps each verse once", () => {
    expect(normaliseVerses(john(18, 16, 17, 16))).toEqual(john(16, 17, 18));
  });

  it("orders by book, then chapter, then verse", () => {
    const mixed = [v(45, 6, 23), v(43, 3, 16), v(45, 3, 23), v(45, 3, 10)];
    expect(normaliseVerses(mixed)).toEqual([
      v(43, 3, 16),
      v(45, 3, 10),
      v(45, 3, 23),
      v(45, 6, 23),
    ]);
  });

  it("drops what the Bible does not have", () => {
    expect(
      normaliseVerses([
        v(43, 3, 16),
        v(43, 3, 37),
        v(43, 22, 1),
        v(67, 1, 1),
        v(43, 3, 0),
        v(43, 3, 1.5),
      ]),
    ).toEqual(john(16));
  });

  it("has no place for a psalm's title: verse 1 is the first verse", () => {
    expect(normaliseVerses([v(19, 3, 0)])).toEqual([]);
    expect(normaliseVerses([v(19, 3, 1)])).toEqual([v(19, 3, 1)]);
  });

  it("makes nothing of nothing", () => {
    expect(normaliseVerses([])).toEqual([]);
  });

  it("carries nothing but the three numbers", () => {
    const extra = { ...v(43, 3, 16), ownerId: "someone" } as VerseRef;
    expect(normaliseVerses([extra])).toEqual(john(16));
  });
});

describe("canonicalKey and sameVerses", () => {
  it("are the same for the same verses however they were chosen", () => {
    expect(canonicalKey(john(18, 16, 17))).toBe(canonicalKey(john(16, 17, 18, 17)));
    expect(sameVerses(john(16, 17), john(17, 16))).toBe(true);
  });

  it("differ for different verses", () => {
    expect(sameVerses(john(16), john(16, 17))).toBe(false);
    expect(canonicalKey(john(16))).not.toBe(canonicalKey([v(43, 4, 16)]));
    // 1.11.1 and 11.1.1 must not run together.
    expect(canonicalKey([v(1, 11, 1)])).not.toBe(canonicalKey([v(11, 1, 1)]));
  });
});

describe("references and verses", () => {
  it("expands a selection from the reader", () => {
    const picked = selectionReferences(43, 3, selectVerses([3, 5, 6, 8], versesIn(43, 3)));
    expect(referencesToVerses(picked)).toEqual(john(3, 5, 6, 8));
  });

  it("expands a whole chapter to every verse", () => {
    const chapter = selectionReferences(19, 23, wholeChapter);
    expect(referencesToVerses(chapter)).toHaveLength(6);
  });

  it("expands a passage across chapters", () => {
    const verses = referencesToVerses([
      { book: 43, chapterStart: 3, verseStart: 35, chapterEnd: 4, verseEnd: 2 },
    ]);
    expect(verses).toEqual([v(43, 3, 35), v(43, 3, 36), v(43, 4, 1), v(43, 4, 2)]);
  });

  it("turns verses back into unbroken runs", () => {
    expect(versesToRuns(john(3, 5, 6, 8))).toEqual([
      { book: 43, chapterStart: 3, verseStart: 3, chapterEnd: null, verseEnd: null },
      { book: 43, chapterStart: 3, verseStart: 5, chapterEnd: null, verseEnd: 6 },
      { book: 43, chapterStart: 3, verseStart: 8, chapterEnd: null, verseEnd: null },
    ]);
  });

  it("picks out one chapter's verses", () => {
    expect(versesInChapter([v(45, 3, 10), v(45, 3, 23), v(45, 6, 23)], 45, 3)).toEqual([10, 23]);
  });
});

describe("formatVerseSet", () => {
  it.each([
    [john(16), "John 3:16"],
    [john(16, 17, 18), "John 3:16–18"],
    [john(3, 5, 6, 8), "John 3:3, 5–6, 8"],
    [[v(45, 3, 10), v(45, 3, 23), v(45, 6, 23)], "Romans 3:10, 23; 6:23"],
    [[v(43, 3, 16), v(45, 6, 23)], "John 3:16; Romans 6:23"],
    [[v(65, 1, 5), v(65, 1, 7)], "Jude 5, 7"],
    [[v(19, 23, 1), v(19, 24, 1)], "Psalms 23:1; 24:1"],
  ])("writes %j as %s", (verses, text) => {
    expect(formatVerseSet(verses)).toBe(text);
  });

  it("writes a whole psalm as its verses, in the singular", () => {
    const psalm = Array.from({ length: 6 }, (_, index) => v(19, 23, index + 1));
    expect(formatVerseSet(psalm)).toBe("Psalm 23:1–6");
  });

  it("writes the same thing whatever order the verses came in", () => {
    expect(formatVerseSet([v(45, 6, 23), v(45, 3, 23), v(45, 3, 10)])).toBe(
      "Romans 3:10, 23; 6:23",
    );
  });

  it("writes nothing for nothing", () => {
    expect(formatVerseSet([])).toBe("");
  });
});

describe("parseVerseSet", () => {
  const read = (text: string) => {
    const result = parseVerseSet(text);
    return result.ok ? formatVerseSet(result.verses) : result.message;
  };

  it.each([
    ["John 3:16", "John 3:16"],
    ["john 3:16-18", "John 3:16–18"],
    ["Romans 3:10, 23; 6:23", "Romans 3:10, 23; 6:23"],
    ["Romans 3:10,23;6:23", "Romans 3:10, 23; 6:23"],
    ["John 3:16; Romans 6:23", "John 3:16; Romans 6:23"],
    ["John 3:3, 5–6, 8", "John 3:3, 5–6, 8"],
    ["Jude 5, 7", "Jude 5, 7"],
    ["Psalm 23", "Psalm 23:1–6"],
    ["1 John 1:9; 2:1", "1 John 1:9; 2:1"],
    ["Romans 6:23; 3:23", "Romans 3:23; 6:23"],
  ])("reads %s", (typed, written) => {
    expect(read(typed)).toBe(written);
  });

  it("reads back everything formatVerseSet writes", () => {
    for (const verses of [
      john(16),
      john(3, 5, 6, 8),
      [v(45, 3, 10), v(45, 3, 23), v(45, 6, 23)],
      [v(43, 3, 16), v(45, 6, 23)],
      [v(65, 1, 5), v(65, 1, 7)],
      [v(19, 23, 1), v(19, 24, 1)],
    ]) {
      const result = parseVerseSet(formatVerseSet(verses));
      expect(result).toEqual({ ok: true, verses: normaliseVerses(verses) });
    }
  });

  it("refuses a verse that does not exist", () => {
    expect(read("John 3:37")).toMatch(/no verse 37/);
    expect(read("John 3:16, 99")).toMatch(/no verse 99/);
    expect(read("John 3:16; 22:1")).toMatch(/no chapter 22/);
  });

  it("refuses a book it does not know, and nothing at all", () => {
    expect(parseVerseSet("Hezekiah 3:16").ok).toBe(false);
    expect(parseVerseSet("3:16").ok).toBe(false);
    expect(parseVerseSet("  ;  , ").ok).toBe(false);
    expect(parseVerseSet("").ok).toBe(false);
  });
});
