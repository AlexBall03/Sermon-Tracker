import type { Metadata } from "next";

import { getDb } from "@/db";
import { PageHeader } from "@/components/layout/page-header";
import { StatStrip } from "@/components/ui/stat-strip";
import { requireAdmin } from "@/features/auth/access";
import {
  listPendingInvitations,
  withIdentities,
  type DirectoryEntry,
} from "@/features/admin/clerk";
import { InvitationsPanel } from "@/features/admin/components/invitations-panel";
import { LanguageControl } from "@/features/admin/components/language-control";
import { UsersTable } from "@/features/admin/components/users-table";
import { getUserCounts, listUsers } from "@/features/admin/users";
import { getAppSettings } from "@/features/preferences/settings";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("admin")).page.metaTitle };
}

/** Administrator-only. Rendered per request; never cached. */
export default async function AdminPage() {
  const admin = await requireAdmin();
  const db = getDb();

  const [counts, rows, invitations, settings, t] = await Promise.all([
    getUserCounts(db),
    listUsers(db),
    // Clerk being unreachable must not take the whole page down.
    listPendingInvitations().catch(() => null),
    getAppSettings(),
    getT("admin"),
  ]);
  const identified = await withIdentities(rows).catch(() => null);
  const entries: DirectoryEntry[] =
    identified ?? rows.map((row) => ({ ...row, name: null, email: null, identityMissing: false }));

  const stats = [
    { label: t.stats.registered, value: counts.total },
    { label: t.stats.active, value: counts.active },
    { label: t.stats.disabled, value: counts.disabled },
    { label: t.stats.pending, value: invitations?.length ?? null },
  ];

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader title={t.page.title} description={t.page.description} />

      <StatStrip stats={stats} className="mt-8" />

      <section aria-labelledby="users-heading" className="mt-10">
        <h2 id="users-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.page.users}
        </h2>
        {!identified && (
          <p className="mt-1.5 text-sm text-muted-foreground">{t.page.identitiesUnavailable}</p>
        )}
        <UsersTable entries={entries} currentUserId={admin.id} />
      </section>

      <section aria-labelledby="invitations-heading" className="mt-10">
        <h2 id="invitations-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.page.invitations}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          {t.page.invitationsDescription}
        </p>
        <InvitationsPanel invitations={invitations} />
      </section>

      <section aria-labelledby="languages-heading" className="mt-10">
        <h2 id="languages-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.page.languages}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          {t.page.languagesDescription}
        </p>
        <LanguageControl spanishEnabled={settings.spanishEnabled} />
      </section>
    </div>
  );
}
