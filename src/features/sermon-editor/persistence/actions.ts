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
import { convertOutline } from "./conversion";
import { conversionEnabled } from "./rollout";
import { failure } from "./failure";
import { readCallerDocument, type DocumentReadResult } from "./reader";
import type { ConversionProblem, DocumentRefusal } from "./model";

/*
 * The actions over sermon document persistence (A2.1). Each one authorises
 * itself when it runs and takes the owner from the session; nothing it
 * accepts can name another account. A missing outline and another account's
 * are the same answer. Reading a document is not an action: a page calls
 * `getDocument` itself, behind `requireActiveUser`.
 *
 * The outline page (A3) converts through `convertOutlineDocument`, behind the
 * rollout switch (`rollout.ts`), and its editor session saves through
 * `saveOutlineDocument`. Nothing is revalidated: the page reads a document
 * through its session, never from a cached render. A failure is logged as its
 * kind and code only, never with the document (`failure`).
 */

/** Why an action did not do what was asked, for code to act on. `stale` means read the document again. */
export type DocumentActionCode =
  | "invalid"
  | "too_large"
  | "missing"
  | "exists"
  | "stale"
  | "unreadable"
  | "unsafe"
  | "disabled"
  | "failed";

export type DocumentActionResult = ActionResult & {
  code?: DocumentActionCode;
  /** The revision to name in the next save: the new one, or the current one when refused as `stale` or `exists`. */
  revision?: number;
  /** Why a document was refused as `invalid`, for the caller who sent it. Never logged. */
  problems?: DocumentProblem[];
  /** For `too_large`: the document's size and the limit, in UTF-8 bytes. */
  bytes?: number;
  limit?: number;
  /** For `unsafe`: why converting the outline could change it (codes and IDs only). */
  conversion?: ConversionProblem[];
};

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

const kilobytes = (locale: Messages["locale"], bytes: number) =>
  `${formatNumber(locale, Math.floor(bytes / 1024))} KB`;

function refusedDocument({ locale, t }: Messages, outcome: DocumentRefusal): DocumentActionResult {
  if (outcome.status === "invalid") {
    const unstorable = outcome.problems.some((problem) => problem.code === "unstorable_text");
    return refused("invalid", unstorable ? t.documentUnstorable : t.invalid, {
      problems: outcome.problems,
    });
  }
  return refused("too_large", t.documentTooLarge(kilobytes(locale, outcome.limit)), {
    bytes: outcome.bytes,
    limit: outcome.limit,
  });
}

/**
 * Converts one of the caller's outlines into its sermon document (A2.2): the
 * only way an outline is given its first one. The document is made on the
 * server from the outline's own entries, so nothing sent from a browser can
 * become an outline's content. Once converted, the outline takes no more
 * legacy entry writes. Asking again answers `exists` and changes nothing.
 */
export async function convertOutlineDocument(outlineId: unknown): Promise<DocumentActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const messages = await context();
  const { locale, t } = messages;

  // The rollout switch (rollout.ts), on the server: a browser asking cannot convert while it is off.
  if (!conversionEnabled()) return refused("disabled", t.conversionDisabled);
  const id = outlineIdSchema.safeParse(outlineId);
  if (!id.success) return refused("invalid", t.invalid);

  let outcome: Awaited<ReturnType<typeof convertOutline>>;
  try {
    outcome = await convertOutline(getDb(), actor.user.id, id.data);
  } catch (error) {
    console.error("Sermon document conversion failed:", failure(error));
    return refused("failed", t.notSaved);
  }
  switch (outcome.status) {
    case "converted":
      return { ok: true, message: t.documentConverted, revision: outcome.document.revision };
    case "exists":
      return refused("exists", t.documentExists, { revision: outcome.revision });
    case "unreadable":
      return refused("unreadable", t.documentUnreadable, { revision: outcome.revision });
    case "missing":
      return refused("missing", t.missing);
    case "unsafe":
      return refused("unsafe", t.conversionUnsafe, { conversion: outcome.problems });
    case "too_large":
      return refused("too_large", t.conversionTooLarge(kilobytes(locale, outcome.limit)), {
        bytes: outcome.bytes,
        limit: outcome.limit,
      });
    default:
      return refusedDocument(messages, outcome);
  }
}

export type { DocumentReadResult };

/**
 * Reads the caller's sermon document as the server holds it (A2.3A.1). Kept
 * for compatibility: it is `readCallerDocument` (reader.ts), which the GET
 * Route Handler `/api/sermon-documents/[outlineId]` shares. The browser's
 * recovery reads use that route, never this action, which Next.js would
 * queue behind a pending save (A2.3B.2D).
 */
export async function readOutlineDocument(outlineId: unknown): Promise<DocumentReadResult> {
  return readCallerDocument(outlineId);
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
