import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { users, type AppUser, type UserRole, type UserStatus } from "@/db/schema";
import type { Database } from "@/db/types";
import { lockAdministration } from "@/features/auth/provisioning";

export type UserCounts = { total: number; active: number; disabled: number };

export async function getUserCounts(db: Database): Promise<UserCounts> {
  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      disabled: sql<number>`count(*) filter (where ${users.status} = 'disabled')::int`,
    })
    .from(users);
  return row;
}

export async function listUsers(db: Database): Promise<AppUser[]> {
  return db.select().from(users).orderBy(asc(users.createdAt));
}

export type UserChange = { role?: UserRole; status?: UserStatus };
export type UserChangeResult =
  { ok: true; user: AppUser } | { ok: false; reason: "not-found" | "last-admin" };

/**
 * Changes a user's role or status. The application must always keep at least
 * one active administrator, so the check and the write share one transaction
 * and every such transaction takes the same lock.
 */
export async function updateUser(
  db: Database,
  userId: string,
  change: UserChange,
): Promise<UserChangeResult> {
  return db.transaction(async (tx) => {
    await tx.execute(lockAdministration);

    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, reason: "not-found" };

    const role = change.role ?? target.role;
    const status = change.status ?? target.status;
    const wasActiveAdmin = target.role === "admin" && target.status === "active";
    const staysActiveAdmin = role === "admin" && status === "active";

    if (wasActiveAdmin && !staysActiveAdmin) {
      const [others] = await tx
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId)));
      if (others.total === 0) return { ok: false, reason: "last-admin" };
    }

    const [user] = await tx
      .update(users)
      .set({ role, status })
      .where(eq(users.id, userId))
      .returning();
    return { ok: true, user };
  });
}
