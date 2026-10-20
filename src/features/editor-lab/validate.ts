import type { JSONContent } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { outlineLimits } from "@/features/outlines/model";
import { layoutParses } from "./layout";
import { migrateDocument, v3ContentIn } from "./migrate";
import { validHighlight, validTextColor } from "./schema/formatting";
import {
  currentSchemaVersion,
  documentTranslations,
  headingLevels,
  noteKinds,
  notePrints,
  passagePrints,
  pointPresentationSchema,
  referenceDisplays,
  sectionRoles,
  textAlignments,
} from "./schema/model";
import { identifiedTypes } from "./schema/nodes";
import { referenceFrom } from "./schema/scripture";
import { appearanceSchemaFor } from "./styles/attributes";
import {
  documentStylesSchema,
  isFontKey,
  isFontSize,
  pageSetupSchema,
  paragraphFormatSchema,
  paragraphStyleNames,
  subtitleSchema,
} from "./styles/model";

/*
 * Whether document JSON may be loaded: the one entry point for reading a
 * sermon document (PS-1B.1 §B.2 invariants, §B.11). In order:
 *
 * 1. The version: a missing or malformed one is refused (`invalid_version`),
 *    a newer one is refused (`unsupported_version`), never read as older.
 * 2. Migration of an older version to the current one (`migrate.ts`).
 * 3. A walk of the raw JSON, because ProseMirror silently drops attributes it
 *    does not declare: an unknown node, mark, attribute, or field is refused.
 * 4. The schema itself (`nodeFromJSON`, `check`).
 * 5. The invariants a content expression cannot state: one introduction and
 *    one conclusion at most, every identified node with an ID unique in the
 *    document, every closed-list attribute a listed value, every passage one
 *    that exists in normal form, every color a preset key or `#rrggbb`, and
 *    (schema v3) every style contract (`styles`, `subtitle`, `page`,
 *    `styleName`, `format`, `appearance`, a font family or size) null or
 *    exactly what its schema in `styles/model.ts` accepts.
 *
 * Nothing is repaired and the input is never changed. Each problem names
 * where it is (`path`, a JSON pointer into the document as given, or as
 * migrated when `migratedFrom` is set) and what was found. A layout that does
 * not parse is a warning, not a refusal: it is kept exactly as stored (§D.1).
 */

export type ProblemCode =
  | "not_a_document"
  | "invalid_version"
  | "unsupported_version"
  | "unknown_node"
  | "unknown_mark"
  | "unknown_attribute"
  | "unknown_field"
  | "schema"
  | "missing_id"
  | "duplicate_id"
  | "duplicate_section"
  | "invalid_attribute"
  | "invalid_color"
  | "invalid_reference"
  | "too_many_entries"
  | "invalid_layout";

export type DocumentProblem = { code: ProblemCode; path?: string; detail?: string };

export type Restored =
  | {
      ok: true;
      doc: ProseMirrorNode;
      /** Kept, reported, and not refused: an unreadable layout. */
      warnings: DocumentProblem[];
      /** The version the document was migrated from, or null when it was current. */
      migratedFrom: number | null;
    }
  | { ok: false; problems: DocumentProblem[] };

const nodeFields = new Set(["type", "attrs", "content", "marks", "text"]);
const markFields = new Set(["type", "attrs"]);

/** Unknown types, attributes, and fields in raw JSON, which `nodeFromJSON` would drop or reject. */
function rawProblems(json: JSONContent, schema: Schema): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  const walk = (node: JSONContent, path: string) => {
    for (const key of Object.keys(node)) {
      if (!nodeFields.has(key)) problems.push({ code: "unknown_field", path, detail: key });
    }
    const type = typeof node.type === "string" ? schema.nodes[node.type] : undefined;
    if (!type) {
      problems.push({ code: "unknown_node", path, detail: String(node.type) });
      return;
    }
    for (const name of Object.keys(node.attrs ?? {})) {
      if (!(name in (type.spec.attrs ?? {}))) {
        problems.push({ code: "unknown_attribute", path, detail: `${node.type}.${name}` });
      }
    }
    (Array.isArray(node.marks) ? node.marks : []).forEach((mark, index) => {
      const markPath = `${path}/marks/${index}`;
      if (typeof mark !== "object" || mark === null) {
        problems.push({ code: "schema", path: markPath, detail: "not a mark" });
        return;
      }
      for (const key of Object.keys(mark)) {
        if (!markFields.has(key))
          problems.push({ code: "unknown_field", path: markPath, detail: key });
      }
      const markType = typeof mark.type === "string" ? schema.marks[mark.type] : undefined;
      if (!markType) {
        problems.push({ code: "unknown_mark", path: markPath, detail: String(mark.type) });
        return;
      }
      for (const name of Object.keys(mark.attrs ?? {})) {
        if (!(name in (markType.spec.attrs ?? {}))) {
          problems.push({
            code: "unknown_attribute",
            path: markPath,
            detail: `${mark.type}.${name}`,
          });
        }
      }
    });
    if (Array.isArray(node.content)) {
      node.content.forEach((child, index) => {
        if (typeof child === "object" && child !== null) walk(child, `${path}/content/${index}`);
        else
          problems.push({ code: "schema", path: `${path}/content/${index}`, detail: "not a node" });
      });
    }
  };
  walk(json, "");
  return problems;
}

