import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.appearance.title };
}

/** The theme, kept in the browser. */
export default async function AppearanceSettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <SettingsPageHeader {...t.categories.appearance} locale={preferences.locale} />
      <SettingsStack>
        <SettingsBlock title={t.blocks.theme}>
          <AppearanceSettings />
        </SettingsBlock>
      </SettingsStack>
    </>
  );
}
