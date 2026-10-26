// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  appSettings,
  bibleFavorites,
  bibleHighlights,
  ideas,
  notifications,
  preachingContexts,
  preachingOccurrences,
  preachingVenues,
  pushSubscriptions,
  sermonOutlineDocuments,
  sermonOutlines,
  supportAttachments,
  supportMessages,
  supportStatusEvents,
  supportTickets,
  tags,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { updateUser } from "@/features/admin/users";
import { provisionUser } from "@/features/auth/provisioning";
import {
  processDeletion,
  processPendingDeletions,
  requestDeletion,
  type DeletionDeps,
} from "./deletion";

let db: Database;
const deps = (): DeletionDeps & { blobs: string[][]; identities: string[] } => {
  const blobs: string[][] = [];
  const identities: string[] = [];
  return {
    blobs,
    identities,
    deleteBlobs: vi.fn(async (pathnames: string[]) => {
      blobs.push(pathnames);
      return true;
    }),
    deleteIdentity: vi.fn(async (id: string) => {
      identities.push(id);
    }),
  };
};

/** One account with something in every table the deletion has to clear. */
async function seed(clerkUserId: string, role: "admin" | "user" = "user") {
  const [user] = await db.insert(users).values({ clerkUserId, role }).returning();
  const owner = user.id;
  const [sermon] = await db
    .insert(ideas)
    .values({ ownerId: owner, title: `${clerkUserId} sermon`, kind: "sermon" })
    .returning();
  const [venue] = await db
    .insert(preachingVenues)
    .values({ ownerId: owner, name: "Main" })
    .returning();
  const [context] = await db
    .insert(preachingContexts)
    .values({ ownerId: owner, name: "Revival" })
    .returning();
  await db.insert(preachingOccurrences).values({
    ownerId: owner,
    sermonId: sermon.id,
    venueId: venue.id,
    contextId: context.id,
    preachedOn: "2026-01-04",
  });
  await db.insert(tags).values({ ownerId: owner, name: "Grace" });
  const [outline] = await db
    .insert(sermonOutlines)
    .values({ ownerId: owner, sermonId: sermon.id })
    .returning();
  await db.insert(sermonOutlineDocuments).values({
    outlineId: outline.id,
    ownerId: owner,
    content: { type: "doc", attrs: { schemaVersion: 4 }, content: [] },
  });
  await db.insert(bibleFavorites).values({
    ownerId: owner,
    translation: "kjv",
    selectionKey: "43:3:16",
    reference: "John 3:16",
    firstBook: 43,
    firstChapter: 3,
    firstVerse: 16,
  });
  await db.insert(bibleHighlights).values({
    ownerId: owner,
    translation: "kjv",
    book: 43,
    chapter: 3,
    verse: 16,
    color: "yellow",
  });
  const [ticket] = await db
    .insert(supportTickets)
    .values({ userId: owner, kind: "bug", source: "app", subject: "Broken" })
    .returning();
  await db.insert(supportMessages).values({
    ticketId: ticket.id,
    authorUserId: owner,
    author: "requester",
    body: "It broke",
  });
  await db.insert(supportAttachments).values({
    ownerId: owner,
    ticketId: ticket.id,
    pathname: `support/${clerkUserId}.png`,
    contentType: "image/png",
    size: 10,
  });
  await db.insert(notifications).values({
    recipientId: owner,
    kind: "reply",
    ticketId: ticket.id,
    eventKey: `message/${clerkUserId}`,
  });
  await db.insert(pushSubscriptions).values({
    ownerId: owner,
    endpoint: `https://push.example/${clerkUserId}`,
    p256dh: "key",
    auth: "auth",
    label: "Chrome on macOS",
  });
  return { user, ticket };
}

