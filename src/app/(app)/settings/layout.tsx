import { getPreferences } from "@/features/preferences/current";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { I18nProvider } from "@/i18n/client";

/**
 * The settings workspace: from `lg` up, the categories in a sidebar that stays
 * in reach while a page scrolls, beside the page being shown; below it, the
 * page alone (the overview lists the categories, and each page leads back).
 * Each page checks access itself; this only frames them.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const preferences = await getPreferences();
  return (
    // Settings says its language itself as well, so it reads right the moment it is changed here.
    <I18nProvider locale={preferences.locale}>
      <div className="container-page py-8 sm:py-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12 lg:py-12 xl:gap-16">
        <aside className="hidden lg:sticky lg:top-[calc(var(--bar-h)+3rem)] lg:block lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </I18nProvider>
  );
}
