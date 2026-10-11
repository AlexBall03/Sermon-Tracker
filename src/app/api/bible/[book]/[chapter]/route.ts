import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { versesIn } from "@/features/scripture/books";
import { getChapter, getChapterTitle } from "@/features/scripture/passages";

const wholeNumber = /^[1-9]\d{0,2}$/;

/**
 * One chapter of the King James Bible, for signed-in accounts. The browser
 * asks for a chapter at a time and keeps what it has opened; the whole text
 * is never sent. `title` is the psalm's title, where the chapter has one.
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
    const [verses, title] = await Promise.all([
      getChapter(book, chapter),
      // The verses are worth showing without their title, so this failure is not the chapter's.
      getChapterTitle(book, chapter).catch((error) => {
        console.error("Psalm title read failed:", describeDatabaseError(error));
        return undefined;
      }),
    ]);
    return Response.json(
      { book, chapter, verses, title: title ?? null },
      // The text never changes, so the browser may keep it; `private` because access needs a
      // session. An answer that is missing its title is not kept.
      { headers: { "Cache-Control": title === undefined ? "no-store" : "private, max-age=86400" } },
    );
  } catch (error) {
    console.error("Bible chapter read failed:", describeDatabaseError(error));
    return Response.json({ message: "The passage could not be loaded." }, { status: 503 });
  }
}
