import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { LegacySettingsHash } from "@/features/settings/components/legacy-settings-hash";
import { SettingsCategoryList } from "@/features/settings/components/settings-layout";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

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
  const [preferences, t, support] = await Promise.all([
    getPreferences(),
    getT("settings"),
    getT("support"),
  ]);
  return (
    <>
      {/* An address from when settings were one page goes on to the category that holds it. */}
      <LegacySettingsHash />
      <PageHeader title={t.page.title} description={t.page.description} />
      <div className="mt-8">
        <SettingsCategoryList locale={preferences.locale} />
      </div>
      {/* Not a category: a way to the team, from where people look for help. */}
      <Link
        href={routes.support}
        className="mt-6 flex items-center gap-3.5 rounded-xl border bg-surface p-4 shadow-card transition-colors duration-150 hover:bg-accent sm:p-5"
      >
        <LifeBuoy className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">{support.name}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {support.hub.description}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </>
  );
}
