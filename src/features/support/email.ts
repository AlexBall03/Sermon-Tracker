import "server-only";

import { Resend } from "resend";

import { env, isEmailConfigured, type Env } from "@/lib/env";
import type { TicketKind } from "./model";
import type { RenderedMail } from "./templates";

/*
 * Contact and feedback mail. Mail is a courtesy and never the record: the
 * ticket and its messages are saved first, and what happens here cannot undo
 * or fail them. Without Resend configured nothing is sent and nothing breaks.
 * Each mail names the event it is about (`idempotencyKey`), so Resend sends a
 * retried one once.
 *
 * Three senders: `contact` for contact messages (public or in the app),
 * `support` for bug reports, feature requests, and feedback, and `notify` for
 * the team's own announcements, which nobody answers (their Reply-To is the
 * requester). Each falls back to CONTACT_EMAIL_FROM, and the support inbox to
 * CONTACT_INBOX_EMAIL, so a deployment with only those two still mails.
 */

export type Delivery = "sent" | "skipped" | "failed";

export type MailSender = "contact" | "support" | "notify";

export type Mail = RenderedMail & {
  to: string;
  sender: MailSender;
  replyTo?: string;
  /** One per event: `ticket/<id>/received`, `message/<id>`, `status/<event id>`. */
  idempotencyKey: string;
};

type Transport = (mail: Omit<Mail, "sender"> & { from: string }) => Promise<{ error: unknown }>;

let client: Resend | undefined;

const resendTransport: Transport = async (mail) => {
  client ??= new Resend(env.RESEND_API_KEY);
  const { idempotencyKey, ...message } = mail;
  return client.emails.send(message, { idempotencyKey });
};

/** Who mail to a requester about a ticket of this kind comes from. */
export function senderFor(kind: TicketKind): MailSender {
  return kind === "contact" ? "contact" : "support";
}

/** The From line for a sender. */
export function fromAddress(sender: MailSender, source: Env = env) {
  const fallback = source.CONTACT_EMAIL_FROM;
  if (sender === "support") return source.SUPPORT_EMAIL_FROM ?? fallback;
  if (sender === "notify") return source.NOTIFY_EMAIL_FROM ?? fallback;
  return fallback;
}

let warned = false;

/** Sends one mail. Never throws: it reports how it went, and the caller carries on either way. */
export async function sendMail(mail: Mail, send: Transport = resendTransport): Promise<Delivery> {
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
    const { sender, ...message } = mail;
    const { error } = await send({ ...message, from: fromAddress(sender)! });
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

/** The team's inbox for a ticket of this kind, if one is set. */
export function inboxAddress(kind: TicketKind, source: Env = env) {
  const contact = source.CONTACT_INBOX_EMAIL ?? null;
  return kind === "contact" ? contact : (source.SUPPORT_INBOX_EMAIL ?? contact);
}

function describe(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}
