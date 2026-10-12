import { describe, expect, it } from "vitest";

import { bibleBooks, booksIn, chapterBookName, findBook, getBook } from "./books";
import { offered, parseReaderLocation, readerHref } from "./reader-location";
import { formatReference, formatReferences, parseReference } from "./reference";
import { formatVerseSet, parseVerseSet } from "./saved/verse-set";
import { buildSearchQuery, foldAccents, searchTips } from "./search";
import { formatSelectionText } from "./selection";
import {
  availableTranslations,
  defaultTranslationFor,
  isTranslationId,
  otherTranslation,
  translationIds,
  translations,
} from "./translations";

const parse = (search: string) => parseReaderLocation(new URLSearchParams(search));

describe("the translations", () => {
  it("are the King James and the Reina-Valera Gómez, shown without a revision year", () => {
    expect(translationIds).toEqual(["kjv", "rvg"]);
    expect(translations.kjv).toMatchObject({ short: "KJV", language: "en" });
    expect(translations.rvg).toMatchObject({
      short: "RVG",
      name: "Reina-Valera Gómez",
      language: "es",
    });
    for (const { short, name } of Object.values(translations)) {
      expect(`${short} ${name}`).not.toMatch(/\d/);
    }
  });

  it("follow the interface language until one is chosen", () => {
    expect(defaultTranslationFor("en")).toBe("kjv");
    expect(defaultTranslationFor("es")).toBe("rvg");
  });

  it("offer only the King James while Spanish is switched off", () => {
    expect(availableTranslations(true)).toEqual(["kjv", "rvg"]);
    expect(availableTranslations(false)).toEqual(["kjv"]);
  });

  it("name the other one for a comparison, or the same when there is no other", () => {
    expect(otherTranslation("kjv", ["kjv", "rvg"])).toBe("rvg");
    expect(otherTranslation("rvg", ["kjv", "rvg"])).toBe("kjv");
    expect(otherTranslation("kjv", ["kjv"])).toBe("kjv");
  });

  it("are told from anything else", () => {
    expect(isTranslationId("rvg")).toBe(true);
    for (const value of ["RVG", "rvr1960", "", null, undefined, 1]) {
      expect(isTranslationId(value)).toBe(false);
    }
  });
});

describe("books in two languages", () => {
  it("are the same 66 books under the same numbers", () => {
    expect(booksIn("es")).toHaveLength(66);
    expect(booksIn("en")).toBe(bibleBooks);
    expect(getBook(1, "es")?.name).toBe("Génesis");
    expect(getBook(43, "es")?.name).toBe("Juan");
    expect(getBook(59, "es")?.name).toBe("Santiago");
    expect(getBook(66, "es")?.name).toBe("Apocalipsis");
    expect(getBook(43)?.name).toBe("John");
    booksIn("es").forEach((book, index) => expect(book.id).toBe(index + 1));
  });

  it("find a book from its Spanish name, with or without accents, whatever the interface", () => {
    for (const [typed, id] of [
      ["Génesis", 1],
      ["genesis", 1],
      ["Éxodo", 2],
      ["Salmos", 19],
      ["Salmo", 19],
      ["Cantares", 22],
      ["1 Reyes", 11],
      ["Primera de... no", 0],
      ["2 Crónicas", 14],
      ["Mateo", 40],
      ["Juan", 43],
      ["1 Juan", 62],
      ["Hechos", 44],
      ["Santiago", 59],
      ["Judas", 65],
      ["Apocalipsis", 66],
      ["Apoc", 66],
      ["Stg", 59],
    ] as const) {
      expect(findBook(typed)?.id ?? 0, typed).toBe(id);
    }
    // The book comes back named in the language asked for.
    expect(findBook("Juan")?.name).toBe("John");
    expect(findBook("John", "es")?.name).toBe("Juan");
  });

  it("read every English spelling as they were read before Spanish was added", () => {
    for (const book of bibleBooks) {
      for (const spelling of [book.name, book.short, ...book.aliases]) {
        expect(findBook(spelling)?.id, spelling).toBe(book.id);
      }
    }
    // A beginning that fits two books is still a question, not an answer.
    expect(findBook("jud")).toBeUndefined();
    expect(findBook("j")).toBeUndefined();
  });

  it("read every Spanish name as its own book", () => {
    for (const book of booksIn("es")) expect(findBook(book.name)?.id, book.name).toBe(book.id);
  });

  it("name one psalm in the singular in both", () => {
    expect(chapterBookName(19)).toBe("Psalm");
    expect(chapterBookName(19, "es")).toBe("Salmo");
    expect(chapterBookName(43, "es")).toBe("Juan");
  });
});

