// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { supportAttachments, supportMessages, supportTickets, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { rateLimits, sniffImageType, statusesFor } from "./model";
import { parseInboxQuery } from "./schemas";
import {
  adminGetTicket,
  adminReply,
  adminSearchTickets,
  adminSetStatus,
  attachmentForViewer,
  closeOwnTicket,
  createPublicContact,
  createTicket,
  getOwnTicket,
  listOwnTickets,
  markReadByAdmin,
  orphanedAttachments,
  recordAttachment,
  removeUnattached,
  replyAsRequester,
  type FeedbackInput,
} from "./tickets";

let db: Database;
let me: string;
let other: string;
let admin: string;

const feedback = (change: Partial<FeedbackInput> = {}): FeedbackInput => ({
  kind: "bug",
  subject: "Outline will not save",
  message: "The save button spins.",
  steps: "Open an outline",
  expected: "It saves",
  area: "Outlines",
  useCase: null,
  pageUrl: "/outlines/1",
  userAgent: "Test",
  attachmentIds: [],
  ...change,
});

const contact = (change: Record<string, unknown> = {}) => ({
  name: "Ruth",
  email: "ruth@example.com",
  subject: "Access for our church",
  message: "How do we join?",
  locale: "en" as const,
  ipHash: "net-1",
  ...change,
});

async function ticketOf(userId: string, change: Partial<FeedbackInput> = {}) {
  const outcome = await createTicket(db, userId, feedback(change), "en");
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.ticket.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([
      { clerkUserId: "user_me" },
      { clerkUserId: "user_other" },
      { clerkUserId: "user_admin", role: "admin" },
    ])
    .returning();
  [me, other, admin] = rows.map((row) => row.id);
});

describe("an account's tickets", () => {
  it("are created for the session's account, with the first message", async () => {
    const outcome = await createTicket(db, me, feedback(), "es");
    expect(outcome.ok && outcome.created).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.ticket).toMatchObject({
      userId: me,
      source: "app",
      status: "open",
      locale: "es",
    });
    expect(outcome.message).toMatchObject({ author: "requester", body: "The save button spins." });
  });

  it("are never seen, replied to, or closed by another account", async () => {
    const id = await ticketOf(me);
    expect(await getOwnTicket(db, other, id)).toBeNull();
    expect(await listOwnTickets(db, other)).toEqual([]);
    expect(await replyAsRequester(db, other, id, "Me too")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await closeOwnTicket(db, other, id)).toEqual({ ok: false, reason: "not_found" });
    expect((await getOwnTicket(db, me, id))!.messages).toHaveLength(1);
  });

  it("never show the requester an internal note", async () => {
    const id = await ticketOf(me);
    await adminReply(db, admin, id, { body: "Looks like the queue.", visibility: "internal" });
    await adminReply(db, admin, id, { body: "We are looking into it.", visibility: "public" });
    const mine = await getOwnTicket(db, me, id);
    expect(mine!.messages.map((message) => message.body)).toEqual([
      "The save button spins.",
      "We are looking into it.",
    ]);
    const all = await adminGetTicket(db, id);
    expect(all!.messages).toHaveLength(3);
  });

  it("mark a public reply from the team unread until the requester looks", async () => {
    const id = await ticketOf(me);
    expect((await listOwnTickets(db, me))[0].unread).toBe(false);
    await adminReply(db, admin, id, { body: "A note", visibility: "internal" });
    expect((await listOwnTickets(db, me))[0].unread).toBe(false);
    await adminReply(
      db,
      admin,
      id,
      { body: "An answer", visibility: "public" },
      new Date(Date.now() + 1000),
    );
    expect((await listOwnTickets(db, me))[0].unread).toBe(true);
  });

  it("are one ticket when the same ID or the same words arrive twice", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const first = await createTicket(db, me, feedback(), "en", id);
    const again = await createTicket(db, me, feedback(), "en", id);
    const repeated = await createTicket(db, me, feedback(), "en");
    expect(again.ok && !again.created && again.ticket.id === id).toBe(true);
    expect(repeated.ok && !repeated.created && repeated.ticket.id === id).toBe(true);
    expect(first.ok && first.created).toBe(true);
    expect(await db.select().from(supportTickets)).toHaveLength(1);
  });

  it("do not take another account's ID as their own", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    await createTicket(db, other, feedback(), "en", id);
    await expect(createTicket(db, me, feedback({ subject: "Other" }), "en", id)).rejects.toThrow();
    expect(await getOwnTicket(db, me, id)).toBeNull();
  });

  it("are limited per hour", async () => {
    for (let index = 0; index < rateLimits.ticketsPerHour; index += 1) {
      await ticketOf(me, { subject: `Report ${index}` });
    }
    expect(await createTicket(db, me, feedback({ subject: "One more" }), "en")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect((await createTicket(db, other, feedback(), "en")).ok).toBe(true);
  });

  it("open again when the requester replies to a finished one, and say so in the history", async () => {
    const id = await ticketOf(me);
    await adminSetStatus(db, admin, id, "resolved");
    const reply = await replyAsRequester(db, me, id, "It is back.");
    expect(reply.ok && reply.ticket.status).toBe("open");
    expect(reply.ok && reply.event?.fromStatus).toBe("resolved");
    expect((await adminGetTicket(db, id))!.events.map((event) => event.toStatus)).toEqual([
      "resolved",
      "open",
    ]);
  });

  it("close once: closing a closed one changes nothing", async () => {
    const id = await ticketOf(me);
    expect((await closeOwnTicket(db, me, id)).ok).toBe(true);
    expect(await closeOwnTicket(db, me, id)).toEqual({ ok: false, reason: "unchanged" });
  });
});

