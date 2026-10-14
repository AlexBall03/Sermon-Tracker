import { z } from "zod";

import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import {
  inboxSorts,
  messageVisibilities,
  supportLimits,
  ticketKinds,
  ticketSources,
  ticketStatuses,
} from "./model";

export const ticketIdSchema = z.uuid().transform((value) => value.toLowerCase());
export const attachmentIdSchema = z.uuid().transform((value) => value.toLowerCase());

/** Words with their ends trimmed, and an empty line read as nothing. */
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((value) => value || null);
}

/**
 * Contact and feedback input, with messages in the sender's language. Called
 * per request. The browser checks with the same schemas before it sends; the
 * server checks again, and only the server's answer counts.
 */
export function supportSchemas(locale: Locale) {
  const t = dictionary(locale, "support").validation;
  const tooLong = t.tooLong;

  const subject = z
    .string()
    .trim()
    .min(1, t.subject)
    .max(supportLimits.subject, tooLong(supportLimits.subject));
  const message = z
    .string()
    .trim()
    .min(1, t.message)
    .max(supportLimits.message, tooLong(supportLimits.message));

  /**
   * The two signs of a robot: the hidden `website` field filled in, or the
   * form sent sooner than a person could have written it. `startedAt` is the
   * time the form was opened, by the browser's clock; it only ever refuses.
   */
  const humanCheck = {
    website: z.string().max(0, t.rejected).optional(),
    startedAt: z.number().int().nonnegative().optional(),
  };

  const contact = z
    .object({
      name: z.string().trim().min(1, t.name).max(supportLimits.name, tooLong(supportLimits.name)),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .max(supportLimits.email, t.email)
        .pipe(z.email(t.email)),
      subject,
      message,
      ...humanCheck,
    })
    .refine(
      (value) => !value.startedAt || Date.now() - value.startedAt >= supportLimits.minFillMs,
      {
        message: t.tooFast,
        path: ["form"],
      },
    );

  const feedback = z.object({
    kind: z.enum(ticketKinds),
    subject,
    message,
    steps: optionalText(supportLimits.detail, tooLong(supportLimits.detail)),
    expected: optionalText(supportLimits.detail, tooLong(supportLimits.detail)),
    area: optionalText(supportLimits.area, tooLong(supportLimits.area)),
    useCase: optionalText(supportLimits.detail, tooLong(supportLimits.detail)),
    // Context the browser adds by itself; cut to size rather than refused.
    pageUrl: z
      .string()
      .nullish()
      .transform((value) => value?.slice(0, supportLimits.pageUrl) || null),
    userAgent: z
      .string()
      .nullish()
      .transform((value) => value?.slice(0, supportLimits.userAgent) || null),
    attachmentIds: z.array(attachmentIdSchema).max(supportLimits.attachments).default([]),
  });

  const reply = z.object({ body: message });

  const adminReply = z.object({
    body: message,
    visibility: z.enum(messageVisibilities).default("public"),
  });

  const status = z.object({ status: z.enum(ticketStatuses) });

  return { contact, feedback, reply, adminReply, status };
}

/** A feedback submission as it is saved: the fields that do not belong to its kind are dropped. */
export function forKind<
  T extends {
    kind: (typeof ticketKinds)[number];
    steps: string | null;
    expected: string | null;
    area: string | null;
    useCase: string | null;
  },
>(input: T): T {
  const bug = input.kind === "bug";
  return {
    ...input,
    steps: bug ? input.steps : null,
    expected: bug ? input.expected : null,
    area: bug ? input.area : null,
    useCase: input.kind === "feature" ? input.useCase : null,
  };
}

/**
 * The administrator's inbox, as its address carries it. Anything it does not
 * understand is read as the default rather than refused.
 */
export const inboxQuerySchema = z.object({
  q: z
    .string()
    .catch("")
    .default("")
    .transform((value) => value.trim().slice(0, 200)),
  kind: z.enum(ticketKinds).nullable().catch(null).default(null),
  /** `active` is every status but resolved and closed. */
  status: z
    .enum([...ticketStatuses, "active"])
    .nullable()
    .catch(null)
    .default(null),
  source: z.enum(ticketSources).nullable().catch(null).default(null),
  sort: z.enum(inboxSorts).catch("updated").default("updated"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type InboxQuery = z.infer<typeof inboxQuerySchema>;

/** The inbox's query from an address's parameters. */
export function parseInboxQuery(params: Record<string, string | string[] | undefined>): InboxQuery {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value || undefined;
  return inboxQuerySchema.parse({
    q: first(params.q),
    kind: first(params.kind),
    status: first(params.status),
    source: first(params.source),
    sort: first(params.sort),
    page: first(params.page),
  });
}

/** The address for an inbox query, leaving out what is the default. */
export function inboxSearch(query: Partial<InboxQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.status) params.set("status", query.status);
  if (query.source) params.set("source", query.source);
  if (query.sort && query.sort !== "updated") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}
