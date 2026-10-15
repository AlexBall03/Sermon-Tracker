/*
 * Contact and feedback (Phase 6A). A ticket is one conversation: a public
 * contact message from someone without an account, or something a signed-in
 * account sent from Help & Feedback. There is no server code here, so the
 * browser can share the lists and the rules about status.
 */

/** What a ticket is about. The public form only ever sends `contact`. */
export const ticketKinds = ["contact", "bug", "feature", "feedback"] as const;
export type TicketKind = (typeof ticketKinds)[number];

/** The kinds an account chooses between in Help & Feedback, in the order they are offered. */
export const appTicketKinds = ["bug", "feature", "feedback", "contact"] as const;

export const ticketSources = ["public", "app"] as const;
export type TicketSource = (typeof ticketSources)[number];

export const ticketStatuses = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

/**
 * The statuses that make sense for each kind, in workflow order. Nothing may
 * set a status outside its kind's list: a contact message is never "Planned",
 * and a bug report is never "Planned" either (it is worked on or it is not).
 */
const statusesByKind: Record<TicketKind, readonly TicketStatus[]> = {
  contact: ["open", "resolved", "closed"],
  bug: ["open", "under_review", "in_progress", "resolved", "closed"],
  feature: ["open", "under_review", "planned", "in_progress", "resolved", "closed"],
  feedback: ["open", "under_review", "closed"],
};

export function statusesFor(kind: TicketKind): readonly TicketStatus[] {
  return statusesByKind[kind];
}

export function isStatusAllowed(kind: TicketKind, status: TicketStatus) {
  return statusesByKind[kind].includes(status);
}

/** A ticket that is finished. Its requester may still reply, which opens it again. */
export function isFinished(status: TicketStatus) {
  return status === "resolved" || status === "closed";
}

/** Status changes the requester is told about by email. The others show in the app only. */
export const notifiedStatuses: readonly TicketStatus[] = [
  "planned",
  "in_progress",
  "resolved",
  "closed",
];

export const messageAuthors = ["requester", "admin"] as const;
export type MessageAuthor = (typeof messageAuthors)[number];

/** `internal` is a note between administrators: never shown to, or mailed to, the requester. */
export const messageVisibilities = ["public", "internal"] as const;
export type MessageVisibility = (typeof messageVisibilities)[number];

export const supportLimits = {
  name: 120,
  email: 254,
  subject: 160,
  message: 5000,
  /** Each of a bug report's or feature request's extra fields. */
  detail: 2000,
  area: 120,
  pageUrl: 2048,
  userAgent: 512,
  /** Screenshots on one submission. */
  attachments: 3,
  /** One screenshot, kept under Vercel's 4.5 MB request limit. */
  attachmentBytes: 4 * 1024 * 1024,
  /** A form sent sooner than this after it was opened was not filled in by a person. */
  minFillMs: 3000,
} as const;

/** How much may be sent before the sender is asked to wait. Counted in the database. */
export const rateLimits = {
  /** Public messages per hour, from one network address and to one email address. */
  publicPerHour: 3,
  /** Tickets an account opens per hour. */
  ticketsPerHour: 10,
  /** Replies an account sends per hour. */
  repliesPerHour: 30,
  /** On the public form, the same words from the same address within this window are the same submission. */
  duplicateWindowMs: 10 * 60 * 1000,
} as const;

/** An upload not attached to a ticket after this long is deleted. */
export const orphanAfterMs = 24 * 60 * 60 * 1000;

export const attachmentTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type AttachmentType = (typeof attachmentTypes)[number];

/**
 * What a file is, from its first bytes: a declared type or a file name is the
 * browser's word and is never trusted. Null for anything but PNG, JPEG, or WebP.
 */
export function sniffImageType(bytes: Uint8Array): AttachmentType | null {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((value, index) => bytes[offset + index] === value);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" … "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Admin inbox: the query its address carries (features/support/inbox-query.ts). */
export const inboxSorts = ["updated", "newest", "oldest"] as const;
export type InboxSort = (typeof inboxSorts)[number];
export const inboxPageSize = 25;
