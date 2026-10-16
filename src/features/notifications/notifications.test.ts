// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pushSubscriptions, supportTickets, users, type AppUser } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { notificationHref } from "./model";
import {
  activeAdminIds,
  listNotifications,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from "./notifications";
import { sendPush, supportPushPayload, type PushSender } from "./push";

let db: Database;
let member: AppUser;
let other: AppUser;
let ticketId: string;

async function add(clerkUserId: string, values: Partial<AppUser> = {}) {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId, ...values })
    .returning();
  return user;
}

beforeEach(async () => {
  db = await createTestDatabase();
  member = await add("user_member");
  other = await add("user_other");
  const [ticket] = await db
    .insert(supportTickets)
    .values({ userId: member.id, kind: "bug", source: "app", subject: "Search is slow" })
    .returning();
  ticketId = ticket.id;
});

describe("notifications", () => {
  it("records an event once per recipient, however often it is sent", async () => {
    const event = { kind: "reply" as const, ticketId, eventKey: "message/1" };
    expect(await notify(db, [member.id], event)).toEqual([member.id]);
    expect(await notify(db, [member.id], event)).toEqual([]);
    expect(await unreadCount(db, member.id)).toBe(1);
  });

  it("is read and marked only by its recipient", async () => {
    await notify(db, [member.id], { kind: "reply", ticketId, eventKey: "message/1" });
    const [item] = await listNotifications(db, member.id, 10);
    expect(item).toMatchObject({ kind: "reply", subject: "Search is slow", read: false });
    expect(await listNotifications(db, other.id, 10)).toEqual([]);

    await markRead(db, other.id, [item.id]);
    await markAllRead(db, other.id);
    expect(await unreadCount(db, member.id)).toBe(1);
    await markRead(db, member.id, [item.id]);
    expect(await unreadCount(db, member.id)).toBe(0);
  });

  it("goes to active administrators but the one who acted", async () => {
    const first = await add("user_admin1", { role: "admin" });
    const second = await add("user_admin2", { role: "admin" });
    await add("user_admin3", { role: "admin", status: "disabled" });
    expect((await activeAdminIds(db, first.id)).sort()).toEqual([second.id]);
  });

  it("leads only to fixed addresses inside the application", () => {
    expect(notificationHref("reply", "abc")).toBe("/support/abc");
    expect(notificationHref("status", "abc")).toBe("/support/abc");
    expect(notificationHref("new_ticket", "abc")).toBe("/admin/feedback/abc");
    expect(notificationHref("contact", "abc")).toBe("/admin/feedback/abc");
  });
});

describe("sendPush", () => {
  const payload = (locale: "en" | "es") =>
    supportPushPayload(locale, "reply", "/support/1", "ticket-1");

  async function device(owner: AppUser, endpoint: string) {
    await db
      .insert(pushSubscriptions)
      .values({ ownerId: owner.id, endpoint, p256dh: "k", auth: "a", label: "Chrome" });
  }

  it("sends nothing anyone wrote, in the recipient's language", async () => {
    await db.update(users).set({ locale: "es" });
    await device(member, "https://push.example/1");
    const send = vi.fn<PushSender>(async () => undefined);
    expect(await sendPush(db, [member.id], payload, { send })).toMatchObject({ sent: 1 });
    const body = JSON.parse(send.mock.calls[0][1]);
    expect(body).toEqual({
      title: "Sermon Tracker",
      body: "Tienes una nueva respuesta a tus comentarios.",
      url: "/support/1",
      tag: "ticket-1",
    });
    expect(send.mock.calls[0][1]).not.toContain("Search is slow");
  });

  it("forgets a device the push service says is gone, and retries a server error once", async () => {
    await device(member, "https://push.example/gone");
    await device(other, "https://push.example/flaky");
    const send = vi.fn<PushSender>(async (subscription) => {
      throw Object.assign(new Error("push"), {
        statusCode: subscription.endpoint.endsWith("gone") ? 410 : 503,
      });
    });
    expect(await sendPush(db, [member.id, other.id], payload, { send })).toEqual({
      sent: 0,
      removed: 1,
      failed: 1,
    });
    expect(send).toHaveBeenCalledTimes(3);
    const left = await db.select().from(pushSubscriptions);
    expect(left.map((row) => row.endpoint)).toEqual(["https://push.example/flaky"]);
  });

  it("respects an account that turned support push off, except for its own test", async () => {
    await db.update(users).set({ pushSupport: false });
    await device(member, "https://push.example/1");
    const send = vi.fn<PushSender>(async () => undefined);
    expect(await sendPush(db, [member.id], payload, { send })).toMatchObject({ sent: 0 });
    expect(await sendPush(db, [member.id], payload, { send, force: true })).toMatchObject({
      sent: 1,
    });
  });
});
