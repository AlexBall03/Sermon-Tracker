import { describe, expect, it } from "vitest";

import { versesIn } from "./books";
import { formatReferences } from "./reference";
import {
  formatSelectionText,
  noSelection,
  selectedVerses,
  selectionReferences,
  selectVerses,
  toggleVerse,
  wholeChapter,
  type VerseSelection,
} from "./selection";

// John 3 has 36 verses.
const john3 = versesIn(43, 3);
const pick = (verses: number[], from: VerseSelection = noSelection) =>
  verses.reduce((selection, verse) => toggleVerse(selection, verse, john3), from);
const named = (selection: VerseSelection) =>
  formatReferences(selectionReferences(43, 3, selection));

describe("toggleVerse", () => {
  it("selects a verse and unselects it again", () => {
    const one = pick([16]);
    expect(one).toEqual({ kind: "verses", verses: [16] });
    expect(pick([16], one)).toEqual(noSelection);
  });

  it("keeps the verses in order, each once, however they were chosen", () => {
    expect(pick([8, 3, 6, 5])).toEqual({ kind: "verses", verses: [3, 5, 6, 8] });
    expect(selectVerses([8, 3, 3, 8, 5], john3)).toEqual({ kind: "verses", verses: [3, 5, 8] });
  });

  it("drops a verse the chapter does not have", () => {
    expect(selectVerses([0, 16, 37, 2.5, -1], john3)).toEqual({ kind: "verses", verses: [16] });
    expect(selectVerses([37], john3)).toEqual(noSelection);
  });

  it("takes one verse out of a whole chapter", () => {
    const rest = toggleVerse(wholeChapter, 2, 3);
    expect(rest).toEqual({ kind: "verses", verses: [1, 3] });
  });

  it("treats every verse chosen one by one as the chapter", () => {
    expect([1, 2, 3].reduce((s, verse) => toggleVerse(s, verse, 3), noSelection)).toEqual(
      wholeChapter,
    );
  });
});

describe("selectionReferences", () => {
  it("is nothing when nothing is selected: never the whole chapter", () => {
    expect(selectionReferences(43, 3, noSelection)).toEqual([]);
    expect(selectedVerses(noSelection, john3)).toEqual([]);
  });

  it("is one reference for one verse", () => {
    expect(selectionReferences(43, 3, pick([16]))).toEqual([
      { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null },
    ]);
  });

  it("joins neighbouring verses into one passage", () => {
    expect(named(pick([16, 17, 18]))).toBe("John 3:16–18");
    expect(selectionReferences(43, 3, pick([16, 17, 18]))).toHaveLength(1);
  });

  it("keeps verses that are apart as separate passages", () => {
    const references = selectionReferences(43, 3, pick([3, 5, 6, 8]));
    expect(references.map((reference) => formatReferences([reference]))).toEqual([
      "John 3:3",
      "John 3:5–6",
      "John 3:8",
    ]);
    expect(named(pick([3, 5, 6, 8]))).toBe("John 3:3, 5–6, 8");
  });

  it("is the one chapter reference for a whole chapter, not a list of verses", () => {
    expect(selectionReferences(43, 3, wholeChapter)).toEqual([
      { book: 43, chapterStart: 3, verseStart: null, chapterEnd: null, verseEnd: null },
    ]);
    expect(named(wholeChapter)).toBe("John 3");
    expect(selectedVerses(wholeChapter, john3)).toHaveLength(36);
  });
});

describe("formatSelectionText", () => {
  const verses = Array.from({ length: john3 }, (_, index) => `Verse ${index + 1} text.`);

  it("is empty for no selection", () => {
    expect(formatSelectionText([], verses, "KJV")).toBe("");
  });

  it("names the passage, then gives its verses, numbered", () => {
    expect(formatSelectionText(selectionReferences(43, 3, pick([16, 17])), verses, "KJV")).toBe(
      "John 3:16–17 (KJV)\n16 Verse 16 text.\n17 Verse 17 text.",
    );
  });

  it("sets the first verse directly under the reference, and every verse on its own line", () => {
    const text = formatSelectionText(selectionReferences(43, 3, pick([1, 2, 3])), verses, "KJV");
    expect(text.split("\n")).toEqual([
      "John 3:1–3 (KJV)",
      "1 Verse 1 text.",
      "2 Verse 2 text.",
      "3 Verse 3 text.",
    ]);
  });

  it("puts no dots where nothing was passed over", () => {
    const text = formatSelectionText(selectionReferences(43, 3, pick([1, 2, 3])), verses, "KJV");
    expect(text).not.toContain("...");
    expect(text).not.toContain("\n\n");
  });

  it("keeps separate passages apart, in order, with dots where verses were passed over", () => {
    const text = formatSelectionText(selectionReferences(43, 3, pick([8, 3, 6, 5])), verses, "KJV");
    expect(text).toBe(
      [
        "John 3:3, 5–6, 8 (KJV)",
        "3 Verse 3 text.",
        "...",
        "5 Verse 5 text.",
        "6 Verse 6 text.",
        "...",
        "8 Verse 8 text.",
      ].join("\n"),
    );
    expect(text).not.toContain("Verse 4 text.");
    expect(text).not.toContain("Verse 7 text.");
  });

  it("gives every verse of a whole chapter", () => {
    const text = formatSelectionText(selectionReferences(43, 3, wholeChapter), verses, "KJV");
    expect(text.split("\n")).toHaveLength(1 + john3);
    expect(text.startsWith("John 3 (KJV)\n1 Verse 1 text.")).toBe(true);
    expect(text.endsWith("36 Verse 36 text.")).toBe(true);
  });
});
