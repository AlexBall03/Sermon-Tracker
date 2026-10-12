"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { userRoles, userStatuses } from "@/db/schema";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { writeSpanishEnabled } from "@/features/preferences/settings";
import { dictionary } from "@/i18n";
import { getT } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { routes, siteConfig } from "@/lib/site";
import { createInvitation, describeClerkError, resendInvitation, revokeInvitation } from "./clerk";
import { updateUser, type UserChange } from "./users";

const userIdSchema = z.uuid();
const roleSchema = z.enum(userRoles);
const statusSchema = z.enum(userStatuses);
const emailSchema = z.email().max(254);
const invitationIdSchema = z.string().regex(/^inv_\w+$/);

type Messages = ReturnType<typeof dictionary<"admin">>["actions"];

async function requestOrigin() {
  return (await headers()).get("origin") ?? siteConfig.url;
}

/**
 * Every action below authorises itself when it runs. The acting administrator
 * comes from the session; nothing about the caller is read from the request.
 */
async function changeUser(
  userId: unknown,
  change: UserChange,
  success: (t: Messages) => string,
): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const t = (await getT("admin")).actions;

  const id = userIdSchema.safeParse(userId);
  if (!id.success) return { ok: false, message: t.invalid };
  if (id.data === actor.user.id) {
    return { ok: false, message: t.ownAccount };
  }

  try {
    const result = await updateUser(getDb(), id.data, change);
    if (!result.ok) {
      return {
        ok: false,
        message: result.reason === "last-admin" ? t.lastAdmin : t.userMissing,
      };
    }
  } catch (error) {
    console.error("User update failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }

  revalidatePath(routes.admin);
  return { ok: true, message: success(t) };
}

export async function setUserRole(userId: string, role: string): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, message: (await getT("admin")).actions.invalid };
  return changeUser(userId, { role: parsed.data }, (t) =>
    parsed.data === "admin" ? t.nowAdmin : t.nowUser,
  );
}

export async function setUserStatus(userId: string, status: string): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: (await getT("admin")).actions.invalid };
  return changeUser(userId, { status: parsed.data }, (t) =>
    parsed.data === "active" ? t.enabled : t.disabled,
  );
}

async function invitationAction(
  run: () => Promise<void>,
  success: string,
  failure: string,
): Promise<ActionResult> {
  try {
    await run();
  } catch (error) {
    return { ok: false, message: describeClerkError(error, failure) };
  }
  revalidatePath(routes.admin);
  return { ok: true, message: success };
}

export async function inviteUser(_previous: ActionResult | null, formData: FormData) {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const t = (await getT("admin")).actions;

  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { ok: false, message: t.invalidEmail };

  const origin = await requestOrigin();
  return invitationAction(
    () => createInvitation(email.data, origin),
    t.invited(email.data),
    t.notInvited,
  );
}

export async function revokeUserInvitation(invitationId: string): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const t = (await getT("admin")).actions;

  const id = invitationIdSchema.safeParse(invitationId);
  if (!id.success) return { ok: false, message: t.invalid };

  return invitationAction(() => revokeInvitation(id.data), t.revoked, t.notRevoked);
}

export async function resendUserInvitation(invitationId: string): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const t = (await getT("admin")).actions;

  const id = invitationIdSchema.safeParse(invitationId);
  if (!id.success) return { ok: false, message: t.invalid };

  const origin = await requestOrigin();
  return invitationAction(() => resendInvitation(id.data, origin), t.resent, t.notResent);
}

/**
 * Switches Spanish on or off for every account: the Spanish interface and the
 * Spanish Bible together. Administrators only, decided here from the session.
 *
 * It writes one row and nothing else. No preference, favorite, or highlight
 * is changed, so switching it back on restores what each person had. Every
 * request reads the row, so the change is in force on the next one.
 */
export async function setSpanishEnabled(enabled: unknown): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  // Said in the language the administrator will see the page in afterwards.
  const locale = enabled === true ? actor.user.locale : "en";
  const t = dictionary(locale, "admin");

  if (typeof enabled !== "boolean") return { ok: false, message: t.actions.invalid };

  try {
    await writeSpanishEnabled(getDb(), enabled, actor.user.id);
  } catch (error) {
    console.error("Spanish switch change failed:", describeDatabaseError(error));
    return { ok: false, message: t.language.notSaved };
  }

  // Every page of every shell is written in a language and may offer a translation.
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? t.language.turnedOn : t.language.turnedOff };
}
