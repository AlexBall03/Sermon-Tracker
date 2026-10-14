import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  supportAttachments,
  supportMessages,
  supportStatusEvents,
  supportTickets,
  users,
  type SupportAttachment,
  type SupportMessage,
  type SupportStatusEvent,
  type SupportTicket,
} from "@/db/schema";
import type { Database } from "@/db/types";
import { containing } from "@/features/ideas/ideas";
import type { Locale } from "@/i18n/locales";
import {
  inboxPageSize,
  isFinished,
  isStatusAllowed,
  orphanAfterMs,
  rateLimits,
  type MessageVisibility,
  type TicketKind,
  type TicketStatus,
} from "./model";
import type { InboxQuery } from "./schemas";

/*
 * Contact and feedback, in the database. Two kinds of caller and never a mix:
 *
 * - An account (`…Own…`, `replyAsRequester`, `createTicket`): every query
 *   names the account in its WHERE clause, so a ticket, a message, or a
 *   screenshot of someone else's is the same answer as one that does not
 *   exist. Internal notes are left out by the query, never by the screen.
 * - An administrator (`admin…`): every ticket, every message. The caller has
 *   already been authorised as one; nothing here decides that.
 *
 * The public contact form has no account and can only create.
 */

const hourMs = 60 * 60 * 1000;

export type TicketView = Omit<SupportTicket, "ipHash">;
export type MessageView = Pick<
  SupportMessage,
  "id" | "author" | "visibility" | "body" | "createdAt" | "authorUserId"
>;
export type EventView = Pick<SupportStatusEvent, "id" | "fromStatus" | "toStatus" | "createdAt">;
export type AttachmentView = Pick<SupportAttachment, "id" | "contentType" | "size" | "createdAt">;

const ticketView = {
  id: supportTickets.id,
  userId: supportTickets.userId,
  kind: supportTickets.kind,
  source: supportTickets.source,
  status: supportTickets.status,
  subject: supportTickets.subject,
  contactName: supportTickets.contactName,
  contactEmail: supportTickets.contactEmail,
  steps: supportTickets.steps,
  expected: supportTickets.expected,
  area: supportTickets.area,
  useCase: supportTickets.useCase,
  pageUrl: supportTickets.pageUrl,
  userAgent: supportTickets.userAgent,
  locale: supportTickets.locale,
  lastMessageAt: supportTickets.lastMessageAt,
  requesterReadAt: supportTickets.requesterReadAt,
  adminReadAt: supportTickets.adminReadAt,
  createdAt: supportTickets.createdAt,
  updatedAt: supportTickets.updatedAt,
};

const messageView = {
  id: supportMessages.id,
  author: supportMessages.author,
  visibility: supportMessages.visibility,
  body: supportMessages.body,
  createdAt: supportMessages.createdAt,
  authorUserId: supportMessages.authorUserId,
};

const eventView = {
  id: supportStatusEvents.id,
  fromStatus: supportStatusEvents.fromStatus,
  toStatus: supportStatusEvents.toStatus,
  createdAt: supportStatusEvents.createdAt,
};

const attachmentView = {
  id: supportAttachments.id,
  contentType: supportAttachments.contentType,
  size: supportAttachments.size,
  createdAt: supportAttachments.createdAt,
};

// ─── Creating ────────────────────────────────────────────────────────────────

export type CreateOutcome =
  | { ok: true; ticket: TicketView; message: MessageView; created: boolean }
  | { ok: false; reason: "rate_limited" };

export type PublicContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: Locale;
  /** A hash of the sender's network address, or null where none was seen. */
  ipHash: string | null;
};

/** The first message of a ticket. */
async function firstMessage(db: Database, ticketId: string): Promise<MessageView> {
  const [message] = await db
    .select(messageView)
    .from(supportMessages)
    .where(and(eq(supportMessages.ticketId, ticketId), eq(supportMessages.visibility, "public")))
    .orderBy(asc(supportMessages.createdAt))
    .limit(1);
  return message;
}

async function ticketById(db: Database, id: string, where?: SQL) {
  const [ticket] = await db
    .select(ticketView)
    .from(supportTickets)
    .where(and(eq(supportTickets.id, id), where))
    .limit(1);
  return ticket ?? null;
}

