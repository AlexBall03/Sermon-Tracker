import { bibleBooks, oldTestamentBooks } from "./books";

/**
 * Word search over the King James text. What someone types is turned into a
 * PostgreSQL text-search query here, by hand, so that only letters and digits
 * ever reach it:
 *
 *   grace mercy        verses with both words
 *   "living water"     the exact phrase
 *   faith OR hope      either
 *   -law               without the word (also -"works of the law")
 *   lov*               words beginning with "lov": love, loved, loveth
 *
 * Words are matched exactly as written, ignoring case: this is a concordance,
 * so "love" does not find "loved" unless a * asks for it.
 */

/** What the search understands, by example, for the help beside a search box. */
export const searchTips = [
  ["grace mercy", "verses with both words"],
  ['"living water"', "the exact phrase"],
  ["faith OR hope", "either word"],
  ["shepherd -sheep", "the first without the second"],
  ["lov*", "love, loved, loveth, lovingkindness"],
] as const;

export const searchLimits = { text: 200, terms: 16, pageSize: 40 } as const;

/** Where to look: everything, one testament, or one book (its number). */
export type SearchScope = "all" | "old" | "new" | number;

export type SearchHit = { book: number; chapter: number; verse: number; text: string };
export type SearchPage = { total: number; hits: SearchHit[] };

/** Marks the matched words in a hit's text. The dataset contains no brackets. */
export const hitStart = "[[";
export const hitEnd = "]]";

export type SearchQuery = { ok: true; tsquery: string } | { ok: false; message: string };

const term = /(-?)"([^"]*)"|(-?)(\S+)/g;

/** One word or phrase as a tsquery fragment, or null when nothing searchable is left. */
function fragment(text: string): string | null {
  const wildcard = text.endsWith("*");
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return null;
  // A lone letter and a star would match a large part of the Bible.
  if (wildcard && words.at(-1)!.length < 2) return null;
  const parts = words.map((word, index) =>
    wildcard && index === words.length - 1 ? `${word}:*` : word,
  );
  return parts.length === 1 ? parts[0] : `(${parts.join(" <-> ")})`;
}

export function buildSearchQuery(input: string): SearchQuery {
  const text = input.trim().replace(/[“”]/g, '"');
  if (!text) return { ok: false, message: "Type a word or a phrase to search for." };
  if (text.length > searchLimits.text) {
    return { ok: false, message: "That search is too long. Try fewer words." };
  }

  // Alternatives separated by OR; within one, every term must match.
  const alternatives: string[][] = [[]];
  let positive = false;
  let count = 0;
  for (const match of text.matchAll(term)) {
    const quoted = match[2] !== undefined;
    const negated = (quoted ? match[1] : match[3]) === "-";
    const raw = quoted ? match[2] : match[4];
    if (!quoted && /^(?:OR|\|)$/.test(raw) && !negated) {
      if (alternatives.at(-1)!.length > 0) alternatives.push([]);
      continue;
    }
    const piece = fragment(quoted ? raw : raw.replace(/^-+/, ""));
    if (!piece) continue;
    if (++count > searchLimits.terms) {
      return { ok: false, message: "That search has too many words. Try fewer." };
    }
    if (!negated) positive = true;
    alternatives.at(-1)!.push(negated ? `!${piece}` : piece);
  }

  const groups = alternatives.filter((group) => group.length > 0);
  if (groups.length === 0) {
    return { ok: false, message: "Type a word or a phrase to search for." };
  }
  if (!positive) {
    return { ok: false, message: "Add a word to look for, as well as the ones to leave out." };
  }
  return { ok: true, tsquery: groups.map((group) => `(${group.join(" & ")})`).join(" | ") };
}

/** The scope a request names, or null when it is not one. */
export function parseScope(value: string | null): SearchScope | null {
  if (value === null || value === "" || value === "all") return "all";
  if (value === "old" || value === "new") return value;
  const book = /^[1-9]\d?$/.test(value) ? Number(value) : 0;
  return book >= 1 && book <= bibleBooks.length ? book : null;
}

/** The first and last book a scope covers. */
export function scopeBooks(scope: SearchScope): [first: number, last: number] {
  if (scope === "old") return [1, oldTestamentBooks];
  if (scope === "new") return [oldTestamentBooks + 1, bibleBooks.length];
  if (scope === "all") return [1, bibleBooks.length];
  return [scope, scope];
}

/** A hit's text as alternating plain and matched runs, starting with plain. */
export function splitHit(text: string): string[] {
  return text.split(/\[\[|\]\]/);
}
