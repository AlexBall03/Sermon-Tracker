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
import { UsersTable } from "@/features/admin/components/users-table";
import { getUserCounts, listUsers } from "@/features/admin/users";

export const metadata: Metadata = { title: "Administration" };

/** Administrator-only. Rendered per request; never cached. */
export default async function AdminPage() {
  const admin = await requireAdmin();
  const db = getDb();

  const [counts, rows, invitations] = await Promise.all([
    getUserCounts(db),
    listUsers(db),
    // Clerk being unreachable must not take the whole page down.
    listPendingInvitations().catch(() => null),
  ]);
  const identified = await withIdentities(rows).catch(() => null);
  const entries: DirectoryEntry[] =
    identified ?? rows.map((row) => ({ ...row, name: null, email: null, identityMissing: false }));

  const stats = [
    { label: "Registered users", value: counts.total },
    { label: "Active", value: counts.active },
    { label: "Disabled", value: counts.disabled },
    { label: "Pending invitations", value: invitations?.length ?? null },
  ];

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title="People and access"
        description="Sermon Tracker is invitation-only. Invite people here, and manage their roles and access."
      />

      <StatStrip stats={stats} className="mt-8" />

      <section aria-labelledby="users-heading" className="mt-10">
        <h2 id="users-heading" className="text-lg font-semibold tracking-[-0.015em]">
          Users
        </h2>
        {!identified && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Names and email addresses could not be loaded from the sign-in provider.
          </p>
        )}
        <UsersTable entries={entries} currentUserId={admin.id} />
      </section>

      <section aria-labelledby="invitations-heading" className="mt-10">
        <h2 id="invitations-heading" className="text-lg font-semibold tracking-[-0.015em]">
          Invitations
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          An invited person receives an email with a link to create their account.
        </p>
        <InvitationsPanel invitations={invitations} />
      </section>
    </div>
  );
}
