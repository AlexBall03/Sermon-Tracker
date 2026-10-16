import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { notifications, supportTickets, users } from "@/db/schema";
import type { Database } from "@/db/types";
import type { TicketStatus } from "@/features/support/model";
import type { NotificationItem, NotificationKind, NotificationSummary } from "./model";

/*
 * Every query here names its recipient in the WHERE clause: an account reads,
 * and marks, only its own notifications.
 */

export type NotificationEvent = {
  kind: NotificationKind;
  ticketId: string;
  /** Names the event, so the same one never makes a second row (`message/<id>`, `status/<id>`). */
  eventKey: string;
  status?: TicketStatus;
};

/** Records an event for each recipient. Returns those it was new for: only they are pushed. */
export async function notify(
  db: Database,
  recipientIds: string[],
  event: NotificationEvent,
): Promise<string[]> {
  if (recipientIds.length === 0) return [];
  const rows = await db
    .insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: event.kind,
        ticketId: event.ticketId,
        eventKey: event.eventKey,
        status: event.status ?? null,
      })),
    )
    .onConflictDoNothing({ target: [notifications.recipientId, notifications.eventKey] })
    .returning({ recipientId: notifications.recipientId });
  return rows.map((row) => row.recipientId);
}

/** Every active administrator but the one who acted. */
export async function activeAdminIds(db: Database, exceptId?: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "admin"),
        eq(users.status, "active"),
        exceptId ? ne(users.id, exceptId) : undefined,
      ),
    );
  return rows.map((row) => row.id);
}

export async function listNotifications(
  db: Database,
  recipientId: string,
  limit: number,
): Promise<NotificationItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      ticketId: notifications.ticketId,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      subject: supportTickets.subject,
    })
    .from(notifications)
    .innerJoin(supportTickets, eq(supportTickets.id, notifications.ticketId))
    .where(eq(notifications.recipientId, recipientId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(({ readAt, createdAt, ...row }) => ({
    ...row,
    createdAt: createdAt.toISOString(),
    read: readAt !== null,
  }));
}

export async function unreadCount(db: Database, recipientId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
  return row.total;
}

export async function summary(
  db: Database,
  recipientId: string,
  limit: number,
): Promise<NotificationSummary> {
  const [unread, items] = await Promise.all([
    unreadCount(db, recipientId),
    listNotifications(db, recipientId, limit),
  ]);
  return { unread, items };
}

/** Marks some of the recipient's own notifications read; another account's ids match nothing. */
export async function markRead(db: Database, recipientId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllRead(db: Database, recipientId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
}
