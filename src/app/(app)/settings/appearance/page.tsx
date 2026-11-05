import type { Metadata } from "next";

import { getDb } from "@/db";
import { MyPresets } from "@/features/appearance-presets/components/my-presets";
import { accountDefaultOf } from "@/features/appearance-presets/defaults";
import { presetLimits } from "@/features/appearance-presets/model";
import { getPreset, listPresets, type PresetPage } from "@/features/appearance-presets/presets";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { failure } from "@/features/sermon-editor/persistence/failure";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.appearance.title };
}

/**
 * The theme, kept in the browser, and the account's appearance presets and
 * its default for new outlines (A4.2C). The first page of presets is read
 * here (metadata only, bounded); everything after that is the browser's,
 * through the presets' own actions.
 */
export default async function AppearanceSettingsPage() {
  const user = await requireActiveUser();
  const [preferences, t, p] = await Promise.all([
    getPreferences(),
    getT("settings"),
    getT("appearancePresets"),
  ]);
  const initialDefault = accountDefaultOf(user);

  let initialPage: PresetPage = { items: [], total: 0, page: 1, pageSize: presetLimits.pageSize };
  let failed = false;
  let defaultName: string | null = null;
  try {
    const db = getDb();
    initialPage = await listPresets(db, user.id, { page: 1, pageSize: presetLimits.pageSize });
    const target = initialDefault.target;
    if (
      target.kind === "personal" &&
      !initialPage.items.some((item) => item.id === target.presetId)
    ) {
      const found = await getPreset(db, user.id, target.presetId);
      defaultName = found.status === "not_found" ? null : found.preset.name;
    }
  } catch (error) {
    // Never the names or appearances: kind and SQLSTATE only.
    console.error("Appearance presets read failed:", failure(error));
    failed = true;
  }

  return (
    <>
      <SettingsPageHeader {...t.categories.appearance} locale={preferences.locale} />
      <SettingsStack>
        <SettingsBlock title={t.blocks.theme}>
          <AppearanceSettings />
        </SettingsBlock>
        <SettingsBlock id="presets" title={p.library.title} description={p.library.description}>
          <MyPresets
            initialPage={initialPage}
            initialDefault={initialDefault}
            defaultName={defaultName}
            failed={failed}
          />
        </SettingsBlock>
      </SettingsStack>
    </>
  );
}