describe("a reference in two languages", () => {
  const john316 = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: 18 };

  it("is the same numbers however its book is named", () => {
    const english = parseReference("John 3:16-18");
    const spanish = parseReference("Juan 3:16-18");
    expect(english).toEqual({ ok: true, reference: john316 });
    expect(spanish).toEqual(english);
    expect(parseReference("Salmo 23")).toEqual(parseReference("Psalm 23"));
    expect(parseReference("1 Reyes 8:27")).toEqual(parseReference("1 Kings 8:27"));
    expect(parseReference("Génesis 1-2")).toEqual(parseReference("Genesis 1-2"));
    expect(parseReference("Judas 5")).toEqual(parseReference("Jude 5"));
  });

  it("is written in the language asked for", () => {
    expect(formatReference(john316)).toBe("John 3:16–18");
    expect(formatReference(john316, "es")).toBe("Juan 3:16–18");
    const psalm = {
      book: 19,
      chapterStart: 23,
      verseStart: null,
      chapterEnd: null,
      verseEnd: null,
    };
    expect(formatReference(psalm, "es")).toBe("Salmo 23");
    expect(formatReference({ ...psalm, chapterEnd: 24 }, "es")).toBe("Salmos 23–24");
    expect(
      formatReferences(
        [
          { ...john316, verseEnd: null },
          { ...john316, verseStart: 18, verseEnd: null },
        ],
        "es",
      ),
    ).toBe("Juan 3:16, 18");
  });

  it("says what is wrong with it in the language asked for", () => {
    const english = parseReference("John 3:99");
    const spanish = parseReference("Juan 3:99", "es");
    expect(english).toEqual({
      ok: false,
      message: "John 3 has 36 verses; there is no verse 99.",
    });
    expect(spanish).toEqual({
      ok: false,
      message: "Juan 3 tiene 36 versículos; no existe el versículo 99.",
    });
    expect(parseReference("Tobías 1", "es")).toMatchObject({ ok: false });
  });

  it("writes and reads a saved passage in its translation's language", () => {
    const verses = [
      { book: 45, chapter: 3, verse: 10 },
      { book: 45, chapter: 3, verse: 23 },
      { book: 45, chapter: 6, verse: 23 },
    ];
    expect(formatVerseSet(verses)).toBe("Romans 3:10, 23; 6:23");
    expect(formatVerseSet(verses, "es")).toBe("Romanos 3:10, 23; 6:23");
    expect(parseVerseSet("Romanos 3:10, 23; 6:23")).toEqual({ ok: true, verses });
    expect(parseVerseSet("Juan 3:16; Romanos 6:23")).toMatchObject({ ok: true });
  });

  it("copies text under the names of the translation it came from", () => {
    const text = formatSelectionText(
      [{ ...john316, verseEnd: null }],
      Array.from({ length: 36 }, (_, index) => `Versículo ${index + 1}`),
      "RVG",
      "es",
    );
    expect(text).toBe("Juan 3:16 (RVG)\n16 Versículo 16");
  });
});

