import type { OutlineActionResult } from "@/features/outlines/actions";
import type { OutlineApi, OutlineSnapshot } from "@/features/outlines/editor/store";
import type { EntryRecord } from "@/features/outlines/entries";
import { outlineLimits } from "@/features/outlines/model";
import { outlineSchemas } from "@/features/outlines/schemas";
import {
  planInsert,
  planMove,
  planRemove,
  subtreeIds,
  type Placement,
} from "@/features/outlines/tree";
import { referenceKey, type ScriptureReference } from "@/features/scripture/reference";
import {
  entryOf,
  type OfflineOutline,
  type OfflineOutlineEntry,
  type OfflineOutlineSermon,
  type OutlineSyncType,
} from "@/features/sync/outlines";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { openOfflineDb } from "../db";
import { ideaKind, shown as shownIdea, type KeptIdea } from "../ideas/store";
import type { MutationRecord } from "../model";
import { announceQueueChange, byAge, putMutation, type NewMutation } from "../queue";
import { announceOutlinesChange, outlineKind, outlineRecord, type KeptOutline } from "./store";

/*
 * The outline editor's way of saving on this device (Phase 5D.2): an
 * `OutlineApi`, as the server actions are, for the editor's store
 * (outlines/editor/store.ts). The store keeps its one queue and its autosave
 * exactly as online; only where each change goes differs.
 *
 * Each change is checked as the server checks it (the outline's schemas, the
 * same `tree.ts` plans, the two revisions), written to the device's copy of
 * the outline (`local`, store.ts), and queued for the sync engine, in ONE
 * IndexedDB transaction: the copy never shows what the queue will not send.
 * It answers as the action would, so a second tab editing the same copy meets
 * the store's own `stale` and `stale_entry` paths. Revisions move here as
 * they do on the server, so the changes queued one after another name the
 * revisions the server will have reached.
 *
 * A change to words or passages carries what they were before it (`base`):
 * the server settles one made on an older entry field by field
 * (sync/apply-outlines.ts). One made while the outline's last queued change is
 * a waiting change of the same kind to the same entry is folded into it, so
 * typing on and off for an hour is not hundreds of requests.
 */

export type DeviceApiOptions = {
  locale: Locale;
  /**
   * What this browser knows the server holds, when the device has no change of
   * its own to the outline yet: the copy the change is made on. Given by the
   * application's editor, whose store has just heard from the server.
   */
  seed?: () => OutlineSnapshot | null;
  /** The sermon, for a copy the device did not have. */
  sermon?: { sermon: OfflineOutlineSermon; sermonReferences: ScriptureReference[] };
};

type Planned = {
  result: OutlineActionResult;
  next?: OfflineOutline;
  change?: Omit<NewMutation, "opId" | "entityType" | "entityId"> & { type: OutlineSyncType };
};

const passagesKey = (list: readonly ScriptureReference[]) => list.map(referenceKey).join("|");

function withPlacements(entries: OfflineOutlineEntry[], placements: Placement[]) {
  if (placements.length === 0) return entries;
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  return entries.map((entry) => {
    const placement = byId.get(entry.id);
    return placement
      ? { ...entry, parentId: placement.parentId, position: placement.position }
      : entry;
  });
}

function asRecord(entry: OfflineOutlineEntry, outlineId: string): EntryRecord {
  const now = new Date();
  return { ...entry, outlineId, createdAt: now, updatedAt: now };
}

function cut(text: string, length: number) {
  const characters = [...text];
  return characters.length <= length ? text : characters.slice(0, length).join("");
}

/** The outline as a device keeps it, from what the editor's store knows. */
function fromSnapshot(
  snapshot: OutlineSnapshot,
  around: Pick<OfflineOutline, "sermonId" | "sermon" | "sermonReferences" | "createdAt">,
): OfflineOutline {
  return {
    ...around,
    id: snapshot.id,
    revision: snapshot.revision,
    numbering: snapshot.numbering,
    updatedAt: new Date().toISOString(),
    entries: snapshot.entries.map((entry) => ({ ...entry })),
  };
}

