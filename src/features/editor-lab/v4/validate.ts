import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { identifiedTypes } from "../schema/nodes";
import { labSchema } from "../schema/extensions";
import { validHighlight, validTextColor } from "../schema/formatting";
import { pointPresentationSchema } from "../schema/model";
import { referenceFrom } from "../schema/scripture";
import { appearanceSchemaFor } from "../styles/attributes";
import { appearanceSchemas, documentStylesSchema, namedStyles } from "../styles/model";
import { rawProblems, restoreDocument, type DocumentProblem } from "../validate";
import { v3ToV4 } from "./migrate";
import { maxDepth, pointRoles, v4SchemaVersion } from "./model";

/*
 * Whether JSON may be loaded as a v4 document (prototype). Narrower than
 * v3's validator, and on purpose: it checks what v4 changes and what keeps
 * meaning safe. A document older than v4 is first checked in full by v3's
 * validator (`restoreDocument`), then flattened (`migrate.ts`).
 *
 * Refused: an unknown node, mark, or attribute; anything the schema refuses;
 * a depth that is not a whole number in range (a point's from 1, any other
 * top-level block's from 0, a block inside a container's 0); a role on a
 * point that is not a main point, or a role twice; an identified node
 * without an ID, or two with one; a passage that does not exist; a color,
 * style, presentation, or appearance outside its contract.
 *
 * Not refused: an irregular structure (a skipped level, a block deeper than
 * its owner). Every sequence of depths has a meaning (`ownership.ts`); an
 * irregular one is shown and can be fixed, never repaired here.
 */

export type RestoredV4 =
  | { ok: true; doc: ProseMirrorNode; migratedFrom: number | null }
  | { ok: false; problems: DocumentProblem[] };

const identified = new Set<string>(identifiedTypes);
const isDepth = (value: unknown, min: number) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= maxDepth;

function invariants(doc: ProseMirrorNode): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  const bad = (path: string, detail: string) =>
    problems.push({ code: "invalid_attribute", path, detail });
  if (doc.attrs.styles !== null && !documentStylesSchema.safeParse(doc.attrs.styles).success) {
    bad("", "doc.styles");
  }
  const ids = new Set<string>();
  const roles = new Set<string>();

  const visit = (node: ProseMirrorNode, path: string, top: boolean) => {
    const { name } = node.type;
    for (const mark of node.marks) {
      if (mark.type.name === "textStyle" && mark.attrs.color !== null) {
        if (!validTextColor(mark.attrs.color)) problems.push({ code: "invalid_color", path });
      }
      if (mark.type.name === "highlight" && !validHighlight(mark.attrs.color)) {
        problems.push({ code: "invalid_color", path });
      }
    }
    if (identified.has(name)) {
      const id = node.attrs.id;
      if (typeof id !== "string" || !id) problems.push({ code: "missing_id", path, detail: name });
      else if (ids.has(id)) problems.push({ code: "duplicate_id", path, detail: id });
      else ids.add(id);
    }
    if ("depth" in node.attrs) {
      const depth = node.attrs.depth;
      if (name === "point") {
        if (!isDepth(depth, 1)) bad(path, `point.depth=${depth}`);
      } else if (top ? !isDepth(depth, 0) : depth !== 0) {
        bad(path, `${name}.depth=${depth}`);
      }
    }
    if (name === "point") {
      const { role, styleName, presentation, appearance } = node.attrs;
      if (role !== null) {
        if (!(pointRoles as readonly unknown[]).includes(role)) bad(path, `point.role=${role}`);
        else if (node.attrs.depth !== 1) bad(path, "point.role below a main point");
        else if (roles.has(role)) problems.push({ code: "duplicate_section", path, detail: role });
        else roles.add(role);
      }
      if (styleName !== null && !(namedStyles as readonly unknown[]).includes(styleName)) {
        bad(path, `point.styleName=${styleName}`);
      }
      if (presentation !== null && !pointPresentationSchema.safeParse(presentation).success) {
        bad(path, "point.presentation");
      }
      // A point with a role takes its role's component contract, as v3's section did.
      const contract =
        role === "introduction" || role === "conclusion"
          ? appearanceSchemas[role as "introduction" | "conclusion"]
          : appearanceSchemas.point;
      if (appearance !== null && !contract.safeParse(appearance).success) {
        bad(path, "point.appearance");
      }
    }
    // A passage's, a note's, and a script's own appearance keep to their contracts (A1-UI.2B.1).
    if (
      (name === "scripturePassage" || name === "preacherNote" || name === "script") &&
      node.attrs.appearance !== null &&
      !appearanceSchemaFor[name].safeParse(node.attrs.appearance).success
    ) {
      bad(path, `${name}.appearance`);
    }
    if (
      (name === "scripturePassage" || name === "scriptureReference") &&
      !referenceFrom(node.attrs)
    ) {
      problems.push({ code: "invalid_reference", path });
    }
    node.forEach((child, _offset, index) => visit(child, `${path}/content/${index}`, false));
  };
  doc.forEach((child, _offset, index) => visit(child, `/content/${index}`, true));
  return problems;
}

export function restoreV4(json: unknown, schema: Schema): RestoredV4 {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, problems: [{ code: "not_a_document" }] };
  }
  const source = json as JSONContent;
  if (source.type !== "doc") return { ok: false, problems: [{ code: "not_a_document" }] };
  const version = source.attrs?.schemaVersion;
  if (!Number.isInteger(version) || (version as number) < 1) {
    return { ok: false, problems: [{ code: "invalid_version", detail: String(version) }] };
  }
  if ((version as number) > v4SchemaVersion) {
    return { ok: false, problems: [{ code: "unsupported_version", detail: String(version) }] };
  }
  let content = source;
  let migratedFrom: number | null = null;
  if ((version as number) < v4SchemaVersion) {
    const older = restoreDocument(source, labSchema());
    if (!older.ok) return older;
    content = v3ToV4(older.doc.toJSON());
    migratedFrom = version as number;
  }
  const raw = rawProblems(content, schema);
  if (raw.length > 0) return { ok: false, problems: raw };
  let doc: ProseMirrorNode;
  try {
    doc = schema.nodeFromJSON(content);
    doc.check();
  } catch (error) {
    return { ok: false, problems: [{ code: "schema", detail: (error as Error).message }] };
  }
  const problems = invariants(doc);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, doc, migratedFrom };
}
