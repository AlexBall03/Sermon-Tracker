import { describe, expect, it } from "vitest";

import * as english from "./dictionaries/en";
import * as spanish from "./dictionaries/es";
import { dictionary, formatNumber, type Feature } from "./index";
import { defaultLocale, isLocale, locales } from "./locales";

type Branch = Record<string, unknown>;
const isBranch = (value: unknown): value is Branch =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every entry of a dictionary, by its path: "reader.goToVerse". */
function entries(branch: Branch, prefix = ""): [string, unknown][] {
  return Object.entries(branch).flatMap(([key, value]) =>
    isBranch(value) ? entries(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  );
}

const features = Object.keys(english) as Feature[];

describe("the dictionaries", () => {
  it("are English and Spanish, with English the fallback", () => {
    expect(locales).toEqual(["en", "es"]);
    expect(defaultLocale).toBe("en");
    expect(isLocale("es")).toBe(true);
    for (const value of ["fr", "EN", "", null, 1]) expect(isLocale(value)).toBe(false);
  });

  it("have a Spanish file for every feature English has", () => {
    expect(Object.keys(spanish).sort()).toEqual([...features].sort());
  });

  it.each(features)("say in Spanish only what English says: %s", (feature) => {
    const known = new Map(entries(english[feature] as Branch));
    for (const [path, value] of entries(spanish[feature] as Branch)) {
      // A key English does not have would never be shown.
      expect(known.has(path), `${feature}.${path} is not in English`).toBe(true);
      // And a string must not stand where English has a function, or the reverse.
      expect(typeof value, `${feature}.${path}`).toBe(typeof known.get(path));
    }
  });

  it.each(features)("leave nothing of %s untranslated", (feature) => {
    const translated = new Set(entries(spanish[feature] as Branch).map(([path]) => path));
    const missing = entries(english[feature] as Branch)
      .map(([path]) => path)
      .filter((path) => !translated.has(path));
    expect(missing).toEqual([]);
  });

  it("show English where Spanish has nothing, and for a language that is not one", () => {
    // Every entry is there in Spanish, in one language or the other.
    for (const feature of features) {
      const merged = new Map(entries(dictionary("es", feature) as Branch));
      for (const [path, value] of entries(english[feature] as Branch)) {
        expect(merged.has(path), `${feature}.${path}`).toBe(true);
        expect(typeof merged.get(path)).toBe(typeof value);
      }
    }
    expect(dictionary("fr" as never, "navigation")).toBe(dictionary("en", "navigation"));
  });

  it("read as each language", () => {
    expect(dictionary("en", "navigation").library).toBe("Library");
    expect(dictionary("es", "navigation").library).toBe("Biblioteca");
    expect(dictionary("en", "scripture").reader.goToVerse).toBe("Go to verse");
    expect(dictionary("es", "scripture").reader.goToVerse).toBe("Ir al versículo");
  });

  it("count and name in each language's own grammar", () => {
    const en = dictionary("en", "library");
    const es = dictionary("es", "library");
    expect(en.count(1, "1", false)).toBe("1 idea");
    expect(en.count(12, "12", true)).toBe("12 matching ideas");
    expect(es.count(1, "1", true)).toBe("1 idea que coincide");
    expect(es.count(12, "12", true)).toBe("12 ideas que coinciden");
    expect(dictionary("en", "scripture").reader.elsewhere(3, 1, "KJV")).toBe(
      "3 highlights and 1 favorite here in the KJV",
    );
    expect(dictionary("es", "scripture").reader.elsewhere(1, 0, "KJV")).toBe(
      "1 resaltado aquí en la KJV",
    );
    expect(dictionary("es", "scripture").marks.severalColors(["yellow", "blue", "red"])).toBe(
      "Estos versículos están en amarillo, azul y rojo. Un color aquí los reemplaza a todos.",
    );
  });

  it("write numbers as each language does", () => {
    expect(formatNumber("en", 31102)).toBe("31,102");
    expect(formatNumber("es", 31102)).toMatch(/^31[.   ]?102$/);
  });

  it("never show the revision year of the Spanish Bible", () => {
    for (const locale of locales) {
      for (const feature of features) {
        for (const [path, value] of entries(dictionary(locale, feature) as Branch)) {
          if (typeof value === "string") expect(value, `${feature}.${path}`).not.toMatch(/2023/);
        }
      }
    }
  });
});
