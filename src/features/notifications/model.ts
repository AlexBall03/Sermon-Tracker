import type { TicketStatus } from "../support/model";

/*
 * What an account is told about, in the application and on its devices. A
 * notification names its event and its ticket and nothing else: its words come
 * from the `notifications` dictionary when it is shown, so no message, note, or
 * subject is ever copied into one or sent to a device.
 */

/** To the person who wrote the ticket. */
export const requesterKinds = ["reply", "status"] as const;
/** To every active administrator except the one who acted. */
export const adminKinds = ["new_ticket", "user_reply", "contact"] as const;
export const notificationKinds = [...requesterKinds, ...adminKinds] as const;
export type NotificationKind = (typeof notificationKinds)[number];

/** How many the bell shows; the page shows `pageSize`. */
export const bellSize = 8;
export const pageSize = 100;
/**
 * The bell's fallback: how often it asks again while it, its tab, and the
 * network are all there. Everything else that asks is an event (refresh.ts).
 */
export const pollMs = 15 * 60_000;
/** The least time between two routine asks (mount, focus, the tab shown again, the fallback). */
export const minRefreshMs = 30_000;
/** What the service worker posts to open windows when a push arrives; it carries nothing else. */
export const notificationsChangedMessage = "NOTIFICATIONS_CHANGED";

const requesterKindSet: ReadonlySet<string> = new Set(requesterKinds);

/**
 * Where a notification leads: a fixed address inside the application, built
 * here and nowhere else. The page there checks access again.
 */
export function notificationHref(kind: NotificationKind, ticketId: string) {
  return requesterKindSet.has(kind) ? `/support/${ticketId}` : `/admin/feedback/${ticketId}`;
}

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  ticketId: string;
  subject: string;
  status: TicketStatus | null;
  createdAt: string;
  read: boolean;
};

export type NotificationSummary = { unread: number; items: NotificationItem[] };
