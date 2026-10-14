import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { AccountInformation } from "@/features/settings/components/account-information";
import { SecuritySettings } from "@/features/settings/components/account-sections";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.account.title };
}

/** The account's access, read only, and its sign-in security, through Clerk. */
export default async function AccountSettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <SettingsPageHeader {...t.categories.account} locale={preferences.locale} />
      <SettingsStack>
        <SettingsBlock title={t.blocks.access}>
          <AccountInformation user={user} labels={t.account} locale={preferences.locale} />
        </SettingsBlock>
        <SecuritySettings />
      </SettingsStack>
    </>
  );
}