export function createDeviceOutlineApi(
  owner: string,
  outlineId: string,
  options: DeviceApiOptions,
): OutlineApi {
  const t = dictionary(options.locale, "outlines").actions;
  const schemas = outlineSchemas(options.locale);
  const refused = (
    code: NonNullable<OutlineActionResult["code"]>,
    message: string,
    extra: Partial<OutlineActionResult> = {},
  ): Planned => ({ result: { ok: false, code, message, ...extra } });

  async function write(
    plan: (
      outline: OfflineOutline,
      ideas: (id: string) => Promise<KeptIdea | null>,
    ) => Planned | Promise<Planned>,
  ): Promise<OutlineActionResult> {
    if (!owner) throw new Error("A change needs its owner.");
    const db = await openOfflineDb();
    const tx = db.transaction(["accountData", "mutations"], "readwrite");
    const data = tx.objectStore("accountData");
    const mutations = tx.objectStore("mutations");
    try {
      const stored = await data.get([owner, outlineKind, outlineId]);
      const kept = stored && stored.owner === owner ? (stored.data as KeptOutline) : null;

      // With nothing changed here yet, a change is made on what the editor knows the server holds.
      let server = kept?.server ?? null;
      const seeded = kept?.local ? null : (options.seed?.() ?? null);
      const known = kept?.server;
      const sermon = options.sermon;
      if (seeded && seeded.id === outlineId && (known || sermon)) {
        server = fromSnapshot(
          seeded,
          known ?? {
            sermonId: sermon!.sermon.id,
            sermon: sermon!.sermon,
            sermonReferences: sermon!.sermonReferences,
            createdAt: new Date().toISOString(),
          },
        );
      }
      const start = kept?.local ?? server;
      if (!start) {
        await tx.done;
        return { ok: false, code: "missing", message: t.missing };
      }

      const ideas = async (id: string) => {
        const record = await data.get([owner, ideaKind, id]);
        return record && record.owner === owner ? (record.data as KeptIdea) : null;
      };
      const planned = await plan(start, ideas);
      if (!planned.next || !planned.change) {
        await tx.done;
        return planned.result;
      }

      await data.put(
        outlineRecord(owner, outlineId, {
          server,
          local: { ...planned.next, updatedAt: new Date().toISOString() },
          behind: kept?.behind,
          generation: kept?.generation,
        }),
      );

      // Folded into the outline's last change when that is a waiting change of the same kind to the same entry.
      const change = planned.change;
      const entryId = entryOf(change.payload);
      const queued = (await mutations.index("owner").getAll(owner))
        .filter((record) => record.entityId === outlineId && record.status !== "done")
        .sort(byAge);
      const last = queued[queued.length - 1];
      const foldable =
        last?.status === "pending" &&
        last.type === change.type &&
        (change.type === "outline.numbering" || entryOf(last.payload) === entryId) &&
        (change.type === "outline.entry.update" ||
          change.type === "outline.entry.references" ||
          change.type === "outline.numbering");
      if (foldable) {
        await mutations.put({ ...last, payload: folded(last, change.payload) });
      } else {
        await putMutation(mutations, owner, {
          ...change,
          opId: crypto.randomUUID(),
          entityType: "outline",
          entityId: outlineId,
        });
      }
      await tx.done;
      announceQueueChange();
      announceOutlinesChange();
      return planned.result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted: nothing was written past the failure.
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }

  const findEntry = (outline: OfflineOutline, id: unknown) =>
    typeof id === "string" ? outline.entries.find((entry) => entry.id === id) : undefined;

  return {
    addEntry: (input, id) =>
      write(async (outline, ideas) => {
        const parsed = schemas.entryCreate.safeParse(input);
        if (!parsed.success || typeof id !== "string" || parsed.data.outlineId !== outlineId) {
          return refused("invalid", parsed.success ? t.invalid : parsed.error.issues[0].message);
        }
        const request = parsed.data;
        const existing = findEntry(outline, id);
        // A retry: it was added the first time, and that is the answer again.
        if (existing) {
          return {
            result: {
              ok: true,
              message: t.entryAdded,
              outlineId,
              revision: outline.revision,
              entry: asRecord(existing, outlineId),
            },
          };
        }
        if (
          request.expectedRevision !== undefined &&
          request.expectedRevision !== outline.revision
        ) {
          return refused("stale", t.stale, { revision: outline.revision });
        }
        if (outline.entries.length >= outlineLimits.entries) {
          return refused("full", t.full(outlineLimits.entries));
        }

        let position = 0;
        let placements: Placement[] = [];
        if (request.type === "point") {
          const plan = planInsert(outline.entries, request.parentId, request.position);
          if (!plan.ok) return refused("invalid_parent", t.invalidParent);
          ({ position, placements } = plan);
        } else {
          if (request.parentId) return refused("invalid_parent", t.invalidParent);
          if (outline.entries.some((entry) => entry.type === request.type)) {
            return refused(
              "section_exists",
              request.type === "conclusion" ? t.conclusionExists : t.introductionExists,
            );
          }
        }

        let { title, notes } = request;
        let references: ScriptureReference[] = [];
        if (request.sourcePointId) {
          // A copy of the saved point as this device keeps it; the server keeps its own passages.
          const point = shownIdea(await ideas(request.sourcePointId));
          if (request.type !== "point" || !point || point.kind !== "point") {
            return refused("unknown_source", t.unknownSource);
          }
          title ??= cut(point.title, outlineLimits.title);
          if (notes === undefined)
            notes = point.notes ? cut(point.notes, outlineLimits.notes) : null;
          const seen = new Set<string>();
          references = point.references
            .map(({ book, chapterStart, verseStart, chapterEnd, verseEnd }) => ({
              book,
              chapterStart,
              verseStart,
              chapterEnd,
              verseEnd,
            }))
            .filter((reference) => {
              const key = referenceKey(reference);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, outlineLimits.references);
        }

        const entry: OfflineOutlineEntry = {
          id,
          parentId: request.type === "point" ? request.parentId : null,
          type: request.type,
          position,
          title: title ?? "",
          notes: notes ?? null,
          revision: 0,
          references,
          sourcePointId: request.sourcePointId,
        };
        const revision = outline.revision + 1;
        return {
          result: {
            ok: true,
            message: t.entryAdded,
            outlineId,
            revision,
            entry: asRecord(entry, outlineId),
          },
          next: {
            ...outline,
            revision,
            entries: [...withPlacements(outline.entries, placements), entry],
          },
          change: {
            type: "outline.entry.add",
            baseRevision: outline.revision,
            payload: {
              entryId: id,
              type: request.type,
              parentId: entry.parentId,
              ...(request.type === "point" ? { position } : {}),
              // Made from a saved point, the words the device showed are the ones sent.
              ...(request.sourcePointId
                ? { sourcePointId: request.sourcePointId, title: entry.title, notes: entry.notes }
                : { title: entry.title, notes: entry.notes }),
            },
          },
        };
      }),

    updateEntry: (id, input) =>
      write((outline) => {
        const parsed = schemas.entryUpdate.safeParse(input);
        if (!parsed.success)
          return refused("invalid", parsed.error.issues[0]?.message || t.invalid);
        const before = findEntry(outline, id);
        if (!before) return refused("missing", t.missingEntry);
        const { title, notes, expectedRevision } = parsed.data;
        if (expectedRevision !== undefined && expectedRevision !== before.revision) {
          return refused("stale_entry", t.staleEntry, { entry: asRecord(before, outlineId) });
        }
        const changed = {
          ...(title !== undefined && title !== before.title ? { title } : {}),
          ...(notes !== undefined && notes !== before.notes ? { notes } : {}),
        };
        // The same words again: nothing to keep, and the revision stays where the server's will.
        if (Object.keys(changed).length === 0) {
          return {
            result: {
              ok: true,
              message: t.entrySaved,
              outlineId,
              entry: asRecord(before, outlineId),
            },
          };
        }
        const after = { ...before, ...changed, revision: before.revision + 1 };
        return {
          result: { ok: true, message: t.entrySaved, outlineId, entry: asRecord(after, outlineId) },
          next: {
            ...outline,
            entries: outline.entries.map((entry) => (entry.id === before.id ? after : entry)),
          },
          change: {
            type: "outline.entry.update",
            baseRevision: before.revision,
            payload: {
              entryId: before.id,
              ...changed,
              base: {
                ...("title" in changed ? { title: before.title } : {}),
                ...("notes" in changed ? { notes: before.notes } : {}),
              },
            },
          },
        };
      }),

    setEntryReferences: (id, references, expectedRevision) =>
      write((outline) => {
        const parsed = schemas.entryReferences.safeParse(references);
        if (!parsed.success)
          return refused("invalid", parsed.error.issues[0]?.message || t.invalid);
        const before = findEntry(outline, id);
        if (!before) return refused("missing", t.missingEntry);
        if (expectedRevision !== undefined && expectedRevision !== before.revision) {
          return refused("stale_entry", t.staleEntry, { entry: asRecord(before, outlineId) });
        }
        if (passagesKey(parsed.data) === passagesKey(before.references)) {
          return {
            result: {
              ok: true,
              message: t.referencesSaved,
              outlineId,
              entry: asRecord(before, outlineId),
            },
          };
        }
        const after = { ...before, references: parsed.data, revision: before.revision + 1 };
        return {
          result: {
            ok: true,
            message: t.referencesSaved,
            outlineId,
            entry: asRecord(after, outlineId),
          },
          next: {
            ...outline,
            entries: outline.entries.map((entry) => (entry.id === before.id ? after : entry)),
          },
          change: {
            type: "outline.entry.references",
            baseRevision: before.revision,
            payload: { entryId: before.id, references: parsed.data, base: before.references },
          },
        };
      }),

    moveEntry: (id, input) =>
      write((outline) => {
        const parsed = schemas.entryMove.safeParse(input);
        if (!parsed.success || typeof id !== "string") return refused("invalid", t.invalid);
        const move = parsed.data;
        if (move.expectedRevision !== undefined && move.expectedRevision !== outline.revision) {
          return refused("stale", t.stale, { revision: outline.revision });
        }
        const plan = planMove(outline.entries, id, move.parentId, move.position);
        if (!plan.ok) {
          return plan.problem === "missing"
            ? refused("missing", t.missingEntry)
            : plan.problem === "section"
              ? refused("section", t.sectionFixed)
              : plan.problem === "cycle"
                ? refused("cycle", t.cycle)
                : refused("invalid_parent", t.invalidParent);
        }
        const moved = { id, parentId: move.parentId, position: plan.position };
        // Where it already is: nothing to keep, and no change of shape.
        if (plan.placements.length === 0) {
          return {
            result: {
              ok: true,
              message: t.entryMoved,
              outlineId,
              revision: outline.revision,
              moved,
            },
          };
        }
        const revision = outline.revision + 1;
        return {
          result: { ok: true, message: t.entryMoved, outlineId, revision, moved },
          next: { ...outline, revision, entries: withPlacements(outline.entries, plan.placements) },
          change: {
            type: "outline.entry.move",
            baseRevision: outline.revision,
            payload: { entryId: id, parentId: move.parentId, position: plan.position },
          },
        };
      }),

    removeEntry: (id, expectedRevision) =>
      write((outline) => {
        const entry = findEntry(outline, id);
        if (!entry) return refused("missing", t.missingEntry);
        if (expectedRevision !== undefined && expectedRevision !== outline.revision) {
          return refused("stale", t.stale, { revision: outline.revision });
        }
        const going = new Set(subtreeIds(outline.entries, entry.id));
        const placements = planRemove(outline.entries, entry.id);
        const revision = outline.revision + 1;
        return {
          result: { ok: true, message: t.entryRemoved, outlineId, revision },
          next: {
            ...outline,
            revision,
            entries: withPlacements(
              outline.entries.filter((other) => !going.has(other.id)),
              placements,
            ),
          },
          change: {
            type: "outline.entry.remove",
            baseRevision: outline.revision,
            payload: { entryId: entry.id },
          },
        };
      }),

    setOutlineNumbering: (id, numbering) =>
      write((outline) => {
        const parsed = schemas.numbering.safeParse(numbering);
        if (!parsed.success || id !== outlineId) return refused("invalid", t.invalid);
        return {
          result: { ok: true, message: t.numberingSaved, outlineId, revision: outline.revision },
          next: { ...outline, numbering: parsed.data },
          change: { type: "outline.numbering", payload: { numbering: parsed.data } },
        };
      }),
  };
}

/**
 * A waiting change with a newer one of the same kind folded in: the newer
 * fields, and what they were before the first of the two (`base`).
 */
function folded(last: MutationRecord, payload: unknown): unknown {
  const before = last.payload as Record<string, unknown> & { base?: Record<string, unknown> };
  const after = payload as Record<string, unknown> & { base?: unknown };
  if (last.type === "outline.entry.update") {
    const newer = (after.base ?? {}) as Record<string, unknown>;
    return { ...before, ...after, base: { ...newer, ...(before.base ?? {}) } };
  }
  if (last.type === "outline.entry.references") {
    return { ...after, base: before.base };
  }
  return after;
}
