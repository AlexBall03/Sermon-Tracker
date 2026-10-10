import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { requireActiveUser } from "@/features/auth/access";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

/** Home for signed-in users. Rendered per request; never cached. */
export default async function DashboardPage() {
  const user = await requireActiveUser();
  // The name is a courtesy: the page still renders if the provider cannot be reached.
  const identity = await currentUser().catch(() => null);

  return <DashboardView firstName={identity?.firstName} isAdmin={user.role === "admin"} />;
}
