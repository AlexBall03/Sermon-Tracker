import { describe, expect, it } from "vitest";

import { bibleBooks, chaptersIn, findBook, versesIn } from "./books";
import {
  countReferenceVerses,
  formatReference,
  parseReference,
  referenceSpans,
  scriptureReferenceSchema,
  type ScriptureReference,
} from "./reference";

const ref = (
  book: number,
  chapterStart: number,
  verseStart: number | null = null,
  verseEnd: number | null = null,
  chapterEnd: number | null = null,
): ScriptureReference => ({ book, chapterStart, verseStart, chapterEnd, verseEnd });

function parsed(input: string) {
  const result = parseReference(input);
  if (!result.ok) throw new Error(`${input}: ${result.message}`);
  return result.reference;
}

describe("books", () => {
  it("lists the 66 books with their real sizes", () => {
    expect(bibleBooks).toHaveLength(66);
    expect(bibleBooks[0].name).toBe("Genesis");
    expect(bibleBooks[65].name).toBe("Revelation");
    expect(chaptersIn(19)).toBe(150);
    expect(versesIn(19, 119)).toBe(176);
    expect(versesIn(43, 3)).toBe(36);
    expect(versesIn(67, 1)).toBe(0);
  });

  it("finds a book from names, abbreviations, and unambiguous beginnings", () => {
    for (const [typed, name] of [
      ["John", "John"],
      ["jn", "John"],
      ["1 Cor.", "1 Corinthians"],
      ["II Kings", "2 Kings"],
      ["First John", "1 John"],
      ["psalm", "Psalms"],
      ["Song of Songs", "Song of Solomon"],
      ["deut", "Deuteronomy"],
      ["Phil", "Philippians"],
      ["Phlm", "Philemon"],
      ["revelations", "Revelation"],
    ]) {
      expect(findBook(typed)?.name, typed).toBe(name);
    }
  });

  it("does not guess when the beginning fits more than one book", () => {
    expect(findBook("jud")).toBeUndefined();
    expect(findBook("j")).toBeUndefined();
    expect(findBook("Tobit")).toBeUndefined();
  });
});

describe("parseReference", () => {
  it("reads the usual ways of writing a reference", () => {
    expect(parsed("John 3:16")).toEqual(ref(43, 3, 16));
    expect(parsed("Romans 12:1-2")).toEqual(ref(45, 12, 1, 2));
    expect(parsed("Psalm 23")).toEqual(ref(19, 23));
    expect(parsed("1 cor 13:4–7")).toEqual(ref(46, 13, 4, 7));
    expect(parsed("  gen 1 - 2 ")).toEqual(ref(1, 1, null, null, 2));
    expect(parsed("John 3:16-4:2")).toEqual(ref(43, 3, 16, 2, 4));
    expect(parsed("Jn3.16")).toEqual(ref(43, 3, 16));
  });

  it("treats a lone number in a one-chapter book as a verse", () => {
    expect(parsed("Jude 5")).toEqual(ref(65, 1, 5));
    expect(parsed("Philemon 4-7")).toEqual(ref(57, 1, 4, 7));
    expect(parsed("Jude 1:5")).toEqual(ref(65, 1, 5));
    expect(parsed("Obadiah")).toEqual(ref(31, 1));
  });

  it("drops an end that repeats the start", () => {
    expect(parsed("John 3:16-16")).toEqual(ref(43, 3, 16));
    expect(parsed("John 3:1-3:5")).toEqual(ref(43, 3, 1, 5));
  });

  it("refuses what the King James Bible does not contain", () => {
    for (const [typed, reason] of [
      ["John 3:37", /36 verses/],
      ["Psalm 151", /150 chapters/],
      ["John 22", /21 chapters/],
      ["Jude 26", /25 verses/],
      ["Jude 2:1", /one chapter/],
      ["John 3:18-16", /end after it starts/],
      ["John 4-3", /end after it starts/],
      ["John 3-4:2", /starting verse/],
      ["John", /Add a chapter/],
      ["Hezekiah 3:16", /not recognised/],
      ["", /Type a reference/],
      ["John three", /not recognised/],
    ] as const) {
      const result = parseReference(typed);
      expect(result.ok, typed).toBe(false);
      if (!result.ok) expect(result.message, typed).toMatch(reason);
    }
  });
});

describe("formatReference", () => {
  it("writes a reference the way it is read", () => {
    expect(formatReference(ref(43, 3))).toBe("John 3");
    expect(formatReference(ref(43, 3, 16))).toBe("John 3:16");
    expect(formatReference(ref(43, 3, 16, 18))).toBe("John 3:16–18");
    expect(formatReference(ref(1, 1, null, null, 2))).toBe("Genesis 1–2");
    expect(formatReference(ref(43, 3, 16, 2, 4))).toBe("John 3:16–4:2");
    expect(formatReference(ref(19, 23))).toBe("Psalm 23");
    expect(formatReference(ref(19, 1, null, null, 2))).toBe("Psalms 1–2");
    expect(formatReference(ref(65, 1, 5))).toBe("Jude 5");
    expect(formatReference(ref(65, 1))).toBe("Jude");
  });

  it("round-trips through the parser", () => {
    for (const typed of ["John 3:16–18", "Genesis 1–2", "Psalm 23", "Jude 5", "John 3:16–4:2"]) {
      expect(formatReference(parsed(typed))).toBe(typed);
    }
  });
});

describe("referenceSpans", () => {
  it("gives the verses covered in each chapter", () => {
    expect(referenceSpans(ref(43, 3, 16))).toEqual([{ book: 43, chapter: 3, from: 16, to: 16 }]);
    expect(referenceSpans(ref(43, 3))).toEqual([{ book: 43, chapter: 3, from: 1, to: 36 }]);
    expect(referenceSpans(ref(43, 3, 16, 2, 4))).toEqual([
      { book: 43, chapter: 3, from: 16, to: 36 },
      { book: 43, chapter: 4, from: 1, to: 2 },
    ]);
    expect(countReferenceVerses(ref(1, 1, null, null, 2))).toBe(31 + 25);
  });
});

describe("scriptureReferenceSchema", () => {
  it("accepts real passages and rejects invented ones", () => {
    expect(scriptureReferenceSchema.safeParse(ref(43, 3, 16)).success).toBe(true);
    expect(scriptureReferenceSchema.safeParse(ref(43, 3, 37)).success).toBe(false);
    expect(scriptureReferenceSchema.safeParse(ref(67, 1)).success).toBe(false);
    expect(scriptureReferenceSchema.safeParse({ book: 43, chapterStart: "3" }).success).toBe(false);
  });
});
