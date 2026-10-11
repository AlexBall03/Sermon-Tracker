import { Suspense } from "react";
import type { Metadata } from "next";

import { describeDatabaseError } from "@/db/types";
import { requireActiveUser } from "@/features/auth/access";
import {
  BibleReader,
  ReaderSidebarScript,
  type InitialChapter,
} from "@/features/scripture/components/bible-reader";
import { getChapter, getChapterTitle } from "@/features/scripture/passages";
import { parseReaderLocation, type ReaderSearchParams } from "@/features/scripture/reader-location";
import BibleLoading from "./loading";

export const metadata: Metadata = { title: "Bible" };

/** The chapter an address names, so a link arrives with its text. Never a reason to fail the page. */
async function chapterFor(
  params: ReaderSearchParams | undefined,
): Promise<InitialChapter | undefined> {
  const location = parseReaderLocation(params);
  if (!location) return undefined;
  const { book, chapter } = location;
  try {
    const [verses, title] = await Promise.all([
      getChapter(book, chapter),
      getChapterTitle(book, chapter),
    ]);
    return { book, chapter, text: { verses, title } };
  } catch (error) {
    // The reader asks again from the browser, and shows its own retry if that fails too.
    console.error("Bible page chapter read failed:", describeDatabaseError(error));
    return undefined;
  }
}

/**
 * The Bible, for reading. For active accounts, like every page in the shell.
 * The address says where it is open (features/scripture/reader-location.ts);
 * nothing in it is trusted beyond a book, a chapter, and a verse that exist.
 * The page sends the chapter the address names and the reader does the rest
 * in the browser, a chapter at a time.
 */
export default async function BiblePage({
  searchParams,
}: {
  searchParams?: Promise<ReaderSearchParams>;
} = {}) {
  await requireActiveUser();
  const initial = await chapterFor(await searchParams);

  return (
    <>
      <ReaderSidebarScript />
      {/* The reader follows the address in the browser, which needs a boundary under Cache Components. */}
      <Suspense fallback={<BibleLoading />}>
        <BibleReader initial={initial} />
      </Suspense>
    </>
  );
}
