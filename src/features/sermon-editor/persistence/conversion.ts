import { isDeepStrictEqual } from "node:util";

import type { Database } from "@/db/types";
import { lockOutlineRows } from "@/features/outlines/entries";
import { numberingConfigSchema, type NumberingConfig } from "@/features/outlines/numbering";
import { readStoredOutline, type StoredOutline } from "@/features/outlines/outlines";
import {
  documentToLegacy,
  legacyToDocument,
  shownOutline,
  toV3,
  type LegacyOutline,
} from "@/features/sermon-editor/document";
import { getDocument, insertPreparedDocument, prepareDocument } from "./documents";
import type { ConversionProblem, ConvertOutlineOutcome } from "./model";

/*
 * Converting a legacy outline into its sermon document (A2.2). The document a
 * conversion stores is the outline's content authority from then on: legacy
 * entry writes are refused (`lockForWrite`, entries.ts, and `setNumbering`).
 *
 * One transaction, which writes one row or nothing:
 *
 * 1. The outline's locks, through `lockOutlineRows`, in the order every legacy
 *    write takes them (the sermon's row, then the outline's). A legacy write
 *    that got there first has committed before anything is read here, and one
 *    that comes after waits, then finds the document and is refused.
 * 2. A document already there, readable or not, is the answer, and is never
 *    replaced: conversion runs once per outline, however often it is asked.
 * 3. The entries, and the numbering read from what is stored (never
 *    `readNumbering`'s fallback; one that does not parse, or that parsing
 *    would change, is refused), through `legacyToDocument`. Any issue it
 *    reports refuses the conversion: none can be shown to keep everything.
 * 4. `prepareDocument`: the core checks it and migrates it to v4, and the size
 *    limit applies. Too large is refused, never cut.
 * 5. Proof that nothing was lost: the stored form, taken back to v3 and read
 *    as entries, must be the outline exactly (every entry once, in order, at
 *    its depth and under its parent, with its words, passages, revision, and
 *    saved point), with no loss reported and the same numbering.
 * 6. The insert, at revision 0.
 *
 * Nothing else is written: not the outline, its entries, its revision, the
 * sermon, or `markDeveloped`. Legacy rows are never deleted or changed. A
 * failure anywhere throws and the transaction leaves everything as it was.
 */

function legacyFrom(stored: StoredOutline, numbering: NumberingConfig): LegacyOutline {
  return {
    id: stored.id,
    revision: stored.revision,
    numbering,
    entries: stored.entries.map((entry) => ({
      id: entry.id,
      parentId: entry.parentId,
      type: entry.type,
      position: entry.position,
      title: entry.title,
      notes: entry.notes,
      revision: entry.revision,
      references: entry.references,
      sourcePointId: entry.sourcePointId,
    })),
  };
}

/** True when every value in `stored` is in `parsed`, unchanged: the schema only added defaults. */
function keeps(stored: unknown, parsed: unknown): boolean {
  if (Array.isArray(stored)) {
    return (
      Array.isArray(parsed) &&
      stored.length === parsed.length &&
      stored.every((item, index) => keeps(item, parsed[index]))
    );
  }
  if (stored !== null && typeof stored === "object") {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    return Object.entries(stored).every(
      ([key, value]) => key in parsed && keeps(value, (parsed as Record<string, unknown>)[key]),
    );
  }
  return Object.is(stored, parsed);
}

/**
 * The numbering as the outline shows it, read from what is stored: never
 * `readNumbering`'s fallback. Null when what is stored does not parse, or
 * parsing it would drop or change any of it. A field the schema fills with
 * its default (one stored before that field existed) is what the outline
 * already shows, and is kept as that.
 */
function storedNumbering(stored: unknown): NumberingConfig | null {
  const parsed = numberingConfigSchema.safeParse(stored);
  return parsed.success && keeps(stored, parsed.data) ? parsed.data : null;
}

/** Why the stored document is not exactly the outline, or nothing when it is. */
export function conversionDifferences(
  outline: LegacyOutline,
  content: unknown,
): ConversionProblem[] {
  const back = toV3(content as Parameters<typeof toV3>[0]);
  if (!back.ok) return [{ code: "not_lossless", detail: back.reason }];
  const { outline: read, losses } = documentToLegacy(back.doc);
  const problems: ConversionProblem[] = losses.map((loss) => ({
    code: "not_lossless",
    entryId: loss.entryId,
    detail: loss.code,
  }));
  if (read.id !== outline.id || read.revision !== outline.revision) {
    problems.push({ code: "not_lossless", detail: "outline" });
  }
  if (!isDeepStrictEqual(read.numbering, outline.numbering)) {
    problems.push({ code: "not_lossless", detail: "numbering" });
  }
  const ids = read.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length || ids.length !== outline.entries.length) {
    problems.push({ code: "not_lossless", detail: "entries" });
  }
  const before = shownOutline(outline);
  const after = shownOutline(read);
  before.forEach((entry, index) => {
    if (!isDeepStrictEqual(entry, after[index])) {
      problems.push({ code: "not_lossless", entryId: entry.id, detail: "entry" });
    }
  });
  if (after.length > before.length) problems.push({ code: "not_lossless", detail: "entries" });
  return problems;
}

/** Converts one of the owner's outlines into its sermon document, once. */
export async function convertOutline(
  db: Database,
  ownerId: string,
  outlineId: string,
): Promise<ConvertOutlineOutcome> {
  return db.transaction(async (tx): Promise<ConvertOutlineOutcome> => {
    const locked = await lockOutlineRows(tx, ownerId, outlineId);
    if (!locked) return { status: "missing" };

    // Asked after the locks are held, in a statement of its own: a conversion
    // that committed while this one waited is seen here.
    const existing = await getDocument(tx, ownerId, locked.id);
    if (existing.status === "found") {
      return { status: "exists", revision: existing.document.revision };
    }
    if (existing.status === "unreadable") return existing;

    const stored = await readStoredOutline(tx, ownerId, locked.id);
    if (!stored) return { status: "missing" };
    const numbering = storedNumbering(stored.numbering);
    if (!numbering) return { status: "unsafe", problems: [{ code: "invalid_numbering" }] };
    const outline = legacyFrom(stored, numbering);

    const converted = legacyToDocument(outline);
    if (!converted.ok || converted.issues.length > 0) {
      return {
        status: "unsafe",
        problems: converted.issues.map(({ code, entryId, detail }) => ({ code, entryId, detail })),
      };
    }

    const prepared = prepareDocument(converted.doc);
    if (!prepared.ok) {
      return prepared.status === "invalid"
        ? { status: "invalid", problems: prepared.problems }
        : { status: "too_large", bytes: prepared.bytes, limit: prepared.limit };
    }

    const differences = conversionDifferences(outline, prepared.content);
    if (differences.length > 0) return { status: "unsafe", problems: differences };

    const document = await insertPreparedDocument(tx, ownerId, locked.id, prepared.content);
    // Never so while the locks are held; answered as `exists` if it ever were.
    if (!document) {
      const now = await getDocument(tx, ownerId, locked.id);
      return now.status === "found"
        ? { status: "exists", revision: now.document.revision }
        : now.status === "unreadable"
          ? now
          : { status: "missing" };
    }
    return { status: "converted", document };
  });
}