/**
 * A message from the public contact form. The same ID twice, or the same
 * words from the same address within a few minutes, is the first one again
 * (`created: false`), so a double click or a retry is one ticket and one
 * email. Past the hourly limit, from the address or the network, nothing is
 * saved.
 */
export async function createPublicContact(
  db: Database,
  input: PublicContactInput,
  id?: string,
  now: Date = new Date(),
): Promise<CreateOutcome> {
  if (id) {
    const existing = await ticketById(db, id, eq(supportTickets.source, "public"));
    if (existing)
      return { ok: true, ticket: existing, message: await firstMessage(db, id), created: false };
  }

  const since = new Date(now.getTime() - rateLimits.duplicateWindowMs);
  const [duplicate] = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .innerJoin(supportMessages, eq(supportMessages.ticketId, supportTickets.id))
    .where(
      and(
        eq(supportTickets.source, "public"),
        eq(supportTickets.contactEmail, input.email),
        eq(supportTickets.subject, input.subject),
        eq(supportMessages.body, input.message),
        gte(supportTickets.createdAt, since),
      ),
    )
    .limit(1);
  if (duplicate) {
    const ticket = (await ticketById(db, duplicate.id))!;
    return { ok: true, ticket, message: await firstMessage(db, duplicate.id), created: false };
  }

  const hourAgo = new Date(now.getTime() - hourMs);
  const sameSender = [eq(supportTickets.contactEmail, input.email)];
  if (input.ipHash) sameSender.push(eq(supportTickets.ipHash, input.ipHash));
  const counts = await db
    .select({
      byEmail:
        sql<number>`count(*) filter (where ${supportTickets.contactEmail} = ${input.email})`.mapWith(
          Number,
        ),
      byNetwork: input.ipHash
        ? sql<number>`count(*) filter (where ${supportTickets.ipHash} = ${input.ipHash})`.mapWith(
            Number,
          )
        : sql<number>`0`.mapWith(Number),
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.source, "public"),
        gte(supportTickets.createdAt, hourAgo),
        or(...sameSender),
      ),
    );
  const { byEmail, byNetwork } = counts[0] ?? { byEmail: 0, byNetwork: 0 };
  if (byEmail >= rateLimits.publicPerHour || byNetwork >= rateLimits.publicPerHour) {
    return { ok: false, reason: "rate_limited" };
  }

  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        ...(id ? { id } : {}),
        kind: "contact",
        source: "public",
        subject: input.subject,
        contactName: input.name,
        contactEmail: input.email,
        locale: input.locale,
        ipHash: input.ipHash,
        lastMessageAt: now,
        createdAt: now,
      })
      .returning(ticketView);
    const [message] = await tx
      .insert(supportMessages)
      .values({ ticketId: ticket.id, author: "requester", body: input.message, createdAt: now })
      .returning(messageView);
    return { ok: true as const, ticket, message, created: true };
  });
}

export type FeedbackInput = {
  kind: TicketKind;
  subject: string;
  message: string;
  steps: string | null;
  expected: string | null;
  area: string | null;
  useCase: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  attachmentIds: string[];
};

/**
 * A ticket from an account, which is the session's and never the input's.
 * Screenshots are taken only from the account's own uploads that no ticket
 * has yet; any other ID is ignored. Idempotent like the public form.
 */
