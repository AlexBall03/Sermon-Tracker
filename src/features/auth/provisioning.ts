import { count, eq, sql } from "drizzle-orm";

import { users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";

/**
 * Taken by every transaction that changes a role or status, so checks such as
 * "is this the last active administrator" cannot race each other.
 */
export const lockAdministration = sql`select pg_advisory_xact_lock(712001)`;

/** Key set in Clerk public metadata by invitations this application sends. */
export const appAccessMetadataKey = "appAccess";

export type ProvisionResult = { ok: true; user: AppUser } | { ok: false; reason: "not-invited" };

type ProvisionOptions = {
  /** INITIAL_ADMIN_CLERK_USER_ID, when configured. */
  initialAdminId?: string;
  /** Whether Clerk records this identity as invited. Only called for new identities. */
  isInvited: () => Promise<boolean>;
};

async function findByClerkId(db: Database, clerkUserId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return user;
}

/**
 * Returns the application user for a signed-in Clerk identity, creating the
 * row on first sign-in. Safe to call on every request and from concurrent
 * requests: the unique constraint on `clerk_user_id` decides the winner.
 *
 * An existing row is returned as it is. Status is never changed here, so a
 * disabled account stays disabled.
 */
export async function provisionUser(
  db: Database,
  clerkUserId: string,
  { initialAdminId, isInvited }: ProvisionOptions,
): Promise<ProvisionResult> {
  const isInitialAdmin = Boolean(initialAdminId) && clerkUserId === initialAdminId;

  let user = await findByClerkId(db, clerkUserId);
  if (!user) {
    if (!isInitialAdmin && !(await isInvited())) return { ok: false, reason: "not-invited" };
    await db
      .insert(users)
      .values({ clerkUserId, role: isInitialAdmin ? "admin" : "user" })
      .onConflictDoNothing({ target: users.clerkUserId });
    user = await findByClerkId(db, clerkUserId);
    if (!user) throw new Error("User provisioning failed.");
  }

  if (isInitialAdmin && user.role !== "admin") user = await bootstrapAdmin(db, user);
  return { ok: true, user };
}

/**
 * Covers the case where the designated person already had an ordinary account
 * before the setting was added. They are promoted only while the application
 * has no administrator at all, so a later deliberate demotion is not undone.
 */
async function bootstrapAdmin(db: Database, user: AppUser) {
  return db.transaction(async (tx) => {
    await tx.execute(lockAdministration);
    const [admins] = await tx.select({ total: count() }).from(users).where(eq(users.role, "admin"));
    if (admins.total > 0) return user;
    const [promoted] = await tx
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id))
      .returning();
    return promoted;
  });
}
