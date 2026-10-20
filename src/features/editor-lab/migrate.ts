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
 *
 * v2 → v3 (PS-1B.2B.2 B.2A): a widening only. v3 adds the Script node and
 * the style attributes (`styles`, `subtitle`, `page`, `styleName`, `format`,
 * `appearance`, a text style's font family and size, heading level 1), each
 * optional with a null default, so a v2 document is already a valid v3
 * document in everything but its version. The step sets `schemaVersion: 3`
 * and changes nothing else: the Outline Layout (`layout`) is carried exactly
 * as it was, its contract unchanged (the owner's decision).
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
 * What schema v3 introduced, which no v1 or v2 writer could have stored:
 * the attributes by node type, the Script node, a text style's font family
 * and size, and heading level 1. A document that says it is older than v3
 * and holds any of these is refused (`validate.ts`), not read as v3: its
 * version would be a lie, and a lie is not guessed past.
 */
export const introducedInV3 = {
  attributes: {
    doc: ["styles", "subtitle", "page"],
    paragraph: ["styleName", "format"],
    heading: ["format"],
    sermonSection: ["appearance"],
    outlinePoint: ["appearance"],
    scripturePassage: ["appearance"],
    preacherNote: ["appearance"],
  } as Record<string, readonly string[]>,
  nodes: ["script"] as readonly string[],
  textStyleAttributes: ["fontFamily", "fontSize"] as readonly string[],
};

/** Where a document older than v3 holds something only v3 can hold, as validation problems. */
export function v3ContentIn(json: JSONContent) {
  const found: { code: "unknown_node" | "unknown_attribute"; path: string; detail: string }[] = [];
  const walk = (node: JSONContent, path: string) => {
    const type = String(node.type);
    if (introducedInV3.nodes.includes(type)) {
      found.push({ code: "unknown_node", path, detail: `${type} (schema v3)` });
      return;
    }
    for (const name of introducedInV3.attributes[type] ?? []) {
      if (node.attrs && name in node.attrs) {
        found.push({ code: "unknown_attribute", path, detail: `${type}.${name} (schema v3)` });
      }
    }
    if (type === "heading" && node.attrs?.level === 1) {
      found.push({ code: "unknown_attribute", path, detail: "heading.level=1 (schema v3)" });
    }
    (Array.isArray(node.marks) ? node.marks : []).forEach((mark, index) => {
      if (mark?.type !== "textStyle") return;
      for (const name of introducedInV3.textStyleAttributes) {
        if (mark.attrs && name in mark.attrs) {
          found.push({
            code: "unknown_attribute",
            path: `${path}/marks/${index}`,
            detail: `textStyle.${name} (schema v3)`,
          });
        }
      }
    });
    if (Array.isArray(node.content)) {
      node.content.forEach((child, index) => {
        if (typeof child === "object" && child !== null) walk(child, `${path}/content/${index}`);
      });
    }
  };
  walk(json, "");
  return found;
}

/** v2 → v3: the version, and nothing else. */
export function migrateV2(json: JSONContent): JSONContent {
  return { ...json, attrs: { ...json.attrs, schemaVersion: 3 } };
}

/** Each step, by the version it starts from. */
const steps: Record<number, (json: JSONContent) => JSONContent> = { 1: migrateV1, 2: migrateV2 };

/**
 * Brings a document to the current version, one step at a time. A version
 * this code does not know is refused, never read as an older one: a newer
 * document is never downgraded, and one with no version is not guessed.
 */
export function migrateDocument(json: JSONContent): Migrated {
  const version = versionOf(json);
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, code: "invalid_version", version };
  }
  if (version > currentSchemaVersion) return { ok: false, code: "unsupported_version", version };
  let doc = json;
  for (let at = version; at < currentSchemaVersion; at += 1) doc = steps[at](doc);
  return { ok: true, doc, from: version };
}
