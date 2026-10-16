"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { notifyAdmins, notifyRequester } from "@/features/notifications/dispatch";
import { dictionary } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { env, isEmailConfigured } from "@/lib/env";
import { routes, siteConfig } from "@/lib/site";
import { deleteScreenshots } from "./blob";
import { inboxAddress, sendMail, senderFor } from "./email";
import { requesterContact } from "./identity";
import { notifiedStatuses } from "./model";
import { attachmentIdSchema, forKind, supportSchemas, ticketIdSchema } from "./schemas";
import {
  acknowledgmentMail,
  inboxMail,
  publicAcknowledgmentMail,
  replyMail,
  statusMail,
} from "./templates";
import * as tickets from "./tickets";

export type SubmitResult = ActionResult & {
  id?: string;
  /** Field by field, when the input was refused. */
  errors?: Record<string, string>;
  /** Whether a confirmation is being mailed. */
  mailed?: boolean;
};

/*
 * Each action authorises itself when it runs and takes the account from the
 * session; nothing in the input can name another. The public form is the one
 * action open to anyone, and it can only create. Mail is sent after the
 * answer, with `after`, or awaited only where the administrator is told how
 * it went: either way the saved ticket or reply stands whatever mail does.
 */

async function context() {
  const locale = await getLocale();
  return { locale, t: dictionary(locale, "support").actions, schemas: supportSchemas(locale) };
}

/** Where links in mail point: the canonical site in production, this deployment elsewhere. */
async function origin() {
  if (env.VERCEL_ENV === "production") return siteConfig.url;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : siteConfig.url;
}

/**
 * A one-way hash of the sender's network address. It only counts messages
 * for the rate limit; the address itself is never stored or shown.
 */
async function networkHash() {
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    null;
  if (!address) return null;
  return createHash("sha256").update(`sermon-tracker/support/${address}`).digest("hex");
}

function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

function failed(t: { failed: string }, error: unknown): ActionResult {
  console.error("Support action failed:", describeDatabaseError(error));
  return { ok: false, message: t.failed };
}

function refresh(ticketId?: string) {
  revalidatePath(routes.support);
  revalidatePath(routes.adminFeedback);
  revalidatePath(routes.admin);
  if (ticketId) {
    revalidatePath(`${routes.support}/${ticketId}`);
    revalidatePath(`${routes.adminFeedback}/${ticketId}`);
  }
}

/** The public contact form. Open to anyone; it can only create. */
export async function submitContact(input: unknown, id?: unknown): Promise<SubmitResult> {
  const { locale, t, schemas } = await context();
  const parsed = schemas.contact.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { ok: false, message: errors.form ?? errors.website ?? t.invalid, errors };
  }
  const ticketId = id === undefined ? undefined : ticketIdSchema.safeParse(id);
  if (ticketId && !ticketId.success) return { ok: false, message: t.invalid };

  let outcome: tickets.CreateOutcome;
  try {
    outcome = await tickets.createPublicContact(
      getDb(),
      { ...parsed.data, locale, ipHash: await networkHash() },
      ticketId?.data,
    );
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok) return { ok: false, message: t.rateLimited };

  if (outcome.created) {
    const { ticket, message } = outcome;
    const base = await origin();
    after(async () => {
      await sendMail({
        to: ticket.contactEmail!,
        sender: senderFor(ticket.kind),
        ...publicAcknowledgmentMail(locale, ticket.contactName ?? ""),
        idempotencyKey: `ticket/${ticket.id}/received`,
      });
      const inbox = inboxAddress(ticket.kind);
      if (inbox) {
        await sendMail({
          to: inbox,
          sender: "notify",
          replyTo: ticket.contactEmail!,
          ...inboxMail({
            ticket,
            message: message.body,
            from: `${ticket.contactName} <${ticket.contactEmail}>`,
            link: `${base}${routes.adminFeedback}/${ticket.id}`,
          }),
          idempotencyKey: `ticket/${ticket.id}/inbox`,
        });
      }
      await notifyAdmins({ kind: "contact", ticketId: ticket.id, eventKey: `ticket/${ticket.id}` });
    });
    revalidatePath(routes.adminFeedback);
  }
  return { ok: true, message: t.sent, id: outcome.ticket.id, mailed: isEmailConfigured() };
}

