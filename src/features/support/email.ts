import "server-only";

import { Resend } from "resend";

import { env, isEmailConfigured } from "@/lib/env";
import type { RenderedMail } from "./templates";

/*
 * Contact and feedback mail. Mail is a courtesy and never the record: the
 * ticket and its messages are saved first, and what happens here cannot undo
 * or fail them. Without Resend configured nothing is sent and nothing breaks.
 * Each mail names the event it is about (`idempotencyKey`), so Resend sends a
 * retried one once.
 */

export type Delivery = "sent" | "skipped" | "failed";

export type Mail = RenderedMail & {
  to: string;
  replyTo?: string;
  /** One per event: `ticket/<id>/received`, `message/<id>`, `status/<event id>`. */
  idempotencyKey: string;
};

type Sender = (mail: Mail & { from: string }) => Promise<{ error: unknown }>;

let client: Resend | undefined;

const resendSender: Sender = async (mail) => {
  client ??= new Resend(env.RESEND_API_KEY);
  const { idempotencyKey, ...message } = mail;
  return client.emails.send(message, { idempotencyKey });
};

let warned = false;

/** Sends one mail. Never throws: it reports how it went, and the caller carries on either way. */
export async function sendMail(mail: Mail, send: Sender = resendSender): Promise<Delivery> {
  if (!isEmailConfigured()) {
    if (!warned) {
      warned = true;
      console.info(
        "Support email is not configured (RESEND_API_KEY, CONTACT_EMAIL_FROM); nothing is mailed.",
      );
    }
    return "skipped";
  }
  try {
    const { error } = await send({ ...mail, from: env.CONTACT_EMAIL_FROM! });
    if (error) {
      console.error("Support email was refused:", describe(error));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("Support email could not be sent:", describe(error));
    return "failed";
  }
}

/** The team's inbox, if one is set. */
export function inboxAddress() {
  return env.CONTACT_INBOX_EMAIL ?? null;
}

function describe(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}
