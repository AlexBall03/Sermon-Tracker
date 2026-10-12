// @vitest-environment node
import { describe, expect, it } from "vitest";

import { verseCounts } from "../../src/features/scripture/versification";
import {
  checksum,
  committedChecksum,
  committedTitlesChecksum,
  countVerses,
  datasets,
  expected,
  psalmCount,
  psalmsBook,
  readDataset,
  readPsalmTitles,
  rvgSource,
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

describe("the committed Reina-Valera Gómez dataset", () => {
  const rvg = readDataset(datasets.rvg.path);
  const rvgTitles = readPsalmTitles(datasets.rvg.titlesPath);
  const rows = titleRows(rvgTitles);

  it("is the complete 66-book canon", () => {
    expect(rvg).toHaveLength(expected.books);
    expect(rvg.reduce((total, chapters) => total + chapters.length, 0)).toBe(expected.chapters);
    expect(countVerses(rvg)).toBe(expected.verses);
  });

  it("is the recorded edition, unchanged, from the recorded file of the publisher", () => {
    expect(checksum(rvg)).toBe(datasets.rvg.checksum);
    expect(titlesChecksum(rvgTitles)).toBe(datasets.rvg.titlesChecksum);
    // The revision is in the publisher's own file name, and the file is pinned by its hash.
    expect(rvgSource.url).toBe("https://www.reinavaleragomez.com/audio/RVG23-RLI-20251028.txt.zip");
    expect(rvgSource.file).toMatch(/^RVG23-/);
    expect(rvgSource.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rvgSource.textSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is not the King James text under another name", () => {
    expect(datasets.rvg.checksum).not.toBe(datasets.kjv.checksum);
    expect(datasets.rvg.name).not.toBe(datasets.kjv.name);
    expect(datasets.rvg.titlesName).not.toBe(datasets.kjv.titlesName);
  });

  it("numbers every chapter and verse as the King James does, so one reference serves both", () => {
    expect(rvg.map((chapters) => chapters.map((verses) => verses.length))).toEqual(verseCounts);
  });

  it("holds plain verse text with no marking left in it", () => {
    for (const text of rvg.flat(2)) {
      expect(text).toBe(text.trim());
      expect(text).toBe(text.normalize("NFC"));
      expect(text).not.toMatch(/[\\|[\]<>«»¶]|\s{2}/);
    }
  });

  it("reads as the Reina-Valera Gómez at well-known verses", () => {
    expect(rvg[0][0][0]).toBe("En el principio creó Dios el cielo y la tierra.");
    expect(rvg[18][22][0]).toBe("Jehová es mi pastor; nada me faltará.");
    expect(rvg[42][2][15]).toBe(
      "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en Él cree no se pierda, mas tenga vida eterna.",
    );
    expect(rvg[61][4][6]).toBe(
      "Porque tres son los que dan testimonio en el cielo, el Padre, el Verbo y el Espíritu Santo; y estos tres son uno.",
    );
    expect(rvg[65][21][20]).toBe(
      "La gracia de nuestro Señor Jesucristo sea con todos vosotros. Amén.",
    );
  });

  it("opens every book on that book's own first verse", () => {
    // The publisher's file has no references: a slip of one line would show here.
    expect(rvg[1][0][0]).toMatch(/^Estos son los nombres de los hijos de Israel/);
    expect(rvg[39][0][0]).toMatch(/^El libro de la generación de Jesucristo/);
    expect(rvg[63][0][0]).toMatch(/^El anciano al muy amado Gayo/);
    expect(rvg[64][0][0]).toMatch(/^Judas, siervo de Jesucristo/);
    expect(rvg[65][0][0]).toMatch(/^La revelación de Jesucristo/);
  });

  it("keeps the psalm titles apart from the verses", () => {
    expect(rows).toHaveLength(datasets.rvg.psalmTitles);
    expect(datasets.rvg.psalmTitles).toBe(123);
    expect(rvgTitles[3]).toBe("Salmo de David, cuando huía de Absalón su hijo");
    expect(rvgTitles[23]).toBe("Salmo de David");
    expect(rvgTitles[119]).toBeUndefined();
    expect(rvg[psalmsBook - 1][2][0]).toMatch(/^¡Oh Jehová, cuánto se han multiplicado/);
    for (const { psalm, text } of rows) {
      expect(psalm).toBeGreaterThanOrEqual(1);
      expect(psalm).toBeLessThanOrEqual(psalmCount);
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/[[\]<>«»]|\s{2}/);
    }
    // Psalms 148 to 150 are headed "Alabad a Jehová" and also begin with those words:
    // the title was lifted off once, and the verse still says what the publisher's does.
    expect(rvgTitles[148]).toBe("Alabad a Jehová");
    expect(rvg[psalmsBook - 1][147][0]).toBe(
      "Alabad a Jehová desde los cielos; alabadle en las alturas.",
    );
    // Psalm 145's heading is part of verse 1 in the publisher's file, and stays there.
    expect(rvgTitles[145]).toBeUndefined();
    expect(rvg[psalmsBook - 1][144][0]).toMatch(/^Salmo de alabanza: de David\. Te exaltaré/);
  });

  it("leaves the Hebrew letter headings of Psalm 119 out of its verses", () => {
    const psalm = rvg[psalmsBook - 1][118];
    expect(psalm[0]).toBe(
      "Bienaventurados los perfectos de camino; los que andan en la ley de Jehová.",
    );
    expect(psalm[72]).toMatch(/^Tus manos me hicieron/);
    for (let verse = 0; verse < psalm.length; verse += 8) {
      expect(psalm[verse]).not.toMatch(/^[A-ZÁÉÍÓÚÑ]+\./);
    }
  });
});
