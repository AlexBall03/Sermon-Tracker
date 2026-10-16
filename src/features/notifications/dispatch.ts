import "server-only";

import { getDb } from "@/db";
import type { TicketStatus } from "@/features/support/model";
import { notificationHref, type NotificationKind } from "./model";
import { activeAdminIds, notify } from "./notifications";
import { sendPush, supportPushPayload } from "./push";

type SupportEvent = {
  kind: NotificationKind;
  ticketId: string;
  eventKey: string;
  status?: TicketStatus;
};

/**
 * Records a support event for its recipients and pushes it to their devices.
 * Called after the action has answered (`after`): a failure here is logged
 * and never undoes or fails what the person did.
 */
async function deliver(recipientIds: string[], event: SupportEvent) {
  try {
    const db = getDb();
    const fresh = await notify(db, recipientIds, event);
    const url = notificationHref(event.kind, event.ticketId);
    await sendPush(db, fresh, (locale) =>
      supportPushPayload(locale, event.kind, url, `ticket-${event.ticketId}`),
    );
  } catch (error) {
    console.error("Notification failed:", error instanceof Error ? error.message : error);
  }
}

/** Tells the person who wrote an app ticket about an administrator's answer or a status change. */
export async function notifyRequester(requesterId: string | null, event: SupportEvent) {
  if (requesterId) await deliver([requesterId], event);
}

/** Tells every active administrator but the one who acted. */
export async function notifyAdmins(event: SupportEvent, actorId?: string) {
  try {
    await deliver(await activeAdminIds(getDb(), actorId), event);
  } catch (error) {
    console.error("Notification failed:", error instanceof Error ? error.message : error);
  }
}
