import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";

import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { SettingsPageHeader } from "@/features/settings/components/settings-layout";
import { SettingsStack } from "@/features/settings/components/settings-section";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("settings")).categories.sync.title };
}

/**
 * Reserved for synchronization (Phase 5C). It says what is coming and offers
 * nothing: no control, no status, and nothing that pretends to work.
 */
export default async function SyncSettingsPage() {
  await requireActiveUser();
  const [preferences, t] = await Promise.all([getPreferences(), getT("settings")]);
  return (
    <>
      <SettingsPageHeader {...t.categories.sync} locale={preferences.locale} />
      <SettingsStack>
        <section
          aria-label={t.sync.title}
          className="flex flex-col items-start gap-4 rounded-xl border border-dashed bg-surface p-6 sm:flex-row sm:p-7"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <RefreshCw className="size-[1.125rem] text-muted-foreground" aria-hidden />
          </span>
          <div>
            <h2 className="text-[0.9375rem] font-semibold">{t.sync.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.sync.body}</p>
          </div>
        </section>
      </SettingsStack>
    </>
  );
}
