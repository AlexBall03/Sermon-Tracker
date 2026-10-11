// @vitest-environment node
import { describe, expect, it } from "vitest";

import { verseCounts } from "../../src/features/scripture/versification";
import {
  checksum,
  committedChecksum,
  committedTitlesChecksum,
  countVerses,
  expected,
  psalmCount,
  psalmsBook,
  readDataset,
  readPsalmTitles,
  titleRows,
  titlesChecksum,
} from "./dataset.mjs";

const books = readDataset();
const titles = readPsalmTitles();

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

describe("the committed psalm titles", () => {
  const rows = titleRows(titles);

  it("are the 116 the edition prints, each on a real psalm, in order", () => {
    expect(rows).toHaveLength(expected.psalmTitles);
    expect(expected.psalmTitles).toBe(116);
    expect(books[psalmsBook - 1]).toHaveLength(psalmCount);
    for (const { psalm } of rows) {
      expect(Number.isInteger(psalm)).toBe(true);
      expect(psalm).toBeGreaterThanOrEqual(1);
      expect(psalm).toBeLessThanOrEqual(psalmCount);
    }
    expect(Object.keys(titles).map(Number)).toEqual(rows.map((row) => row.psalm));
  });

  it("are the recorded edition, unchanged", () => {
    expect(titlesChecksum(titles)).toBe(committedTitlesChecksum);
  });

  it("notice a changed, added, or removed title", () => {
    expect(titlesChecksum({ ...titles, 3: "A Psalm of Solomon." })).not.toBe(
      committedTitlesChecksum,
    );
    expect(titlesChecksum({ ...titles, 1: "A new title." })).not.toBe(committedTitlesChecksum);
    const { 3: removed, ...rest } = titles;
    expect(removed).toBeTruthy();
    expect(titlesChecksum(rest)).not.toBe(committedTitlesChecksum);
  });

  it("leave the psalms that have none without one", () => {
    for (const psalm of [1, 2, 10, 33, 43, 71, 91, 104, 119, 150]) {
      expect(titles[psalm]).toBeUndefined();
    }
  });

  it("read as the traditional titles", () => {
    expect(titles[3]).toBe("A Psalm of David, when he fled from Absalom his son.");
    expect(titles[23]).toBe("A Psalm of David.");
    expect(titles[90]).toBe("A Prayer of Moses the man of God.");
    expect(titles[120]).toBe("A Song of degrees.");
  });

  it("hold plain text with no markup left in it", () => {
    for (const { text } of rows) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/[\\|[\]¶]|\s{2}|strong=/);
    }
  });

  it("are no part of the verses, which are as they were", () => {
    // Verse 1 of a titled psalm begins with the psalm, not its title.
    expect(books[psalmsBook - 1][2][0]).toMatch(/^LORD, how are they increased/);
    for (const { psalm, text } of rows) {
      expect(books[psalmsBook - 1][psalm - 1][0].startsWith(text)).toBe(false);
    }
    expect(checksum(books)).toBe(committedChecksum);
    expect(countVerses(books)).toBe(expected.verses);
  });
});
