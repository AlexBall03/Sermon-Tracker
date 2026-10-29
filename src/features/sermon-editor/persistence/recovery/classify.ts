import type { JSONContent } from "@tiptap/core";

import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { jsonEqual } from "../autosave/model";
import { canonicalDocument } from "../canonical";
import { toPlainJson, type JsonValue } from "../json";
import { documentLimits, utf8Bytes } from "../model";
import {
  currentRefusal,
  draftStatus,
  linkMatches,
  type CleanupRead,
  type DraftRead,
  type DraftRefusal,
} from "./model";

/*
 * Recovery classification (A2.3C): what each record of one outline on this
 * device is, measured against the server's document as just read. Pure: no
 * IndexedDB, no network, no logging, and no content in what it returns
 * (previews are made on request, `restoreForRecovery`).
 *
 * Each draft is compared in the browser's canonical form with `jsonEqual`,
 * never by string. Its relationship to the server is never assumed: an
 * equivalent draft proves nothing about its request, a pending one proves
 * nothing is in flight, and a revision past its base proves nothing about
 * which content the server took.
 *
 * Restores (A2.3C) are related by their stored lineage, and only by it. A
 * restored draft names, in `adoption.lineage`, each draft it came from as
 * that draft was at the moment of restoring (`linkMatches`). A draft still
 * matching such a link is part of the restored draft's work, so the two are
 * one unit: the person resumes it without first discarding what it was
 * restored from. A draft that no longer matches is independent. Nothing
 * else (similar words, a later time) ever relates two drafts.
 *
 * A readable cleanup marker is the durable evidence that the server
 * confirmed a restored draft's work; the drafts it names, while they still
 * match, are `cleanup_pending` and no longer block. A marker that cannot be
 * read is evidence of nothing.
 */

export type DraftEntry = { read: DraftRead; record: unknown };
export type CleanupEntry = { read: CleanupRead; record: unknown };
/** One outline's records on this device, with their stored form (for identity, `sameRecord`). */
export type RecoveryRecords = { drafts: DraftEntry[]; cleanups: CleanupEntry[] };

/** Whether a draft's content can be restored into the editor, and how. */
export type Restorable =
  /** The document core accepts it. `oversized`: over `documentLimits`, kept on the device and never sent until it fits. */
  | { ok: true; oversized: boolean; bytes: number }
  /** The document core refuses it: it is never restored, and never guessed at. */
  | { ok: false; reason: "invalid" };

/**
 * A draft's part in a restore:
 * - `none`: no part.
 * - `restored`: began as a restore; its work is not known to be confirmed.
 * - `protected`: a draft a restored draft came from, kept until that work is confirmed.
 * - `cleanup_pending`: a draft a confirmed restore came from (a marker says so); removed by `settleCleanups`.
 * - `unknown`: named by a lineage or a marker, but changed since: independent, and kept.
 */
export type Provenance = "none" | "restored" | "protected" | "cleanup_pending" | "unknown";

export type ClassifiedDraft = {
  recordId: string;
  draftId: string | null;
  kind: "equivalent" | "divergent" | "unsupported" | "malformed";
  /** For a readable draft: `pending` or `conflict` (`draftStatus`). */
  status: "pending" | "conflict" | null;
  sequence: number | null;
  baseRevision: number | null;
  updatedAt: number | null;
  /** The refusal that still applies (`currentRefusal`). */
  refusal: DraftRefusal | null;
  /** The draft was made against a revision older than the server's now. Advice only. */
  behindServer: boolean;
  /** For a divergent draft only. */
  restorable: Restorable | null;
  provenance: Provenance;
  /** Whether it, on its own, keeps the outline from being edited. */
  blocking: boolean;
};

/**
 * What the person resolves as one: a draft, or a restored draft (`head`)
 * with the drafts it came from that still match (`members` after the head).
 */
export type RecoveryUnit = {
  head: string;
  members: string[];
  blocking: boolean;
  /** The head can be restored (it differs from the server and the core accepts it). */
  restorable: boolean;
};

export type RecoveryClassification = {
  drafts: ClassifiedDraft[];
  /** Every unit that blocks, and every restored draft with ancestors. */
  units: RecoveryUnit[];
  /** Whether anything here keeps the outline from being edited. */
  blocking: boolean;
};

/**
 * A draft's content as the editor would open it: canonical when the core
 * accepts it within the limit; validated by the core (and in its output
 * form) when it is only too large; refused otherwise.
 */
export function restoreForRecovery(
  content: unknown,
): { ok: true; content: JSONContent; bytes: number; oversized: boolean } | { ok: false } {
  const canonical = canonicalDocument(content);
  if (canonical.ok) {
    return { ok: true, content: canonical.content, bytes: canonical.bytes, oversized: false };
  }
  if (canonical.status !== "too_large") return { ok: false };
  // Too large to save, never too large to keep: the core still has to accept it.
  const plain = toPlainJson(content);
  if (!plain.ok) return { ok: false };
  const restored = restoreSermonDocument(plain.value);
  if (!restored.ok) return { ok: false };
  const output = toPlainJson(restored.doc.toJSON());
  if (!output.ok) return { ok: false };
  const json = output.value as JSONContent;
  const bytes = utf8Bytes(JSON.stringify(json));
  return { ok: true, content: json, bytes, oversized: bytes > documentLimits.bytes };
}

