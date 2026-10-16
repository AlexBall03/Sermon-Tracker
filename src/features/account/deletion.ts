import { and, count, eq, inArray, ne, or } from "drizzle-orm";

import {
  bibleFavorites,
  bibleHighlights,
  ideas,
  preachingContexts,
  preachingOccurrences,
  preachingVenues,
  supportAttachments,
  supportMessages,
  supportStatusEvents,
  supportTickets,
  syncOperations,
  tags,
  users,
} from "@/db/schema";
import type { Database } from "@/db/types";
import { lockAdministration } from "@/features/auth/provisioning";

/*
 * Deleting an account, in two steps that are each safe to repeat.
 *
 * `requestDeletion` locks the account for good (`status = 'deleting'`): from
 * then on every page and action refuses it, and `provisionUser` keeps
 * returning the locked row, so the identity cannot come back as a new account.
 * `processDeletion` then removes, in order, the private screenshots, every row
 * the account owns (one transaction), the Clerk identity, and last the `users`
 * row itself. A step that fails leaves the account locked and is tried again,
 * by the next request or by the daily cron (`processPendingDeletions`).
 */

export type DeletionRequest = { ok: true } | { ok: false; reason: "not-found" | "last-admin" };

export async function requestDeletion(db: Database, userId: string): Promise<DeletionRequest> {
  return db.transaction(async (tx) => {
    await tx.execute(lockAdministration);
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, reason: "not-found" };
    if (target.status === "deleting") return { ok: true };

    if (target.role === "admin" && target.status === "active") {
      const [others] = await tx
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId)));
      if (others.total === 0) return { ok: false, reason: "last-admin" };
    }

    await tx.update(users).set({ status: "deleting" }).where(eq(users.id, userId));
    return { ok: true };
  });
}

export type DeletionDeps = {
  /** Removes private Blob objects; false when it could not. */
  deleteBlobs: (pathnames: string[]) => Promise<boolean>;
  /** Removes the Clerk identity; an identity already gone is not an error. */
  deleteIdentity: (clerkUserId: string) => Promise<void>;
};

/** `done`: nothing is left. `gone`: no account is waiting to be deleted. `retry`: locked, try again later. */
export type DeletionOutcome = "done" | "gone" | "retry";

export async function processDeletion(
  db: Database,
  userId: string,
  deps: DeletionDeps,
): Promise<DeletionOutcome> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "deleting")))
    .limit(1);
  if (!user) return "gone";

  const ownTickets = db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId));
  const files = await db
    .select({ pathname: supportAttachments.pathname })
    .from(supportAttachments)
    .where(
      or(eq(supportAttachments.ownerId, userId), inArray(supportAttachments.ticketId, ownTickets)),
    );
  if (!(await deps.deleteBlobs(files.map((file) => file.pathname)))) return "retry";

  try {
    await db.transaction(async (tx) => {
      // The account's own conversations go whole: messages, status changes, and screenshots cascade.
      await tx.delete(supportTickets).where(eq(supportTickets.userId, userId));
      // What it wrote on other people's tickets (an administrator's replies) stays, with no author.
      await tx
        .update(supportMessages)
        .set({ authorUserId: null })
        .where(eq(supportMessages.authorUserId, userId));
      await tx
        .update(supportStatusEvents)
        .set({ actorUserId: null })
        .where(eq(supportStatusEvents.actorUserId, userId));
      await tx.delete(supportAttachments).where(eq(supportAttachments.ownerId, userId));

      // Occasions first: they hold their sermon, venue, and context in place.
      await tx.delete(preachingOccurrences).where(eq(preachingOccurrences.ownerId, userId));
      // Tags on ideas, passages, relations, points, and outlines cascade from the ideas.
      await tx.delete(ideas).where(eq(ideas.ownerId, userId));
      await tx.delete(tags).where(eq(tags.ownerId, userId));
      await tx.delete(preachingVenues).where(eq(preachingVenues.ownerId, userId));
      await tx.delete(preachingContexts).where(eq(preachingContexts.ownerId, userId));
      await tx.delete(bibleFavorites).where(eq(bibleFavorites.ownerId, userId));
      await tx.delete(bibleHighlights).where(eq(bibleHighlights.ownerId, userId));
      await tx.delete(syncOperations).where(eq(syncOperations.ownerId, userId));
    });
  } catch (error) {
    console.error("Account data deletion failed:", error instanceof Error ? error.message : error);
    return "retry";
  }

  try {
    await deps.deleteIdentity(user.clerkUserId);
  } catch (error) {
    console.error("Identity deletion failed:", error instanceof Error ? error.message : error);
    return "retry";
  }

  // Last, so an identity that still exists always finds its locked row.
  try {
    await db.delete(users).where(and(eq(users.id, userId), eq(users.status, "deleting")));
  } catch (error) {
    console.error("Account row deletion failed:", error instanceof Error ? error.message : error);
    return "retry";
  }
  return "done";
}

/** The cron's retry: every account still locked for deletion, a few at a time. */
export async function processPendingDeletions(db: Database, deps: DeletionDeps, limit = 10) {
  const pending = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "deleting"))
    .limit(limit);
  const outcomes = { done: 0, gone: 0, retry: 0 };
  for (const { id } of pending) outcomes[await processDeletion(db, id, deps)] += 1;
  return outcomes;
}
