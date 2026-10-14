import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { LegacySettingsHash } from "@/features/settings/components/legacy-settings-hash";
import { SettingsCategoryList } from "@/features/settings/components/settings-layout";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).page.title };
}

/**
 * The settings overview: every category, each leading to its own page. The
 * person's profile and preferences live on those pages, in the application's
 * own interface; the sign-in provider still owns identity, credentials,
 * verification, and sessions.
 */
export default async function SettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      {/* An address from when settings were one page goes on to the category that holds it. */}
      <LegacySettingsHash />
      <PageHeader title={t.page.title} description={t.page.description} />
      <div className="mt-8">
        <SettingsCategoryList locale={preferences.locale} />
      </div>
    </>
  );
}