const recordIdOf = (read: DraftRead) =>
  read.status === "ok" ? `${read.outlineId}:${read.draftId}` : read.id;

export function classifyRecovery({
  records,
  server,
  serverRevision,
}: {
  records: RecoveryRecords;
  /** The server's document as just read. */
  server: JSONContent;
  serverRevision: number;
}): RecoveryClassification {
  const base = canonicalDocument(server);
  const ok = records.drafts
    .map((entry) => entry.read)
    .filter((read): read is Extract<DraftRead, { status: "ok" }> => read.status === "ok");
  const byDraftId = new Map(ok.map((read) => [read.draftId, read]));

  // Drafts named by a readable marker that still match: the evidence of a confirmed restore.
  const settling = new Set<string>();
  const named = new Set<string>();
  for (const { read } of records.cleanups) {
    if (read.status !== "ok") continue;
    for (const link of read.marker.ancestors) {
      named.add(link.draftId);
      const draft = byDraftId.get(link.draftId);
      if (draft && linkMatches(link, draft)) settling.add(link.draftId);
    }
  }

  // Verified edges: a restored draft to each draft it came from that still matches.
  const ancestors = new Map<string, string[]>();
  const protectedIds = new Set<string>();
  for (const draft of ok) {
    const lineage = draft.draft.adoption?.lineage ?? [];
    const found: string[] = [];
    for (const link of lineage) {
      named.add(link.draftId);
      const parent = byDraftId.get(link.draftId);
      if (!parent || parent.draftId === draft.draftId || !linkMatches(link, parent)) continue;
      found.push(parent.draftId);
      protectedIds.add(parent.draftId);
    }
    if (found.length) ancestors.set(draft.draftId, found);
  }

  const drafts: ClassifiedDraft[] = records.drafts.map(({ read }) => {
    const recordId = recordIdOf(read);
    if (read.status !== "ok") {
      return {
        recordId,
        draftId: read.draftId,
        kind: read.status,
        status: null,
        sequence: null,
        baseRevision: null,
        updatedAt: null,
        refusal: null,
        behindServer: false,
        restorable: null,
        provenance: "none",
        blocking: true,
      };
    }
    const kept = canonicalDocument(read.draft.content);
    const equivalent =
      base.ok && kept.ok && jsonEqual(kept.content as JsonValue, base.content as JsonValue);
    let restorable: Restorable | null = null;
    if (!equivalent) {
      const restored = restoreForRecovery(read.draft.content);
      restorable = restored.ok
        ? { ok: true, oversized: restored.oversized, bytes: restored.bytes }
        : { ok: false, reason: "invalid" };
    }
    const provenance: Provenance = settling.has(read.draftId)
      ? "cleanup_pending"
      : protectedIds.has(read.draftId)
        ? "protected"
        : read.draft.adoption
          ? "restored"
          : named.has(read.draftId)
            ? "unknown"
            : "none";
    return {
      recordId,
      draftId: read.draftId,
      kind: equivalent ? "equivalent" : "divergent",
      status: draftStatus(read.draft),
      sequence: read.draft.sequence,
      baseRevision: read.draft.baseRevision,
      updatedAt: read.updatedAt,
      refusal: currentRefusal(read.draft),
      behindServer: read.draft.baseRevision < serverRevision,
      restorable,
      provenance,
      blocking: !equivalent && provenance !== "cleanup_pending",
    };
  });
  const byRecord = new Map(drafts.map((draft) => [draft.recordId, draft]));
  const recordOf = (id: string) => byDraftId.get(id) && `${byDraftId.get(id)!.outlineId}:${id}`;

  // Units: every restored draft that is no one's ancestor heads one, with its ancestors, transitively.
  const units: RecoveryUnit[] = [];
  const covered = new Set<string>();
  for (const draft of ok) {
    if (protectedIds.has(draft.draftId) || settling.has(draft.draftId)) continue;
    if (!ancestors.has(draft.draftId)) continue;
    const members: string[] = [];
    const seen = new Set<string>([draft.draftId]);
    const queue = [...(ancestors.get(draft.draftId) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next) || settling.has(next)) continue;
      seen.add(next);
      members.push(next);
      queue.push(...(ancestors.get(next) ?? []));
    }
    const head = recordOf(draft.draftId)!;
    const all = [head, ...members.map((id) => recordOf(id)!)];
    for (const id of all) covered.add(id);
    const headDraft = byRecord.get(head)!;
    units.push({
      head,
      members: all,
      blocking: all.some((id) => byRecord.get(id)!.blocking),
      restorable: headDraft.kind === "divergent" && headDraft.restorable?.ok === true,
    });
  }
  // Every other blocking record is a unit of its own: nothing blocking is ever left out.
  for (const draft of drafts) {
    if (!draft.blocking || covered.has(draft.recordId)) continue;
    units.push({
      head: draft.recordId,
      members: [draft.recordId],
      blocking: true,
      restorable: draft.kind === "divergent" && draft.restorable?.ok === true,
    });
  }
  return { drafts, units, blocking: units.some((unit) => unit.blocking) };
}
