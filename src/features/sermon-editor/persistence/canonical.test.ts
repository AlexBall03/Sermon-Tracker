// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { documentV4, pointV4, proseV4, v4Fixtures } from "@/features/editor-lab/v4/fixtures";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { jsonEqual } from "./autosave/model";
import { canonicalDocument, prepareDocument } from "./canonical";
import { prepareDocument as serverPrepareDocument } from "./documents";
import type { JsonValue } from "./json";
import { documentLimits } from "./model";

/*
 * The canonical form (A2.3B.2A): the server's own function, run in the
 * browser to predict what a save stores.
 */

const canonical = (json: unknown) => {
  const result = canonicalDocument(json);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
};

const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);

describe("canonicalDocument", () => {
  it("is the very function the server stores with", () => {
    expect(serverPrepareDocument).toBe(prepareDocument);
  });

  it("gives what the server would store and read back, for every fixture, and is idempotent", () => {
    const fixtures = { ...documentFixtures, ...v4Fixtures } as Record<string, JSONContent>;
    expect(Object.keys(fixtures).length).toBeGreaterThan(10);
    for (const [name, json] of Object.entries(fixtures)) {
      const once = canonical(json);
      // What `getDocument` and `readOutlineDocument` would give for the stored form.
      const restored = restoreSermonDocument(once.content);
      expect(restored.ok, name).toBe(true);
      if (!restored.ok) continue;
      expect(equal(once.content, JSON.parse(JSON.stringify(restored.doc.toJSON()))), name).toBe(
        true,
      );
      expect(equal(canonical(once.content).content, once.content), name).toBe(true);
      // A plain copy: every object has Object.prototype, as a Server Action requires.
      expect(Object.getPrototypeOf(once.content)).toBe(Object.prototype);
    }
  });

  it("never takes raw input as canonical: an older document becomes v4", () => {
    const [name, v3] = Object.entries(documentFixtures)[0] as [string, JSONContent];
    const result = canonical(v3);
    expect(equal(result.content, v3), name).toBe(false);
    expect(result.content.attrs).toMatchObject({ schemaVersion: 4 });
  });

  it("does not depend on key order or on null prototypes", () => {
    const json = documentV4([pointV4("p-1", "Grace", 1), proseV4("Grace first.", 1)]);
    const restored = restoreSermonDocument(json);
    if (!restored.ok) throw new Error("refused");
    const editorJson = restored.doc.toJSON() as JSONContent; // attrs with no prototype
    const reordered = JSON.parse(JSON.stringify(json), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    );
    expect(equal(canonical(editorJson).content, canonical(json).content)).toBe(true);
    expect(equal(canonical(reordered).content, canonical(json).content)).toBe(true);
  });

  it("keeps every character of valid Unicode exactly", () => {
    const words = "La gracia de Dios — ¿Por qué? Él dijo: «Sí». Señor 🙏🏽 👨‍👩‍👧 ñÑáéíóú";
    const result = canonical(documentV4([pointV4("p-1", "Fe 🙌", 1), proseV4(words, 1)]));
    expect(JSON.stringify(result.content)).toContain(words);
    expect(JSON.stringify(result.content)).toContain("Fe 🙌");
  });

  it("refuses what the server refuses, saying why", () => {
    const json = documentV4([pointV4("p-1", "Grace", 1), proseV4("Bad \u0000 text", 1)]);
    expect(canonicalDocument(json)).toMatchObject({
      ok: false,
      status: "invalid",
      problems: [{ code: "unstorable_text" }],
    });
    expect(canonicalDocument({ type: "paragraph" })).toMatchObject({
      ok: false,
      status: "invalid",
    });
    const huge = documentV4([
      pointV4("p-1", "Grace", 1),
      proseV4("x".repeat(documentLimits.bytes + 1), 1),
    ]);
    expect(canonicalDocument(huge)).toMatchObject({
      ok: false,
      status: "too_large",
      limit: documentLimits.bytes,
    });
  });
});
