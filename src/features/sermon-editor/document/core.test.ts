import type { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { legacyFixtures } from "@/features/editor-lab/fixtures";
import { legacyToDocument } from "@/features/editor-lab/legacy";
import { labSchema } from "@/features/editor-lab/schema/extensions";
import { v3Schema } from "@/features/editor-lab/schema/document-schema";
import { labV4Schema } from "@/features/editor-lab/v4/extensions";
import { v4Fixtures } from "@/features/editor-lab/v4/fixtures";
import { restoreV4 } from "@/features/editor-lab/v4/validate";
import { restoreSermonDocument, sermonDocumentSchema } from ".";

/*
 * A2.0: one schema. The schema built without an editor is the editor's own,
 * node for node and attribute for attribute, and a document restores to the
 * same JSON through either.
 */

/** What a schema says, without its parse and render functions. */
function shape(schema: Schema) {
  const attrs = (spec: { attrs?: Record<string, { default?: unknown }> }) =>
    Object.fromEntries(
      Object.entries(spec.attrs ?? {}).map(([name, attr]) => [
        name,
        "default" in attr ? { default: attr.default } : { required: true },
      ]),
    );
  const nodes: unknown[] = [];
  schema.spec.nodes.forEach((name, spec) =>
    nodes.push({
      name,
      content: spec.content ?? null,
      group: spec.group ?? null,
      marks: spec.marks ?? null,
      inline: spec.inline ?? false,
      atom: spec.atom ?? false,
      defining: spec.defining ?? false,
      isolating: spec.isolating ?? false,
      attrs: attrs(spec),
    }),
  );
  const marks: unknown[] = [];
  schema.spec.marks.forEach((name, spec) =>
    marks.push({
      name,
      inclusive: spec.inclusive ?? null,
      excludes: spec.excludes ?? null,
      attrs: attrs(spec),
    }),
  );
  return { topNode: schema.spec.topNode ?? "doc", nodes, marks };
}

describe("one canonical schema (A2.0)", () => {
  it("schema v4 without an editor is the editor's schema", () => {
    expect(shape(sermonDocumentSchema())).toEqual(shape(labV4Schema()));
  });

  it("schema v3 without an editor is the lab editor's schema", () => {
    expect(shape(v3Schema())).toEqual(shape(labSchema()));
  });

  it("is built once", () => {
    expect(sermonDocumentSchema()).toBe(sermonDocumentSchema());
    expect(v3Schema()).toBe(v3Schema());
  });

  it("restores every lab and legacy document to the same JSON as the editor's schema does", () => {
    const legacy = Object.values(legacyFixtures).flatMap((outline) => {
      const converted = legacyToDocument(outline);
      return converted.ok ? [converted.doc] : [];
    });
    const all = [...Object.values(v4Fixtures), ...Object.values(documentFixtures), ...legacy];
    expect(all.length).toBeGreaterThan(10);
    const editorSchema = labV4Schema();
    for (const json of all) {
      const core = restoreSermonDocument(structuredClone(json));
      const editor = restoreV4(structuredClone(json), editorSchema);
      expect(core.ok).toBe(editor.ok);
      if (core.ok && editor.ok) {
        expect(core.doc.toJSON()).toEqual(editor.doc.toJSON());
        expect(core.migratedFrom).toBe(editor.migratedFrom);
      }
    }
  });
});
