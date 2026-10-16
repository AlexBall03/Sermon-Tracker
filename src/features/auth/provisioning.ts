import { count, eq, sql } from "drizzle-orm";

import { users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";
import { defaultLocale, type Locale } from "@/i18n/locales";

/**
 * Taken by every transaction that changes a role or status, so checks such as
 * "is this the last active administrator" cannot race each other.
 */
export const lockAdministration = sql`select pg_advisory_xact_lock(712001)`;

/** Key set in Clerk public metadata by invitations this application sends. */
export const appAccessMetadataKey = "appAccess";

export type ProvisionResult = { ok: true; user: AppUser } | { ok: false; reason: "unverified" };

type ProvisionOptions = {
  /** INITIAL_ADMIN_CLERK_USER_ID, when configured. */
  initialAdminId?: string;
  /**
   * Whether this identity may have an account: Clerk records it as invited,
   * or its email address is verified. Only called for new identities.
   */
  mayJoin: () => Promise<boolean>;
  /**
   * The interface language a new account starts in, which is the browser's.
   * Only called for new identities; an existing account keeps what it saved.
   */
  locale?: () => Promise<Locale>;
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
  { initialAdminId, mayJoin, locale }: ProvisionOptions,
): Promise<ProvisionResult> {
  const isInitialAdmin = Boolean(initialAdminId) && clerkUserId === initialAdminId;

  let user = await findByClerkId(db, clerkUserId);
  if (!user) {
    // Every new account is an ordinary user, whoever asks: only the configured
    // initial administrator starts as anything else.
    if (!isInitialAdmin && !(await mayJoin())) return { ok: false, reason: "unverified" };
    await db
      .insert(users)
      .values({
        clerkUserId,
        role: isInitialAdmin ? "admin" : "user",
        locale: (await locale?.()) ?? defaultLocale,
      })
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
