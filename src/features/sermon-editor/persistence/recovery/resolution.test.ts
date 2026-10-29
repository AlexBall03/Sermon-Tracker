import "fake-indexeddb/auto";

import type { JSONContent } from "@tiptap/core";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { forgetAccount, resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb, openOfflineDb } from "@/features/offline/db";
import { canonicalDocument } from "../canonical";
import { documentLimits } from "../model";
import { classifyRecovery, restoreForRecovery, type RecoveryRecords } from "./classify";
import { sameRecord } from "./identity";
import { cleanupKind, draftKind, linkTo, readDraftRecord, type AdoptionLink } from "./model";
import {
  adoptDraft,
  confirmDraft,
  discardReviewedDraft,
  inspectRecoveryRecords,
  readDraft,
  refuseDraft,
  settleCleanups,
  writeDraft,
  type ReviewedRecord,
} from "./store";

/*
 * Recovery resolution's pure parts and storage (A2.3C, checkpoints C.1, C.2,
 * C.4) against the real offline database in fake-indexeddb.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const stranger = "4f1c2d3e-0000-4000-8000-000000000b0b";
const outline = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const A = "7d1e5f60-1111-4222-8333-444455556666";
const B = "8e2f6071-2222-4333-9444-555566667777";
const C = "9f307182-3333-4444-a555-666677778888";
const D = "a0418293-4444-4555-b666-777788889999";
const E = "b15293a4-5555-4666-8777-88889999aaaa";
const R = 8;

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const server = doc("On the server");
const invalid = { type: "doc", content: [{ type: "nonsense" }] } as JSONContent;

async function draft(draftId: string, words: string | JSONContent, sequence = 2, baseRevision = R) {
  const content = typeof words === "string" ? doc(words) : words;
  await writeDraft(owner, { outlineId: outline, draftId, content, sequence, baseRevision });
}

const inspect = () => inspectRecoveryRecords(owner, outline);
const classify = (records: RecoveryRecords, revision = R) =>
  classifyRecovery({ records, server, serverRevision: revision });
const idOf = (draftId: string) => `${outline}:${draftId}`;
const reviewedOf = (records: RecoveryRecords): ReviewedRecord[] =>
  records.drafts.map((entry) => ({
    recordId: entry.read.status === "ok" ? idOf(entry.read.draftId) : entry.read.id,
    record: entry.record,
  }));

/** Restores `head` (with its unit) into `into`, as a session would. */
async function restoreInto(head: string, into: string, ancestors: string[] = []) {
  const records = await inspect();
  const reads = new Map(
    records.drafts
      .filter((entry) => entry.read.status === "ok")
      .map((entry) => [(entry.read as { draftId: string }).draftId, entry]),
  );
  const headEntry = reads.get(head)!;
  if (headEntry.read.status !== "ok") throw new Error();
  const restored = restoreForRecovery(headEntry.read.draft.content);
  if (!restored.ok) throw new Error("not restorable");
  const lineage: AdoptionLink[] = [head, ...ancestors].map((id) => {
    const read = reads.get(id)!.read;
    if (read.status !== "ok") throw new Error();
    return linkTo(read);
  });
  return adoptDraft(owner, {
    outlineId: outline,
    draftId: into,
    content: restored.content,
    baseRevision: R,
    oversized: restored.oversized,
    lineage,
    head: reviewedOf(records).find((entry) => entry.recordId === idOf(head))!,
    reviewed: reviewedOf(records),
  });
}

async function putRaw(id: string, data: unknown, kind = draftKind) {
  const db = await openOfflineDb();
  await db.put("accountData", { owner, kind, id, data, updatedAt: 1 });
}

async function raw(id: string, kind = draftKind) {
  return (await openOfflineDb()).get("accountData", [owner, kind, id]);
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeOfflineDb();
});

