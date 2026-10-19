import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { outlineLimits } from "@/features/outlines/model";
import { numberingConfigSchema } from "@/features/outlines/numbering";
import { duplicateIds } from "./identity";
import { referenceFrom } from "./schema/scripture";

/*
 * Whether document JSON may be loaded into the lab's editor: it must fit the
 * schema (one introduction at most and first, one conclusion at most and
 * last, no point inside a section), every passage must exist in the Bible,
 * an entry may hold at most `outlineLimits.references` passages, the outline
 * at most `outlineLimits.entries` entries, IDs must be unique, and the
 * numbering must be one the outline engine accepts. Nothing is repaired here.
 */

export type DocumentProblem = {
  code:
    | "not_a_document"
    | "schema"
    | "invalid_reference"
    | "too_many_references"
    | "too_many_entries"
    | "duplicate_id"
    | "invalid_numbering";
  detail?: string;
};

export type Restored =
  { ok: true; doc: ProseMirrorNode } | { ok: false; problems: DocumentProblem[] };

export function restoreDocument(json: unknown, schema: Schema): Restored {
  if (typeof json !== "object" || json === null || (json as JSONContent).type !== "doc") {
    return { ok: false, problems: [{ code: "not_a_document" }] };
  }
  let doc: ProseMirrorNode;
  try {
    doc = schema.nodeFromJSON(json);
    doc.check();
  } catch (error) {
    return { ok: false, problems: [{ code: "schema", detail: (error as Error).message }] };
  }

  const problems: DocumentProblem[] = [];
  let entries = 0;
  doc.descendants((node) => {
    const name = node.type.name;
    if (name === "outlinePoint" || name === "sermonIntroduction" || name === "sermonConclusion") {
      entries += 1;
    }
    if (name === "scriptureReference" && !referenceFrom(node.attrs)) {
      problems.push({ code: "invalid_reference", detail: JSON.stringify(node.attrs) });
    }
    if (name === "entryPassages" && node.childCount > outlineLimits.references) {
      problems.push({ code: "too_many_references", detail: String(node.childCount) });
    }
    return true;
  });
  if (entries > outlineLimits.entries) {
    problems.push({ code: "too_many_entries", detail: String(entries) });
  }
  for (const id of duplicateIds(doc)) problems.push({ code: "duplicate_id", detail: id });
  if (!numberingConfigSchema.safeParse(doc.attrs.numbering).success) {
    problems.push({ code: "invalid_numbering" });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, doc };
}
