import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Inbox, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { StatusBadge } from "@/features/support/components/ticket-parts";
import { listOwnTickets } from "@/features/support/tickets";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("support")).hub.metaTitle };
}

/** Help & Feedback: the account's own messages to the team, most recently active first. */
export default async function SupportPage() {
  const user = await requireActiveUser();
  const [tickets, t, locale] = await Promise.all([
    listOwnTickets(getDb(), user.id),
    getT("support"),
    getLocale(),
  ]);

  const action = (
    <Link href={routes.supportNew} className={buttonVariants()}>
      <Plus aria-hidden />
      {t.hub.new}
    </Link>
  );

  return (
    <div className="container-page max-w-4xl py-10 lg:py-12">
      <PageHeader title={t.hub.title} description={t.hub.description} action={action} />

      {tickets.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed p-8 text-center sm:p-12">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 font-display text-xl tracking-[-0.01em]">{t.hub.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t.hub.empty}
          </p>
        </div>
      ) : (
        <ul
          aria-label={t.hub.list}
          className="mt-8 divide-y overflow-hidden rounded-xl border bg-surface shadow-card"
        >
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`${routes.support}/${ticket.id}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-accent sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <StatusBadge status={ticket.status} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.kinds[ticket.kind]}
                    </span>
                    {ticket.unread && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <span aria-hidden className="size-2 rounded-full bg-primary" />
                        {t.hub.unread}
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-1.5 block truncate text-[0.9375rem] ${ticket.unread ? "font-semibold" : "font-medium"}`}
                  >
                    {ticket.subject}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                    {t.hub.updated(formatDate(ticket.lastMessageAt, locale))}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
