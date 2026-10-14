import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { InstallAppSettings } from "@/features/pwa/components/install-app-settings";
import { ScrollToHash } from "@/features/settings/components/scroll-to-hash";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsBlock, SettingsStack } from "@/features/settings/components/settings-section";
import { RestartTourButton } from "@/features/tour/components/restart-tour-button";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.app.title };
}

/** Installing the app, the product tour again, and account setup again. */
export default async function AppSettingsPage() {
  await requireActiveUser();
  const [preferences, t, pwa] = await Promise.all([
    getPreferences(),
    getT("settings"),
    getT("pwa"),
  ]);
  return (
    <>
      {/* The install notice sends people to `#install`. */}
      <ScrollToHash />
      <SettingsPageHeader {...t.categories.app} locale={preferences.locale} />
      <SettingsStack>
        {/* Installing is offered here and nowhere else (features/pwa). */}
        <SettingsBlock id="install" title={pwa.install.title} description={pwa.install.description}>
          <InstallAppSettings />
        </SettingsBlock>
        {/* A replay of the tour: it goes to the dashboard and begins, and resets nothing. */}
        <SettingsBlock title={t.blocks.tour} description={t.blocks.tourDescription}>
          <RestartTourButton />
        </SettingsBlock>
        {/* The same steps a new account goes through. Opening them changes nothing. */}
        <SettingsBlock title={t.blocks.setup} description={t.blocks.setupDescription}>
          <Link href={routes.onboarding} className={buttonVariants({ variant: "outline" })}>
            {t.blocks.runSetup}
          </Link>
        </SettingsBlock>
      </SettingsStack>
    </>
  );
}