export async function createTicket(
  db: Database,
  userId: string,
  input: FeedbackInput,
  locale: Locale,
  id?: string,
  now: Date = new Date(),
): Promise<CreateOutcome> {
  const mine = eq(supportTickets.userId, userId);
  if (id) {
    const existing = await ticketById(db, id, mine);
    if (existing)
      return { ok: true, ticket: existing, message: await firstMessage(db, id), created: false };
  }

  const since = new Date(now.getTime() - rateLimits.duplicateWindowMs);
  const [duplicate] = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .innerJoin(supportMessages, eq(supportMessages.ticketId, supportTickets.id))
    .where(
      and(
        mine,
        eq(supportTickets.subject, input.subject),
        eq(supportMessages.body, input.message),
        gte(supportTickets.createdAt, since),
      ),
    )
    .limit(1);
  if (duplicate) {
    const ticket = (await ticketById(db, duplicate.id, mine))!;
    return { ok: true, ticket, message: await firstMessage(db, duplicate.id), created: false };
  }

  const [{ recent }] = await db
    .select({ recent: count() })
    .from(supportTickets)
    .where(and(mine, gte(supportTickets.createdAt, new Date(now.getTime() - hourMs))));
  if (recent >= rateLimits.ticketsPerHour) return { ok: false, reason: "rate_limited" };

  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        ...(id ? { id } : {}),
        userId,
        kind: input.kind,
        source: "app",
        subject: input.subject,
        steps: input.steps,
        expected: input.expected,
        area: input.area,
        useCase: input.useCase,
        pageUrl: input.pageUrl,
        userAgent: input.userAgent,
        locale,
        lastMessageAt: now,
        requesterReadAt: now,
        createdAt: now,
      })
      .returning(ticketView);
    const [message] = await tx
      .insert(supportMessages)
      .values({
        ticketId: ticket.id,
        authorUserId: userId,
        author: "requester",
        body: input.message,
        createdAt: now,
      })
      .returning(messageView);
    if (input.attachmentIds.length > 0) {
      await tx
        .update(supportAttachments)
        .set({ ticketId: ticket.id })
        .where(
          and(
            eq(supportAttachments.ownerId, userId),
            isNull(supportAttachments.ticketId),
            inArray(supportAttachments.id, input.attachmentIds),
          ),
        );
    }
    return { ok: true as const, ticket, message, created: true };
  });
}

// ─── An account's own ────────────────────────────────────────────────────────

export type OwnTicketSummary = Pick<
  TicketView,
  "id" | "kind" | "status" | "subject" | "lastMessageAt" | "createdAt"
> & { unread: boolean };

/*
 * The subqueries below are written out by hand, with the ticket's columns
 * named with their table: Drizzle leaves a column unqualified in a query of
 * one table, and inside the subquery an unqualified `id` would be the
 * message's own.
 */
const ticketColumn = (name: string) => sql.raw(`"support_tickets"."${name}"`);

/** Something said by the team since the requester last looked. */
const unreadByRequester = sql<boolean>`exists (
  select 1 from "support_messages" as m
  where m.ticket_id = ${ticketColumn("id")}
    and m.author = 'admin'
    and m.visibility = 'public'
    and m.created_at > coalesce(${ticketColumn("requester_read_at")}, 'epoch'::timestamptz)
)`;

/** The account's tickets, most recently active first. */
export async function listOwnTickets(db: Database, userId: string): Promise<OwnTicketSummary[]> {
  return db
    .select({
      id: supportTickets.id,
      kind: supportTickets.kind,
      status: supportTickets.status,
      subject: supportTickets.subject,
      lastMessageAt: supportTickets.lastMessageAt,
      createdAt: supportTickets.createdAt,
      unread: unreadByRequester,
    })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.lastMessageAt), desc(supportTickets.id))
    .limit(200);
}

export type OwnTicket = {
  ticket: TicketView;
  messages: MessageView[];
  events: EventView[];
  attachments: AttachmentView[];
};

/** One of the account's tickets, with what the requester may see of it: never an internal note. */
export async function getOwnTicket(
  db: Database,
  userId: string,
  id: string,
): Promise<OwnTicket | null> {
  const ticket = await ticketById(db, id, eq(supportTickets.userId, userId));
  if (!ticket) return null;
  const [messages, events, attachments] = await Promise.all([
    db
      .select(messageView)
      .from(supportMessages)
      .where(and(eq(supportMessages.ticketId, id), eq(supportMessages.visibility, "public")))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id)),
    db
      .select(eventView)
      .from(supportStatusEvents)
      .where(eq(supportStatusEvents.ticketId, id))
      .orderBy(asc(supportStatusEvents.createdAt)),
    db
      .select(attachmentView)
      .from(supportAttachments)
      .where(and(eq(supportAttachments.ticketId, id), eq(supportAttachments.ownerId, userId)))
      .orderBy(asc(supportAttachments.createdAt)),
  ]);
  return { ticket, messages, events, attachments };
}

