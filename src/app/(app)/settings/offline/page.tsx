import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { OfflineStorageSettings } from "@/features/offline/components/offline-storage-settings";
import { ScrollToHash } from "@/features/settings/components/scroll-to-hash";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.offline.title };
}

/** What this device keeps for working offline: the device's, never the account's. */
export default async function OfflineSettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      {/* The offline notices send people to `#offline-capture` and here. */}
      <ScrollToHash />
      <SettingsPageHeader {...t.categories.offline} locale={preferences.locale} />
      <SettingsStack>
        <OfflineStorageSettings />
      </SettingsStack>
    </>
  );
}
