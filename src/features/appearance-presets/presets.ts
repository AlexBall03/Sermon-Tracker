import { createHash } from "node:crypto";
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";

import { appearancePresetOperations, appearancePresets, users } from "@/db/schema";
import { isCheckViolation, isUniqueViolation, violatedConstraint, type Database } from "@/db/types";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { needsOnboarding } from "@/features/onboarding/model";
import { jsonEqual } from "@/features/sermon-editor/persistence/autosave/model";
import type { JsonValue } from "@/features/sermon-editor/persistence/json";
import { builtinPresetIds, fallbackBuiltinPreset, type BuiltinPresetId } from "./builtin";
import {
  canonicalJson,
  prepareAppearance,
  presetLimits,
  presetNameSchema,
  readStoredAppearance,
  type OperationRequest,
} from "./model";

/*
 * An account's own appearance presets (A4.2B). Every statement names the
 * owner in its WHERE clause, and a preset of another account is answered
 * exactly as one that does not exist.
 *
 * Every change runs in one transaction that locks the account's `users` row
 * first (`FOR NO KEY UPDATE`) and then, where it needs one, the preset's row:
 * one order everywhere, so two changes never wait on each other in a cycle.
 * Holding the account row also puts an account's changes one after another
 * (which is what keeps the count limit true under parallel creates) and
 * against `requestDeletion`, whose `UPDATE` of the same row waits for it or
 * is waited for: the status is checked again under the lock, so nothing is
 * made for an account being deleted. Reads take no lock.
 *
 * A refusal by a constraint aborts the transaction; it is mapped to an answer
 * only after the transaction has ended (`constraintOutcome`), never with more SQL in it.
 */

