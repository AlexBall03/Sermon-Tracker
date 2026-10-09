import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import type { AppUser } from "@/db/schema";
import { env, isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { appAccessMetadataKey, provisionUser } from "./provisioning";

export type Access =
  | { state: "signed-out" }
  | { state: "denied"; reason: "not-invited" | "disabled" }
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
    isInvited: async () => {
      const client = await clerkClient();
      const identity = await client.users.getUser(userId);
      return identity.publicMetadata[appAccessMetadataKey] === true;
    },
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

/** For pages and layouts: an active account, or a redirect. */
export async function requireActiveUser() {
  const access = await getAccess();
  if (access.state === "signed-out") redirect(routes.signIn);
  if (access.state === "denied") redirect(routes.accessDenied);
  return access.user;
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
 */
export async function authorize(requirement: "active" | "admin"): Promise<Authorization> {
  const access = await getAccess();
  if (access.state === "signed-out")
    return { ok: false, message: "Your session has ended. Sign in again." };
  if (access.state === "denied")
    return { ok: false, message: "Your account does not have access." };
  if (requirement === "admin" && access.user.role !== "admin") {
    return { ok: false, message: "Only administrators can do that." };
  }
  return { ok: true, user: access.user };
}
