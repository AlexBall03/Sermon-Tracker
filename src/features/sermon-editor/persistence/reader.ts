import "server-only";

import type { JSONContent } from "@tiptap/core";

import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import { outlineIdSchema } from "@/features/outlines/schemas";
import { dictionary } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import * as documents from "./documents";
import { failure } from "./failure";
import { toPlainJson } from "./json";

/*
 * The one authoritative read of a sermon document (A2.3B.2D), shared by the
 * `readOutlineDocument` Server Action and the GET Route Handler
 * (`/api/sermon-documents/[outlineId]`), so neither has a reader of its own.
 */

export type DocumentReadResult = ActionResult & {
  /** Why nothing was read: `missing` for none (or another account's), `unreadable` for one the core no longer accepts. */
  code?: "invalid" | "missing" | "unreadable" | "failed";
  /** The canonical document, as a plain copy a Client Component can take. Only with `ok`. */
  content?: JSONContent;
  /** The revision to name in the next save; with `unreadable` too. */
  revision?: number;
};

/**
 * Reads the caller's sermon document as the server holds it (A2.3A.1): its
 * canonical form and revision. Read only: it never creates, converts,
 * repairs, or writes, and revalidates nothing. The owner is the session's,
 * never the caller's to name. Another account's outline and none are the same
 * `missing`. An unreadable document gives its revision and not its content or
 * its problems. A refused caller gets `authorize`'s answer, which has no code.
 */
export async function readCallerDocument(outlineId: unknown): Promise<DocumentReadResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const t = dictionary(await getLocale(), "outlines").actions;

  const id = outlineIdSchema.safeParse(outlineId);
  if (!id.success) return { ok: false, code: "invalid", message: t.invalid };

  let outcome: Awaited<ReturnType<typeof documents.getDocument>>;
  try {
    outcome = await documents.getDocument(getDb(), actor.user.id, id.data);
  } catch (error) {
    console.error("Sermon document read failed:", failure(error));
    return { ok: false, code: "failed", message: t.documentNotRead };
  }
  switch (outcome.status) {
    case "found": {
      // ProseMirror's attributes have no prototype, which React refuses to send.
      const plain = toPlainJson(outcome.document.content);
      if (!plain.ok) {
        console.error("Sermon document read failed:", `not plain JSON (${plain.problem.code})`);
        return { ok: false, code: "failed", message: t.documentNotRead };
      }
      return {
        ok: true,
        message: t.documentLoaded,
        content: plain.value as JSONContent,
        revision: outcome.document.revision,
      };
    }
    case "unreadable":
      return {
        ok: false,
        code: "unreadable",
        message: t.documentUnreadable,
        revision: outcome.revision,
      };
    case "missing":
      return { ok: false, code: "missing", message: t.missing };
  }
}
