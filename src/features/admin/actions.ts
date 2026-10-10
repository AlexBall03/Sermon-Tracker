"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { userRoles, userStatuses } from "@/db/schema";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import type { ActionResult } from "@/lib/action-result";
import { routes, siteConfig } from "@/lib/site";
import { createInvitation, describeClerkError, resendInvitation, revokeInvitation } from "./clerk";
import { updateUser, type UserChange } from "./users";

const userIdSchema = z.uuid();
const roleSchema = z.enum(userRoles);
const statusSchema = z.enum(userStatuses);
const emailSchema = z.email().max(254);
const invitationIdSchema = z.string().regex(/^inv_\w+$/);

const invalid: ActionResult = { ok: false, message: "That request was not valid." };

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
  success: string,
): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;

  const id = userIdSchema.safeParse(userId);
  if (!id.success) return invalid;
  if (id.data === actor.user.id) {
    return { ok: false, message: "You cannot change your own account. Ask another administrator." };
  }

  try {
    const result = await updateUser(getDb(), id.data, change);
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === "last-admin"
            ? "There must always be at least one active administrator."
            : "That user no longer exists.",
      };
    }
  } catch (error) {
    console.error("User update failed:", describeDatabaseError(error));
    return { ok: false, message: "The change could not be saved. Try again." };
  }

  revalidatePath(routes.admin);
  return { ok: true, message: success };
}

export async function setUserRole(userId: string, role: string): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return invalid;
  return changeUser(
    userId,
    { role: parsed.data },
    parsed.data === "admin" ? "User is now an administrator." : "User is now a standard user.",
  );
}

export async function setUserStatus(userId: string, status: string): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return invalid;
  return changeUser(
    userId,
    { status: parsed.data },
    parsed.data === "active" ? "Account re-enabled." : "Account disabled.",
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

  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { ok: false, message: "Enter a valid email address." };

  const origin = await requestOrigin();
  return invitationAction(
    () => createInvitation(email.data, origin),
    `Invitation sent to ${email.data}.`,
    "The invitation could not be sent. Try again.",
  );
}

export async function revokeUserInvitation(invitationId: string): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;

  const id = invitationIdSchema.safeParse(invitationId);
  if (!id.success) return invalid;

  return invitationAction(
    () => revokeInvitation(id.data),
    "Invitation revoked.",
    "The invitation could not be revoked. Try again.",
  );
}

export async function resendUserInvitation(invitationId: string): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;

  const id = invitationIdSchema.safeParse(invitationId);
  if (!id.success) return invalid;

  const origin = await requestOrigin();
  return invitationAction(
    () => resendInvitation(id.data, origin),
    "Invitation sent again.",
    "The invitation could not be sent again. Try again.",
  );
}