export type PresetMeta = {
  id: string;
  name: string;
  revision: number;
  /** The built-in preset the appearance was made over, for a list to show. */
  basePreset: BuiltinPresetId | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Preset = PresetMeta & { appearance: AppearanceSnapshot };

export type Unavailable = { status: "account_unavailable" };
export type NotFound = { status: "not_found" };
export type Conflict = { status: "conflict"; revision: number };
export type Invalid = { status: "invalid" } | { status: "too_large"; bytes?: number };

export type CreateOutcome =
  | { status: "created"; replayed: boolean; id: string; preset: PresetMeta | null }
  | { status: "duplicate_name" }
  | { status: "limit_reached"; limit: number }
  | { status: "operation_reused" }
  | Invalid
  | Unavailable;

export type DuplicateOutcome = CreateOutcome | NotFound | { status: "unreadable" };

export type ChangeOutcome =
  | { status: "updated"; preset: PresetMeta }
  | { status: "unchanged"; preset: PresetMeta }
  | { status: "duplicate_name" }
  | Conflict
  | NotFound
  | Invalid
  | Unavailable;

export type DeleteOutcome =
  | { status: "deleted"; defaultReset: boolean; defaultRevision: number }
  | Conflict
  | NotFound
  | Unavailable;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const basePreset = (value: unknown): BuiltinPresetId | null =>
  builtinPresetIds.find((id) => id === value) ?? null;

const metaColumns = {
  id: appearancePresets.id,
  name: appearancePresets.name,
  revision: appearancePresets.revision,
  base: sql<string | null>`${appearancePresets.appearance}->>'preset'`,
  createdAt: appearancePresets.createdAt,
  updatedAt: appearancePresets.updatedAt,
};

type MetaRow = {
  id: string;
  name: string;
  revision: number;
  base: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const toMeta = ({ base, ...row }: MetaRow): PresetMeta => ({
  ...row,
  basePreset: basePreset(base),
});

/** A SHA-256 of what an operation asked, keys in order and IDs in lower case. */
export function fingerprint(request: OperationRequest): string {
  const value: JsonValue =
    request.kind === "create"
      ? { kind: "create", name: request.name, appearance: request.appearance as JsonValue }
      : { kind: "duplicate", sourceId: request.sourceId.toLowerCase(), name: request.name };
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export type LockedAccount = {
  id: string;
  defaultBuiltin: BuiltinPresetId | null;
  defaultPersonal: string | null;
  defaultRevision: number;
};

/**
 * Locks the account's row for a change and says whether it may still make
 * one: active, and past first-time setup. `authorize("active")` asked before
 * the transaction; this asks again with the row held.
 */
export async function lockAccount(tx: Tx, ownerId: string): Promise<LockedAccount | null> {
  const [row] = await tx
    .select({
      id: users.id,
      status: users.status,
      onboardingStatus: users.onboardingStatus,
      defaultBuiltin: users.defaultBuiltinAppearancePreset,
      defaultPersonal: users.defaultPersonalAppearancePresetId,
      defaultRevision: users.appearanceDefaultRevision,
    })
    .from(users)
    .where(eq(users.id, ownerId))
    .for("no key update");
  if (!row || row.status !== "active" || needsOnboarding(row)) return null;
  return {
    id: row.id,
    defaultBuiltin: row.defaultBuiltin,
    defaultPersonal: row.defaultPersonal,
    defaultRevision: row.defaultRevision,
  };
}

/** A constraint's refusal, read after its transaction ended. */
export function constraintOutcome(
  error: unknown,
): { status: "duplicate_name" } | { status: "too_large" } | null {
  const constraint = violatedConstraint(error);
  if (isUniqueViolation(error) && constraint === "appearance_presets_owner_name_key") {
    return { status: "duplicate_name" };
  }
  if (isCheckViolation(error) && constraint === "appearance_presets_appearance_check") {
    return { status: "too_large" };
  }
  return null;
}

async function settle<T>(
  work: () => Promise<T>,
): Promise<T | ReturnType<typeof constraintOutcome>> {
  try {
    return await work();
  } catch (error) {
    const answer = constraintOutcome(error);
    if (answer) return answer;
    throw error;
  }
}

const nameTaken = async (tx: Tx, ownerId: string, name: string, except?: string) => {
  const [clash] = await tx
    .select({ id: appearancePresets.id })
    .from(appearancePresets)
    .where(
      and(
        eq(appearancePresets.ownerId, ownerId),
        sql`lower(${appearancePresets.name}) = lower(${name})`,
        except ? ne(appearancePresets.id, except) : undefined,
      ),
    )
    .limit(1);
  return Boolean(clash);
};

async function metaOf(db: Database | Tx, ownerId: string, id: string): Promise<PresetMeta | null> {
  const [row] = await db
    .select(metaColumns)
    .from(appearancePresets)
    .where(and(eq(appearancePresets.id, id), eq(appearancePresets.ownerId, ownerId)))
    .limit(1);
  return row ? toMeta(row) : null;
}

/**
 * Makes a preset from a request, once. An operation already carried out is
 * answered from the ledger with the preset it made (`replayed`, and `preset`
 * as it is now, or null if it was deleted since), and never carried out
 * again; the same operation ID with a different request is
 * `operation_reused`. Otherwise the name and the count are checked with the
 * account held, and the preset and its ledger row are written together.
 */
async function make(
  db: Database,
  ownerId: string,
  operationId: string,
  request: OperationRequest,
  appearanceOf: (tx: Tx) => Promise<AppearanceSnapshot | NotFound | { status: "unreadable" }>,
): Promise<DuplicateOutcome> {
  const print = fingerprint(request);
  const outcome = await settle(() =>
    db.transaction(async (tx): Promise<DuplicateOutcome> => {
      if (!(await lockAccount(tx, ownerId))) return { status: "account_unavailable" };

      const [done] = await tx
        .select()
        .from(appearancePresetOperations)
        .where(
          and(
            eq(appearancePresetOperations.ownerId, ownerId),
            eq(appearancePresetOperations.operationId, operationId),
          ),
        );
      if (done) {
        if (done.fingerprint !== print || done.kind !== request.kind) {
          return { status: "operation_reused" };
        }
        return {
          status: "created",
          replayed: true,
          id: done.presetId,
          preset: await metaOf(tx, ownerId, done.presetId),
        };
      }

      const appearance = await appearanceOf(tx);
      if ("status" in appearance) return appearance;
      if (await nameTaken(tx, ownerId, request.name)) return { status: "duplicate_name" };
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(appearancePresets)
        .where(eq(appearancePresets.ownerId, ownerId));
      if (total >= presetLimits.perAccount) {
        return { status: "limit_reached", limit: presetLimits.perAccount };
      }

      // Opportunistic: this account's records past retention go with its next create.
      await tx
        .delete(appearancePresetOperations)
        .where(
          and(
            eq(appearancePresetOperations.ownerId, ownerId),
            lt(
              appearancePresetOperations.createdAt,
              sql`now() - make_interval(days => ${presetLimits.retentionDays})`,
            ),
          ),
        );
      const [row] = await tx
        .insert(appearancePresets)
        .values({ ownerId, name: request.name, appearance })
        .returning(metaColumns);
      await tx.insert(appearancePresetOperations).values({
        ownerId,
        operationId,
        kind: request.kind,
        presetId: row.id,
        fingerprint: print,
      });
      return { status: "created", replayed: false, id: row.id, preset: toMeta(row) };
    }),
  );
  return outcome as DuplicateOutcome;
}

/** Saves a new preset of `appearance` (validated and materialized first) under `name`. */
export async function createPreset(
  db: Database,
  ownerId: string,
  input: { operationId: string; name: string; appearance: unknown },
): Promise<CreateOutcome> {
  const name = presetNameSchema.safeParse(input.name);
  if (!name.success) return { status: "invalid" };
  const prepared = prepareAppearance(input.appearance);
  if (!prepared.ok) {
    return prepared.code === "too_large"
      ? { status: "too_large", bytes: prepared.bytes }
      : { status: "invalid" };
  }
  const outcome = await make(
    db,
    ownerId,
    input.operationId,
    { kind: "create", name: name.data, appearance: prepared.snapshot },
    async () => prepared.snapshot,
  );
  return outcome as CreateOutcome;
}

/**
 * Saves a copy of one of the account's presets under a new name: a new
 * preset at revision 1 with its own copy of the appearance, the source left
 * as it is. A missing source and another account's are `not_found`.
 */
export async function duplicatePreset(
  db: Database,
  ownerId: string,
  input: { operationId: string; sourceId: string; name: string },
): Promise<DuplicateOutcome> {
  const name = presetNameSchema.safeParse(input.name);
  if (!name.success) return { status: "invalid" };
  return make(
    db,
    ownerId,
    input.operationId,
    { kind: "duplicate", sourceId: input.sourceId, name: name.data },
    async (tx) => {
      // Read with the account held, which every change to the source takes first.
      const [source] = await tx
        .select({ appearance: appearancePresets.appearance })
        .from(appearancePresets)
        .where(
          and(eq(appearancePresets.id, input.sourceId), eq(appearancePresets.ownerId, ownerId)),
        );
      if (!source) return { status: "not_found" };
      return readStoredAppearance(source.appearance) ?? { status: "unreadable" };
    },
  );
}

export type PresetPage = {
  items: (PresetMeta & { appearance?: AppearanceSnapshot | null })[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * One page of the account's presets, in name order, in one query. Without
 * `withAppearance` it reads no appearance (the base preset is read from
 * inside it by the database); with it, each one is validated and an
 * unreadable one is `null`.
 */
export async function listPresets(
  db: Database,
  ownerId: string,
  options: { page: number; pageSize: number; withAppearance?: boolean },
): Promise<PresetPage> {
  const pageSize = Math.min(Math.max(1, options.pageSize), presetLimits.maxPageSize);
  const page = Math.max(1, options.page);
  const rows = await db
    .select({
      ...metaColumns,
      total: sql<number>`count(*) over ()::int`,
      ...(options.withAppearance ? { appearance: appearancePresets.appearance } : {}),
    })
    .from(appearancePresets)
    .where(eq(appearancePresets.ownerId, ownerId))
    .orderBy(asc(sql`lower(${appearancePresets.name})`), asc(appearancePresets.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [count] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(appearancePresets)
      .where(eq(appearancePresets.ownerId, ownerId));
    total = count.total;
  }
  return {
    items: rows.map((row) => {
      const meta = toMeta({
        id: row.id,
        name: row.name,
        revision: row.revision,
        base: row.base,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      if (!options.withAppearance) return meta;
      const { appearance } = row as typeof row & { appearance?: unknown };
      return { ...meta, appearance: readStoredAppearance(appearance) };
    }),
    total,
    page,
    pageSize,
  };
}

export type GetOutcome =
  { status: "found"; preset: Preset } | { status: "unreadable"; preset: PresetMeta } | NotFound;

/** One preset with its appearance, validated as it is read. */
export async function getPreset(db: Database, ownerId: string, id: string): Promise<GetOutcome> {
  const [row] = await db
    .select({ ...metaColumns, appearance: appearancePresets.appearance })
    .from(appearancePresets)
    .where(and(eq(appearancePresets.id, id), eq(appearancePresets.ownerId, ownerId)))
    .limit(1);
  if (!row) return { status: "not_found" };
  const { appearance, ...meta } = row;
  const snapshot = readStoredAppearance(appearance);
  return snapshot
    ? { status: "found", preset: { ...toMeta(meta), appearance: snapshot } }
    : { status: "unreadable", preset: toMeta(meta) };
}

/** The preset's row, locked, after the account's: missing, stale, or current. */
async function lockPreset(
  tx: Tx,
  ownerId: string,
  id: string,
  expectedRevision: number,
): Promise<{ row: MetaRow & { appearance: unknown } } | NotFound | Conflict> {
  const [row] = await tx
    .select({ ...metaColumns, appearance: appearancePresets.appearance })
    .from(appearancePresets)
    .where(and(eq(appearancePresets.id, id), eq(appearancePresets.ownerId, ownerId)))
    .for("update");
  if (!row) return { status: "not_found" };
  if (row.revision !== expectedRevision) return { status: "conflict", revision: row.revision };
  return { row };
}

/**
 * Changes one column of a preset made against `expectedRevision`. A stale
 * revision is `conflict` even when the value asked for is already there, and
 * writes nothing; the value already there at the revision named is
 * `unchanged`, and writes nothing either. Otherwise the revision moves by one.
 */
async function change(
  db: Database,
  ownerId: string,
  id: string,
  expectedRevision: number,
  edit: { column: "name"; name: string } | { column: "appearance"; appearance: AppearanceSnapshot },
): Promise<ChangeOutcome> {
  const outcome = await settle(() =>
    db.transaction(async (tx): Promise<ChangeOutcome> => {
      if (!(await lockAccount(tx, ownerId))) return { status: "account_unavailable" };
      const current = await lockPreset(tx, ownerId, id, expectedRevision);
      if ("status" in current) return current;
      const { appearance: stored, ...meta } = current.row;

      if (edit.column === "name") {
        if (meta.name === edit.name) return { status: "unchanged", preset: toMeta(meta) };
        if (await nameTaken(tx, ownerId, edit.name, id)) return { status: "duplicate_name" };
      } else {
        // As jsonb compares: key order is not a difference.
        if (jsonEqual(stored as JsonValue, edit.appearance as JsonValue)) {
          return { status: "unchanged", preset: toMeta(meta) };
        }
      }

      const [row] = await tx
        .update(appearancePresets)
        .set({
          ...(edit.column === "name" ? { name: edit.name } : { appearance: edit.appearance }),
          revision: sql`${appearancePresets.revision} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(appearancePresets.id, id),
            eq(appearancePresets.ownerId, ownerId),
            eq(appearancePresets.revision, expectedRevision),
          ),
        )
        .returning(metaColumns);
      // The row is held, so this cannot miss; were it to, it is a conflict, never a write.
      if (!row) return { status: "conflict", revision: meta.revision };
      return { status: "updated", preset: toMeta(row) };
    }),
  );
  return outcome as ChangeOutcome;
}

/** Renames a preset. Its appearance is not touched. */
export function renamePreset(
  db: Database,
  ownerId: string,
  input: { id: string; expectedRevision: number; name: string },
): Promise<ChangeOutcome> {
  const name = presetNameSchema.safeParse(input.name);
  if (!name.success) return Promise.resolve({ status: "invalid" });
  return change(db, ownerId, input.id, input.expectedRevision, {
    column: "name",
    name: name.data,
  });
}

/** Replaces a preset's appearance (validated and materialized first). Its name is not touched. */
export async function replacePresetAppearance(
  db: Database,
  ownerId: string,
  input: { id: string; expectedRevision: number; appearance: unknown },
): Promise<ChangeOutcome> {
  const prepared = prepareAppearance(input.appearance);
  if (!prepared.ok) {
    return prepared.code === "too_large"
      ? { status: "too_large", bytes: prepared.bytes }
      : { status: "invalid" };
  }
  return change(db, ownerId, input.id, input.expectedRevision, {
    column: "appearance",
    appearance: prepared.snapshot,
  });
}

/**
 * Deletes a preset made against `expectedRevision`. When it is the account's
 * default, the default becomes built-in Balanced in the same transaction,
 * before the row goes; a stale revision changes neither. The composite key
 * from `users` refuses the delete outright if anything ever skipped that.
 */
export async function deletePreset(
  db: Database,
  ownerId: string,
  input: { id: string; expectedRevision: number },
): Promise<DeleteOutcome> {
  return db.transaction(async (tx): Promise<DeleteOutcome> => {
    const account = await lockAccount(tx, ownerId);
    if (!account) return { status: "account_unavailable" };
    const current = await lockPreset(tx, ownerId, input.id, input.expectedRevision);
    if ("status" in current) return current;

    let defaultRevision = account.defaultRevision;
    const defaultReset = account.defaultPersonal === current.row.id;
    if (defaultReset) {
      const [reset] = await tx
        .update(users)
        .set({
          defaultBuiltinAppearancePreset: fallbackBuiltinPreset,
          defaultPersonalAppearancePresetId: null,
          appearanceDefaultRevision: sql`${users.appearanceDefaultRevision} + 1`,
        })
        .where(eq(users.id, ownerId))
        .returning({ revision: users.appearanceDefaultRevision });
      defaultRevision = reset.revision;
    }
    await tx
      .delete(appearancePresets)
      .where(
        and(
          eq(appearancePresets.id, input.id),
          eq(appearancePresets.ownerId, ownerId),
          eq(appearancePresets.revision, input.expectedRevision),
        ),
      );
    return { status: "deleted", defaultReset, defaultRevision };
  });
}
