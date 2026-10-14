// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supportMessages, supportTickets, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// Access, mail, and Clerk are mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: "admin" | "user" },
  db: undefined as unknown,
  delivery: "sent" as "sent" | "failed" | "skipped",
  sendMail: vi.fn(),
  later: [] as (() => unknown)[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => state.later.push(task) }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (requirement: string): Promise<Authorization> => {
    if (!state.user) return { ok: false, message: "Your session has ended. Sign in again." };
    if (requirement === "admin" && state.user.role !== "admin") {
      return { ok: false, message: "Only administrators can do that." };
    }
    return {
      ok: true,
      user: {
        id: state.user.id,
        clerkUserId: `clerk_${state.user.id}`,
        role: state.user.role,
      } as never,
    };
  },
}));
vi.mock("./email", () => ({
  sendMail: async (mail: unknown) => {
    state.sendMail(mail);
    return state.delivery;
  },
  inboxAddress: () => "team@example.com",
}));
vi.mock("./identity", () => ({
  requesterContact: async () => ({ email: "member@example.com", name: "Member" }),
}));
vi.mock("./blob", () => ({ deleteScreenshots: vi.fn(async () => true) }));

import {
  adminReplyToTicket,
  replyToTicket,
  setTicketStatus,
  submitContact,
  submitFeedback,
} from "./actions";

let db: Database;
let me: string;
let other: string;
let admin: string;

const report = {
  kind: "bug",
  subject: "Bible will not open",
  message: "It spins.",
  steps: "",
  useCase: "Not for a bug",
};

async function runLater() {
  const tasks = state.later.splice(0);
  for (const task of tasks) await task();
}

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.user = null;
  state.delivery = "sent";
  state.sendMail.mockClear();
  state.later = [];
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "a" }, { clerkUserId: "b" }, { clerkUserId: "c", role: "admin" }])
    .returning();
  [me, other, admin] = rows.map((row) => row.id);
});

describe("submitFeedback", () => {
  it("refuses a guest and saves nothing", async () => {
    expect((await submitFeedback(report)).ok).toBe(false);
    expect(await db.select().from(supportTickets)).toEqual([]);
  });

  it("files the ticket under the session's account, whatever the input names", async () => {
    state.user = { id: me, role: "user" };
    const result = await submitFeedback({ ...report, userId: other });
    expect(result.ok).toBe(true);
    const [ticket] = await db.select().from(supportTickets);
    expect(ticket.userId).toBe(me);
    // Fields that do not belong to the kind are dropped, and an empty line is nothing.
    expect(ticket.useCase).toBeNull();
    expect(ticket.steps).toBeNull();
  });

  it("acknowledges the requester and tells the team, once", async () => {
    state.user = { id: me, role: "user" };
    const id = crypto.randomUUID();
    await submitFeedback(report, id);
    await submitFeedback(report, id);
    await runLater();
    expect(state.sendMail.mock.calls.map(([mail]) => mail.to)).toEqual([
      "member@example.com",
      "team@example.com",
    ]);
  });

  it("stands when mail fails", async () => {
    state.user = { id: me, role: "user" };
    state.delivery = "failed";
    expect((await submitFeedback(report)).ok).toBe(true);
    await runLater();
    expect(await db.select().from(supportTickets)).toHaveLength(1);
  });
});

describe("submitContact", () => {
  const message = {
    name: "Ruth",
    email: "RUTH@example.com",
    subject: "Access",
    message: "How do we join?",
    startedAt: Date.now() - 10_000,
  };

  it("saves a message from anyone, and mails nothing of what they wrote to the address given", async () => {
    const result = await submitContact(message);
    expect(result.ok).toBe(true);
    const [ticket] = await db.select().from(supportTickets);
    expect(ticket).toMatchObject({ source: "public", contactEmail: "ruth@example.com" });
    expect(ticket.ipHash).toMatch(/^[0-9a-f]{64}$/);
    await runLater();
    const [acknowledgment] = state.sendMail.mock.calls[0];
    expect(acknowledgment.to).toBe("ruth@example.com");
    expect(acknowledgment.text).not.toContain("How do we join?");
    expect(acknowledgment.subject).not.toContain("Access");
  });

  it("refuses a robot: the hidden field filled in, or sent at once", async () => {
    expect((await submitContact({ ...message, website: "http://spam" })).ok).toBe(false);
    expect((await submitContact({ ...message, startedAt: Date.now() })).ok).toBe(false);
    expect(await db.select().from(supportTickets)).toEqual([]);
  });

  it("refuses an address that is not one", async () => {
    const result = await submitContact({ ...message, email: "not an address" });
    expect(result.ok).toBe(false);
    expect(result.errors?.email).toBeTruthy();
  });
});

describe("replies and statuses", () => {
  async function ticket() {
    state.user = { id: me, role: "user" };
    const result = await submitFeedback(report);
    state.later = [];
    state.sendMail.mockClear();
    return result.id!;
  }

  it("lets nobody but the requester reply as the requester", async () => {
    const id = await ticket();
    state.user = { id: other, role: "user" };
    expect((await replyToTicket(id, { body: "Mine now" })).ok).toBe(false);
    expect(await db.select().from(supportMessages)).toHaveLength(1);
  });

  it("keeps administrator tools from anyone else", async () => {
    const id = await ticket();
    expect((await adminReplyToTicket(id, { body: "Hi" })).ok).toBe(false);
    expect((await setTicketStatus(id, { status: "resolved" })).ok).toBe(false);
  });

  it("saves an administrator's reply when its mail fails, and says the mail did not go", async () => {
    const id = await ticket();
    state.user = { id: admin, role: "admin" };
    state.delivery = "failed";
    const result = await adminReplyToTicket(id, { body: "Fixed in the next release." });
    expect(result).toMatchObject({ ok: true, message: "Saved, but the email could not be sent." });
    expect(await db.select().from(supportMessages)).toHaveLength(2);
  });

  it("never mails an internal note", async () => {
    const id = await ticket();
    state.user = { id: admin, role: "admin" };
    expect(
      (await adminReplyToTicket(id, { body: "Duplicate of #4", visibility: "internal" })).ok,
    ).toBe(true);
    await runLater();
    expect(state.sendMail).not.toHaveBeenCalled();
  });

  it("mails the requester about an important status, once", async () => {
    const id = await ticket();
    state.user = { id: admin, role: "admin" };
    await setTicketStatus(id, { status: "under_review" });
    await setTicketStatus(id, { status: "resolved" });
    await setTicketStatus(id, { status: "resolved" });
    await runLater();
    expect(state.sendMail).toHaveBeenCalledTimes(1);
    expect(state.sendMail.mock.calls[0][0].subject).toContain("Resolved");
  });

  it("refuses a status the kind does not have", async () => {
    const id = await ticket();
    state.user = { id: admin, role: "admin" };
    expect((await setTicketStatus(id, { status: "planned" })).ok).toBe(false);
  });
});
