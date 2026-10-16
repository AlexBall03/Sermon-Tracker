import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { pushSubscriptions, users } from "@/db/schema";
import type { Database } from "@/db/types";
import { storedPreferences } from "@/features/preferences/preferences";
import { resolvePreferences } from "@/features/preferences/resolve";
import { readAppSettings } from "@/features/preferences/settings";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { env, isPushConfigured } from "@/lib/env";

/** What a device is shown: generic words and an address inside the application, nothing anyone wrote. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<unknown>;

const webPushSender: PushSender = (subscription, payload) =>
  webpush.sendNotification(subscription, payload, {
    vapidDetails: {
      subject: env.VAPID_SUBJECT!,
      publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      privateKey: env.VAPID_PRIVATE_KEY!,
    },
    TTL: 60 * 60 * 24,
    urgency: "normal",
  });

const statusOf = (error: unknown) =>
  typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode: unknown }).statusCode)
    : 0;

/**
 * Sends to every device of the given accounts that turned push on, in each
 * account's own language. A device the push service says is gone (404, 410)
 * is forgotten; a server error or a lost connection is tried once more and
 * then left: the notification is still in the application.
 */
export async function sendPush(
  db: Database,
  userIds: string[],
  payloadFor: (locale: Locale) => PushPayload,
  { send = webPushSender, force = false }: { send?: PushSender; force?: boolean } = {},
): Promise<{ sent: number; removed: number; failed: number }> {
  const outcome = { sent: 0, removed: 0, failed: 0 };
  if (userIds.length === 0 || (send === webPushSender && !isPushConfigured())) return outcome;

  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      locale: users.locale,
      bibleTranslation: users.bibleTranslation,
      pushSupport: users.pushSupport,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.ownerId))
    .where(and(inArray(pushSubscriptions.ownerId, userIds), eq(users.status, "active")));
  const wanted = rows.filter((row) => force || row.pushSupport);
  if (wanted.length === 0) return outcome;

  const { spanishEnabled } = await readAppSettings(db);
  await Promise.all(
    wanted.map(async (row) => {
      const { locale } = resolvePreferences(storedPreferences(row), spanishEnabled);
      const body = JSON.stringify(payloadFor(locale));
      const target = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await send(target, body);
          outcome.sent += 1;
          return;
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
            outcome.removed += 1;
            return;
          }
          const transient = status === 0 || status === 429 || status >= 500;
          if (!transient || attempt === 2) {
            console.error("Push delivery failed:", status || "network");
            outcome.failed += 1;
            return;
          }
        }
      }
    }),
  );
  return outcome;
}

/** The words a device shows for a support event, in one language. */
export function supportPushPayload(
  locale: Locale,
  kind: keyof ReturnType<typeof dictionary<"notifications">>["push"],
  url: string,
  tag: string,
): PushPayload {
  const t = dictionary(locale, "notifications").push;
  return { title: t.title, body: t[kind], url, tag };
}
