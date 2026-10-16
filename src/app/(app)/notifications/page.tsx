import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { NotificationsView } from "@/features/notifications/components/notifications-view";
import { pageSize } from "@/features/notifications/model";
import { listNotifications } from "@/features/notifications/notifications";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("notifications")).metaTitle };
}

/** Every notification of the account, newest first. Reached from the bell; not in the navigation. */
export default async function NotificationsPage() {
  const user = await requireActiveUser();
  const [items, t] = await Promise.all([
    listNotifications(getDb(), user.id, pageSize),
    getT("notifications"),
  ]);
  return (
    <div className="container-page max-w-3xl py-10 lg:py-12">
      <PageHeader title={t.title} description={t.description} />
      <NotificationsView items={items} />
    </div>
  );
}
