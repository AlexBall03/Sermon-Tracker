import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { requestedTranslation } from "@/features/preferences/resolve";
import { versesIn } from "@/features/scripture/books";
import { getChapter, getChapterTitle } from "@/features/scripture/passages";
import { translationParam } from "@/features/scripture/reader-location";
import { fallbackTranslation } from "@/features/scripture/translations";
import { getT } from "@/i18n/server";

const wholeNumber = /^[1-9]\d{0,2}$/;

/**
 * One chapter of the Bible, for signed-in accounts, in the translation the
 * address names (`?t=`) or, when it names none, the account's own. The
 * browser asks for a chapter at a time and keeps what it has opened; the
 * whole text is never sent. `title` is the psalm's title, where the chapter
 * has one.
 *
 * A translation that is not on offer (the Spanish text while an administrator
 * has Spanish switched off) is answered as a chapter that does not exist.
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
  const translation = requestedTranslation(
    new URL(request.url).searchParams.get(translationParam),
    await getPreferences(),
  );
  if (versesIn(book, chapter) === 0 || !translation) {
    return Response.json(
      { message: t.errors.noChapter },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [verses, title] = await Promise.all([
      getChapter(translation, book, chapter),
      // The verses are worth showing without their title, so this failure is not the chapter's.
      getChapterTitle(translation, book, chapter).catch((error) => {
        console.error("Psalm title read failed:", describeDatabaseError(error));
        return undefined;
      }),
    ]);
    // The text never changes, so the browser may keep it; `private` because access needs a
    // session. An answer that is missing its title is not kept, and neither is a text an
    // administrator can switch off: the browser must ask again to learn that it has been.
    const keep = title !== undefined && translation === fallbackTranslation;
    return Response.json(
      { translation, book, chapter, verses, title: title ?? null },
      { headers: { "Cache-Control": keep ? "private, max-age=86400" : "no-store" } },
    );
  } catch (error) {
    console.error("Bible chapter read failed:", describeDatabaseError(error));
    return Response.json({ message: t.errors.passageUnavailable }, { status: 503 });
  }
}
