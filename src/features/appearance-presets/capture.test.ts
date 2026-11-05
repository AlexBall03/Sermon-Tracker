// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  committedAt,
  emptyDraft,
  setEdit,
  type Draft,
  type Path,
} from "@/features/editor-lab/styles/draft";
import type { DocumentStyles } from "@/features/editor-lab/styles/model";
import { readStyles } from "@/features/editor-lab/styles/resolve";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { initialDocument } from "@/features/sermon-editor/persistence/initialization";
import { captureAppearance } from "./capture";

/*
 * Capturing the previewed appearance (A4.2C): checked as Apply checks it
 * (`applyPlan`), and taken from what the plan would leave.
 */

function outline(
  styles?: DocumentStyles,
  layoutPatch?: (layout: Record<string, unknown>) => unknown,
) {
  const made = initialDocument(
    { id: crypto.randomUUID(), revision: 0, numbering: { version: 1, preset: "traditional" } },
    { kind: "builtin", preset: "balanced" },
  );
  if (!made.ok) throw new Error("not made");
  const json: JSONContent = structuredClone(made.content);
  const attrs = json.attrs as Record<string, unknown>;
  if (styles !== undefined) attrs.styles = styles;
  json.content = [
    {
      type: "point",
      attrs: { id: "p1", depth: 1, role: null, appearance: { bold: true } },
      content: [{ type: "text", text: "One" }],
    },
  ];
  const restored = restoreSermonDocument(json);
  if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
  let doc = restored.doc;
  if (layoutPatch) {
    // A layout this version cannot read, as a later version might store it.
    doc = doc.type.create(
      { ...doc.attrs, layout: layoutPatch(doc.attrs.layout as Record<string, unknown>) },
      doc.content,
    );
  }
  return { doc, stored: readStyles(doc.attrs.styles) };
}

const edit = (
  draft: Draft,
  stored: DocumentStyles | null,
  doc: Parameters<typeof committedAt>[1],
  path: Path,
  value: unknown,
) => setEdit(draft, path, value, committedAt(stored, doc, path));

describe("captureAppearance", () => {
  it("takes the committed appearance when nothing is pending", () => {
    const { doc, stored } = outline();
    const captured = captureAppearance(emptyDraft, stored, doc, "balanced");
    expect(captured).toEqual({
      ok: true,
      snapshot: {
        version: 1,
        preset: "balanced",
        presetRevision: 2,
        numbering: { version: 1, preset: "traditional" },
      },
    });
  });

  it("takes pending styles and a pending numbering, never the committed numbering", () => {
    const { doc, stored } = outline();
    let draft = edit(emptyDraft, stored, doc, { layer: "defaults", field: "fontSize" }, 14);
    draft = edit(draft, stored, doc, { layer: "numbering" }, { version: 1, preset: "decimal" });
    draft = edit(draft, stored, doc, { layer: "preset" }, "minimal");
    const captured = captureAppearance(draft, stored, doc, "balanced");
    expect(captured.ok && captured.snapshot).toMatchObject({
      preset: "minimal",
      defaults: { fontSize: 14 },
      numbering: { version: 1, preset: "decimal" },
    });
    expect(doc.attrs.layout.numbering).toEqual({ version: 1, preset: "traditional" });
  });

  it("leaves out every single component's own appearance, pending or committed", () => {
    const { doc, stored } = outline();
    const draft = edit(
      emptyDraft,
      stored,
      doc,
      { layer: "instance", id: "p1", kind: "point", field: "italic" },
      true,
    );
    const captured = captureAppearance(draft, stored, doc, "balanced");
    expect(captured.ok).toBe(true);
    expect(JSON.stringify(captured)).not.toMatch(/p1|italic|One/);
  });

  it("refuses a numbering still being typed instead of saving the committed one", () => {
    const { doc, stored } = outline();
    const draft = edit(
      emptyDraft,
      stored,
      doc,
      { layer: "numbering" },
      { version: 1, preset: "nonsense" },
    );
    expect(captureAppearance(draft, stored, doc, "balanced")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses a conflicted draft, as Apply would", () => {
    const { doc, stored } = outline();
    // Made against a value that is no longer the committed one.
    const draft: Draft = {
      edits: new Map([
        [
          "defaults.fontSize",
          { path: { layer: "defaults", field: "fontSize" } as Path, value: 14, base: 9 },
        ],
      ]),
    };
    expect(captureAppearance(draft, stored, doc, "balanced")).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("refuses an edit for a component that is gone, as Apply would", () => {
    const { doc, stored } = outline();
    const draft = edit(
      emptyDraft,
      stored,
      doc,
      { layer: "instance", id: "gone", kind: "point", field: "bold" },
      true,
    );
    expect(captureAppearance(draft, stored, doc, "balanced")).toEqual({
      ok: false,
      reason: "orphan",
    });
  });

  it("refuses an outline whose layout cannot be read, never standing a default in for it", () => {
    const { doc, stored } = outline(undefined, (layout) => ({ ...layout, version: 9 }));
    expect(captureAppearance(emptyDraft, stored, doc, "balanced")).toEqual({
      ok: false,
      reason: "layout_unreadable",
    });
  });

  it("refuses what has no preset to name (the v3 lab's baseline)", () => {
    const { doc } = outline({ version: 1 });
    expect(captureAppearance(emptyDraft, null, doc, "baseline")).toEqual({
      ok: false,
      reason: "no_preset",
    });
  });

  it("changes nothing it is given", () => {
    const { doc, stored } = outline();
    const draft = edit(emptyDraft, stored, doc, { layer: "defaults", field: "fontSize" }, 14);
    const before = { doc: doc.toJSON(), edits: [...draft.edits.entries()] };
    captureAppearance(draft, stored, doc, "balanced");
    expect({ doc: doc.toJSON(), edits: [...draft.edits.entries()] }).toEqual(before);
  });
});
