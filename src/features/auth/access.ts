import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import type { AppUser } from "@/db/schema";
import { needsOnboarding } from "@/features/onboarding/model";
import { deviceLocale } from "@/i18n/device";
import { env, isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { appAccessMetadataKey, provisionUser } from "./provisioning";

export type Access =
  | { state: "signed-out" }
  | { state: "denied"; reason: "unverified" | "disabled" }
  | { state: "active"; user: AppUser };

/**
 * Resolves the caller: Clerk says who they are, the database says what they
 * may do. Memoised for the duration of one request.
 */
export const getAccess = cache(async (): Promise<Access> => {
  // Always decided per request, so an access decision can never be prerendered.
  await connection();
  if (!isAuthConfigured()) return { state: "signed-out" };

  const { userId } = await auth();
  if (!userId) return { state: "signed-out" };

  const result = await provisionUser(getDb(), userId, {
    initialAdminId: env.INITIAL_ADMIN_CLERK_USER_ID,
    // Registration is open: an invited identity, or one whose email Clerk has verified.
    mayJoin: async () => {
      const client = await clerkClient();
      const identity = await client.users.getUser(userId);
      if (identity.publicMetadata[appAccessMetadataKey] === true) return true;
      const primary = identity.emailAddresses.find(
        (address) => address.id === identity.primaryEmailAddressId,
      );
      return primary?.verification?.status === "verified";
    },
    locale: deviceLocale,
  });

  if (!result.ok) return { state: "denied", reason: result.reason };
  if (result.user.status !== "active") return { state: "denied", reason: "disabled" };
  return { state: "active", user: result.user };
});

/** The current application user, or null when signed out or not allowed in. */
export async function getCurrentAppUser() {
  const access = await getAccess();
  return access.state === "active" ? access.user : null;
}

/*
 * Three questions, asked in this order and never mixed: who is this (Clerk),
 * may they be here at all (the account's status), and have they finished
 * first-time setup (features/onboarding). The last is not a role and grants
 * nothing: it only decides whether an account that is allowed in may reach
 * the application yet, or is sent to finish setup first. It is decided here,
 * for every page, action, and route, and nowhere else.
 */

/**
 * For the setup page alone: an active account, whether or not it has finished
 * first-time setup, or a redirect. Everything else uses `requireActiveUser`.
 */
export async function requireAccount() {
  const access = await getAccess();
  if (access.state === "signed-out") redirect(routes.signIn);
  if (access.state === "denied") redirect(routes.accessDenied);
  return access.user;
}

/**
 * For pages and layouts: an active account that has finished first-time
 * setup, or a redirect. A new account is sent to finish it.
 */
export async function requireActiveUser() {
  const user = await requireAccount();
  if (needsOnboarding(user)) redirect(routes.onboarding);
  return user;
}

/** For pages and layouts: an active administrator, or a redirect. */
export async function requireAdmin() {
  const user = await requireActiveUser();
  if (user.role !== "admin") redirect(routes.accessDenied);
  return user;
}

export type Authorization = { ok: true; user: AppUser } | { ok: false; message: string };

/**
 * For server actions and route handlers: the same checks, returned as a value
 * so the caller can report the failure instead of navigating away.
 *
 * `"active"` and `"admin"` refuse an account that has not finished
 * first-time setup. `"account"` admits it, and is only for what setup itself
 * needs: its own two actions, and saving the profile, the language, and the
 * Bible translation.
 */
export async function authorize(
  requirement: "account" | "active" | "admin",
): Promise<Authorization> {
  const access = await getAccess();
  if (access.state === "signed-out")
    return { ok: false, message: "Your session has ended. Sign in again." };
  if (access.state === "denied")
    return { ok: false, message: "Your account does not have access." };
  if (requirement !== "account" && needsOnboarding(access.user)) {
    return { ok: false, message: "Finish setting up your account first." };
  }
  if (requirement === "admin" && access.user.role !== "admin") {
    return { ok: false, message: "Only administrators can do that." };
  }
  return { ok: true, user: access.user };
}