/** Records that the requester has seen the ticket as it is now. */
export async function markReadByRequester(
  db: Database,
  userId: string,
  id: string,
  now = new Date(),
) {
  await db
    .update(supportTickets)
    .set({ requesterReadAt: now, updatedAt: sql`${supportTickets.updatedAt}` })
    .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, userId)));
}

export type ReplyOutcome =
  | { ok: true; ticket: TicketView; message: MessageView; event: EventView | null }
  | { ok: false; reason: "not_found" | "rate_limited" };

/**
 * The requester answers. A finished ticket is open again, and the change is
 * in its history.
 */
export async function replyAsRequester(
  db: Database,
  userId: string,
  id: string,
  body: string,
  now: Date = new Date(),
): Promise<ReplyOutcome> {
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.authorUserId, userId),
        eq(supportMessages.author, "requester"),
        gte(supportMessages.createdAt, new Date(now.getTime() - hourMs)),
      ),
    );
  if (recent >= rateLimits.repliesPerHour) return { ok: false, reason: "rate_limited" };

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: supportTickets.status })
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, userId)))
      .for("update");
    if (!locked) return { ok: false as const, reason: "not_found" as const };

    const [message] = await tx
      .insert(supportMessages)
      .values({ ticketId: id, authorUserId: userId, author: "requester", body, createdAt: now })
      .returning(messageView);

    let event: EventView | null = null;
    if (isFinished(locked.status)) {
      [event] = await tx
        .insert(supportStatusEvents)
        .values({
          ticketId: id,
          fromStatus: locked.status,
          toStatus: "open",
          actorUserId: userId,
          createdAt: now,
        })
        .returning(eventView);
    }
    const [ticket] = await tx
      .update(supportTickets)
      .set({
        lastMessageAt: now,
        requesterReadAt: now,
        ...(event ? { status: "open" as const } : {}),
      })
      .where(eq(supportTickets.id, id))
      .returning(ticketView);
    return { ok: true as const, ticket, message, event };
  });
}

export type StatusOutcome =
  | { ok: true; ticket: TicketView; event: EventView }
  | { ok: false; reason: "not_found" | "not_allowed" | "unchanged" };

/** The requester closes their own ticket. Closing a closed one changes nothing. */
export async function closeOwnTicket(
  db: Database,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<StatusOutcome> {
  return changeStatus(db, id, "closed", userId, eq(supportTickets.userId, userId), now);
}

async function changeStatus(
  db: Database,
  id: string,
  status: TicketStatus,
  actorUserId: string,
  where: SQL | undefined,
  now: Date,
): Promise<StatusOutcome> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ kind: supportTickets.kind, status: supportTickets.status })
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), where))
      .for("update");
    if (!locked) return { ok: false as const, reason: "not_found" as const };
    if (!isStatusAllowed(locked.kind, status))
      return { ok: false as const, reason: "not_allowed" as const };
    if (locked.status === status) return { ok: false as const, reason: "unchanged" as const };

    const [event] = await tx
      .insert(supportStatusEvents)
      .values({
        ticketId: id,
        fromStatus: locked.status,
        toStatus: status,
        actorUserId,
        createdAt: now,
      })
      .returning(eventView);
    const [ticket] = await tx
      .update(supportTickets)
      .set({ status })
      .where(eq(supportTickets.id, id))
      .returning(ticketView);
    return { ok: true as const, ticket, event };
  });
}

// ─── Administrators ──────────────────────────────────────────────────────────

/** Something the requester said since an administrator last looked. */
const unreadByAdmin = sql<boolean>`exists (
  select 1 from "support_messages" as m
  where m.ticket_id = ${ticketColumn("id")}
    and m.author = 'requester'
    and m.created_at > coalesce(${ticketColumn("admin_read_at")}, 'epoch'::timestamptz)
)`;

export type InboxRow = Pick<
  TicketView,
  | "id"
  | "kind"
  | "source"
  | "status"
  | "subject"
  | "contactName"
  | "contactEmail"
  | "userId"
  | "lastMessageAt"
  | "createdAt"
