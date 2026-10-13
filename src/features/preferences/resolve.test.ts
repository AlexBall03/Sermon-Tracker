import { describe, expect, it } from "vitest";

import { requestedTranslation, resolvePreferences } from "./resolve";

describe("resolvePreferences", () => {
  it("reads an English interface in the King James until a translation is chosen", () => {
    const resolved = resolvePreferences({ locale: "en", bibleTranslation: null }, true);
    expect(resolved).toMatchObject({ locale: "en", translation: "kjv" });
    expect(resolved.translations).toEqual(["kjv", "rvg"]);
  });

  it("reads a Spanish interface in the Reina-Valera Gómez until a translation is chosen", () => {
    expect(resolvePreferences({ locale: "es", bibleTranslation: null }, true)).toMatchObject({
      locale: "es",
      translation: "rvg",
    });
  });

  it("keeps the two apart: either interface language with either translation", () => {
    for (const locale of ["en", "es"] as const) {
      for (const bibleTranslation of ["kjv", "rvg"] as const) {
        expect(resolvePreferences({ locale, bibleTranslation }, true)).toMatchObject({
          locale,
          translation: bibleTranslation,
        });
      }
    }
  });

  it("does not move a chosen translation when the interface language changes", () => {
    const chosen = { bibleTranslation: "kjv" as const };
    expect(resolvePreferences({ ...chosen, locale: "en" }, true).translation).toBe("kjv");
    expect(resolvePreferences({ ...chosen, locale: "es" }, true).translation).toBe("kjv");
    // One that was never chosen follows the language.
    expect(resolvePreferences({ locale: "en", bibleTranslation: null }, true).translation).toBe(
      "kjv",
    );
    expect(resolvePreferences({ locale: "es", bibleTranslation: null }, true).translation).toBe(
      "rvg",
    );
  });

  it("falls back to English and the King James while Spanish is switched off", () => {
    for (const stored of [
      { locale: "es" as const, bibleTranslation: null },
      { locale: "es" as const, bibleTranslation: "rvg" as const },
      { locale: "en" as const, bibleTranslation: "rvg" as const },
    ]) {
      const resolved = resolvePreferences(stored, false);
      expect(resolved).toMatchObject({ locale: "en", translation: "kjv", spanishEnabled: false });
      expect(resolved.translations).toEqual(["kjv"]);
    }
  });

  it("changes nothing that is stored, so switching Spanish back on restores every choice", () => {
    const stored = { locale: "es" as const, bibleTranslation: "rvg" as const };
    expect(resolvePreferences(stored, false).stored).toEqual(stored);
    expect(resolvePreferences(stored, true)).toMatchObject({ locale: "es", translation: "rvg" });
    expect(stored).toEqual({ locale: "es", bibleTranslation: "rvg" });
  });
});

describe("attending preaching class", () => {
  it("is as it was saved, whatever the language and whether Spanish is on", () => {
    const stored = { locale: "es" as const, bibleTranslation: null };
    for (const spanishEnabled of [true, false]) {
      expect(resolvePreferences(stored, spanishEnabled).attendsPreachingClass).toBe(false);
      expect(
        resolvePreferences({ ...stored, attendsPreachingClass: true }, spanishEnabled)
          .attendsPreachingClass,
      ).toBe(true);
    }
  });
});

describe("requestedTranslation", () => {
  const both = resolvePreferences({ locale: "es", bibleTranslation: null }, true);
  const englishOnly = resolvePreferences({ locale: "es", bibleTranslation: "rvg" }, false);

  it("is the account's own when the request names none", () => {
    expect(requestedTranslation(null, both)).toBe("rvg");
    expect(requestedTranslation(undefined, both)).toBe("rvg");
    expect(requestedTranslation("", both)).toBe("rvg");
    expect(requestedTranslation(null, englishOnly)).toBe("kjv");
  });

  it("is the one named, when that is on offer", () => {
    expect(requestedTranslation("kjv", both)).toBe("kjv");
    expect(requestedTranslation("rvg", both)).toBe("rvg");
  });

  it("is nothing for a translation that is switched off, or is not one at all", () => {
    expect(requestedTranslation("rvg", englishOnly)).toBeNull();
    expect(requestedTranslation("kjv", englishOnly)).toBe("kjv");
    for (const name of ["rv1960", "RVG", "kjv ", "constructor", "1"]) {
      expect(requestedTranslation(name, both)).toBeNull();
    }
  });
});
