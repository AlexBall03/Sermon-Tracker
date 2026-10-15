// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  RESEND_API_KEY: "re_test" as string | undefined,
  CONTACT_EMAIL_FROM: "Sermon Tracker <contact@example.com>" as string | undefined,
  SUPPORT_EMAIL_FROM: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env,
  isEmailConfigured: () => Boolean(env.RESEND_API_KEY && env.CONTACT_EMAIL_FROM),
}));

import type { Env } from "@/lib/env";
import { fromAddress, inboxAddress, sendMail, senderFor } from "./email";
import { escapeHtml, inboxMail, publicAcknowledgmentMail, replyMail } from "./templates";

const mail = {
  to: "a@example.com",
  sender: "support" as const,
  subject: "S",
  text: "T",
  html: "H",
  idempotencyKey: "message/1",
};

describe("sendMail", () => {
  it("sends nothing and reports it when mail is not configured", async () => {
    env.RESEND_API_KEY = undefined;
    const send = vi.fn();
    expect(await sendMail(mail, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    env.RESEND_API_KEY = "re_test";
  });

  it("passes the event's key so a retry is sent once", async () => {
    const send = vi.fn(async () => ({ error: null }));
    expect(await sendMail(mail, send)).toBe("sent");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "message/1", from: env.CONTACT_EMAIL_FROM }),
    );
  });

  it("sends from the mail's own sender once it is set", async () => {
    env.SUPPORT_EMAIL_FROM = "Sermon Tracker Support <support@example.com>";
    const send = vi.fn(async () => ({ error: null }));
    await sendMail(mail, send);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Sermon Tracker Support <support@example.com>" }),
    );
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ sender: "support" }));
    env.SUPPORT_EMAIL_FROM = undefined;
  });

  it("never throws: a refusal or a lost connection is reported as failed", async () => {
    expect(await sendMail(mail, async () => ({ error: { message: "domain not verified" } }))).toBe(
      "failed",
    );
    expect(
      await sendMail(mail, async () => {
        throw new Error("network");
      }),
    ).toBe("failed");
  });
});

describe("senders and inboxes", () => {
  const all = {
    CONTACT_EMAIL_FROM: "contact@x",
    SUPPORT_EMAIL_FROM: "support@x",
    NOTIFY_EMAIL_FROM: "no-reply@x",
    CONTACT_INBOX_EMAIL: "contact@x.org",
    SUPPORT_INBOX_EMAIL: "support@x.org",
  } as Env;
  const onlyContact = {
    CONTACT_EMAIL_FROM: "contact@x",
    CONTACT_INBOX_EMAIL: "contact@x.org",
  } as Env;

  it("send contact messages from contact and everything else from support", () => {
    expect(senderFor("contact")).toBe("contact");
    for (const kind of ["bug", "feature", "feedback"] as const)
      expect(senderFor(kind)).toBe("support");
    expect(fromAddress("support", all)).toBe("support@x");
    expect(fromAddress("notify", all)).toBe("no-reply@x");
    expect(inboxAddress("contact", all)).toBe("contact@x.org");
    expect(inboxAddress("bug", all)).toBe("support@x.org");
  });

  it("fall back to the contact sender and inbox when the others are not set", () => {
    expect(fromAddress("support", onlyContact)).toBe("contact@x");
    expect(fromAddress("notify", onlyContact)).toBe("contact@x");
    expect(inboxAddress("feature", onlyContact)).toBe("contact@x.org");
  });
});

const ticketId = "3f9a1c00-0000-4000-8000-000000000000";
const bug = {
  id: ticketId,
  kind: "bug" as const,
  source: "app" as const,
  subject: "Test",
  steps: "1. Open Bible\n2. Tap a verse",
  expected: "It opens",
  area: "Bible reader",
  useCase: null,
  pageUrl: null,
  userAgent: null,
};

describe("templates", () => {
  it("escape what people wrote", () => {
    const rendered = replyMail("en", {
      ticketId,
      name: "<b>Ann</b>",
      subject: "Hi",
      body: `<script>alert("x")</script>`,
      link: null,
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain(escapeHtml(`<script>alert("x")</script>`));
    expect(rendered.text).toContain(`> <script>alert("x")</script>`);
  });

  it("are written in the requester's language", () => {
    expect(
      replyMail("es", { ticketId, name: null, subject: "Hola", body: "x", link: null }).text,
    ).toContain("El equipo de Sermon Tracker");
  });

  it("label the team's mail with its kind and its reference", () => {
    const rendered = inboxMail({ ticket: bug, message: "It broke", from: "Ann", link: "x" });
    expect(rendered.subject).toBe("Bug Report #3F9A1C · Test");
    expect(rendered.text).toContain("A new bug report was submitted");
    expect(rendered.text).toContain("1. Open Bible\n2. Tap a verse");
    expect(rendered.html).toContain("Steps to reproduce");
    expect(
      inboxMail({ ticket: bug, message: "More", from: "Ann", link: "x", reply: true }).subject,
    ).toBe("Reply · Bug Report #3F9A1C · Test");
  });

  it("never give two conversations the same subject", () => {
    const contact = {
      ...bug,
      id: "a1b2c3d4-0000-4000-8000-000000000000",
      kind: "contact" as const,
    };
    const first = inboxMail({ ticket: contact, message: "Hi", from: "Ann", link: "x" });
    const second = inboxMail({ ticket: bug, message: "Hi", from: "Ann", link: "x" });
    expect(first.subject).toBe("Contact #A1B2C3 · Test");
    expect(first.subject).not.toBe(second.subject);
  });

  it("repeat nothing a public sender wrote", () => {
    const rendered = publicAcknowledgmentMail("en", "Ruth");
    expect(rendered.subject).toBe("We received your message");
    expect(rendered.text).not.toContain("#");
  });
});
