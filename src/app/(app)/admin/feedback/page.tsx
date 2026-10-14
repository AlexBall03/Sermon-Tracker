import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/access";
import { InboxFilters } from "@/features/support/components/inbox-filters";
import { StatusBadge } from "@/features/support/components/ticket-parts";
import { identitiesFor } from "@/features/support/identity";
import { inboxSearch, parseInboxQuery } from "@/features/support/schemas";
import { adminSearchTickets } from "@/features/support/tickets";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("support")).admin.metaTitle };
}

/** Administrator-only: every contact message and feedback ticket, searched and filtered by the address. */
export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = parseInboxQuery((await searchParams) ?? {});
  const [result, t, locale] = await Promise.all([
    adminSearchTickets(getDb(), query),
    getT("support"),
    getLocale(),
  ]);
  const identities = await identitiesFor(
    result.rows.flatMap((row) => (row.clerkUserId ? [row.clerkUserId] : [])),
  );
  const filtered = Boolean(query.q || query.kind || query.status || query.source);

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={routes.admin}>{t.admin.back}</BackLink>
      <PageHeader title={t.admin.title} description={t.admin.description} />

      <div className="mt-8">
        <InboxFilters query={query} />
      </div>

      <p role="status" className="mt-6 text-sm text-muted-foreground">
        {t.admin.results(result.total)}
      </p>

      {result.rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed p-8 text-center sm:p-12">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 font-display text-xl tracking-[-0.01em]">{t.admin.emptyTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered ? t.admin.empty : t.admin.emptyInbox}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y overflow-hidden rounded-xl border bg-surface shadow-card">
          {result.rows.map((row) => {
            const identity = row.clerkUserId ? identities?.get(row.clerkUserId) : null;
            const from =
              row.source === "public"
                ? `${row.contactName} · ${row.contactEmail}`
                : identity
                  ? [identity.name, identity.email].filter(Boolean).join(" · ")
                  : t.admin.unknownAccount;
            return (
              <li key={row.id}>
                <Link
                  href={`${routes.adminFeedback}/${row.id}`}
                  className="flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-accent sm:px-5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      row.unread ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <StatusBadge status={row.status} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {t.kinds[row.kind]} · {t.sources[row.source]}
                      </span>
                      {row.unread && (
                        <span className="text-xs font-semibold text-primary">{t.admin.unread}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 block truncate text-[0.9375rem]",
                        row.unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {row.subject}
                    </span>
                    <span className="mt-0.5 flex flex-col text-[0.8125rem] text-muted-foreground sm:flex-row sm:gap-3">
                      <span className="truncate">{from}</span>
                      <span className="shrink-0">
                        {t.admin.lastActivity}: {formatDate(row.lastMessageAt, locale)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {result.pages > 1 && (
        <nav
          aria-label={t.admin.page(query.page, result.pages)}
          className="mt-6 flex items-center justify-between gap-4"
        >
          <PageLink
            href={`${routes.adminFeedback}${inboxSearch({ ...query, page: query.page - 1 })}`}
            disabled={query.page <= 1}
          >
            {t.admin.previous}
          </PageLink>
          <span className="text-sm text-muted-foreground">
            {t.admin.page(query.page, result.pages)}
          </span>
          <PageLink
            href={`${routes.adminFeedback}${inboxSearch({ ...query, page: query.page + 1 })}`}
            disabled={query.page >= result.pages}
          >
            {t.admin.next}
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