/** Help & Feedback: a new ticket from the signed-in account. */
export async function submitFeedback(input: unknown, id?: unknown): Promise<SubmitResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { locale, t, schemas } = await context();

  const parsed = schemas.feedback.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalid, errors: fieldErrors(parsed.error) };
  const ticketId = id === undefined ? undefined : ticketIdSchema.safeParse(id);
  if (ticketId && !ticketId.success) return { ok: false, message: t.invalid };

  let outcome: tickets.CreateOutcome;
  try {
    outcome = await tickets.createTicket(
      getDb(),
      actor.user.id,
      forKind(parsed.data),
      locale,
      ticketId?.data,
    );
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok) return { ok: false, message: t.rateLimited };

  if (outcome.created) {
    const { ticket, message } = outcome;
    const base = await origin();
    const clerkUserId = actor.user.clerkUserId;
    after(async () => {
      const contact = await requesterContact(clerkUserId);
      if (contact) {
        await sendMail({
          to: contact.email,
          sender: senderFor(ticket.kind),
          ...acknowledgmentMail(locale, {
            ticketId: ticket.id,
            name: contact.name,
            subject: ticket.subject,
            message: message.body,
            link: `${base}${routes.support}/${ticket.id}`,
          }),
          idempotencyKey: `ticket/${ticket.id}/received`,
        });
      }
      const inbox = inboxAddress(ticket.kind);
      if (inbox) {
        await sendMail({
          to: inbox,
          sender: "notify",
          replyTo: contact?.email,
          ...inboxMail({
            ticket,
            message: message.body,
            from: contact ? `${contact.name ?? ""} <${contact.email}>`.trim() : clerkUserId,
            link: `${base}${routes.adminFeedback}/${ticket.id}`,
          }),
          idempotencyKey: `ticket/${ticket.id}/inbox`,
        });
      }
      await notifyAdmins(
        { kind: "new_ticket", ticketId: ticket.id, eventKey: `ticket/${ticket.id}` },
        actor.user.id,
      );
    });
    refresh(ticket.id);
  }
  return { ok: true, message: dictionary(locale, "support").compose.sent, id: outcome.ticket.id };
}

/** The requester answers on one of their own tickets. */
export async function replyToTicket(ticketId: unknown, input: unknown): Promise<SubmitResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { locale, t, schemas } = await context();
  const id = ticketIdSchema.safeParse(ticketId);
  const parsed = schemas.reply.safeParse(input);
  if (!id.success) return { ok: false, message: t.notFound };
  if (!parsed.success) return { ok: false, message: t.invalid, errors: fieldErrors(parsed.error) };

  let outcome: tickets.ReplyOutcome;
  try {
    outcome = await tickets.replyAsRequester(getDb(), actor.user.id, id.data, parsed.data.body);
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok) {
    return { ok: false, message: outcome.reason === "rate_limited" ? t.rateLimited : t.notFound };
  }

  const { ticket, message } = outcome;
  const actorId = actor.user.id;
  after(() =>
    notifyAdmins(
      { kind: "user_reply", ticketId: ticket.id, eventKey: `message/${message.id}` },
      actorId,
    ),
  );
  const inbox = inboxAddress(ticket.kind);
  if (inbox) {
    const base = await origin();
    const clerkUserId = actor.user.clerkUserId;
    after(async () => {
      const contact = await requesterContact(clerkUserId);
      await sendMail({
        to: inbox,
        sender: "notify",
        replyTo: contact?.email,
        ...inboxMail({
          ticket,
          message: message.body,
          from: contact ? `${contact.name ?? ""} <${contact.email}>`.trim() : clerkUserId,
          link: `${base}${routes.adminFeedback}/${ticket.id}`,
          reply: true,
        }),
        idempotencyKey: `message/${message.id}`,
      });
    });
  }
  refresh(ticket.id);
  return { ok: true, message: dictionary(locale, "support").thread.replied };
}

/** The requester closes one of their own tickets. */
export async function closeTicket(ticketId: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { locale, t } = await context();
  const id = ticketIdSchema.safeParse(ticketId);
  if (!id.success) return { ok: false, message: t.notFound };

  let outcome: tickets.StatusOutcome;
  try {
    outcome = await tickets.closeOwnTicket(getDb(), actor.user.id, id.data);
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok && outcome.reason === "not_found") return { ok: false, message: t.notFound };
  refresh(id.data);
  return { ok: true, message: dictionary(locale, "support").thread.closed };
}

/** Records that the requester has seen their ticket. Nothing is answered. */
export async function markTicketRead(ticketId: unknown): Promise<void> {
  const actor = await authorize("active");
  const id = ticketIdSchema.safeParse(ticketId);
  if (!actor.ok || !id.success) return;
  await tickets.markReadByRequester(getDb(), actor.user.id, id.data).catch(() => undefined);
}

/** Records that an administrator has seen a ticket. */
export async function markTicketReadByAdmin(ticketId: unknown): Promise<void> {
  const actor = await authorize("admin");
  const id = ticketIdSchema.safeParse(ticketId);
  if (!actor.ok || !id.success) return;
  await tickets.markReadByAdmin(getDb(), id.data).catch(() => undefined);
}

/** Removes a screenshot the account uploaded and has not sent. */
export async function removeScreenshot(attachmentId: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { t } = await context();
  const id = attachmentIdSchema.safeParse(attachmentId);
  if (!id.success) return { ok: false, message: t.notFound };
  try {
    const removed = await tickets.removeUnattached(getDb(), actor.user.id, id.data);
    if (removed) after(() => deleteScreenshots([removed.pathname]));
    return { ok: true, message: "" };
  } catch (error) {
    return failed(t, error);
  }
}

// ─── Administrators ──────────────────────────────────────────────────────────