describe("exact record identity (sameRecord)", () => {
  it("compares the values IndexedDB keeps for drafts exactly", () => {
    expect(sameRecord({ a: 1, b: [1, "x", null] }, { b: [1, "x", null], a: 1 })).toBe("equal");
    expect(sameRecord({ a: 1 }, { a: 2 })).toBe("different");
    expect(sameRecord({ a: 1 }, { a: 1, b: undefined })).toBe("different");
    expect(sameRecord([1, 2], [1, 2, 3])).toBe("different");
    expect(sameRecord(0, -0)).toBe("different");
    expect(sameRecord(Number.NaN, Number.NaN)).toBe("equal");
    expect(sameRecord(new Date(5), new Date(5))).toBe("equal");
    expect(sameRecord(new Date(5), new Date(6))).toBe("different");
    expect(sameRecord(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe("equal");
    expect(sameRecord(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe("different");
    expect(sameRecord(new Uint8Array([1, 2]), new Int8Array([1, 2]))).toBe("different");
    expect(sameRecord(new Uint8Array([7]).buffer, new Uint8Array([7]).buffer)).toBe("equal");
    expect(sameRecord({ a: 1 }, [1])).toBe("different");
  });

  it("never calls an unfamiliar type equal because its type matches", () => {
    expect(sameRecord(new Map([["a", 1]]), new Map([["a", 1]]))).toBe("unknown");
    expect(sameRecord(new Set([1]), new Set([1]))).toBe("unknown");
    expect(sameRecord(new Blob(["x"]), new Blob(["x"]))).toBe("unknown");
    expect(sameRecord(/x/, /x/)).toBe("unknown");
    expect(sameRecord(new String("x"), new String("x"))).toBe("unknown");
    class Thing {
      a = 1;
    }
    expect(sameRecord(new Thing(), new Thing())).toBe("unknown");
    // Inside a record too: the whole record's identity is unknown.
    expect(sameRecord({ data: new Map() }, { data: new Map() })).toBe("unknown");
    // A definite difference elsewhere still says different.
    expect(sameRecord({ a: new Map(), b: 1 }, { a: new Map(), b: 2 })).toBe("different");
  });
});

describe("classification (C.1)", () => {
  it("tells equivalent, pending, conflicted, refused-by-the-core, oversized, newer, and damaged drafts apart", async () => {
    await draft(A, server);
    await draft(B, "Pending words");
    await draft(C, "Refused words", 3, 6);
    await refuseDraft(owner, {
      outlineId: outline,
      draftId: C,
      sequence: 3,
      code: "stale",
      revision: R,
    });
    await draft(D, invalid);
    await putRaw(idOf(E), { format: 9 });
    await putRaw(`${outline}:not-a-uuid`, { format: 1 });

    const records = await inspect();
    const result = classify(records);
    const by = (draftId: string | null, kind?: string) =>
      result.drafts.find((d) => d.draftId === draftId && (!kind || d.kind === kind))!;
    expect(by(A)).toMatchObject({ kind: "equivalent", blocking: false, restorable: null });
    expect(by(B)).toMatchObject({
      kind: "divergent",
      status: "pending",
      blocking: true,
      restorable: { ok: true, oversized: false },
      provenance: "none",
      behindServer: false,
    });
    expect(by(C)).toMatchObject({
      kind: "divergent",
      status: "conflict",
      refusal: expect.objectContaining({ code: "stale" }),
      behindServer: true,
    });
    expect(by(D)).toMatchObject({
      kind: "divergent",
      restorable: { ok: false, reason: "invalid" },
    });
    expect(by(E)).toMatchObject({ kind: "unsupported", blocking: true });
    expect(by(null, "malformed")).toMatchObject({ blocking: true });
    // Each blocking record is its own unit; nothing blocking is left out.
    expect(result.units.map((unit) => unit.head).sort()).toEqual(
      [idOf(B), idOf(C), idOf(D), idOf(E), `${outline}:not-a-uuid`].sort(),
    );
    expect(result.units.find((unit) => unit.head === idOf(D))!.restorable).toBe(false);
    // No content in what classification returns.
    expect(JSON.stringify(result)).not.toContain("Pending words");
  });

  it("restores an oversized draft through the core, never a refused one, and never guesses a schema", () => {
    const big = doc("x".repeat(documentLimits.bytes + 10));
    const restored = restoreForRecovery(big);
    expect(restored).toMatchObject({ ok: true, oversized: true });
    if (restored.ok) expect(restored.bytes).toBeGreaterThan(documentLimits.bytes);
    expect(restoreForRecovery(invalid)).toEqual({ ok: false });
    expect(
      restoreForRecovery({ type: "doc", content: [{ type: "text", text: "\u0000" }] }),
    ).toEqual({
      ok: false,
    });
    const fits = restoreForRecovery(doc("Fine"));
    expect(fits).toMatchObject({ ok: true, oversized: false });
    if (fits.ok)
      expect(fits.content).toEqual(
        (canonicalDocument(doc("Fine")) as { content: unknown }).content,
      );
  });

  it("treats a restored draft and the draft it came from as one unit, through several generations", async () => {
    await draft(A, "Original words");
    expect(await restoreInto(A, B)).toBe("adopted");
    let result = classify(await inspect());
    expect(result.units).toEqual([
      { head: idOf(B), members: [idOf(B), idOf(A)], blocking: true, restorable: true },
    ]);
    expect(result.drafts.find((d) => d.draftId === A)!.provenance).toBe("protected");
    expect(result.drafts.find((d) => d.draftId === B)!.provenance).toBe("restored");

    // B's session crashed with more words; restored again into C: still one unit.
    await draft(B, "Original words, and more", 2);
    // B changed since A was linked? No: A is unchanged, B's own lineage still names A.
    expect(await restoreInto(B, C, [A])).toBe("adopted");
    result = classify(await inspect());
    expect(result.units).toEqual([
      { head: idOf(C), members: [idOf(C), idOf(B), idOf(A)], blocking: true, restorable: true },
    ]);
    // And a third generation.
    expect(await restoreInto(C, D, [B, A])).toBe("adopted");
    result = classify(await inspect());
    expect(result.units).toHaveLength(1);
    expect(result.units[0].members).toEqual([idOf(D), idOf(C), idOf(B), idOf(A)]);
  });

  it("keeps an unrelated divergent draft a unit of its own beside a lineage", async () => {
    await draft(A, "Original words");
    await restoreInto(A, B);
    await draft(C, "Unrelated words");
    const result = classify(await inspect());
    expect(result.units.map((unit) => unit.head).sort()).toEqual([idOf(B), idOf(C)].sort());
  });

  it("makes a draft independent again once it no longer matches its link", async () => {
    await draft(A, "Original words");
    await restoreInto(A, B);
    // A's own late answer changed it (a refusal written after the restore).
    await refuseDraft(owner, { outlineId: outline, draftId: A, sequence: 2, code: "stale" });
    const result = classify(await inspect());
    expect(result.drafts.find((d) => d.draftId === A)!.provenance).toBe("unknown");
    expect(result.units.map((unit) => unit.head).sort()).toEqual([idOf(A), idOf(B)].sort());
  });

  it("does not let a restored draft that now says what the server says hide what it came from", async () => {
    await draft(A, "Original words");
    await restoreInto(A, B);
    // B's words became the server's (its save's confirmation was never recorded): equivalent.
    await draft(B, server, 2);
    const result = classify(await inspect());
    expect(result.drafts.find((d) => d.draftId === B)!.kind).toBe("equivalent");
    expect(result.units).toEqual([
      { head: idOf(B), members: [idOf(B), idOf(A)], blocking: true, restorable: false },
    ]);
  });

  it("takes only a readable cleanup marker, naming unchanged drafts, as evidence", async () => {
    await draft(A, "Original words");
    await putRaw(
      idOf(B),
      {
        format: 1,
        adopter: B,
        sequence: 1,
        revision: R + 1,
        ancestors: [linkTo((await inspect()).drafts[0].read as never)],
        at: 1,
      },
      cleanupKind,
    );
    let result = classify(await inspect());
    expect(result.drafts[0]).toMatchObject({ provenance: "cleanup_pending", blocking: false });
    expect(result.blocking).toBe(false);

    await putRaw(idOf(B), { format: 1, adopter: B }, cleanupKind);
    result = classify(await inspect());
    expect(result.drafts[0]).toMatchObject({ provenance: "none", blocking: true });
  });
});

describe("durable adoption (C.2)", () => {
  it("keeps the restored content as a new draft's first snapshot, naming where it came from, and removes nothing", async () => {
    await draft(A, "Original words", 4);
    expect(await restoreInto(A, B)).toBe("adopted");
    const original = await readDraft(owner, { outlineId: outline, draftId: A });
    expect(original?.status).toBe("ok");
    const adopted = await readDraft(owner, { outlineId: outline, draftId: B });
    if (adopted?.status !== "ok" || original?.status !== "ok") throw new Error();
    expect(adopted.draft).toMatchObject({
      sequence: 1,
      confirmedSequence: 0,
      baseRevision: R,
      adoption: { lineage: [{ draftId: A, sequence: 4, updatedAt: original.updatedAt }] },
    });
    expect(adopted.draft.refusal).toBeUndefined();
    expect(adopted.draft.content).toEqual(
      restoreForRecovery(doc("Original words")).ok &&
        (restoreForRecovery(doc("Original words")) as { content: unknown }).content,
    );
  });

  it("records an oversized restore as refused for its snapshot, as a write would", async () => {
    await draft(A, doc("y".repeat(documentLimits.bytes + 10)));
    expect(await restoreInto(A, B)).toBe("adopted");
    const adopted = await readDraft(owner, { outlineId: outline, draftId: B });
    if (adopted?.status !== "ok") throw new Error();
    expect(adopted.draft.refusal).toMatchObject({ code: "too_large", sequence: 1 });
  });

  it("refuses, writing nothing, when the head, another draft, or the new draft is not as reviewed", async () => {
    await draft(A, "Original words");
    await draft(C, server);
    const records = await inspect();
    const reviewed = reviewedOf(records);
    const head = reviewed.find((entry) => entry.recordId === idOf(A))!;
    const headRead = records.drafts.find((e) => e.record === head.record)!.read;
    if (headRead.status !== "ok") throw new Error();
    const input = {
      outlineId: outline,
      draftId: B,
      content: doc("Original words"),
      baseRevision: R,
      oversized: false,
      lineage: [linkTo(headRead)],
      head,
      reviewed,
    };
    // Another draft changed since the review.
    await draft(C, "Now different", 3);
    expect(await adoptDraft(owner, input)).toBe("changed");
    expect(await readDraft(owner, { outlineId: outline, draftId: B })).toBeNull();

    // A new draft appeared since the review.
    const again = await inspect();
    const reviewed2 = reviewedOf(again);
    await draft(D, "Appeared");
    expect(
      await adoptDraft(owner, {
        ...input,
        head: reviewed2.find((entry) => entry.recordId === idOf(A))!,
        reviewed: reviewed2,
      }),
    ).toBe("changed");

    // The head itself changed.
    const third = await inspect();
    const reviewed3 = reviewedOf(third);
    await draft(A, "Original words, edited", 5);
    expect(
      await adoptDraft(owner, {
        ...input,
        head: reviewed3.find((entry) => entry.recordId === idOf(A))!,
        reviewed: reviewed3,
      }),
    ).toBe("changed");
    expect(await readDraft(owner, { outlineId: outline, draftId: B })).toBeNull();
  });

  it("is atomic: a failed write leaves nothing, and says why", async () => {
    await draft(A, "Original words");
    const quota = new DOMException("full", "QuotaExceededError");
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw quota;
    });
    await expect(restoreInto(A, B)).rejects.toMatchObject({ kind: "quota" });
    vi.restoreAllMocks();
    expect(await readDraft(owner, { outlineId: outline, draftId: B })).toBeNull();
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
  });

  it("is scoped to the owner: another account's adoption sees none of it", async () => {
    await draft(A, "Original words");
    expect((await inspectRecoveryRecords(stranger, outline)).drafts).toEqual([]);
  });
});

describe("guarded discard (C.2)", () => {
  it("removes only the record reviewed, readable or not", async () => {
    await draft(A, "Words");
    await putRaw(idOf(B), { format: 1, content: "damaged", sequence: 1 });
    const records = await inspect();
    const [first, second] = reviewedOf(records);
    // A was written again after the review: the old approval removes nothing.
    await draft(A, "Words, again", 3);
    expect(await discardReviewedDraft(owner, { outlineId: outline, ...first })).toBe("changed");
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
    // B, replaced by a different damaged record under the same key: kept.
    await putRaw(idOf(B), { format: 1, content: "other damage", sequence: 1 });
    expect(await discardReviewedDraft(owner, { outlineId: outline, ...second })).toBe("changed");
    expect(await raw(idOf(B))).toBeDefined();
    // As reviewed: removed.
    const fresh = reviewedOf(await inspect());
    for (const entry of fresh) {
      expect(await discardReviewedDraft(owner, { outlineId: outline, ...entry })).toBe("discarded");
    }
    expect((await inspect()).drafts).toEqual([]);
    expect(await discardReviewedDraft(owner, { outlineId: outline, ...fresh[0] })).toBe("ignored");
  });

  it("refuses when sameness cannot be established", async () => {
    await putRaw(idOf(B), { format: 3, extra: new Map([["a", 1]]) });
    const [entry] = reviewedOf(await inspect());
    expect(await discardReviewedDraft(owner, { outlineId: outline, ...entry })).toBe("changed");
    expect(await raw(idOf(B))).toBeDefined();
  });

  it("never reaches another outline's or another account's records", async () => {
    await draft(A, "Words");
    const [entry] = reviewedOf(await inspect());
    await expect(
      discardReviewedDraft(owner, {
        outlineId: "1c7b4d2f-0e65-4d8f-9b66-2a2a7e4c3b21",
        ...entry,
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(await discardReviewedDraft(stranger, { outlineId: outline, ...entry })).toBe("ignored");
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
  });
});

describe("confirmation and cleanup (C.4)", () => {
  async function adoptedChain() {
    await draft(A, "Original words");
    await restoreInto(A, B);
  }

  it("keeps the original until the server confirms the restored work; then records evidence and cleans up", async () => {
    await adoptedChain();
    // Kept on the device, writes of newer snapshots: the original stays, and the lineage is carried.
    await writeDraft(owner, {
      outlineId: outline,
      draftId: B,
      content: doc("Edited"),
      sequence: 2,
      baseRevision: R,
    });
    const kept = await readDraft(owner, { outlineId: outline, draftId: B });
    if (kept?.status !== "ok") throw new Error();
    expect(kept.draft.adoption?.lineage[0].draftId).toBe(A);
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 0, removed: 0, kept: 0 });

    // Confirmation of snapshot 1 (B holds 2): evidence recorded, the lineage moves to it.
    expect(
      await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 }),
    ).toBe("advanced");
    const marker = await raw(idOf(B), cleanupKind);
    expect(marker?.data).toMatchObject({
      adopter: B,
      sequence: 1,
      revision: R + 1,
      ancestors: [expect.objectContaining({ draftId: A })],
    });
    const advanced = await readDraft(owner, { outlineId: outline, draftId: B });
    if (advanced?.status !== "ok") throw new Error();
    expect(advanced.draft.adoption).toBeUndefined();
    // Cleanup pending: the original no longer blocks.
    expect(classify(await inspect(), R + 1).drafts.find((d) => d.draftId === A)).toMatchObject({
      provenance: "cleanup_pending",
      blocking: false,
    });

    expect(await settleCleanups(owner, outline)).toEqual({ settled: 1, removed: 1, kept: 0 });
    expect(await readDraft(owner, { outlineId: outline, draftId: A })).toBeNull();
    expect(await raw(idOf(B), cleanupKind)).toBeUndefined();
    // Idempotent.
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 0, removed: 0, kept: 0 });
  });

  it("records the evidence when the confirmation clears the restored draft itself", async () => {
    await adoptedChain();
    expect(
      await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 }),
    ).toBe("cleared");
    expect(await readDraft(owner, { outlineId: outline, draftId: B })).toBeNull();
    expect(await raw(idOf(B), cleanupKind)).toBeDefined();
    await settleCleanups(owner, outline);
    expect((await inspect()).drafts).toEqual([]);
  });

  it("never records evidence without the confirmation: a failed transaction leaves both as they were", async () => {
    await adoptedChain();
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => {
      throw new DOMException("gone", "UnknownError");
    });
    await expect(
      confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 }),
    ).rejects.toMatchObject({ kind: "failed" });
    vi.restoreAllMocks();
    expect(await raw(idOf(B), cleanupKind)).toBeUndefined();
    const still = await readDraft(owner, { outlineId: outline, draftId: B });
    if (still?.status !== "ok") throw new Error();
    expect(still.draft.adoption).toBeDefined();
    // The same evidence recorded again later works: nothing was lost but time.
    expect(
      await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 }),
    ).toBe("cleared");
    expect(await raw(idOf(B), cleanupKind)).toBeDefined();
  });

  it("finishes an interrupted cleanup on a later try, and never removes a changed original", async () => {
    await adoptedChain();
    await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 });
    // The cleanup's transaction fails: the marker stays, and is still the evidence.
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => {
      throw new DOMException("gone", "UnknownError");
    });
    await expect(settleCleanups(owner, outline)).rejects.toBeDefined();
    vi.restoreAllMocks();
    expect(await raw(idOf(B), cleanupKind)).toBeDefined();
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");

    // The original changed meanwhile (its own late answer): it is kept, as independent work.
    await refuseDraft(owner, { outlineId: outline, draftId: A, sequence: 2, code: "stale" });
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 1, removed: 0, kept: 1 });
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
    expect(classify(await inspect()).drafts[0]).toMatchObject({ blocking: true });
  });

  it("cleans every generation of a confirmed restore at once", async () => {
    await draft(A, "Original words");
    await restoreInto(A, B);
    await restoreInto(B, C, [A]);
    await restoreInto(C, D, [B, A]);
    await confirmDraft(owner, { outlineId: outline, draftId: D, sequence: 1, revision: R + 1 });
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 1, removed: 3, kept: 0 });
    expect((await inspect()).drafts).toEqual([]);
  });

  it("keeps a draft that other unconfirmed restored work still names", async () => {
    await draft(A, "Original words");
    await restoreInto(A, B);
    // Another restore of A exists (as if two lineages shared it): it still protects A.
    const records = await inspect();
    const aRead = records.drafts.find((e) => e.read.status === "ok" && e.read.draftId === A)!.read;
    if (aRead.status !== "ok") throw new Error();
    await putRaw(idOf(C), {
      format: 1,
      content: doc("Other restore"),
      sequence: 1,
      confirmedSequence: 0,
      baseRevision: R,
      createdAt: 1,
      adoption: { lineage: [linkTo(aRead)] },
    });
    await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 });
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 1, removed: 0, kept: 1 });
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
  });

  it("leaves an unreadable marker alone and takes nothing from it", async () => {
    await draft(A, "Original words");
    await putRaw(idOf(B), { format: 1, adopter: "nope" }, cleanupKind);
    expect(await settleCleanups(owner, outline)).toEqual({ settled: 0, removed: 0, kept: 0 });
    expect((await readDraft(owner, { outlineId: outline, draftId: A }))?.status).toBe("ok");
    expect(await raw(idOf(B), cleanupKind)).toBeDefined();
  });

  it("are cleared with the account's data", async () => {
    await adoptedChain();
    await confirmDraft(owner, { outlineId: outline, draftId: B, sequence: 1, revision: R + 1 });
    await forgetAccount(owner);
    expect(await raw(idOf(B), cleanupKind)).toBeUndefined();
    expect((await inspect()).drafts).toEqual([]);
  });

  it("reads a restored draft written by this version as an ordinary draft in shape", async () => {
    await adoptedChain();
    const stored = await raw(idOf(B));
    expect(readDraftRecord(owner, stored!).status).toBe("ok");
  });
});
