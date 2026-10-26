// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { legacyFixtures } from "@/features/editor-lab/fixtures";
import { documentV4, pointV4, proseV4, v4Fixtures } from "@/features/editor-lab/v4/fixtures";
import {
  analyze,
  duplicateIds,
  legacyToDocument,
  restoreSermonDocument,
  sermonDocumentSchema,
  v4SchemaVersion,
} from ".";

/*
 * A2.0: the sermon document core loads and works on a server. This file runs
 * under Node, with no DOM, and walks the core's imports to prove no client or
 * editor module is among them.
 */

const src = resolve(process.cwd(), "src");
const entry = join(src, "features", "sermon-editor", "document", "index.ts");

/** The files a module loads at run time (type-only imports are erased and left out). */
function runtimeImports(text: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]) specifiers.push(match[3]);
  }
  return specifiers;
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(src, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${from}`);
}

/** Every local file reachable from the entry, and every package it names. */
function closure() {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of runtimeImports(readFileSync(file, "utf8"))) {
      const local = resolveLocal(file, specifier);
      if (local) pending.push(local);
      else packages.add(specifier);
    }
  }
  return {
    files: [...files].map((file) => ({
      path: relative(src, file).replaceAll("\\", "/"),
      text: readFileSync(file, "utf8"),
    })),
    packages: [...packages],
  };
}

describe("the sermon document core on a server (A2.0)", () => {
  it("runs with no DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(sermonDocumentSchema().topNodeType.name).toBe("doc");
  });

  const { files, packages } = closure();

  it("loads no client module, no React, and no browser storage", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const { path, text } of files) {
      expect(text, path).not.toMatch(/^\s*["']use client["']/m);
      expect(text, path).not.toMatch(/\b(indexedDB|localStorage|sessionStorage)\b/);
    }
    for (const name of packages) {
      expect(name).not.toMatch(/^(react|react-dom|@tiptap\/react|next)(\/|$)/);
      expect(name).not.toBe("server-only");
    }
  });

  it("loads no editor behaviour: no node view, plugin set, or editor UI", () => {
    const forbidden = [
      /^features\/scripture\/use-chapter/,
      /^features\/offline\//,
      /^db\//,
      /^features\/editor-lab\/schema\/(extensions|scripture-view)\.ts$/,
      /^features\/editor-lab\/v4\/(extensions|plugins|commands|keymap|numbering|labels|paper|caret-sync)\.ts$/,
      /^features\/editor-lab\/(clipboard|outline-commands|numbering|gap-caret|click-placement)\.ts$/,
      /^features\/editor-lab\/pagination\/plugin\.ts$/,
      /^features\/editor-lab\/styles\/plugin\.ts$/,
      /\/components\//,
      /\.tsx$/,
    ];
    for (const { path } of files) {
      for (const pattern of forbidden) expect(path).not.toMatch(pattern);
    }
  });

  it("restores every v4 lab document unchanged", () => {
    for (const [id, json] of Object.entries(v4Fixtures)) {
      const restored = restoreSermonDocument(structuredClone(json));
      expect(restored.ok, id).toBe(true);
      if (restored.ok) {
        expect(restored.migratedFrom, id).toBeNull();
        expect(duplicateIds(restored.doc), id).toEqual([]);
      }
    }
  });

  it("migrates every v3 lab document to v4", () => {
    for (const [id, json] of Object.entries(documentFixtures)) {
      const restored = restoreSermonDocument(structuredClone(json));
      expect(restored.ok, id).toBe(true);
      if (restored.ok) {
        expect(restored.doc.attrs.schemaVersion, id).toBe(v4SchemaVersion);
        expect(restored.migratedFrom, id).not.toBeNull();
      }
    }
  });

  it("converts every legacy outline and restores it as v4, keeping its entries' IDs", () => {
    for (const [id, outline] of Object.entries(legacyFixtures)) {
      const converted = legacyToDocument(outline);
      if (!converted.ok) continue;
      const restored = restoreSermonDocument(converted.doc);
      expect(restored.ok, id).toBe(true);
      if (!restored.ok) continue;
      const legacyIds: string[] = [];
      restored.doc.descendants((node) => {
        if (node.type.name === "point" && node.attrs.legacyEntryId) {
          legacyIds.push(node.attrs.legacyEntryId);
        }
      });
      const entryIds = outline.entries.map((entry) => entry.id);
      for (const legacyId of legacyIds) expect(entryIds, id).toContain(legacyId);
      expect(new Set(legacyIds).size, id).toBe(legacyIds.length);
    }
  });

  it("works out ownership from depth alone", () => {
    const restored = restoreSermonDocument(
      documentV4([pointV4("a", "A", 1), proseV4("under A", 1), pointV4("b", "B", 2)]),
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const structure = analyze(restored.doc);
    expect(structure.blocks.map((block) => block.isPoint)).toEqual([true, false, true]);
    expect(structure.owner).toEqual([null, 0, 0]);
    expect(structure.groupEnd[0]).toBe(3);
  });

  it("refuses what breaks identity or meaning, and repairs nothing", () => {
    const refused = (content: Parameters<typeof documentV4>[0]) =>
      restoreSermonDocument(documentV4(content));
    const duplicate = refused([pointV4("a", "A", 1), pointV4("a", "B", 1)]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.problems.map((p) => p.code)).toContain("duplicate_id");
    const missing = refused([{ ...pointV4("a", "A", 1), attrs: { depth: 1 } }]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.problems.map((p) => p.code)).toContain("missing_id");
    expect(refused([pointV4("p", "P", 0)]).ok).toBe(false);
    expect(refused([pointV4("p", "P", 2, { role: "introduction" })]).ok).toBe(false);
    expect(restoreSermonDocument({ ...documentV4([]), attrs: { schemaVersion: 5 } }).ok).toBe(
      false,
    );
    expect(restoreSermonDocument(null).ok).toBe(false);
    expect(restoreSermonDocument({ type: "paragraph" }).ok).toBe(false);
  });
});
