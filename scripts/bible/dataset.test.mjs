// @vitest-environment node
import { describe, expect, it } from "vitest";

import { verseCounts } from "../../src/features/scripture/versification";
import { checksum, committedChecksum, countVerses, expected, readDataset } from "./dataset.mjs";

const books = readDataset();

describe("the committed King James dataset", () => {
  it("is the complete 66-book canon", () => {
    expect(books).toHaveLength(expected.books);
    expect(books.reduce((total, chapters) => total + chapters.length, 0)).toBe(expected.chapters);
    expect(countVerses(books)).toBe(expected.verses);
  });

  it("is the recorded edition, unchanged", () => {
    expect(checksum(books)).toBe(committedChecksum);
  });

  it("matches the verse counts the application validates against", () => {
    expect(books.map((chapters) => chapters.map((verses) => verses.length))).toEqual(verseCounts);
  });

  it("holds plain verse text with no markup left in it", () => {
    for (const text of books.flat(2)) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/[\\|[\]¶]|\s{2}|strong=/);
    }
  });

  it("reads as the traditional text at well-known verses", () => {
    expect(books[0][0][0]).toBe("In the beginning God created the heaven and the earth.");
    expect(books[18][22][0]).toBe("The LORD is my shepherd; I shall not want.");
    expect(books[42][2][15]).toBe(
      "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    );
    expect(books[44][11].slice(0, 2)).toHaveLength(2);
    expect(books[65][21][20]).toBe("The grace of our Lord Jesus Christ be with you all. Amen.");
  });
});
