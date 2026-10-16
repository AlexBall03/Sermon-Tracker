"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import { authorize } from "@/features/auth/access";
import { getT } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { markAllRead, markRead } from "./notifications";
import { sendPush } from "./push";

/*
 * Every action acts on the caller's own notifications, devices, and
 * preferences, taken from the session; nothing names another account.
 */

const idsSchema = z.array(z.uuid()).min(1).max(100);

export async function markNotificationsRead(ids: unknown): Promise<void> {
  const caller = await authorize("active");
  const parsed = idsSchema.safeParse(ids);
  if (!caller.ok || !parsed.success) return;
  await markRead(getDb(), caller.user.id, parsed.data);
}

export async function markAllNotificationsRead(): Promise<void> {
  const caller = await authorize("active");
  if (!caller.ok) return;
  await markAllRead(getDb(), caller.user.id);
  revalidatePath(routes.notifications);
}

const preferencesSchema = z
  .object({ emailReplies: z.boolean(), emailStatus: z.boolean(), pushSupport: z.boolean() })
  .partial()
  .strict();

export async function setNotificationPreferences(input: unknown): Promise<ActionResult> {
  const caller = await authorize("active");
  if (!caller.ok) return caller;
  const t = (await getT("notifications")).settings;
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return { ok: false, message: t.failed };
  }
  await getDb().update(users).set(parsed.data).where(eq(users.id, caller.user.id));
  revalidatePath(routes.settingsNotifications);
  return { ok: true, message: t.saved };
}

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
  label: z.string().trim().min(1).max(80),
});

/**
 * Keeps this device's subscription for the caller. An endpoint belongs to
 * one browser; if another account used it before on this device, it is the
 * caller's now.
 */
export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  const caller = await authorize("active");
  if (!caller.ok) return caller;
  const t = (await getT("notifications")).settings;
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.failed };
  const { endpoint, keys, label } = parsed.data;
  const values = { ownerId: caller.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, label };
  await getDb()
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  revalidatePath(routes.settingsNotifications);
  return { ok: true, message: t.enabled };
}

const removeSchema = z.union([
  z.object({ id: z.uuid() }),
  z.object({ endpoint: z.url().max(2048) }),
]);

export async function removePushSubscription(input: unknown): Promise<ActionResult> {
  const caller = await authorize("active");
  if (!caller.ok) return caller;
  const t = (await getT("notifications")).settings;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.failed };
  const which =
    "id" in parsed.data
      ? eq(pushSubscriptions.id, parsed.data.id)
      : eq(pushSubscriptions.endpoint, parsed.data.endpoint);
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.ownerId, caller.user.id), which));
  revalidatePath(routes.settingsNotifications);
  return { ok: true, message: "id" in parsed.data ? t.removed : t.disabled };
}

/** A test sent only to the caller's own devices, whatever the support preference says. */
export async function sendTestPush(): Promise<ActionResult> {
  const caller = await authorize("active");
  if (!caller.ok) return caller;
  const all = await getT("notifications");
  const outcome = await sendPush(
    getDb(),
    [caller.user.id],
    () => ({
      title: all.push.title,
      body: all.push.test,
      url: routes.settingsNotifications,
      tag: "test",
    }),
    { force: true },
  );
  return outcome.sent > 0
    ? { ok: true, message: all.settings.testSent }
    : { ok: false, message: all.settings.testNone };
}