> & { clerkUserId: string | null; unread: boolean };

/** The inbox: every ticket that matches the query, a page at a time. */
export async function adminSearchTickets(
  db: Database,
  query: InboxQuery,
): Promise<{ rows: InboxRow[]; total: number; pages: number }> {
  const conditions: (SQL | undefined)[] = [];
  if (query.kind) conditions.push(eq(supportTickets.kind, query.kind));
  if (query.source) conditions.push(eq(supportTickets.source, query.source));
  if (query.status === "active") {
    conditions.push(notInArray(supportTickets.status, ["resolved", "closed"]));
  } else if (query.status) {
    conditions.push(eq(supportTickets.status, query.status));
  }
  for (const term of query.q.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const pattern = containing(term);
    conditions.push(
      or(
        ilike(supportTickets.subject, pattern),
        ilike(supportTickets.contactEmail, pattern),
        ilike(supportTickets.contactName, pattern),
        sql`exists (select 1 from "support_messages" as m where m.ticket_id = ${ticketColumn("id")} and m.body ilike ${pattern})`,
      ),
    );
  }
  const where = and(...conditions);
  const order =
    query.sort === "newest"
      ? [desc(supportTickets.createdAt), desc(supportTickets.id)]
      : query.sort === "oldest"
        ? [asc(supportTickets.createdAt), asc(supportTickets.id)]
        : [desc(supportTickets.lastMessageAt), desc(supportTickets.id)];

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(supportTickets).where(where),
    db
      .select({
        id: supportTickets.id,
        kind: supportTickets.kind,
        source: supportTickets.source,
        status: supportTickets.status,
        subject: supportTickets.subject,
        contactName: supportTickets.contactName,
        contactEmail: supportTickets.contactEmail,
        userId: supportTickets.userId,
        lastMessageAt: supportTickets.lastMessageAt,
        createdAt: supportTickets.createdAt,
        clerkUserId: users.clerkUserId,
        unread: unreadByAdmin,
      })
      .from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.userId))
      .where(where)
      .orderBy(...order)
      .limit(inboxPageSize)
      .offset((query.page - 1) * inboxPageSize),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / inboxPageSize)) };
}

/** How many tickets are not finished, for the administration page. */
export async function countActiveTickets(db: Database): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(supportTickets)
    .where(notInArray(supportTickets.status, ["resolved", "closed"]));
  return total;
}

export type AdminTicket = Omit<OwnTicket, "events"> & {
  requester: { clerkUserId: string } | null;
  events: (EventView & { actorUserId: string | null })[];
};

/** One ticket, everything about it: internal notes, every status change, every screenshot. */
export async function adminGetTicket(db: Database, id: string): Promise<AdminTicket | null> {
  const ticket = await ticketById(db, id);
  if (!ticket) return null;
  const [messages, events, attachments, requester] = await Promise.all([
    db
      .select(messageView)
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id)),
    db
      .select({ ...eventView, actorUserId: supportStatusEvents.actorUserId })
      .from(supportStatusEvents)
      .where(eq(supportStatusEvents.ticketId, id))
      .orderBy(asc(supportStatusEvents.createdAt)),
    db
      .select(attachmentView)
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, id))
      .orderBy(asc(supportAttachments.createdAt)),
    ticket.userId
      ? db
          .select({ clerkUserId: users.clerkUserId })
          .from(users)
          .where(eq(users.id, ticket.userId))
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { ticket, messages, events, attachments, requester };
}

export async function markReadByAdmin(db: Database, id: string, now = new Date()) {
  await db
    .update(supportTickets)
    .set({ adminReadAt: now, updatedAt: sql`${supportTickets.updatedAt}` })
    .where(eq(supportTickets.id, id));
}

export type AdminReplyOutcome =
  { ok: true; ticket: TicketView; message: MessageView } | { ok: false; reason: "not_found" };

/**
 * An administrator answers, or leaves a note only administrators see. A note
 * does not move the ticket's last activity: the requester sees nothing new.
 */
