import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { siteConfig } from "@/lib/site";
import type { TicketStatus } from "./model";
import type { TicketView } from "./tickets";

/*
 * The words and the look of contact and feedback mail. The same in every mail
 * program: tables, inline styles, the brand's paper, ink, and emerald, and a
 * text version beside it. Everything a person wrote is escaped; nothing here
 * is ever an attachment or an internal note. Every subject but the public
 * acknowledgment's carries the ticket's reference, so a mail program never
 * folds two conversations with the same subject into one.
 */

export type RenderedMail = { subject: string; text: string; html: string };

/**
 * Mail cannot read the stylesheet, so these copy the brand tokens of
 * `src/app/globals.css` (light). Change them together.
 */
const mailColors = {
  paper: "#f7f5f0",
  card: "#ffffff",
  ink: "#17181b",
  muted: "#5e6168",
  border: "#e4e1d9",
  subtle: "#faf9f6",
  emerald: "#127a5b",
  emeraldSoft: "#e9f3ef",
};

const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const serif = "'Playfair Display',Georgia,'Times New Roman',serif";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A ticket's short reference, `#` and the first six of its ID. Shown, never stored. */
export function ticketReference(id: string) {
  return `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

type Body = {
  lang: Locale;
  /** A small label above the greeting: what this is, and its reference. */
  eyebrow?: string;
  greeting: string;
  paragraphs: string[];
  details?: [string, string][];
  /** What someone wrote, quoted as it was, under its label. */
  quote?: { label: string; text: string };
  link?: { href: string; label: string };
  signature: string;
  footer: string;
};

function render(subject: string, body: Body): RenderedMail {
  const details = body.details ?? [];
  const text = [
    ...(body.eyebrow ? [body.eyebrow, ""] : []),
    body.greeting,
    "",
    ...body.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...details.flatMap(([label, value]) =>
      value.includes("\n") ? [`${label}:`, value, ""] : [`${label}: ${value}`],
    ),
    ...(details.length ? [""] : []),
    ...(body.quote ? [`${body.quote.label}:`, body.quote.text.replace(/^/gm, "> "), ""] : []),
    ...(body.link ? [`${body.link.label}: ${body.link.href}`, ""] : []),
    body.signature,
    "",
    "—",
    body.footer,
    siteConfig.url,
  ].join("\n");

  const c = mailColors;
  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px;font-family:${sans};font-size:15px;line-height:1.65;color:${c.ink}">${escapeHtml(value)}</p>`;
  const label = (value: string) =>
    `<p style="margin:0 0 8px;font-family:${sans};font-size:11px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${c.muted}">${escapeHtml(value)}</p>`;

  const eyebrow = body.eyebrow
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="padding:5px 10px;border-radius:999px;background:${c.emeraldSoft};font-family:${sans};font-size:11px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${c.emerald}">${escapeHtml(body.eyebrow)}</td></tr></table>`
    : "";

  const detailsTable = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;border:1px solid ${c.border};border-radius:10px;border-collapse:separate;overflow:hidden">${details
        .map(
          ([name, value], index) =>
            `<tr><td valign="top" style="width:34%;padding:10px 14px;${index ? `border-top:1px solid ${c.border};` : ""}background:${c.subtle};font-family:${sans};font-size:13px;line-height:1.5;color:${c.muted}">${escapeHtml(name)}</td><td valign="top" style="padding:10px 14px;${index ? `border-top:1px solid ${c.border};` : ""}font-family:${sans};font-size:14px;line-height:1.5;color:${c.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const quote = body.quote
    ? `${label(body.quote.label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="padding:14px 18px;border-left:3px solid ${c.emerald};background:${c.subtle};border-radius:0 8px 8px 0;font-family:${sans};font-size:14px;line-height:1.65;color:${c.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(body.quote.text)}</td></tr></table>`
    : "";

  const button = body.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="border-radius:8px;background:${c.emerald}"><a href="${escapeHtml(body.link.href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;font-family:${sans};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none">${escapeHtml(body.link.label)}</a></td></tr></table>`
    : "";

  const preheader = body.paragraphs[0] ?? "";
  const html = `<!doctype html>
<html lang="${body.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${c.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.paper}"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 20px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:10px"><img src="${escapeHtml(`${siteConfig.url}/brand/icon-192.png`)}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px"></td>
<td valign="middle" style="font-family:${serif};font-size:20px;line-height:1;color:${c.ink}">${escapeHtml(siteConfig.name)}</td>
</tr></table>
</td></tr>
<tr><td style="background:${c.card};border:1px solid ${c.border};border-top:3px solid ${c.emerald};border-radius:12px;padding:32px 32px 16px">
${eyebrow}
${paragraph(body.greeting)}
${body.paragraphs.map(paragraph).join("\n")}
${detailsTable}
${quote}
${button}
<p style="margin:0 0 16px;font-family:${sans};font-size:15px;line-height:1.65;color:${c.ink}">${escapeHtml(body.signature)}</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${sans};font-size:12px;line-height:1.6;color:${c.muted}">
${escapeHtml(body.footer)}<br>
<a href="${escapeHtml(siteConfig.url)}" style="color:${c.muted};text-decoration:underline">${escapeHtml(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
</td></tr>
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
  input: {
    ticketId: string;
    name: string | null;
    subject: string;
    message: string;
    link: string | null;
  },
): RenderedMail {
  const words = dictionary(locale, "support");
  const t = words.email;
  const reference = ticketReference(input.ticketId);
  return render(t.receivedSubject(oneLine(input.subject), reference), {
    lang: locale,
    eyebrow: t.reference(reference),
    greeting: t.greeting(input.name),
    paragraphs: [t.received],
    quote: { label: words.fields.message, text: input.message },
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
    lang: locale,
    greeting: t.greeting(name.slice(0, 60)),
    paragraphs: [t.receivedPublic],
    signature: t.signature,
    footer: t.footer,
  });
}

/** To the requester: the team answered. */
export function replyMail(
  locale: Locale,
  input: {
    ticketId: string;
    name: string | null;
    subject: string;
    body: string;
    link: string | null;
  },
): RenderedMail {
  const t = dictionary(locale, "support").email;
  const reference = ticketReference(input.ticketId);
  return render(t.replySubject(oneLine(input.subject), reference), {
    lang: locale,
    eyebrow: t.reference(reference),
    greeting: t.greeting(input.name),
    paragraphs: [t.reply],
    quote: { label: t.teamReply, text: input.body },
    link: input.link ? { href: input.link, label: t.view } : undefined,
    signature: t.signature,
    footer: t.footer,
  });
}

/** To the requester: their ticket moved on. */
export function statusMail(
  locale: Locale,
  input: {
    ticketId: string;
    name: string | null;
    subject: string;
    status: TicketStatus;
    link: string | null;
  },
): RenderedMail {
  const words = dictionary(locale, "support");
  const status = words.statuses[input.status];
  const reference = ticketReference(input.ticketId);
  return render(words.email.statusSubject(oneLine(input.subject), status, reference), {
    lang: locale,
    eyebrow: words.email.reference(reference),
    greeting: words.email.greeting(input.name),
    paragraphs: [words.email.status(status)],
    details: [
      [words.fields.subject, oneLine(input.subject)],
      [words.admin.status, status],
    ],
    link: input.link ? { href: input.link, label: words.email.view } : undefined,
    signature: words.email.signature,
    footer: words.email.footer,
  });
}

export type InboxTicket = Pick<
  TicketView,
  | "id"
  | "kind"
  | "source"
  | "subject"
  | "steps"
  | "expected"
  | "area"
  | "useCase"
  | "pageUrl"
  | "userAgent"
>;

/** To the team's inbox: something new, or a reply. Always in English: it is the team's. */
export function inboxMail(input: {
  ticket: InboxTicket;
  message: string;
  from: string;
  link: string;
  reply?: boolean;
}): RenderedMail {
  const words = dictionary("en", "support");
  const { ticket } = input;
  const kind = words.kinds[ticket.kind];
  const reference = ticketReference(ticket.id);
  const subject = oneLine(ticket.subject);

  const details: [string, string][] = [
    [words.admin.kind, kind],
    [words.email.referenceLabel, reference],
    [words.fields.subject, subject],
    [words.admin.from, input.from],
  ];
  if (!input.reply) {
    details.push([words.admin.source, words.sources[ticket.source]]);
    const extra: [string, string | null][] = [
      [words.fields.area, ticket.area],
      [words.fields.steps, ticket.steps],
      [words.fields.expected, ticket.expected],
      [words.fields.useCase, ticket.useCase],
      [words.admin.page_, ticket.pageUrl],
      [words.admin.browser, ticket.userAgent],
    ];
    for (const [name, value] of extra) if (value?.trim()) details.push([name, value.trim()]);
  }

  return render(
    input.reply
      ? words.email.inboxReplySubject(kind, reference, subject)
      : words.email.inboxSubject(kind, reference, subject),
    {
      lang: "en",
      eyebrow: `${kind} · ${reference}`,
      greeting: words.email.greeting(null),
      paragraphs: [input.reply ? words.email.inboxReply : words.email.inbox[ticket.kind]],
      details,
      quote: {
        label: input.reply ? words.email.requesterReply : words.fields.message,
        text: input.message,
      },
      link: { href: input.link, label: words.email.open },
      signature: words.email.signature,
      footer: words.email.inboxFooter,
    },
  );
}
