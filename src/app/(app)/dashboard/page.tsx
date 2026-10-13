import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { recentIdeas, revisitIdeas } from "@/features/ideas/ideas";
import { listContexts } from "@/features/preaching/contexts";
import { listVenues } from "@/features/preaching/venues";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("dashboard")).metaTitle };
}

/** How many of the latest ideas the dashboard lists; the library has the rest. */
const recentCount = 5;

/** Home for signed-in users. Rendered per request; never cached. */
export default async function DashboardPage() {
  const user = await requireActiveUser();
  const db = getDb();
  // The name is a courtesy: the page still renders if the provider cannot be reached.
  const [identity, ideas, revisit, locale, venues, contexts] = await Promise.all([
    currentUser().catch(() => null),
    recentIdeas(db, user.id, recentCount),
    // Unfinished sermon ideas left alone for a while: at most three rows, chosen by the database.
    revisitIdeas(db, user.id),
    getLocale(),
    // For recording a sermon as preached from here: the form's two lists.
    listVenues(db, user.id),
    listContexts(db, user.id),
  ]);

  return (
    <DashboardView
      firstName={identity?.firstName}
      recentIdeas={ideas}
      revisitIdeas={revisit}
      venues={venues.map(({ id, name, locality }) => ({ id, name, locality }))}
      contexts={contexts.map(({ id, name }) => ({ id, name }))}
      locale={locale}
    />
  );
}
