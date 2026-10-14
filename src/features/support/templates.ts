import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { siteConfig } from "@/lib/site";
import type { TicketKind, TicketStatus } from "./model";

/*
 * The words and the look of contact and feedback mail. Plain, light, and the
 * same in every mail program: a table, inline styles, the brand's ink and
 * emerald, and a text version beside it. Everything a person wrote is
 * escaped; nothing here is ever an attachment or an internal note.
 */

export type RenderedMail = { subject: string; text: string; html: string };

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Body = {
  greeting: string;
  paragraphs: string[];
  /** What someone wrote, quoted as it was. */
  quote?: string;
  link?: { href: string; label: string };
  details?: [string, string][];
  signature: string;
  footer: string;
};

function render(subject: string, body: Body): RenderedMail {
  const text = [
    body.greeting,
    "",
    ...body.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(body.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(body.details?.length ? [""] : []),
    ...(body.quote ? [body.quote.replace(/^/gm, "> "), ""] : []),
    ...(body.link ? [`${body.link.label}: ${body.link.href}`, ""] : []),
    body.signature,
    "",
    "—",
    body.footer,
  ].join("\n");

  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1c1917">${escapeHtml(value)}</p>`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5e4">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#1c1917">${escapeHtml(siteConfig.name)}</span>
</td></tr>
<tr><td style="padding:28px">
${paragraph(body.greeting)}
${body.paragraphs.map(paragraph).join("\n")}
${
  body.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;color:#44403c">${body.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:2px 12px 2px 0;color:#78716c;vertical-align:top">${escapeHtml(label)}</td><td style="padding:2px 0">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${
  body.quote
    ? `<div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #059669;background:#fafaf9;font-size:14px;line-height:1.6;color:#44403c;white-space:pre-wrap">${escapeHtml(body.quote)}</div>`
    : ""
}
${
  body.link
    ? `<p style="margin:0 0 20px"><a href="${escapeHtml(body.link.href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#047857;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(body.link.label)}</a></p>`
    : ""
}
${paragraph(body.signature)}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e7e5e4;font-size:12px;line-height:1.5;color:#78716c">${escapeHtml(body.footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/** A line for a subject: one line, and not too long. */
function oneLine(value: string) {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/** To the sender: their message arrived. */
export function acknowledgmentMail(
  locale: Locale,
  input: { name: string | null; subject: string; message: string; link: string | null },
): RenderedMail {
  const t = dictionary(locale, "support").email;
  return render(t.receivedSubject(oneLine(input.subject)), {
    greeting: t.greeting(input.name),
    paragraphs: [t.received],
    quote: input.message,
    link: input.link ? { href: input.link, label: t.view } : undefined,
    signature: t.signature,
    footer: t.footer,
  });
}

/**
 * To the address typed into the public form. Anyone can type any address, so
 * it repeats nothing they wrote, not even the subject: it cannot carry
 * someone else's words to a stranger.
 */
export function publicAcknowledgmentMail(locale: Locale, name: string): RenderedMail {
  const t = dictionary(locale, "support").email;
  return render(t.receivedPublicSubject, {
    greeting: t.greeting(name.slice(0, 60)),
    paragraphs: [t.receivedPublic],
    signature: t.signature,
    footer: t.footer,
  });
}

/** To the requester: the team answered. */
export function replyMail(
  locale: Locale,
  input: { name: string | null; subject: string; body: string; link: string | null },
): RenderedMail {
  const t = dictionary(locale, "support").email;
  return render(t.replySubject(oneLine(input.subject)), {
    greeting: t.greeting(input.name),
    paragraphs: [t.reply],
    quote: input.body,
    link: input.link ? { href: input.link, label: t.view } : undefined,
    signature: t.signature,
    footer: t.footer,
  });
}

/** To the requester: their ticket moved on. */
export function statusMail(
  locale: Locale,
  input: { name: string | null; subject: string; status: TicketStatus; link: string | null },
): RenderedMail {
  const words = dictionary(locale, "support");
  const status = words.statuses[input.status];
  return render(words.email.statusSubject(oneLine(input.subject), status), {
    greeting: words.email.greeting(input.name),
    paragraphs: [words.email.status(status)],
    link: input.link ? { href: input.link, label: words.email.view } : undefined,
    signature: words.email.signature,
    footer: words.email.footer,
  });
}

/** To the team's inbox: something new, or a reply. Always in English: it is the team's. */
export function inboxMail(input: {
  kind: TicketKind;
  subject: string;
  message: string;
  from: string;
  link: string;
  reply?: boolean;
}): RenderedMail {
  const words = dictionary("en", "support");
  const kind = words.kinds[input.kind];
  return render(
    input.reply
      ? words.email.inboxReplySubject(oneLine(input.subject))
      : words.email.inboxSubject(kind, oneLine(input.subject)),
    {
      greeting: words.email.greeting(null),
      paragraphs: [input.reply ? words.email.inboxReply : words.email.inbox(kind)],
      details: [[words.email.from, input.from]],
      quote: input.message,
      link: { href: input.link, label: words.email.open },
      signature: words.email.signature,
      footer: siteConfig.url,
    },
  );
}
