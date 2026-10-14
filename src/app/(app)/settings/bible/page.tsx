import type { Metadata } from "next";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { BibleSettings } from "@/features/settings/components/bible-settings";
import { LanguageSettings } from "@/features/settings/components/language-settings";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.bible.title };
}

/** The interface language and the Bible translation (the account's), and the reader's copy shortcut (the browser's). */
export default async function BibleSettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <SettingsPageHeader {...t.categories.bible} locale={preferences.locale} />
      <SettingsStack>
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
      </SettingsStack>
    </>
  );
}
