import { and, asc, between, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { scriptureVerses } from "@/db/schema";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import {
  committedEditions,
  editionVersion,
  packageParts,
  type PackagePart,
} from "@/features/offline/bible/package";
import { getPreferences } from "@/features/preferences/current";
import { requestedTranslation } from "@/features/preferences/resolve";
import { psalmsBook } from "@/features/scripture/books";
import { readPsalmTitles } from "@/features/scripture/passages";
import { fallbackTranslation } from "@/features/scripture/translations";
import { verseCounts } from "@/features/scripture/versification";
import { getT } from "@/i18n/server";

const wholeNumber = /^\d{1,2}$/;

/**
 * One part of a whole translation (`packageParts`), for a signed-in account
 * to keep on its device and read offline (features/offline/bible). Only a
 * translation on offer to the account is sent: the Spanish text while an
 * administrator has Spanish switched off is answered as one that does not
 * exist. A part is sent whole or not at all; the device checks the whole
 * translation against its committed checksums before it reads any of it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ translation: string; part: string }> },
) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });
  const t = await getT("scripture");

  const { translation: named, part: partParam } = await params;
  const part = wholeNumber.test(partParam) ? Number(partParam) : -1;
  const range = packageParts[part];
  // An empty name would mean "the account's own" to `requestedTranslation`; here one must be named.
  const translation = named ? requestedTranslation(named, await getPreferences()) : null;
  if (!range || !translation) {
    return Response.json(
      { message: t.errors.noChapter },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const db = getDb();
    const hasPsalms = range.first <= psalmsBook && psalmsBook <= range.last;
    const [rows, titles] = await Promise.all([
      db
        .select({
          book: scriptureVerses.book,
          chapter: scriptureVerses.chapter,
          verse: scriptureVerses.verse,
          text: scriptureVerses.text,
        })
        .from(scriptureVerses)
        .where(
          and(
            eq(scriptureVerses.translation, translation),
            between(scriptureVerses.book, range.first, range.last),
          ),
        )
        .orderBy(
          asc(scriptureVerses.book),
          asc(scriptureVerses.chapter),
          asc(scriptureVerses.verse),
        ),
      hasPsalms ? readPsalmTitles(db, translation) : Promise.resolve({}),
    ]);

    const books: PackagePart["books"] = [];
    for (let book = range.first; book <= range.last; book++) {
      books.push({ book, chapters: verseCounts[book - 1].map(() => []) });
    }
    for (const row of rows) {
      const verses = books[row.book - range.first]?.chapters[row.chapter - 1];
      if (!verses || row.verse !== verses.length + 1) throw new Error("The text is out of order.");
      verses.push(row.text);
    }
    const whole = books.every(({ book, chapters }) =>
      chapters.every((verses, index) => verses.length === verseCounts[book - 1][index]),
    );
    if (!whole) throw new Error(`The text of ${translation} is incomplete.`);

    const body: PackagePart = {
      translation,
      version: editionVersion(committedEditions[translation]),
      part,
      books,
      titles: titles as Record<string, string>,
    };
    // As for a chapter: kept by the browser only for the text that cannot be switched off.
    return Response.json(body, {
      headers: {
        "Cache-Control":
          translation === fallbackTranslation ? "private, max-age=86400" : "no-store",
      },
    });
  } catch (error) {
    console.error("Bible package read failed:", describeDatabaseError(error));
    return Response.json({ message: t.errors.passageUnavailable }, { status: 503 });
  }
}
