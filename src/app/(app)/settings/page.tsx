import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { storedProfile } from "@/features/preferences/preferences";
import { AccountInformation } from "@/features/settings/components/account-information";
import { ProfileSettings, SecuritySettings } from "@/features/settings/components/account-sections";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { BibleSettings } from "@/features/settings/components/bible-settings";
import { ChurchMinistrySettings } from "@/features/settings/components/church-ministry-settings";
import { LanguageSettings } from "@/features/settings/components/language-settings";
import { SettingsBlock, SettingsSection } from "@/features/settings/components/settings-section";
import { InstallAppSettings } from "@/features/pwa/components/install-app-settings";
import { RestartTourButton } from "@/features/tour/components/restart-tour-button";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).page.title };
}

/**
 * The person's profile and preferences, in the application's own interface.
 * The sign-in provider still owns identity, credentials, verification, and
 * sessions: the personal and account controls call it, and nothing here stores
 * any of that. The church, the ministry role, attending preaching class, the
 * language, and the Bible translation are the application's own, saved on the
 * account. The theme and the reader's copy shortcut are kept in the browser.
 */
export default async function SettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t, pwa] = await Promise.all([
    getPreferences(),
    getT("settings"),
    getT("pwa"),
  ]);

  return (
    // The page says its language itself as well, so it reads right the moment it is changed here.
    <I18nProvider locale={preferences.locale}>
      <div className="container-page py-10 lg:py-12">
        <PageHeader title={t.page.title} description={t.page.description} />

        <SettingsSection id="personal" {...t.sections.personal}>
          <ProfileSettings />
        </SettingsSection>

        <SettingsSection id="ministry" {...t.sections.ministry}>
          {/* Keyed by person so a different sign-in never inherits half-typed values. */}
          <ChurchMinistrySettings key={user.id} profile={storedProfile(user)} />
        </SettingsSection>

        <SettingsSection id="bible-language" {...t.sections.bibleLanguage}>
          <SettingsBlock title={t.blocks.language} description={t.blocks.languageDescription}>
            <LanguageSettings
              // Its own controls start again from what was saved whenever that changes.
              key={`${preferences.stored.locale}.${preferences.stored.bibleTranslation}.${preferences.spanishEnabled}`}
              preferences={preferences}
            />
          </SettingsBlock>
          <SettingsBlock title={t.blocks.reader} description={t.blocks.readerDescription}>
            <BibleSettings />
          </SettingsBlock>
        </SettingsSection>

        <SettingsSection id="appearance" {...t.sections.appearance}>
          <SettingsBlock title={t.blocks.theme}>
            <AppearanceSettings />
          </SettingsBlock>
          {/* The same steps a new account goes through. Opening them changes nothing. */}
          <SettingsBlock title={t.blocks.setup} description={t.blocks.setupDescription}>
            <Link href={routes.onboarding} className={buttonVariants({ variant: "outline" })}>
              {t.blocks.runSetup}
            </Link>
          </SettingsBlock>
          {/* A replay of the tour: it goes to the dashboard and begins, and resets nothing. */}
          <SettingsBlock title={t.blocks.tour} description={t.blocks.tourDescription}>
            <RestartTourButton />
          </SettingsBlock>
          {/* Installing is offered here and nowhere else (features/pwa). */}
          <SettingsBlock title={pwa.install.title} description={pwa.install.description}>
            <InstallAppSettings />
          </SettingsBlock>
        </SettingsSection>

        <SettingsSection id="account" {...t.sections.account}>
          <SettingsBlock title={t.blocks.access}>
            <AccountInformation user={user} labels={t.account} locale={preferences.locale} />
          </SettingsBlock>
          <SecuritySettings />
        </SettingsSection>
      </div>
    </I18nProvider>
  );
}
