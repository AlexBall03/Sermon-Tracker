// @vitest-environment node
import { describe, expect, it } from "vitest";

import { materialize, type AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { restoreSermonDocument, v4SchemaVersion } from "@/features/sermon-editor/document";
import { newDocumentPage } from "@/features/editor-lab/pagination/page-config";
import { initialDocument } from "./initialization";

const outline = {
  id: "0b6f1a5e-7d1c-4c0e-9a44-2f9b1d0c3e11",
  revision: 0,
  numbering: { version: 1, preset: "traditional" },
};

const personal: AppearanceSnapshot = materialize({
  version: 1,
  preset: "expressive",
  presetRevision: 2,
  defaults: { fontSize: 13 },
  levels: { "2": { bold: true } },
  numbering: { version: 1, preset: "decimal" },
});

describe("initialDocument (A4.2C)", () => {
  it("starts a built-in default at its latest revision, with the outline's numbering", () => {
    const made = initialDocument(outline, { kind: "builtin", preset: "minimal" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const attrs = made.content.attrs as Record<string, unknown>;
    expect(attrs.schemaVersion).toBe(v4SchemaVersion);
    expect(attrs.styles).toEqual({ version: 1, preset: "minimal", presetRevision: 2 });
    expect((attrs.layout as { numbering: unknown }).numbering).toEqual(outline.numbering);
    expect(restoreSermonDocument(made.content).ok).toBe(true);
  });

  it("copies a personal snapshot's styles and numbering, naming no preset", () => {
    const made = initialDocument(outline, { kind: "snapshot", snapshot: personal });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const attrs = made.content.attrs as Record<string, unknown>;
    const styles = attrs.styles as Record<string, unknown>;
    expect(styles.preset).toBe("expressive");
    expect(styles.defaults).toEqual(personal.defaults);
    expect(styles.levels).toEqual(personal.levels);
    expect((attrs.layout as { numbering: unknown }).numbering).toEqual(personal.numbering);
    expect(JSON.stringify(made.content)).not.toMatch(/presetId|personal/);
    expect(restoreSermonDocument(made.content).ok).toBe(true);
  });

  it("is a copy: changing the snapshot afterwards changes nothing made from it", () => {
    const snapshot = structuredClone(personal);
    const made = initialDocument(outline, { kind: "snapshot", snapshot });
    snapshot.defaults!.fontSize = 20;
    if (!made.ok) throw new Error("not made");
    const styles = (made.content.attrs as { styles: { defaults: { fontSize: number } } }).styles;
    expect(styles.defaults.fontSize).toBe(13);
  });

  it("refuses an invalid starting numbering instead of storing it", () => {
    const made = initialDocument(
      { ...outline, numbering: { version: 1, preset: "nonsense" } },
      { kind: "builtin", preset: "balanced" },
    );
    expect(made.ok).toBe(false);
  });

  it("gives every new outline the new page: numbers on, right, and bold; the title centred (A4.3)", () => {
    for (const start of [
      { kind: "builtin", preset: "expressive" } as const,
      { kind: "snapshot", snapshot: personal } as const,
    ]) {
      const made = initialDocument(outline, start);
      if (!made.ok) throw new Error("not made");
      const page = (made.content.attrs as { page: unknown }).page;
      expect(page).toEqual(newDocumentPage());
      expect(page).toMatchObject({
        version: 2,
        paper: "letter",
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        header: { titleAlign: "center" },
        runningHeader: { enabled: false, subtitle: false },
        pageNumbers: { enabled: true, align: "right", weight: "bold" },
      });
      expect(restoreSermonDocument(made.content).ok).toBe(true);
    }
  });
});
