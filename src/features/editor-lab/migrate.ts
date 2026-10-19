import type { JSONContent } from "@tiptap/core";

import { layoutFromNumbering } from "./layout";
import { currentSchemaVersion } from "./schema/model";

/*
 * Schema migrations (PS-1B.1 §B.11, Proposed). Every version bump ships one
 * pure, lossless step, run on load before validation; this code reads and
 * writes only the current version. A migration never lowers a version, never
 * repairs, and never changes its input: it returns a new document.
 *
 * v1 → v2 (PS-1A's lab schema to the canonical document):
 * - `numbering` on the document becomes `layout`, wrapping it verbatim;
 *   `translation` is added as null (follow the account).
 * - `sermonIntroduction` / `sermonConclusion` become `sermonSection` with
 *   `role`, and `entryTitle` becomes `sectionTitle` or `pointTitle`.
 * - An entry's `entryPassages` becomes `scripturePassage` blocks straight
 *   after the title, each keeping its ID, printed as a reference (as a
 *   converted legacy outline prints) and with no translation override.
 * - An inline `scriptureReference` gains `translation: null` and
 *   `display: "reference"`.
 * - An empty document gets one empty paragraph: v2 needs a block, and an
 *   empty top-level paragraph holds nothing (the legacy projection ignores it).
 * Everything else (text, marks, prose, points, IDs, provenance) is copied as
 * it is. Whatever v1 could hold, v2 holds; the tests check it.
 */

export type Migrated =
  | { ok: true; doc: JSONContent; from: number }
  | { ok: false; code: "invalid_version" | "unsupported_version"; version: unknown };

/** The schema version a document says it is, read from its JSON. */
export const versionOf = (json: JSONContent): unknown => json.attrs?.schemaVersion;

function migrateNodeV1(node: JSONContent): JSONContent {
  const next: JSONContent = { ...node };
  if (node.attrs) next.attrs = { ...node.attrs };

  switch (node.type) {
    case "sermonIntroduction":
    case "sermonConclusion":
      next.type = "sermonSection";
      next.attrs = {
        ...next.attrs,
        role: node.type === "sermonIntroduction" ? "introduction" : "conclusion",
      };
      next.content = migrateEntryContent(node.content ?? [], "sectionTitle");
      return next;
    case "outlinePoint":
      next.attrs = { ...next.attrs, presentation: null };
      next.content = migrateEntryContent(node.content ?? [], "pointTitle");
      return next;
    case "scriptureReference":
      next.attrs = { ...next.attrs, translation: null, display: "reference" };
      return next;
  }
  if (node.content) next.content = node.content.map(migrateNodeV1);
  return next;
}

function migrateEntryContent(content: JSONContent[], titleType: string): JSONContent[] {
  const result: JSONContent[] = [];
  for (const child of content) {
    if (child.type === "entryTitle") {
      result.push({
        ...child,
        type: titleType,
        ...(child.content ? { content: child.content.map(migrateNodeV1) } : {}),
      });
    } else if (child.type === "entryPassages") {
      for (const reference of child.content ?? []) {
        result.push({
          type: "scripturePassage",
          attrs: { ...reference.attrs, translation: null, print: "reference" },
        });
      }
    } else {
      result.push(migrateNodeV1(child));
    }
  }
  return result;
}

export function migrateV1(json: JSONContent): JSONContent {
  const { numbering, ...rest } = json.attrs ?? {};
  return {
    ...json,
    attrs: {
      ...rest,
      schemaVersion: 2,
      layout: layoutFromNumbering(numbering),
      translation: null,
    },
    // v2 holds at least one block; an empty paragraph holds nothing.
    content: json.content?.length ? json.content.map(migrateNodeV1) : [{ type: "paragraph" }],
  };
}

/**
 * Brings a document to the current version. A version this code does not
 * know is refused, never read as an older one: a newer document is never
 * downgraded, and one with no version is not guessed.
 */
export function migrateDocument(json: JSONContent): Migrated {
  const version = versionOf(json);
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, code: "invalid_version", version };
  }
  if (version > currentSchemaVersion) return { ok: false, code: "unsupported_version", version };
  if (version === 1) return { ok: true, doc: migrateV1(json), from: 1 };
  return { ok: true, doc: json, from: version };
}
