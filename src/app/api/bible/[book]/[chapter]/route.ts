import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { versesIn } from "@/features/scripture/books";
import { getChapter } from "@/features/scripture/passages";

const wholeNumber = /^[1-9]\d{0,2}$/;

/**
 * One chapter of the King James Bible, for signed-in accounts. The browser
 * asks for a chapter at a time and keeps what it has opened; the whole text
 * is never sent.
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
    const verses = await getChapter(book, chapter);
    return Response.json(
      { book, chapter, verses },
      // The text never changes, so the browser may keep it; `private` because access needs a session.
      { headers: { "Cache-Control": "private, max-age=86400" } },
    );
  } catch (error) {
    console.error("Bible chapter read failed:", describeDatabaseError(error));
    return Response.json({ message: "The passage could not be loaded." }, { status: 503 });
  }
}
