import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { listIdeas } from "@/features/ideas/ideas";

export const metadata: Metadata = { title: "Dashboard" };

/** How many of the latest ideas the dashboard lists; the library has the rest. */
const recentCount = 5;

/** Home for signed-in users. Rendered per request; never cached. */
export default async function DashboardPage() {
  const user = await requireActiveUser();
  // The name is a courtesy: the page still renders if the provider cannot be reached.
  const [identity, recentIdeas] = await Promise.all([
    currentUser().catch(() => null),
    listIdeas(getDb(), user.id, recentCount),
  ]);

  return (
    <DashboardView
      firstName={identity?.firstName}
      isAdmin={user.role === "admin"}
      recentIdeas={recentIdeas}
    />
  );
}
