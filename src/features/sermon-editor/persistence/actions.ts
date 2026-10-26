"use server";

import { z } from "zod";

import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import { outlineIdSchema } from "@/features/outlines/schemas";
import type { DocumentProblem } from "@/features/sermon-editor/document";
import { dictionary, formatNumber } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import * as documents from "./documents";
import type { DocumentRefusal } from "./model";

/*
 * The actions over sermon document persistence (A2.1). Each one authorises
 * itself when it runs and takes the owner from the session; nothing it
 * accepts can name another account. A missing outline and another account's
 * are the same answer. Reading a document is not an action: a page calls
 * `getDocument` itself, behind `requireActiveUser`.
 *
 * Nothing in the application calls these yet (A2.3 does), and nothing is
 * revalidated: no page shows a document. A failure is logged as its kind and
 * code only, never with the document (`failure`).
 */

/** Why an action did not do what was asked, for code to act on. `stale` means read the document again. */
export type DocumentActionCode =
  "invalid" | "too_large" | "missing" | "exists" | "stale" | "failed";

export type DocumentActionResult = ActionResult & {
  code?: DocumentActionCode;
  /** The revision to name in the next save: the new one, or the current one when refused as `stale` or `exists`. */
  revision?: number;
  /** Why a document was refused as `invalid`, for the caller who sent it. Never logged. */
  problems?: DocumentProblem[];
  /** For `too_large`: the document's size and the limit, in UTF-8 bytes. */
  bytes?: number;
  limit?: number;
};

/**
 * What is logged of a failure: its kind and SQLSTATE, and nothing else.
 * Not `describeDatabaseError`: Drizzle puts every parameter of the failed
 * query in its message, and here that is the whole document, which is never
 * logged (migration document, section 10).
 */
function failure(error: unknown): string {
  let code: unknown;
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current !== "object") break;
    code ??= (current as { code?: unknown }).code;
    current = (current as { cause?: unknown }).cause;
  }
  // Only a real SQLSTATE (five digits or capitals) and a plain name: nothing else of the error.
  const kind = error instanceof Error && /^\w{1,40}$/.test(error.name) ? error.name : "Error";
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? `${kind} (${code})` : kind;
}

/** The revision a save is made against: always named. */
const expectedRevisionSchema = z.number().int().min(0).max(2_147_483_647);

async function context() {
  const locale = await getLocale();
  return { locale, t: dictionary(locale, "outlines").actions };
}

type Messages = Awaited<ReturnType<typeof context>>;

const refused = (
  code: DocumentActionCode,
  message: string,
  extra: Partial<DocumentActionResult> = {},
): DocumentActionResult => ({ ok: false, code, message, ...extra });

function refusedDocument({ locale, t }: Messages, outcome: DocumentRefusal): DocumentActionResult {
  if (outcome.status === "invalid") {
    return refused("invalid", t.invalid, { problems: outcome.problems });
  }
  const limit = `${formatNumber(locale, Math.floor(outcome.limit / 1024))} KB`;
  return refused("too_large", t.documentTooLarge(limit), {
    bytes: outcome.bytes,
    limit: outcome.limit,
  });
}

/** Gives one of the caller's outlines its first sermon document. */
export async function createOutlineDocument(
  outlineId: unknown,
  content: unknown,
): Promise<DocumentActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const messages = await context();
  const { t } = messages;

  const id = outlineIdSchema.safeParse(outlineId);
  if (!id.success) return refused("invalid", t.invalid);

  let outcome: Awaited<ReturnType<typeof documents.createDocument>>;
  try {
    outcome = await documents.createDocument(getDb(), actor.user.id, id.data, content);
  } catch (error) {
    console.error("Sermon document create failed:", failure(error));
    return refused("failed", t.notSaved);
  }
  switch (outcome.status) {
    case "created":
      return { ok: true, message: t.documentCreated, revision: outcome.document.revision };
    case "exists":
      return refused("exists", t.documentExists, { revision: outcome.revision });
    case "missing":
      return refused("missing", t.missing);
    default:
      return refusedDocument(messages, outcome);
  }
}

/** Saves the caller's sermon document, made against the revision it was read at. */
export async function saveOutlineDocument(
  outlineId: unknown,
  content: unknown,
  expectedRevision: unknown,
): Promise<DocumentActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const messages = await context();
  const { t } = messages;

  const id = outlineIdSchema.safeParse(outlineId);
  const revision = expectedRevisionSchema.safeParse(expectedRevision);
  if (!id.success || !revision.success) return refused("invalid", t.invalid);

  let outcome: Awaited<ReturnType<typeof documents.updateDocument>>;
  try {
    outcome = await documents.updateDocument(
      getDb(),
      actor.user.id,
      id.data,
      content,
      revision.data,
    );
  } catch (error) {
    console.error("Sermon document save failed:", failure(error));
    return refused("failed", t.notSaved);
  }
  switch (outcome.status) {
    case "updated":
      return { ok: true, message: t.documentSaved, revision: outcome.revision };
    case "stale":
      return refused("stale", t.stale, { revision: outcome.revision });
    case "missing":
      return refused("missing", t.missing);
    default:
      return refusedDocument(messages, outcome);
  }
}
