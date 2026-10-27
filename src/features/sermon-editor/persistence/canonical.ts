import type { JSONContent } from "@tiptap/core";

import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { toPlainJson } from "./json";
import { documentLimits, utf8Bytes, type DocumentRefusal } from "./model";

/*
 * A sermon document's canonical form (A2.3B.2A): what the server stores for
 * a given JSON. Pure: no database, no React, no editor, so the server's
 * persistence (documents.ts) and the browser's save coordinator use the same
 * function, and the browser can predict exactly what a save will store.
 *
 * `prepareDocument` was in documents.ts (A2.1); it moved here unchanged so
 * the browser could use it without importing the database. documents.ts
 * re-exports it.
 */

/**
 * What would be stored for `json`: its canonical form, or why it is refused.
 *
 * First it must be JSON that `jsonb` keeps exactly (`toPlainJson`, A2.3A.1):
 * a `NaN`, an `undefined`, a `Date`, a cycle, U+0000, or an unpaired surrogate
 * is refused as `invalid` (`not_json`, `unstorable_text`) before the database
 * is asked, never written as something else or left to fail there. Then the
 * size, before the schema is asked (so a huge document is not parsed), and the
 * canonical form's size again after, since that is what is stored. An older
 * document is migrated by the core, so what is stored is always v4.
 */
export function prepareDocument(
  json: unknown,
): { ok: true; content: JSONContent } | ({ ok: false } & DocumentRefusal) {
  const limit = documentLimits.bytes;
  const plain = toPlainJson(json);
  if (!plain.ok) return { ok: false, status: "invalid", problems: [plain.problem] };
  const rawBytes = utf8Bytes(JSON.stringify(plain.value));
  if (rawBytes > limit) return { ok: false, status: "too_large", bytes: rawBytes, limit };

  const restored = restoreSermonDocument(plain.value);
  if (!restored.ok) return { ok: false, status: "invalid", problems: restored.problems };
  const content = restored.doc.toJSON() as JSONContent;
  const bytes = utf8Bytes(JSON.stringify(content));
  if (bytes > limit) return { ok: false, status: "too_large", bytes, limit };
  return { ok: true, content };
}

export type CanonicalDocument =
  { ok: true; content: JSONContent; bytes: number } | ({ ok: false } & DocumentRefusal);

/**
 * The canonical form of `json` as a plain copy: `prepareDocument`, then the
 * same `toPlainJson` step `readOutlineDocument` takes before it answers. What
 * the server would store for a save of `json`, and what reading it back would
 * give, as long as the browser runs the same schema as the server (a
 * deployment between the two can change it: A2.3B.2B reads to be sure).
 * Compare with `jsonEqual`, never by string.
 */
export function canonicalDocument(json: unknown): CanonicalDocument {
  const prepared = prepareDocument(json);
  if (!prepared.ok) return prepared;
  const plain = toPlainJson(prepared.content);
  // The core's own output is JSON; a refusal here would be the core's fault, said as invalid.
  if (!plain.ok) return { ok: false, status: "invalid", problems: [plain.problem] };
  const content = plain.value as JSONContent;
  return { ok: true, content, bytes: utf8Bytes(JSON.stringify(content)) };
}