describe("statuses", () => {
  it("are only those that suit the kind", async () => {
    const bug = await ticketOf(me);
    const idea = await ticketOf(me, { kind: "feature", subject: "Dark Bible" });
    expect(statusesFor("bug")).not.toContain("planned");
    expect(await adminSetStatus(db, admin, bug, "planned")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    const planned = await adminSetStatus(db, admin, idea, "planned");
    expect(planned.ok && planned.ticket.status).toBe("planned");
  });

  it("write one history row per change, and none for the same status again", async () => {
    const id = await ticketOf(me);
    await adminSetStatus(db, admin, id, "under_review");
    expect(await adminSetStatus(db, admin, id, "under_review")).toEqual({
      ok: false,
      reason: "unchanged",
    });
    await adminSetStatus(db, admin, id, "in_progress");
    const { events } = (await adminGetTicket(db, id))!;
    expect(events.map((event) => [event.fromStatus, event.toStatus, event.actorUserId])).toEqual([
      ["open", "under_review", admin],
      ["under_review", "in_progress", admin],
    ]);
  });
});

describe("the public contact form", () => {
  it("saves a contact message with no account", async () => {
    const outcome = await createPublicContact(db, contact());
    expect(outcome.ok && outcome.ticket).toMatchObject({
      userId: null,
      kind: "contact",
      source: "public",
      contactEmail: "ruth@example.com",
    });
  });

  it("is one message when sent twice", async () => {
    await createPublicContact(db, contact());
    const again = await createPublicContact(db, contact());
    expect(again.ok && again.created).toBe(false);
    expect(await db.select().from(supportMessages)).toHaveLength(1);
  });

  it("is limited per address and per network", async () => {
    for (let index = 0; index < rateLimits.publicPerHour; index += 1) {
      await createPublicContact(db, contact({ subject: `Hello ${index}`, ipHash: `net-${index}` }));
    }
    expect(await createPublicContact(db, contact({ subject: "Again", ipHash: "net-new" }))).toEqual(
      {
        ok: false,
        reason: "rate_limited",
      },
    );
    for (let index = 0; index < rateLimits.publicPerHour; index += 1) {
      await createPublicContact(db, contact({ email: `x${index}@example.com`, ipHash: "busy" }));
    }
    expect(
      await createPublicContact(db, contact({ email: "y@example.com", ipHash: "busy" })),
    ).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("cannot be replied to or read as anyone's own", async () => {
    const outcome = await createPublicContact(db, contact());
    if (!outcome.ok) throw new Error("refused");
    expect(await getOwnTicket(db, me, outcome.ticket.id)).toBeNull();
    expect((await replyAsRequester(db, me, outcome.ticket.id, "Hi")).ok).toBe(false);
  });

  it("is refused by the table without an address", async () => {
    await expect(
      db.insert(supportTickets).values({ kind: "contact", source: "public", subject: "x" }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(supportTickets)
        .values({ kind: "bug", source: "public", subject: "x", contactEmail: "a@b.c" }),
    ).rejects.toThrow();
  });
});

describe("the inbox", () => {
  it("finds by words in the subject, the message, or the address, and filters", async () => {
    await ticketOf(me);
    await ticketOf(other, {
      kind: "feature",
      subject: "Psalm titles",
      message: "Show the superscriptions",
    });
    await createPublicContact(db, contact());
    const all = await adminSearchTickets(db, parseInboxQuery({}));
    expect(all.total).toBe(3);
    expect(
      (await adminSearchTickets(db, parseInboxQuery({ q: "superscriptions" }))).rows.map(
        (row) => row.subject,
      ),
    ).toEqual(["Psalm titles"]);
    expect((await adminSearchTickets(db, parseInboxQuery({ q: "superscriptions" }))).total).toBe(1);
    expect((await adminSearchTickets(db, parseInboxQuery({ q: "ruth@" }))).total).toBe(1);
    expect((await adminSearchTickets(db, parseInboxQuery({ kind: "feature" }))).total).toBe(1);
    expect((await adminSearchTickets(db, parseInboxQuery({ source: "public" }))).total).toBe(1);
  });

  it("marks a ticket unread until an administrator opens it, and again when the requester replies", async () => {
    const id = await ticketOf(me);
    const unread = async () => (await adminSearchTickets(db, parseInboxQuery({}))).rows[0].unread;
    expect(await unread()).toBe(true);
    await markReadByAdmin(db, id, new Date(Date.now() + 1000));
    expect(await unread()).toBe(false);
    await replyAsRequester(db, me, id, "More detail", new Date(Date.now() + 2000));
    expect(await unread()).toBe(true);
  });

  it("reads anything it does not understand as the default", () => {
    expect(parseInboxQuery({ kind: "nonsense", status: "x", sort: "y", page: "-3" })).toEqual({
      q: "",
      kind: null,
      status: null,
      source: null,
      sort: "updated",
      page: 1,
    });
  });
});

describe("screenshots", () => {
  const png = { contentType: "image/png", size: 10 };

  it("are attached only from the account's own unattached uploads", async () => {
    const mine = await recordAttachment(db, me, {
      id: crypto.randomUUID(),
      pathname: "support/a.png",
      ...png,
    });
    const theirs = await recordAttachment(db, other, {
      id: crypto.randomUUID(),
      pathname: "support/b.png",
      ...png,
    });
    const id = await ticketOf(me, { attachmentIds: [mine.id, theirs.id] });
    const rows = await db.select().from(supportAttachments);
    expect(rows.find((row) => row.id === mine.id)!.ticketId).toBe(id);
    expect(rows.find((row) => row.id === theirs.id)!.ticketId).toBeNull();
    expect((await getOwnTicket(db, me, id))!.attachments.map((row) => row.id)).toEqual([mine.id]);
  });

  it("are shown to their owner and to administrators, and to nobody else", async () => {
    const file = await recordAttachment(db, me, {
      id: crypto.randomUUID(),
      pathname: "support/c.png",
      ...png,
    });
    const asUser = (id: string) => ({ id, role: "user" as const });
    expect(await attachmentForViewer(db, asUser(me), file.id)).not.toBeNull();
    expect(await attachmentForViewer(db, asUser(other), file.id)).toBeNull();
    // Not yet sent: still private to its uploader.
    expect(await attachmentForViewer(db, { id: admin, role: "admin" }, file.id)).toBeNull();
    await ticketOf(me, { attachmentIds: [file.id] });
    expect(await attachmentForViewer(db, { id: admin, role: "admin" }, file.id)).not.toBeNull();
  });

  it("can be taken back before sending, and not after", async () => {
    const kept = await recordAttachment(db, me, {
      id: crypto.randomUUID(),
      pathname: "support/d.png",
      ...png,
    });
    const loose = await recordAttachment(db, me, {
      id: crypto.randomUUID(),
      pathname: "support/e.png",
      ...png,
    });
    await ticketOf(me, { attachmentIds: [kept.id] });
    expect(await removeUnattached(db, other, loose.id)).toBeNull();
    expect(await removeUnattached(db, me, kept.id)).toBeNull();
    expect(await removeUnattached(db, me, loose.id)).toEqual({ pathname: "support/e.png" });
  });

  it("left unattached for a day are found for clean-up", async () => {
    await recordAttachment(db, me, {
      id: crypto.randomUUID(),
      pathname: "support/old.png",
      ...png,
    });
    expect(await orphanedAttachments(db, me)).toEqual([]);
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect((await orphanedAttachments(db, me, later)).map((row) => row.pathname)).toEqual([
      "support/old.png",
    ]);
    expect(await orphanedAttachments(db, other, later)).toEqual([]);
  });

  it("are recognized by their bytes, not their names", () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});