export async function adminReply(
  db: Database,
  adminId: string,
  id: string,
  input: { body: string; visibility: MessageVisibility },
  now: Date = new Date(),
): Promise<AdminReplyOutcome> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .for("update");
    if (!locked) return { ok: false as const, reason: "not_found" as const };
    const [message] = await tx
      .insert(supportMessages)
      .values({
        ticketId: id,
        authorUserId: adminId,
        author: "admin",
        visibility: input.visibility,
        body: input.body,
        createdAt: now,
      })
      .returning(messageView);
    const [ticket] = await tx
      .update(supportTickets)
      .set({ adminReadAt: now, ...(input.visibility === "public" ? { lastMessageAt: now } : {}) })
      .where(eq(supportTickets.id, id))
      .returning(ticketView);
    return { ok: true as const, ticket, message };
  });
}

/** An administrator moves a ticket to a status its kind has. The same status again changes nothing. */
export async function adminSetStatus(
  db: Database,
  adminId: string,
  id: string,
  status: TicketStatus,
  now: Date = new Date(),
): Promise<StatusOutcome> {
  return changeStatus(db, id, status, adminId, undefined, now);
}

// ─── Screenshots ─────────────────────────────────────────────────────────────

/** Uploads an account may make in an hour, attached or not. */
export const uploadsPerHour = 20;

export async function recentUploadCount(db: Database, ownerId: string, now = new Date()) {
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(supportAttachments)
    .where(
      and(
        eq(supportAttachments.ownerId, ownerId),
        gte(supportAttachments.createdAt, new Date(now.getTime() - hourMs)),
      ),
    );
  return recent;
}

export async function recordAttachment(
  db: Database,
  ownerId: string,
  file: { id: string; pathname: string; contentType: string; size: number },
): Promise<AttachmentView> {
  const [row] = await db
    .insert(supportAttachments)
    .values({ ...file, ownerId })
    .returning(attachmentView);
  return row;
}

/** The account's uploads that no ticket took within a day: to be removed from storage and here. */
export async function orphanedAttachments(db: Database, ownerId: string, now = new Date()) {
  return db
    .select({ id: supportAttachments.id, pathname: supportAttachments.pathname })
    .from(supportAttachments)
    .where(
      and(
        eq(supportAttachments.ownerId, ownerId),
        isNull(supportAttachments.ticketId),
        lt(supportAttachments.createdAt, new Date(now.getTime() - orphanAfterMs)),
      ),
    )
    .limit(50);
}

export async function deleteAttachmentRows(db: Database, ownerId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .delete(supportAttachments)
    .where(
      and(
        eq(supportAttachments.ownerId, ownerId),
        isNull(supportAttachments.ticketId),
        inArray(supportAttachments.id, ids),
      ),
    );
}

/**
 * Removes one of the account's own uploads that no ticket has taken, and
 * says where it was stored. Once on a ticket a screenshot stays with it.
 */
export async function removeUnattached(db: Database, ownerId: string, id: string) {
  const [row] = await db
    .delete(supportAttachments)
    .where(
      and(
        eq(supportAttachments.id, id),
        eq(supportAttachments.ownerId, ownerId),
        isNull(supportAttachments.ticketId),
      ),
    )
    .returning({ pathname: supportAttachments.pathname });
  return row ?? null;
}

/**
 * A screenshot, if this viewer may see it: its owner always, an
 * administrator once it is on a ticket. Anyone else gets nothing, the same as
 * for one that does not exist.
 */
export async function attachmentForViewer(
  db: Database,
  viewer: { id: string; role: "admin" | "user" },
  id: string,
) {
  const allowed =
    viewer.role === "admin"
      ? or(
          eq(supportAttachments.ownerId, viewer.id),
          sql`${supportAttachments.ticketId} is not null`,
        )
      : eq(supportAttachments.ownerId, viewer.id);
  const [row] = await db
    .select({ pathname: supportAttachments.pathname, contentType: supportAttachments.contentType })
    .from(supportAttachments)
    .where(and(eq(supportAttachments.id, id), allowed))
    .limit(1);
  return row ?? null;
}

/** The Clerk identity of a ticket's account, for mail. */
export async function clerkIdFor(db: Database, userId: string) {
  const [row] = await db
    .select({ clerkUserId: users.clerkUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.clerkUserId ?? null;
}
