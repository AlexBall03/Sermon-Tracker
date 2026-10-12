import { Badge } from "@/components/ui/badge";
import type { AppUser } from "@/db/schema";
import { dictionary, type Dictionaries } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";

/**
 * Read-only facts from the application's own record. Role and status are
 * changed only by an administrator, in Administration; there is no control
 * for them here and no action that accepts them.
 */
export function AccountInformation({
  user,
  locale = defaultLocale,
  labels = dictionary(locale, "settings").account,
}: {
  user: AppUser;
  locale?: Locale;
  labels?: Dictionaries["settings"]["account"];
}) {
  return (
    <div>
      <dl className="divide-y rounded-xl border bg-surface text-sm shadow-card">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">{labels.role}</dt>
          <dd>
            <Badge tone={user.role === "admin" ? "accent" : "muted"}>
              {user.role === "admin" ? labels.administrator : labels.standardUser}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">{labels.status}</dt>
          <dd>
            <Badge tone={user.status === "active" ? "muted" : "danger"}>
              {user.status === "active" ? labels.active : labels.disabled}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-muted-foreground">{labels.memberSince}</dt>
          <dd className="font-medium tabular-nums">{formatDate(user.createdAt, locale)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
        {labels.managed}
      </p>
    </div>
  );
}