describe("the reader's address with a translation", () => {
  it("reads a translation, and leaves it out when none is named", () => {
    expect(parse("book=43&chapter=3")).toEqual({ book: 43, chapter: 3, verse: null });
    expect(parse("book=43&chapter=3&t=rvg")).toEqual({
      book: 43,
      chapter: 3,
      verse: null,
      translation: "rvg",
    });
  });

  it.each(["t=RVG", "t=rvr1960", "t=", "t=1", "t=kjv%20", "t=constructor"])(
    "drops %s and keeps the place",
    (param) => {
      expect(parse(`book=43&chapter=3&verse=16&${param}`)).toEqual({
        book: 43,
        chapter: 3,
        verse: 16,
      });
    },
  );

  it("reads a second pane with a translation and a chapter of its own", () => {
    expect(parse("book=43&chapter=3&beside=rvg.43.3")?.beside).toEqual({
      translation: "rvg",
      book: 43,
      chapter: 3,
    });
    // The second pane need not be where the first is, or in another translation.
    expect(parse("book=43&chapter=3&beside=kjv.45.8")?.beside).toEqual({
      translation: "kjv",
      book: 45,
      chapter: 8,
    });
  });

  it.each([
    "beside=rvg",
    "beside=rvg.43",
    "beside=rvg.67.1",
    "beside=rvg.43.22",
    "beside=nvi.43.3",
    "beside=rvg.43.3.16",
    "beside=..",
    "beside=rvg.4x.3",
  ])("drops a second pane that names no real chapter: %s", (param) => {
    expect(parse(`book=43&chapter=3&${param}`)).toEqual({ book: 43, chapter: 3, verse: null });
  });

  it("writes one address per place, translation, and comparison, in a fixed order", () => {
    const location = {
      book: 43,
      chapter: 3,
      verse: 16,
      through: 18,
      idea: "11111111-1111-4111-8111-111111111111",
      translation: "rvg" as const,
      beside: { translation: "kjv" as const, book: 45, chapter: 8 },
    };
    const href = readerHref(location);
    expect(href).toBe(
      "/bible?book=43&chapter=3&verse=16&through=18&t=rvg&beside=kjv.45.8&idea=11111111-1111-4111-8111-111111111111",
    );
    expect(parse(href.split("?")[1])).toEqual(location);
    // Every combination of two translations is an address.
    for (const first of translationIds) {
      for (const second of translationIds) {
        const both = {
          book: 1,
          chapter: 1,
          verse: null,
          translation: first,
          beside: { translation: second, book: 1, chapter: 1 },
        };
        expect(parse(readerHref(both).split("?")[1])).toEqual(both);
      }
    }
  });

  it("takes out what is not on offer and keeps the place", () => {
    const location = parse("book=43&chapter=3&verse=16&t=rvg&beside=rvg.45.8")!;
    expect(offered(location, ["kjv", "rvg"])).toEqual(location);
    expect(offered(location, ["kjv"])).toEqual({ book: 43, chapter: 3, verse: 16 });
    // A King James pane beside the reader survives Spanish being switched off.
    expect(offered(parse("book=43&chapter=3&t=rvg&beside=kjv.45.8")!, ["kjv"])).toEqual({
      book: 43,
      chapter: 3,
      verse: null,
      beside: { translation: "kjv", book: 45, chapter: 8 },
    });
  });
});

describe("searching Spanish text", () => {
  it("folds accented vowels and leaves ñ alone", () => {
    expect(foldAccents("Jehová está aquí")).toBe("Jehova esta aqui");
    expect(foldAccents("ÁRBOL pingüino")).toBe("ARBOL pinguino");
    expect(foldAccents("año señor")).toBe("año señor");
  });

  it("builds the same query with or without the accents typed", () => {
    expect(buildSearchQuery("Jehová")).toEqual(buildSearchQuery("jehova"));
    expect(buildSearchQuery("misericordia Señor")).toEqual({
      ok: true,
      tsquery: "(misericordia & señor)",
    });
    expect(buildSearchQuery("fe O esperanza")).toEqual(buildSearchQuery("fe OR esperanza"));
    expect(buildSearchQuery("«agua viva»")).toEqual(buildSearchQuery('"agua viva"'));
  });

  it("says what is wrong in the language asked for", () => {
    expect(buildSearchQuery("", "es")).toEqual({
      ok: false,
      message: "Escribe una palabra o una frase para buscar.",
    });
    expect(buildSearchQuery("")).toEqual({
      ok: false,
      message: "Type a word or a phrase to search for.",
    });
  });

  it("gives examples in the language of the text, explained in the language of the interface", () => {
    expect(searchTips("en")[0]).toEqual(["grace mercy", "verses with both words"]);
    expect(searchTips("es", "en")[0]).toEqual(["gracia misericordia", "verses with both words"]);
    expect(searchTips("es", "es")[0]).toEqual([
      "gracia misericordia",
      "versículos con ambas palabras",
    ]);
  });
});
