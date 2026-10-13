import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import {
  continueWorking,
  recentIdeas,
  revisitIdeas,
  workspaceCounts,
} from "@/features/ideas/ideas";
import { outlinesForSermons } from "@/features/outlines/outlines";
import { listContexts } from "@/features/preaching/contexts";
import { searchHistory } from "@/features/preaching/occurrences";
import { defaultHistoryQuery } from "@/features/preaching/schemas";
import { listVenues } from "@/features/preaching/venues";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("dashboard")).metaTitle };
}

/** How many of the latest ideas the dashboard lists; the library has the rest. */
const recentCount = 5;

/** How many of the latest occasions it lists; the Preaching Record has the rest. */
const preachingCount = 3;

/** Home for signed-in users. Rendered per request; never cached. */
export default async function DashboardPage() {
  const user = await requireActiveUser();
  const db = getDb();

  /**
   * The sermons being developed and, in one more query for all of them, their
   * outlines: no entry of any outline is read.
   */
  async function inProgress() {
    const sermons = await continueWorking(db, user.id);
    const outlines = await outlinesForSermons(
      db,
      user.id,
      sermons.map((sermon) => sermon.id),
    );
    return sermons.map((sermon) => ({ sermon, outline: outlines.get(sermon.id) ?? null }));
  }

  // Each of these names the owner in its own WHERE clause and is limited by the database.
  const [identity, working, revisit, ideas, history, counts, locale, venues, contexts] =
    await Promise.all([
      // The name is a courtesy: the page still renders if the provider cannot be reached.
      currentUser().catch(() => null),
      inProgress(),
      // Unfinished sermon ideas left alone for a while: at most three rows, chosen by the database.
      revisitIdeas(db, user.id),
      recentIdeas(db, user.id, recentCount),
      // The latest occasions, and with them how many there are in all: the lifetime figure.
      searchHistory(db, user.id, defaultHistoryQuery, preachingCount),
      // The figures are a summary: without them the page is still the workspace, and says they are unavailable.
      workspaceCounts(db, user.id).catch(() => null),
      getLocale(),
      // For recording a sermon as preached from here: the form's two lists.
      listVenues(db, user.id),
      listContexts(db, user.id),
    ]);

  return (
    <DashboardView
      firstName={identity?.firstName}
      continueWorking={working}
      revisitIdeas={revisit}
      recentIdeas={ideas}
      recentPreaching={history.items}
      counts={counts}
      timesPreached={history.total}
      venues={venues.map(({ id, name, locality }) => ({ id, name, locality }))}
      contexts={contexts.map(({ id, name }) => ({ id, name }))}
      locale={locale}
    />
  );
}