/**
 * An administrator replies, or adds an internal note. A public reply is
 * mailed to the requester: an account's in its language with a link to the
 * conversation, a public sender's to the address they gave. The reply is
 * saved whether or not the mail goes, and the administrator is told which.
 */
export async function adminReplyToTicket(ticketId: unknown, input: unknown): Promise<SubmitResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const { locale, t, schemas } = await context();
  const words = dictionary(locale, "support").admin;
  const id = ticketIdSchema.safeParse(ticketId);
  const parsed = schemas.adminReply.safeParse(input);
  if (!id.success) return { ok: false, message: t.notFound };
  if (!parsed.success) return { ok: false, message: t.invalid, errors: fieldErrors(parsed.error) };

  const db = getDb();
  let outcome: tickets.AdminReplyOutcome;
  try {
    outcome = await tickets.adminReply(db, actor.user.id, id.data, parsed.data);
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok) return { ok: false, message: t.notFound };
  refresh(id.data);

  const { ticket, message } = outcome;
  if (message.visibility === "internal") return { ok: true, message: words.noted };

  if (ticket.source === "app" && ticket.userId !== actor.user.id) {
    after(() =>
      notifyRequester(ticket.userId, {
        kind: "reply",
        ticketId: ticket.id,
        eventKey: `message/${message.id}`,
      }),
    );
  }
  // An account may turn reply email off; a public sender has no other way to hear.
  if (!(await wantsEmail(ticket, "emailReplies"))) return { ok: true, message: words.replied };

  const base = await origin();
  const recipient = await recipientFor(ticket);
  if (!recipient)
    return { ok: true, message: isEmailConfigured() ? words.emailNotSent : words.replied };
  const delivery = await sendMail({
    to: recipient.email,
    sender: senderFor(ticket.kind),
    ...replyMail(ticket.locale, {
      ticketId: ticket.id,
      name: recipient.name,
      subject: ticket.subject,
      body: message.body,
      link: ticket.source === "app" ? `${base}${routes.support}/${ticket.id}` : null,
    }),
    idempotencyKey: `message/${message.id}`,
  });
  return { ok: true, message: delivery === "failed" ? words.emailNotSent : words.replied };
}

/** An administrator moves a ticket on. The requester is mailed about the changes that matter. */
export async function setTicketStatus(ticketId: unknown, input: unknown): Promise<ActionResult> {
  const actor = await authorize("admin");
  if (!actor.ok) return actor;
  const { locale, t, schemas } = await context();
  const words = dictionary(locale, "support").admin;
  const id = ticketIdSchema.safeParse(ticketId);
  const parsed = schemas.status.safeParse(input);
  if (!id.success) return { ok: false, message: t.notFound };
  if (!parsed.success) return { ok: false, message: t.invalid };

  let outcome: tickets.StatusOutcome;
  try {
    outcome = await tickets.adminSetStatus(getDb(), actor.user.id, id.data, parsed.data.status);
  } catch (error) {
    return failed(t, error);
  }
  if (!outcome.ok) {
    if (outcome.reason === "unchanged") return { ok: true, message: words.statusUnchanged };
    return { ok: false, message: outcome.reason === "not_allowed" ? t.notAllowed : t.notFound };
  }
  refresh(id.data);

  const { ticket, event } = outcome;
  if (notifiedStatuses.includes(event.toStatus)) {
    const base = await origin();
    const actorId = actor.user.id;
    after(async () => {
      if (ticket.source === "app" && ticket.userId !== actorId) {
        await notifyRequester(ticket.userId, {
          kind: "status",
          ticketId: ticket.id,
          eventKey: `status/${event.id}`,
          status: event.toStatus,
        });
      }
      if (!(await wantsEmail(ticket, "emailStatus"))) return;
      const recipient = await recipientFor(ticket);
      if (!recipient) return;
      await sendMail({
        to: recipient.email,
        sender: senderFor(ticket.kind),
        ...statusMail(ticket.locale, {
          ticketId: ticket.id,
          name: recipient.name,
          subject: ticket.subject,
          status: event.toStatus,
          link: ticket.source === "app" ? `${base}${routes.support}/${ticket.id}` : null,
        }),
        idempotencyKey: `status/${event.id}`,
      });
    });
  }
  return { ok: true, message: words.statusSaved };
}

/** Whether optional support mail may go: always to a public sender, to an account unless it turned it off. */
async function wantsEmail(ticket: tickets.TicketView, preference: "emailReplies" | "emailStatus") {
  if (ticket.source !== "app" || !ticket.userId) return true;
  return tickets.wantsSupportEmail(getDb(), ticket.userId, preference);
}

/** Who mail about a ticket goes to: the public sender's address, or the account's, from Clerk. */
async function recipientFor(ticket: tickets.TicketView) {
  if (ticket.source === "public") {
    return ticket.contactEmail ? { email: ticket.contactEmail, name: ticket.contactName } : null;
  }
  if (!ticket.userId) return null;
  const clerkUserId = await tickets.clerkIdFor(getDb(), ticket.userId);
  return clerkUserId ? requesterContact(clerkUserId) : null;
}
