import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { requestedTranslation } from "@/features/preferences/resolve";
import { versesIn } from "@/features/scripture/books";
import { translationParam } from "@/features/scripture/reader-location";
import { getChapterMarks } from "@/features/scripture/saved/favorites";
import { getT } from "@/i18n/server";

const wholeNumber = /^[1-9]\d{0,2}$/;

/**
 * What the signed-in account has marked in one chapter of one translation
 * (`?t=`, or the account's own): its highlights, the favorites that have a
 * verse there, and how many marks it has in the same chapter of the other
 * translations on offer. It is the account's own and is read afresh every
 * time, so unlike the chapter's text beside it, it is never cached, by the
 * server or by the browser.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ book: string; chapter: string }> },
) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });
  const t = await getT("scripture");

  const { book: bookParam, chapter: chapterParam } = await params;
  const book = wholeNumber.test(bookParam) ? Number(bookParam) : 0;
  const chapter = wholeNumber.test(chapterParam) ? Number(chapterParam) : 0;
  const preferences = await getPreferences();
  const translation = requestedTranslation(
    new URL(request.url).searchParams.get(translationParam),
    preferences,
  );
  if (versesIn(book, chapter) === 0 || !translation) {
    return Response.json(
      { message: t.errors.noChapter },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const marks = await getChapterMarks(
      getDb(),
      actor.user.id,
      translation,
      book,
      chapter,
      preferences.translations,
    );
    return Response.json(marks, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chapter marks read failed:", describeDatabaseError(error));
    return Response.json(
      { message: t.errors.marksUnavailable },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
