import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/access";
import {
  Details,
  MarkRead,
  ReplyForm,
  Screenshots,
  StatusBadge,
  StatusControl,
  Thread,
  type ThreadItem,
} from "@/features/support/components/ticket-parts";
import { identitiesFor } from "@/features/support/identity";
import { ticketIdSchema } from "@/features/support/schemas";
import { adminGetTicket } from "@/features/support/tickets";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("support")).admin.metaTitle };
}

/**
 * Administrator-only: one conversation, everything about it. Internal notes
 * are shown here and marked as such; they are never loaded for the requester.
 */
export default async function FeedbackTicketPage({ params }: PageProps<"/admin/feedback/[id]">) {
  await requireAdmin();
  const id = ticketIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const found = await adminGetTicket(getDb(), id.data);
  if (!found) notFound();
  const [t, locale] = await Promise.all([getT("support"), getLocale()]);

  const { ticket, messages, events, attachments, requester } = found;
  const identities = requester ? await identitiesFor([requester.clerkUserId]) : null;
  const identity = requester ? identities?.get(requester.clerkUserId) : null;
  const requesterName =
    ticket.source === "public"
      ? (ticket.contactName ?? t.admin.requester)
      : (identity?.name ?? identity?.email ?? t.admin.unknownAccount);

  const items: ThreadItem[] = [
    ...messages.map((message): ThreadItem => ({
      type: "message",
      id: message.id,
      author: message.author,
      visibility: message.visibility,
      body: message.body,
      createdAt: message.createdAt,
      name: message.author === "admin" ? t.admin.administrator : requesterName,
    })),
    ...events.map((event): ThreadItem => ({
      type: "status",
      id: event.id,
      toStatus: event.toStatus,
      createdAt: event.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const details = (
    [
      [t.fields.steps, ticket.steps],
      [t.fields.expected, ticket.expected],
      [t.fields.area, ticket.area],
      [t.fields.useCase, ticket.useCase],
    ] as const
  ).filter((pair): pair is readonly [string, string] => Boolean(pair[1]));

  const email = ticket.source === "public" ? ticket.contactEmail : (identity?.email ?? null);
  const metadata: [string, string][] = [
    [
      t.admin.from,
      ticket.source === "public"
        ? `${ticket.contactName}`
        : (identity?.name ?? (identities ? t.admin.unknownAccount : t.admin.identityUnavailable)),
    ],
    ...(email ? [[t.fields.email, email] as [string, string]] : []),
    [t.admin.kind, t.kinds[ticket.kind]],
    [t.admin.source, t.sources[ticket.source]],
    [t.admin.created, formatDate(ticket.createdAt, locale)],
    [t.admin.lastActivity, formatDate(ticket.lastMessageAt, locale)],
    [t.admin.language, ticket.locale.toUpperCase()],
    ...(ticket.pageUrl ? [[t.admin.page_, ticket.pageUrl] as [string, string]] : []),
    ...(ticket.userAgent ? [[t.admin.browser, ticket.userAgent] as [string, string]] : []),
  ];

  return (
    <div className="container-page py-10 lg:py-12">
      <MarkRead ticketId={ticket.id} as="admin" />
      <BackLink href={routes.adminFeedback}>{t.admin.backToInbox}</BackLink>
      <header className="border-b pb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge status={ticket.status} />
          <span className="text-xs font-medium text-muted-foreground">
            {t.kinds[ticket.kind]} · {t.sources[ticket.source]}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-medium tracking-[-0.015em] break-words sm:text-[2rem]">
          {ticket.subject}
        </h1>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          {details.length > 0 && (
            <Details
              title={ticket.kind === "bug" ? t.admin.bug : t.admin.feature}
              details={details}
            />
          )}
          <Screenshots ids={attachments.map((attachment) => attachment.id)} />
          <Thread items={items} label={t.admin.title} />
          <ReplyForm ticketId={ticket.id} as="admin" publicSender={ticket.source === "public"} />
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-[calc(var(--bar-h)+1.5rem)] lg:self-start">
          <div className="rounded-xl border bg-surface p-4 shadow-card sm:p-5">
            <StatusControl ticketId={ticket.id} kind={ticket.kind} status={ticket.status} />
          </div>
          <section
            aria-labelledby="ticket-metadata"
            className="rounded-xl border bg-surface p-4 sm:p-5"
          >
            <h2 id="ticket-metadata" className="text-sm font-semibold">
              {t.thread.details}
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {metadata.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section
            aria-labelledby="ticket-history"
            className="rounded-xl border bg-surface p-4 sm:p-5"
          >
            <h2 id="ticket-history" className="text-sm font-semibold">
              {t.admin.history}
            </h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t.admin.noHistory}</p>
            ) : (
              <ol className="mt-3 space-y-2 text-sm">
                {events.map((event) => (
                  <li key={event.id} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {t.statuses[event.fromStatus]} → {t.statuses[event.toStatus]}
                    </span>
                    <time
                      dateTime={event.createdAt.toISOString()}
                      className="text-muted-foreground"
                    >
                      {formatDate(event.createdAt, locale)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
