import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import {
  CloseTicketButton,
  Details,
  MarkRead,
  ReplyForm,
  Screenshots,
  StatusBadge,
  Thread,
  type ThreadItem,
} from "@/features/support/components/ticket-parts";
import { isFinished } from "@/features/support/model";
import { ticketIdSchema } from "@/features/support/schemas";
import { getOwnTicket } from "@/features/support/tickets";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("support")).hub.metaTitle };
}

/**
 * One of the account's conversations with the team. Someone else's, or one
 * that does not exist, is the same "not found"; internal notes are never
 * loaded for this page.
 */
export default async function SupportTicketPage({ params }: PageProps<"/support/[id]">) {
  const user = await requireActiveUser();
  const id = ticketIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const found = await getOwnTicket(getDb(), user.id, id.data);
  if (!found) notFound();
  const [t, locale] = await Promise.all([getT("support"), getLocale()]);

  const { ticket, messages, events, attachments } = found;
  const items: ThreadItem[] = [
    ...messages.map((message): ThreadItem => ({
      type: "message",
      id: message.id,
      author: message.author,
      visibility: message.visibility,
      body: message.body,
      createdAt: message.createdAt,
      name: message.author === "admin" ? t.thread.team : t.thread.you,
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

  return (
    <div className="container-page max-w-3xl py-10 lg:py-12">
      <MarkRead ticketId={ticket.id} as="requester" />
      <BackLink href={routes.support}>{t.thread.back}</BackLink>
      <header className="border-b pb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge status={ticket.status} />
          <span className="text-xs font-medium text-muted-foreground">{t.kinds[ticket.kind]}</span>
        </div>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-medium tracking-[-0.015em] break-words sm:text-[2rem]">
          {ticket.subject}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.thread.sent(formatDate(ticket.createdAt, locale))}
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {details.length > 0 && <Details title={t.thread.details} details={details} />}
        <Screenshots ids={attachments.map((attachment) => attachment.id)} />
        <Thread items={items} label={t.hub.title} />
        <section aria-labelledby="ticket-reply" className="space-y-4">
          <h2 id="ticket-reply" className="sr-only">
            {t.thread.reply}
          </h2>
          <ReplyForm ticketId={ticket.id} as="requester" finished={isFinished(ticket.status)} />
          {ticket.status !== "closed" && <CloseTicketButton ticketId={ticket.id} />}
        </section>
      </div>
    </div>
  );
}
