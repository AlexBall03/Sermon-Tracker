import type { Metadata } from "next";

import { getDb } from "@/db";
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
    <div className="container-page py-12 lg:py-16">
      <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
        Administration
      </p>
      <h1 className="mt-4 font-display text-4xl leading-[1.1] font-semibold tracking-tight">
        People and access
      </h1>

      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-surface p-5 shadow-card">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="mt-2 text-3xl font-semibold tabular-nums">
              {stat.value ?? <span className="text-base text-muted-foreground">Unavailable</span>}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="users-heading" className="mt-12">
        <h2 id="users-heading" className="text-xl font-semibold">
          Users
        </h2>
        {!identified && (
          <p className="mt-2 text-sm text-muted-foreground">
            Names and email addresses could not be loaded from the sign-in provider.
          </p>
        )}
        <UsersTable entries={entries} currentUserId={admin.id} />
      </section>

      <section aria-labelledby="invitations-heading" className="mt-12">
        <h2 id="invitations-heading" className="text-xl font-semibold">
          Invitations
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Sermon Tracker is invitation-only. An invited person receives an email with a link to
          create their account.
        </p>
        <InvitationsPanel invitations={invitations} />
      </section>
    </div>
  );
}