const identified = new Set<string>(identifiedTypes);
const isNullableString = (value: unknown) =>
  value === null || (typeof value === "string" && value.length > 0);
const isNullableInteger = (value: unknown) => value === null || Number.isInteger(value);
const oneOf = (list: readonly unknown[], value: unknown) => list.includes(value);
/** Null, or a value `schema` accepts exactly as it is. */
const nullOr = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) =>
  value === null || schema.safeParse(value).success;

/** The invariants of a document that fits the schema. */
function invariantProblems(doc: ProseMirrorNode): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  const bad = (path: string, detail: string) =>
    problems.push({ code: "invalid_attribute", path, detail });

  if (doc.attrs.schemaVersion !== currentSchemaVersion) bad("", `doc.schemaVersion`);
  if (doc.attrs.translation !== null && !oneOf(documentTranslations, doc.attrs.translation)) {
    bad("", "doc.translation");
  }
  if (!isNullableString(doc.attrs.legacyOutlineId)) bad("", "doc.legacyOutlineId");
  if (!isNullableInteger(doc.attrs.legacyRevision)) bad("", "doc.legacyRevision");
  // The style contracts (schema v3): null, or exactly what their schemas accept. Never repaired.
  if (!nullOr(documentStylesSchema, doc.attrs.styles)) bad("", "doc.styles");
  if (!nullOr(subtitleSchema, doc.attrs.subtitle)) bad("", "doc.subtitle");
  if (!nullOr(pageSetupSchema, doc.attrs.page)) bad("", "doc.page");

  const firstAt = new Map<string, string>();
  const roles = new Map<string, string>();
  let entries = 0;

  const checkMarks = (marks: readonly Mark[], path: string) => {
    marks.forEach((mark, index) => {
      const where = `${path}/marks/${index}`;
      if (mark.type.name === "textStyle") {
        const { color, fontFamily, fontSize } = mark.attrs;
        if (color === null && fontFamily === null && fontSize === null) {
          problems.push({ code: "invalid_attribute", path: where, detail: "textStyle (empty)" });
        }
        if (color !== null && !validTextColor(color)) {
          problems.push({ code: "invalid_color", path: where, detail: JSON.stringify(color) });
        }
        if (fontFamily !== null && !isFontKey(fontFamily)) {
          bad(where, `textStyle.fontFamily=${fontFamily}`);
        }
        if (fontSize !== null && !isFontSize(fontSize)) {
          bad(where, `textStyle.fontSize=${fontSize}`);
        }
      }
      if (mark.type.name === "highlight" && !validHighlight(mark.attrs.color)) {
        problems.push({
          code: "invalid_color",
          path: where,
          detail: JSON.stringify(mark.attrs.color),
        });
      }
    });
  };

  const visit = (node: ProseMirrorNode, path: string) => {
    const name = node.type.name;
    const attrs = node.attrs;
    checkMarks(node.marks, path);

    if (identified.has(name)) {
      const id = attrs.id;
      if (typeof id !== "string" || id.length === 0) {
        problems.push({ code: "missing_id", path, detail: name });
      } else if (firstAt.has(id)) {
        problems.push({
          code: "duplicate_id",
          path,
          detail: `${id} (first at ${firstAt.get(id)})`,
        });
      } else {
        firstAt.set(id, path);
      }
    }

    switch (name) {
      case "sermonSection":
      case "outlinePoint": {
        entries += 1;
        for (const field of ["legacyEntryId", "derivedFrom"]) {
          if (!isNullableString(attrs[field])) bad(path, `${name}.${field}`);
        }
        if (!isNullableInteger(attrs.legacyRevision)) bad(path, `${name}.legacyRevision`);
        if (name === "sermonSection") {
          if (!oneOf(sectionRoles, attrs.role)) bad(path, `sermonSection.role=${attrs.role}`);
          else if (roles.has(attrs.role)) {
            problems.push({
              code: "duplicate_section",
              path,
              detail: `${attrs.role} (first at ${roles.get(attrs.role)})`,
            });
          } else roles.set(attrs.role, path);
        } else {
          for (const field of ["sourcePointId", "legacyParentId"]) {
            if (!isNullableString(attrs[field])) bad(path, `outlinePoint.${field}`);
          }
          if (
            attrs.presentation !== null &&
            !pointPresentationSchema.safeParse(attrs.presentation).success
          ) {
            bad(path, "outlinePoint.presentation");
          }
        }
        break;
      }
      case "scripturePassage":
      case "scriptureReference": {
        if (!referenceFrom(attrs)) {
          problems.push({ code: "invalid_reference", path, detail: JSON.stringify(attrs) });
        }
        if (attrs.translation !== null && !oneOf(documentTranslations, attrs.translation)) {
          bad(path, `${name}.translation=${attrs.translation}`);
        }
        if (name === "scripturePassage" && !oneOf(passagePrints, attrs.print)) {
          bad(path, `scripturePassage.print=${attrs.print}`);
        }
        if (name === "scriptureReference" && !oneOf(referenceDisplays, attrs.display)) {
          bad(path, `scriptureReference.display=${attrs.display}`);
        }
        break;
      }
      case "preacherNote":
        if (!oneOf(noteKinds, attrs.kind)) bad(path, `preacherNote.kind=${attrs.kind}`);
        if (attrs.print !== null && !oneOf(notePrints, attrs.print)) {
          bad(path, `preacherNote.print=${attrs.print}`);
        }
        break;
      case "heading":
        if (!oneOf(headingLevels, attrs.level)) bad(path, `heading.level=${attrs.level}`);
        break;
    }
    if ((name === "paragraph" || name === "heading") && attrs.textAlign !== null) {
      if (!oneOf(textAlignments, attrs.textAlign))
        bad(path, `${name}.textAlign=${attrs.textAlign}`);
    }
    if (name === "paragraph" && attrs.styleName !== null) {
      if (!oneOf(paragraphStyleNames, attrs.styleName))
        bad(path, `paragraph.styleName=${attrs.styleName}`);
    }
    if (
      (name === "paragraph" || name === "heading") &&
      !nullOr(paragraphFormatSchema, attrs.format)
    ) {
      bad(path, `${name}.format`);
    }
    if (name in appearanceSchemaFor && !nullOr(appearanceSchemaFor[name], attrs.appearance)) {
      bad(path, `${name}.appearance`);
    }
    node.forEach((child, _offset, index) => visit(child, `${path}/content/${index}`));
  };
  doc.forEach((child, _offset, index) => visit(child, `/content/${index}`));

  if (entries > outlineLimits.entries) {
    problems.push({ code: "too_many_entries", detail: String(entries) });
  }
  return problems;
}

