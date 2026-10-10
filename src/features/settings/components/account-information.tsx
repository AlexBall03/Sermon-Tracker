import { Badge } from "@/components/ui/badge";
import type { AppUser } from "@/db/schema";
import { formatDate } from "@/lib/format";

/**
 * Read-only facts from the application's own record. Role and status are
 * changed only by an administrator, in Administration; there is no control
 * for them here and no action that accepts them.
 */
export function AccountInformation({ user }: { user: AppUser }) {
  return (
    <div>
      <dl className="divide-y rounded-xl border bg-surface text-sm shadow-card">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">Role</dt>
          <dd>
            <Badge tone={user.role === "admin" ? "accent" : "muted"}>
              {user.role === "admin" ? "Administrator" : "Standard user"}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge tone={user.status === "active" ? "muted" : "danger"}>
              {user.status === "active" ? "Active" : "Disabled"}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">Member since</dt>
          <dd className="font-medium tabular-nums">{formatDate(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
        Roles and access are managed by an administrator.
      </p>
    </div>
  );
}
