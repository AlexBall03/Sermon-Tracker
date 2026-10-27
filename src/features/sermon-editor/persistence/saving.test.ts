// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { documentV4, pointV4, proseV4, v4Fixtures } from "@/features/editor-lab/v4/fixtures";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { toPlainJson } from "./json";
import { documentLimits, utf8Bytes } from "./model";
import { prepareSave, readOutcome, saveOutcome, unansweredOutcome } from "./saving";

/* The save contract (A2.3A): what each answer of `saveOutlineDocument` means. */

describe("saveOutcome", () => {
  it("confirms a save with its revision", () => {
    expect(saveOutcome(7, { ok: true, message: "Saved", revision: 4 })).toEqual({
      kind: "confirmed",
      sequence: 7,
      revision: 4,
    });
  });

  it("does not believe a success without a revision", () => {
    expect(saveOutcome(7, { ok: true, message: "Saved" })).toEqual({
      kind: "failed",
      sequence: 7,
      uncertain: true,
    });
  });

  it("makes stale and missing conflicts that name the server's revision", () => {
    expect(saveOutcome(2, { ok: false, message: "", code: "stale", revision: 9 })).toEqual({
      kind: "conflict",
      sequence: 2,
      code: "stale",
      revision: 9,
    });
    expect(saveOutcome(2, { ok: false, message: "", code: "missing" })).toMatchObject({
      kind: "conflict",
      code: "missing",
    });
  });

  it("makes invalid and too_large refusals that carry why", () => {
    const problems = [{ code: "not_a_document" as const }];
    expect(saveOutcome(3, { ok: false, message: "", code: "invalid", problems })).toEqual({
      kind: "refused",
      sequence: 3,
      code: "invalid",
      problems,
    });
    expect(
      saveOutcome(3, { ok: false, message: "", code: "too_large", bytes: 5, limit: 4 }),
    ).toEqual({
      kind: "refused",
      sequence: 3,
      code: "too_large",
      bytes: 5,
      limit: 4,
    });
  });

  it("separates a failed transaction, an ended session, and no answer", () => {
    expect(saveOutcome(1, { ok: false, message: "", code: "failed" })).toEqual({
      kind: "failed",
      sequence: 1,
      uncertain: false,
    });
    expect(
      saveOutcome(1, { ok: false, message: "Your session has ended. Sign in again." }),
    ).toEqual({
      kind: "unauthorized",
      sequence: 1,
    });
    expect(unansweredOutcome(1)).toEqual({ kind: "failed", sequence: 1, uncertain: true });
    expect(saveOutcome(1, { ok: false, message: "", code: "unsafe" })).toEqual({
      kind: "failed",
      sequence: 1,
      uncertain: true,
    });
  });
});

