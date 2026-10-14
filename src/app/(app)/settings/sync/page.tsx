import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { SyncSettings } from "@/features/offline/components/sync-settings";
import { getPreferences } from "@/features/preferences/current";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.sync.title };
}

/**
 * Synchronization (Phase 5C): where the work this device keeps stands, and a
 * way to send it now. The engine itself runs in the signed-in shell
 * (features/offline/sync); this page only shows it.
 */
export default async function SyncSettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <SettingsPageHeader {...t.categories.sync} locale={preferences.locale} />
      <SettingsStack>
        <SyncSettings />
      </SettingsStack>
    </>
  );
}
