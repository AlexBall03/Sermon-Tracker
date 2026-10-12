import { Suspense } from "react";
import type { Metadata } from "next";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { requireActiveUser } from "@/features/auth/access";
import { getIdea } from "@/features/ideas/ideas";
import { getPreferences } from "@/features/preferences/current";
import type { Preferences } from "@/features/preferences/resolve";
import {
  BibleReader,
  ReaderSidebarScript,
  type InitialChapter,
  type ReaderOrigin,
} from "@/features/scripture/components/bible-reader";
import { getChapter, getChapterTitle } from "@/features/scripture/passages";
import {
  offered,
  parseReaderLocation,
  type ReaderSearchParams,
} from "@/features/scripture/reader-location";
import { getChapterMarks } from "@/features/scripture/saved/favorites";
import { getT } from "@/i18n/server";
import BibleLoading from "./loading";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("scripture")).reader.bible };
}

/**
 * The chapter an address names, so a link arrives with its text, in the
 * translation the address names where that is on offer and the account's own
 * otherwise. Never a reason to fail the page.
 */
async function chapterFor(
  params: ReaderSearchParams | undefined,
  ownerId: string,
  preferences: Preferences,
): Promise<InitialChapter | undefined> {
  const named = parseReaderLocation(params);
  if (!named) return undefined;
  // A translation that is switched off is read as the account's own, here as in the reader.
  const location = offered(named, preferences.translations);
  const translation = location.translation ?? preferences.translation;
  const { book, chapter } = location;
  try {
    const [verses, title, marks] = await Promise.all([
      getChapter(translation, book, chapter),
      getChapterTitle(translation, book, chapter),
      // The reader's own highlights and favorites here, read for this request and never
      // cached. The text is worth sending without them: the reader asks again itself.
      getChapterMarks(getDb(), ownerId, translation, book, chapter, preferences.translations).catch(
        (error) => {
          console.error("Bible page marks read failed:", describeDatabaseError(error));
          return undefined;
        },
      ),
    ]);
    return { translation, book, chapter, text: { verses, title }, marks };
  } catch (error) {
    // The reader asks again from the browser, and shows its own retry if that fails too.
    console.error("Bible page chapter read failed:", describeDatabaseError(error));
    return undefined;
  }
}

/**
 * The idea the address says the reader was opened from, if it is this
 * account's. One that is missing or someone else's is simply not offered as a
 * way back: the address is not trusted to name it, and nothing is said.
 */
async function originFor(
  params: ReaderSearchParams | undefined,
  ownerId: string,
): Promise<ReaderOrigin | undefined> {
  const id = parseReaderLocation(params)?.idea;
  if (!id) return undefined;
  try {
    const idea = await getIdea(getDb(), ownerId, id);
    return idea ? { id: idea.id, title: idea.title } : undefined;
  } catch (error) {
    console.error("Bible page origin read failed:", describeDatabaseError(error));
    return undefined;
  }
}

/**
 * The Bible, for reading. For active accounts, like every page in the shell.
 * The address says where it is open and in which translation
 * (features/scripture/reader-location.ts); nothing in it is trusted beyond a
 * book, a chapter, and a verse that exist, and a translation that is on
 * offer. The page sends the chapter the address names and the reader does the
 * rest in the browser, a chapter at a time.
 */
export default async function BiblePage({
  searchParams,
}: {
  searchParams?: Promise<ReaderSearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const [params, preferences] = await Promise.all([searchParams, getPreferences()]);
  const [initial, origin] = await Promise.all([
    chapterFor(params, user.id, preferences),
    originFor(params, user.id),
  ]);

  return (
    <>
      <ReaderSidebarScript />
      {/* The reader follows the address in the browser, which needs a boundary under Cache Components. */}
      <Suspense fallback={<BibleLoading />}>
        <BibleReader initial={initial} origin={origin} />
      </Suspense>
    </>
  );
}
