/**
 * Accented vowels are searched as plain ones, so "jehova" finds "Jehová" and
 * the other way about. The index in the schema and the query in
 * search-verses.ts fold the text with exactly these letters, and
 * `buildSearchQuery` folds what was typed. ñ is a letter of its own and is
 * left alone: "ano" is not "año".
 *
 * This file imports nothing, because the schema reads it and the migration
 * generator loads the schema outside the application.
 */
export const accentFold = { from: "áéíóúüÁÉÍÓÚÜ", to: "aeiouuAEIOUU" } as const;

export function foldAccents(text: string): string {
  return text.replace(
    /[áéíóúüÁÉÍÓÚÜ]/g,
    (letter) => accentFold.to[accentFold.from.indexOf(letter)],
  );
}
