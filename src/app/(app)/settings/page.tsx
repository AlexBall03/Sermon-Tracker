import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { AccountInformation } from "@/features/settings/components/account-information";
import { ProfileSettings, SecuritySettings } from "@/features/settings/components/account-sections";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { BibleSettings } from "@/features/settings/components/bible-settings";
import { LanguageSettings } from "@/features/settings/components/language-settings";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).page.title };
}

/**
 * Account management in the application's own interface. The sign-in provider
 * still owns identity, credentials, verification, and sessions: the profile
 * and security controls call it, and nothing here stores any of that. The
 * language and the Bible translation are the application's own, and are saved
 * on the account.
 */
export default async function SettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);

  return (
    // The page says its language itself as well, so it reads right the moment it is changed here.
    <I18nProvider locale={preferences.locale}>
      <div className="container-page py-10 lg:py-12">
        <PageHeader title={t.page.title} description={t.page.description} />

        <SettingsSection id="profile" {...t.sections.profile}>
          <ProfileSettings />
        </SettingsSection>

        <SettingsSection id="security" {...t.sections.security}>
          <SecuritySettings />
        </SettingsSection>

        <SettingsSection id="language" {...t.sections.language}>
          <LanguageSettings
            // Its own controls start again from what was saved whenever that changes.
            key={`${preferences.stored.locale}.${preferences.stored.bibleTranslation}.${preferences.spanishEnabled}`}
            preferences={preferences}
          />
        </SettingsSection>

        <SettingsSection id="appearance" {...t.sections.appearance}>
          <AppearanceSettings />
        </SettingsSection>

        <SettingsSection id="bible" {...t.sections.bible}>
          <BibleSettings />
        </SettingsSection>

        <SettingsSection id="account" {...t.sections.account}>
          <AccountInformation user={user} labels={t.account} locale={preferences.locale} />
        </SettingsSection>
      </div>
    </I18nProvider>
  );
}