const rowsOf = async (owner: string) => ({
  ideas: (await db.select().from(ideas).where(eq(ideas.ownerId, owner))).length,
  tickets: (await db.select().from(supportTickets).where(eq(supportTickets.userId, owner))).length,
  highlights: (await db.select().from(bibleHighlights).where(eq(bibleHighlights.ownerId, owner)))
    .length,
  notifications: (await db.select().from(notifications).where(eq(notifications.recipientId, owner)))
    .length,
  devices: (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerId, owner)))
    .length,
  documents: (
    await db.select().from(sermonOutlineDocuments).where(eq(sermonOutlineDocuments.ownerId, owner))
  ).length,
});

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("account deletion", () => {
  it("removes everything the account owns and nothing of anyone else's", async () => {
    const admin = await seed("user_admin", "admin");
    const gone = await seed("user_gone", "admin");
    // The leaving administrator answered someone else's ticket and changed its status.
    await db.insert(supportMessages).values({
      ticketId: admin.ticket.id,
      authorUserId: gone.user.id,
      author: "admin",
      body: "Fixed now.",
    });
    await db.insert(supportStatusEvents).values({
      ticketId: admin.ticket.id,
      fromStatus: "open",
      toStatus: "resolved",
      actorUserId: gone.user.id,
    });
    await db.insert(appSettings).values({ spanishEnabled: true, updatedBy: gone.user.id });

    expect(await requestDeletion(db, gone.user.id)).toEqual({ ok: true });
    const services = deps();
    expect(await processDeletion(db, gone.user.id, services)).toBe("done");

    expect(services.blobs).toEqual([["support/user_gone.png"]]);
    expect(services.identities).toEqual(["user_gone"]);
    expect(await db.select().from(users).where(eq(users.id, gone.user.id))).toHaveLength(0);
    expect(await rowsOf(gone.user.id)).toEqual({
      ideas: 0,
      tickets: 0,
      highlights: 0,
      notifications: 0,
      devices: 0,
      documents: 0,
    });

    expect(await rowsOf(admin.user.id)).toEqual({
      ideas: 1,
      tickets: 1,
      highlights: 1,
      notifications: 1,
      devices: 1,
      documents: 1,
    });
    const reply = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.body, "Fixed now."));
    expect(reply).toMatchObject([{ authorUserId: null, author: "admin" }]);
    const [event] = await db.select().from(supportStatusEvents);
    expect(event.actorUserId).toBeNull();
    const [settings] = await db.select().from(appSettings);
    expect(settings.updatedBy).toBeNull();
    expect(
      await db
        .select()
        .from(supportAttachments)
        .where(eq(supportAttachments.ownerId, admin.user.id)),
    ).toHaveLength(1);
  });

  it("keeps the account locked, and its data, when the screenshots cannot be removed yet", async () => {
    const { user } = await seed("user_a");
    await requestDeletion(db, user.id);
    const failing = { ...deps(), deleteBlobs: async () => false };
    expect(await processDeletion(db, user.id, failing)).toBe("retry");
    expect(await rowsOf(user.id)).toMatchObject({ ideas: 1 });
    const [locked] = await db.select().from(users).where(eq(users.id, user.id));
    expect(locked.status).toBe("deleting");

    expect(await processPendingDeletions(db, deps())).toEqual({ done: 1, gone: 0, retry: 0 });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("keeps the locked row until the identity is gone, so it cannot be provisioned again", async () => {
    const { user } = await seed("user_a");
    await requestDeletion(db, user.id);
    const failing = {
      ...deps(),
      deleteIdentity: async () => {
        throw new Error("Clerk is down");
      },
    };
    expect(await processDeletion(db, user.id, failing)).toBe("retry");
    expect(await rowsOf(user.id)).toEqual({
      ideas: 0,
      tickets: 0,
      highlights: 0,
      notifications: 0,
      devices: 0,
      documents: 0,
    });

    // The identity still signs in: it finds its locked row, never a new account.
    const mayJoin = vi.fn(async () => true);
    const again = await provisionUser(db, "user_a", { mayJoin });
    expect(again).toMatchObject({ ok: true, user: { id: user.id, status: "deleting" } });
    expect(mayJoin).not.toHaveBeenCalled();
    expect(await updateUser(db, user.id, { status: "active" })).toEqual({
      ok: false,
      reason: "deleting",
    });

    expect(await processDeletion(db, user.id, deps())).toBe("done");
    expect(await processDeletion(db, user.id, deps())).toBe("gone");
  });

  it("refuses to delete the last active administrator", async () => {
    const { user } = await seed("user_owner", "admin");
    expect(await requestDeletion(db, user.id)).toEqual({ ok: false, reason: "last-admin" });
    expect(await processDeletion(db, user.id, deps())).toBe("gone");
    expect(await rowsOf(user.id)).toMatchObject({ ideas: 1 });
  });

  it("does nothing to an account that was not asked to be deleted", async () => {
    const { user } = await seed("user_a");
    expect(await processDeletion(db, user.id, deps())).toBe("gone");
    expect(await requestDeletion(db, crypto.randomUUID())).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
