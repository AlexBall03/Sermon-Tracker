import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

/*
 * A recovery draft of a sermon document (A2.3A): the newest snapshot one
 * editor session has kept on this device, and how far the server is known to
 * have it. Plain types and pure rules; the IndexedDB operations are store.ts.
 *
 * One draft per account, outline, and editor session (`draftId`, a UUID the
 * autosave controller makes for itself), so two tabs never overwrite each
 * other's work. A draft exists only while it holds something the server is
 * not known to hold: it is deleted when the server confirms exactly its
 * snapshot, when the person discards it, or when the account is deleted.
 *
 * What a draft guarantees, once `writeDraft` has resolved:
 * - it survives a reload, a closed tab or browser, signing out, and another
 *   account signing in on the device;
 * - an acknowledgment of sequence N never removes sequence N+1;
 * - a write of an older sequence never replaces a newer one;
 * - another account's calls cannot read, confirm, or remove it.
 * What it does not guarantee:
 * - that the server has it: a draft is never a save;
 * - protection from anyone using this browser profile: IndexedDB is neither
 *   encrypted nor behind sign-in, and the owner in the key is a scope, not a lock;
 * - survival of the browser clearing or evicting the site's storage;
 * - that its content is still a document the schema accepts: recovery (A2.3C)
 *   restores it through the document core before using it.
 */

/** The `accountData` kind of a draft. */
export const draftKind = "documentDraft";

/** The draft format this code writes and reads. Anything else is `unsupported`, never guessed at. */
export const draftFormat = 1;

/** Why the server would not take the draft's line of work. It waits for the person (A2.3C). */
export type DraftRefusal = {
  code: "stale" | "missing" | "invalid" | "too_large";
  /** The snapshot whose save was refused. Only a confirmation of it or a later one answers the refusal. */
  sequence: number;
  /** The server's current revision, when it said. */
  revision?: number;
  at: number;
};

/** What a draft record holds. Its owner, outline, and session are its key; its update time is the record's. */
export type DocumentDraftData = {
  format: typeof draftFormat;
  /** The newest snapshot this session kept: schema v4 JSON as the editor gave it. */
  content: JSONContent;
  /** The client's sequence of `content`. Rises with every snapshot of one session. */
  sequence: number;
  /** The highest sequence of this session the server has confirmed (0: none since the draft began). */
  confirmedSequence: number;
  /** The document revision the next save of `content` names: the last confirmed, or the one read. */
  baseRevision: number;
  /** Set when the server refused this line of work; the content is kept whole. */
  refusal?: DraftRefusal;
  createdAt: number;
};

/**
 * Where a draft stands. `pending`: content the server is not known to have
 * (a save of it may have landed; nothing here proves it did). `conflict`: the
 * server refused it and the person decides. A draft found by a session other
 * than its own is a recovery candidate, whatever its status.
 */
export type DraftStatus = "pending" | "conflict";

export const draftStatus = (draft: DocumentDraftData): DraftStatus =>
  draft.refusal ? "conflict" : "pending";

/** A draft as read: readable, of a format this code does not know, or damaged. Never silently skipped. */
export type DraftRead =
  | {
      status: "ok";
      outlineId: string;
      draftId: string;
      draft: DocumentDraftData;
      updatedAt: number;
    }
  /** Written by a newer version of the application. Kept as it is. */
  | { status: "unsupported"; outlineId: string; draftId: string; id: string; format: number }
  /** Not a draft this code can read. Kept as it is; its content is not returned. */
  | { status: "malformed"; outlineId: string | null; draftId: string | null; id: string };

const uuid = z.uuid().transform((value) => value.toLowerCase());
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().min(0).max(2_147_483_647);
const time = z.number().finite();

export const draftInputs = {
  owner: z.string().min(1),
  outlineId: uuid,
  draftId: uuid,
  sequence,
  revision,
};

const contentSchema = z.custom<JSONContent>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "doc",
);

const dataSchema = z.object({
  format: z.literal(draftFormat),
  content: contentSchema,
  sequence,
  confirmedSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  baseRevision: revision,
  refusal: z
    .object({
      code: z.enum(["stale", "missing", "invalid", "too_large"]),
      sequence,
      revision: revision.optional(),
      at: time,
    })
    .optional(),
  createdAt: time,
});

/** A draft's record ID: the outline, then the session. A UUID has no `:`, so one outline's drafts are one key range. */
export const draftId = (outlineId: string, session: string) => `${outlineId}:${session}`;

function splitId(id: string): { outlineId: string; draftId: string } | null {
  const [outline, session, ...rest] = id.split(":");
  if (rest.length) return null;
  const parsedOutline = draftInputs.outlineId.safeParse(outline);
  const parsedSession = draftInputs.draftId.safeParse(session);
  if (!parsedOutline.success || !parsedSession.success) return null;
  // Only a canonical (lowercase) ID is one this code wrote.
  if (parsedOutline.data !== outline || parsedSession.data !== session) return null;
  return { outlineId: outline, draftId: session };
}

/**
 * Reads a stored `accountData` record as a draft of `owner`'s. A record whose
 * owner field is not the owner it was looked up under, whose ID is not a draft
 * ID, or whose data does not parse, is `malformed`: reported, never treated as
 * no draft, and never returned with its content.
 */
export function readDraftRecord(
  owner: string,
  record: { owner?: unknown; kind?: unknown; id?: unknown; data?: unknown; updatedAt?: unknown },
): DraftRead {
  const id = typeof record.id === "string" ? record.id : "";
  const ids = splitId(id);
  const malformed: DraftRead = {
    status: "malformed",
    outlineId: ids?.outlineId ?? null,
    draftId: ids?.draftId ?? null,
    id,
  };
  if (!ids || record.owner !== owner || record.kind !== draftKind) return malformed;
  const format = (record.data as { format?: unknown } | null | undefined)?.format;
  if (format !== draftFormat) {
    return typeof format === "number" && format > draftFormat
      ? { status: "unsupported", ...ids, id, format }
      : malformed;
  }
  const data = dataSchema.safeParse(record.data);
  if (!data.success) return malformed;
  if (data.data.confirmedSequence >= data.data.sequence) return malformed;
  const updatedAt = typeof record.updatedAt === "number" ? record.updatedAt : data.data.createdAt;
  return { status: "ok", ...ids, draft: data.data as DocumentDraftData, updatedAt };
}
