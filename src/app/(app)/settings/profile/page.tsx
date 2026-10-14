import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { storedProfile } from "@/features/preferences/preferences";
import { ProfileSettings } from "@/features/settings/components/account-sections";
import { ChurchMinistrySettings } from "@/features/settings/components/church-ministry-settings";
import { ScrollToHash } from "@/features/settings/components/scroll-to-hash";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.profile.title };
}

/**
 * How the person appears (Clerk's: picture, name, email addresses) and what
 * they say about themselves (the account's: church, ministry role, preaching
 * class).
 */
export default async function ProfileSettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <ScrollToHash />
      <SettingsPageHeader {...t.categories.profile} locale={preferences.locale} />
      <SettingsStack>
        <ProfileSettings />
        <SettingsBlock
          id="ministry"
          title={t.blocks.ministry}
          description={t.blocks.ministryDescription}
        >
          {/* Keyed by person so a different sign-in never inherits half-typed values. */}
          <ChurchMinistrySettings key={user.id} profile={storedProfile(user)} />
        </SettingsBlock>
      </SettingsStack>
    </>
  );
}
