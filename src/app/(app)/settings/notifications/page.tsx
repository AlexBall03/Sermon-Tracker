import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireActiveUser } from "@/features/auth/access";
import { NotificationSettings } from "@/features/notifications/components/notification-settings";
import { getPreferences } from "@/features/preferences/current";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.notifications.title };
}

/** Optional support email, push on this account's devices, and the devices themselves. */
export default async function NotificationSettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t, devices] = await Promise.all([
    getPreferences(),
    getT("settings"),
    getDb()
      .select({
        id: pushSubscriptions.id,
        label: pushSubscriptions.label,
        endpoint: pushSubscriptions.endpoint,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerId, user.id))
      .orderBy(asc(pushSubscriptions.createdAt)),
  ]);
  return (
    <>
      <SettingsPageHeader {...t.categories.notifications} locale={preferences.locale} />
      <SettingsStack>
        <NotificationSettings
          preferences={{
            emailReplies: user.emailReplies,
            emailStatus: user.emailStatus,
            pushSupport: user.pushSupport,
          }}
          devices={devices.map((device) => ({
            ...device,
            createdAt: device.createdAt.toISOString(),
          }))}
        />
      </SettingsStack>
    </>
  );
}
