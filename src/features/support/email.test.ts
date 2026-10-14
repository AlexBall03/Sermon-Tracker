// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  RESEND_API_KEY: "re_test" as string | undefined,
  CONTACT_EMAIL_FROM: "Sermon Tracker <support@example.com>" as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env,
  isEmailConfigured: () => Boolean(env.RESEND_API_KEY && env.CONTACT_EMAIL_FROM),
}));

import { sendMail } from "./email";
import { escapeHtml, replyMail } from "./templates";

const mail = {
  to: "a@example.com",
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

describe("templates", () => {
  it("escape what people wrote", () => {
    const rendered = replyMail("en", {
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
    expect(replyMail("es", { name: null, subject: "Hola", body: "x", link: null }).text).toContain(
      "El equipo de Sermon Tracker",
    );
  });
});
