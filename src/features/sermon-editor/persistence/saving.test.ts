// @vitest-environment node
import { describe, expect, it } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { documentLimits, utf8Bytes } from "./model";
import { plainDocument, prepareSave, saveOutcome, unansweredOutcome } from "./saving";

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

describe("prepareSave", () => {
  const canonical = (words: string) => {
    const restored = restoreSermonDocument(
      documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]),
    );
    if (!restored.ok) throw new Error("refused");
    return restored.doc.toJSON();
  };

  it("gives a plain copy of the editor's JSON", () => {
    const json = canonical("Grace first.");
    expect(Object.getPrototypeOf(json.attrs)).toBeNull();
    const prepared = prepareSave(json);
    if (!prepared.ok) throw new Error("refused");
    expect(Object.getPrototypeOf(prepared.content.attrs)).toBe(Object.prototype);
    expect(prepared.content).toEqual(plainDocument(json));
    expect(prepared.bytes).toBe(utf8Bytes(JSON.stringify(json)));
  });

  it("refuses a document over the limit without sending it, and takes one at the limit", () => {
    const base = utf8Bytes(JSON.stringify(canonical("x"))) - 1;
    const atLimit = canonical("x".repeat(documentLimits.bytes - base));
    expect(prepareSave(atLimit)).toMatchObject({ ok: true, bytes: documentLimits.bytes });
    const over = canonical("x".repeat(documentLimits.bytes - base + 1));
    expect(prepareSave(over)).toEqual({
      ok: false,
      bytes: documentLimits.bytes + 1,
      limit: documentLimits.bytes,
    });
  });
});