export function restoreDocument(json: unknown, schema: Schema): Restored {
  if (
    typeof json !== "object" ||
    json === null ||
    Array.isArray(json) ||
    (json as JSONContent).type !== "doc"
  ) {
    return { ok: false, problems: [{ code: "not_a_document" }] };
  }
  const migrated = migrateDocument(json as JSONContent);
  if (!migrated.ok) {
    return {
      ok: false,
      problems: [
        { code: migrated.code, path: "/attrs/schemaVersion", detail: String(migrated.version) },
      ],
    };
  }
  // A document that says it is older than v3 holds only what its version could (paths as given).
  if (migrated.from < 3) {
    const newer = v3ContentIn(json as JSONContent);
    if (newer.length > 0) return { ok: false, problems: newer };
  }
  const source = migrated.doc;

  const raw = rawProblems(source, schema);
  if (raw.length > 0) return { ok: false, problems: raw };

  let doc: ProseMirrorNode;
  try {
    doc = schema.nodeFromJSON(source);
    doc.check();
  } catch (error) {
    return { ok: false, problems: [{ code: "schema", detail: (error as Error).message }] };
  }

  const problems = invariantProblems(doc);
  if (problems.length > 0) return { ok: false, problems };

  const warnings: DocumentProblem[] = layoutParses(doc.attrs.layout)
    ? []
    : [{ code: "invalid_layout", path: "/attrs/layout" }];
  return {
    ok: true,
    doc,
    warnings,
    migratedFrom: migrated.from === currentSchemaVersion ? null : migrated.from,
  };
}