describe("prepareSave (A2.3A.1: strict and lossless)", () => {
  const editorJson = (words = "Grace first.") => {
    const restored = restoreSermonDocument(
      documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]),
    );
    if (!restored.ok) throw new Error("refused");
    return restored.doc.toJSON() as JSONContent;
  };
  const prepared = (json: JSONContent) => {
    const result = prepareSave(json);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result;
  };
  /** Every object in a value, with where it is. */
  const objects = (value: unknown, path = ""): [string, object][] =>
    typeof value !== "object" || value === null
      ? []
      : [
          [path, value],
          ...Object.entries(value).flatMap(([key, item]) => objects(item, `${path}/${key}`)),
        ];

  it("keeps every v3 and v4 fixture exactly", () => {
    const fixtures = { ...documentFixtures, ...v4Fixtures } as Record<string, JSONContent>;
    expect(Object.keys(fixtures).length).toBeGreaterThan(10);
    for (const [name, json] of Object.entries(fixtures)) {
      const restored = restoreSermonDocument(json);
      if (!restored.ok) throw new Error(name);
      const sent = prepared(restored.doc.toJSON() as JSONContent);
      const back = restoreSermonDocument(sent.content);
      expect(back.ok && back.doc.eq(restored.doc), name).toBe(true);
      expect(sent.content, name).toEqual(JSON.parse(JSON.stringify(restored.doc.toJSON())));
    }
  });

  it("takes the editor's prototype-less attributes and gives plain objects", () => {
    const json = editorJson();
    expect(objects(json).some(([, object]) => Object.getPrototypeOf(object) === null)).toBe(true);
    const sent = prepared(json);
    for (const [path, object] of objects(sent.content)) {
      const prototype = Object.getPrototypeOf(object);
      expect(prototype === Object.prototype || prototype === Array.prototype, path).toBe(true);
    }
    expect(sent.bytes).toBe(utf8Bytes(JSON.stringify(json)));
  });

  it("keeps ordinary Unicode, emoji, and paired surrogates as they are", () => {
    const words = "Café — ¡Gracia! 恩典 👨‍👩‍👧 😀 😀 ​﻿￿";
    const sent = prepared(editorJson(words));
    const back = restoreSermonDocument(sent.content);
    expect(back.ok && back.doc.textContent).toContain(words);
  });

  it("refuses a value JSON would change, at its path, nested or not", () => {
    const json = editorJson();
    const withPage = (page: unknown) => ({ ...json, attrs: { ...json.attrs, page } });
    const cases: [unknown, string, string][] = [
      [Number.NaN, "/attrs/page", "NaN"],
      [Number.POSITIVE_INFINITY, "/attrs/page", "Infinity"],
      [{ margins: { top: undefined } }, "/attrs/page/margins/top", "undefined"],
      [{ size: () => "letter" }, "/attrs/page/size", "function"],
      [{ at: new Date(0) }, "/attrs/page/at", "Date"],
      [new Map([["a", 1]]), "/attrs/page", "Map"],
      [{ big: BigInt(1) }, "/attrs/page/big", "bigint"],
      [{ s: Symbol("x") }, "/attrs/page/s", "symbol"],
      [[1, , 3], "/attrs/page", "array_shape"],
      [{ [Symbol("k")]: 1 }, "/attrs/page", "symbol_key"],
    ];
    for (const [page, path, detail] of cases) {
      expect(prepareSave(withPage(page) as JSONContent), detail).toEqual({
        ok: false,
        reason: "unsafe",
        problem: { code: "not_json", path, detail },
      });
    }
    const nested = editorJson();
    (nested.content![1].attrs as Record<string, unknown>).depth = undefined;
    expect(prepareSave(nested)).toMatchObject({
      reason: "unsafe",
      problem: { code: "not_json", path: "/content/1/attrs/depth" },
    });
  });

  it("refuses a cycle without looping, and still takes a value shared twice", () => {
    const json = editorJson();
    const page: Record<string, unknown> = { size: "letter" };
    page.self = page;
    expect(prepareSave({ ...json, attrs: { ...json.attrs, page } })).toEqual({
      ok: false,
      reason: "unsafe",
      problem: { code: "not_json", path: "/attrs/page/self", detail: "cycle" },
    });
    const shared = { size: "letter" };
    const twice = { ...json, attrs: { ...json.attrs, page: { a: shared, b: shared } } };
    expect(prepareSave(twice).ok).toBe(true);
  });

  it("refuses text PostgreSQL cannot store, at its path, and says nothing of the text", () => {
    const cases: [string, string][] = [
      ["before\u0000after", "nul"],
      ["before\ud800after", "unpaired_surrogate"],
      ["before\udc00after", "unpaired_surrogate"],
      ["ends high\ud83d", "unpaired_surrogate"],
    ];
    for (const [words, detail] of cases) {
      const result = prepareSave(editorJson(words));
      expect(result, detail).toEqual({
        ok: false,
        reason: "unsafe",
        problem: { code: "unstorable_text", path: "/content/1/content/0/text", detail },
      });
      expect(JSON.stringify(result)).not.toContain("before");
    }
    const json = editorJson();
    const badKey = { ...json, attrs: { ...json.attrs, page: { "a\u0000": 1 } } };
    expect(prepareSave(badKey)).toMatchObject({
      problem: { code: "unstorable_text", detail: "key_nul" },
    });
  });

  it("keeps a key named __proto__ as a property, as JSON.parse does", () => {
    const value = toPlainJson(JSON.parse('{"__proto__": {"x": 1}, "y": 2}'));
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    expect(Object.getPrototypeOf(value.value)).toBe(Object.prototype);
    expect(JSON.stringify(value.value)).toBe('{"__proto__":{"x":1},"y":2}');
  });

  it("refuses a document over the limit without sending it, and takes one at the limit", () => {
    const base = utf8Bytes(JSON.stringify(editorJson("x"))) - 1;
    const atLimit = editorJson("x".repeat(documentLimits.bytes - base));
    expect(prepareSave(atLimit)).toMatchObject({ ok: true, bytes: documentLimits.bytes });
    const over = editorJson("x".repeat(documentLimits.bytes - base + 1));
    expect(prepareSave(over)).toEqual({
      ok: false,
      reason: "too_large",
      bytes: documentLimits.bytes + 1,
      limit: documentLimits.bytes,
    });
  });
});

describe("readOutcome", () => {
  const content = { type: "doc", content: [] };

  it("reads each answer of readOutlineDocument", () => {
    expect(readOutcome({ ok: true, message: "", content, revision: 3 })).toEqual({
      kind: "found",
      content,
      revision: 3,
    });
    expect(readOutcome({ ok: true, message: "" })).toEqual({ kind: "failed" });
    expect(readOutcome({ ok: false, message: "", code: "missing" })).toEqual({ kind: "missing" });
    expect(readOutcome({ ok: false, message: "", code: "invalid" })).toEqual({ kind: "missing" });
    expect(readOutcome({ ok: false, message: "", code: "unreadable", revision: 2 })).toEqual({
      kind: "unreadable",
      revision: 2,
    });
    expect(readOutcome({ ok: false, message: "", code: "failed" })).toEqual({ kind: "failed" });
    expect(readOutcome({ ok: false, message: "Your session has ended. Sign in again." })).toEqual({
      kind: "unauthorized",
    });
  });
});
