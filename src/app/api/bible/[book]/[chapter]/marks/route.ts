import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { translation, versesIn } from "@/features/scripture/books";
import { getChapterMarks } from "@/features/scripture/saved/favorites";

const wholeNumber = /^[1-9]\d{0,2}$/;

/**
 * What the signed-in account has marked in one chapter: its highlights, and
 * the favorites that have a verse there. It is the account's own and is read
 * afresh every time, so unlike the chapter's text beside it, it is never
 * cached, by the server or by the browser.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ book: string; chapter: string }> },
) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });

  const { book: bookParam, chapter: chapterParam } = await params;
  const book = wholeNumber.test(bookParam) ? Number(bookParam) : 0;
  const chapter = wholeNumber.test(chapterParam) ? Number(chapterParam) : 0;
  if (versesIn(book, chapter) === 0) {
    return Response.json({ message: "There is no such chapter." }, { status: 404 });
  }

  try {
    const marks = await getChapterMarks(getDb(), actor.user.id, translation.id, book, chapter);
    return Response.json(marks, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chapter marks read failed:", describeDatabaseError(error));
    return Response.json(
      { message: "Your highlights could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
