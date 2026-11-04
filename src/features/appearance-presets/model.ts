import { z } from "zod";

import {
  appearanceSnapshotSchema,
  materialize,
  type AppearanceSnapshot,
} from "@/features/editor-lab/styles/snapshot";
import { toPlainJson, type JsonValue } from "@/features/sermon-editor/persistence/json";
import { builtinPresetIds, type BuiltinPresetId } from "./builtin";

/*
 * Personal appearance presets (A4.2B): the limits, the input schemas, and the
 * one way an appearance becomes something that may be stored. Pure: no
 * database, no account, no React. The snapshot contract itself is A4.2A's
 * (`editor-lab/styles/snapshot.ts`) and is not repeated here.
 */

export const presetLimits = {
  /** A name's length after trimming, in characters (code points, as PostgreSQL counts). */
  name: 80,
  /**
   * The stored appearance's size, in UTF-8 bytes of PostgreSQL's own text of
   * the jsonb (`octet_length(appearance::text)`, the table's CHECK). That text
   * is never shorter than compact JSON, so `prepareAppearance` refuses here
   * only what the table would refuse too, and the CHECK decides the rest.
   */
  bytes: 65_536,
  /** Presets one account may keep. */
  perAccount: 100,
  pageSize: 25,
  maxPageSize: 100,
  /**
   * How long a create or duplicate is remembered for its retry, at least.
   * Older records are removed by the account's next create, so one may live
   * longer; a retry later than this may be carried out again.
   */
  retentionDays: 30,
} as const;

/** The largest revision a request may name (PostgreSQL `integer`). */
const maxRevision = 2_147_483_647;

/** Characters a name may not hold: controls and line or paragraph separators. */
const forbiddenInName = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const codePoints = (value: string) => [...value].length;

/**
 * A preset's name: trimmed, 1 to 80 characters, on one line. Case is kept as
 * written; uniqueness ignores case only as PostgreSQL's `lower()` does, and
 * nothing folds accents or other characters.
 */
export const presetNameSchema = z
  .string()
  .max(presetLimits.name * 4)
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .refine((value) => codePoints(value) <= presetLimits.name, "too_long")
      .refine((value) => !forbiddenInName.test(value), "forbidden_character"),
  );

export const presetIdSchema = z.uuid();
export const operationIdSchema = z.uuid();
export const revisionSchema = z.number().int().min(1).max(maxRevision);

export const createPresetInput = z
  .object({ operationId: operationIdSchema, name: presetNameSchema, appearance: z.unknown() })
  .strict();
export const duplicatePresetInput = z
  .object({ operationId: operationIdSchema, sourceId: presetIdSchema, name: presetNameSchema })
  .strict();
export const renamePresetInput = z
  .object({ id: presetIdSchema, expectedRevision: revisionSchema, name: presetNameSchema })
  .strict();
export const replacePresetInput = z
  .object({ id: presetIdSchema, expectedRevision: revisionSchema, appearance: z.unknown() })
  .strict();
export const deletePresetInput = z
  .object({ id: presetIdSchema, expectedRevision: revisionSchema })
  .strict();
export const listPresetsInput = z
  .object({
    page: z.number().int().min(1).max(maxRevision).default(1),
    pageSize: z.number().int().min(1).max(presetLimits.maxPageSize).default(presetLimits.pageSize),
    withAppearance: z.boolean().default(false),
  })
  .strict();

/** An account's default: a built-in preset, or one of its own. */
export type DefaultTarget =
  { kind: "builtin"; preset: BuiltinPresetId } | { kind: "personal"; presetId: string };

export const defaultTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), preset: z.enum(builtinPresetIds) }).strict(),
  z.object({ kind: z.literal("personal"), presetId: presetIdSchema }).strict(),
]);
export const setDefaultInput = z
  .object({ target: defaultTargetSchema, expectedRevision: revisionSchema })
  .strict();

/* The appearance */

export type PreparedAppearance =
  | { ok: true; snapshot: AppearanceSnapshot; bytes: number }
  | { ok: false; code: "invalid" | "too_large"; bytes?: number };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether `input` holds anything the schema's output left out. The snapshot
 * schema is strict, but the numbering schema it includes drops a key it does
 * not know; a preset refuses one instead of storing less than was sent. A
 * default the schema filled in is not a difference.
 */
export function hasUnknownKeys(input: unknown, parsed: unknown): boolean {
  if (Array.isArray(input)) {
    if (!Array.isArray(parsed) || parsed.length !== input.length) return true;
    return input.some((item, index) => hasUnknownKeys(item, parsed[index]));
  }
  if (isPlainObject(input)) {
    if (!isPlainObject(parsed)) return true;
    return Object.keys(input).some(
      (key) => !Object.hasOwn(parsed, key) || hasUnknownKeys(input[key], parsed[key]),
    );
  }
  return false;
}

const utf8 = new TextEncoder();
/** Compact JSON's size: never more than what PostgreSQL stores for it. */
export const compactBytes = (value: JsonValue) => utf8.encode(JSON.stringify(value)).length;

/** Parses a plain JSON value as a snapshot, refusing anything left over. */
function strictSnapshot(value: JsonValue): AppearanceSnapshot | null {
  const parsed = appearanceSnapshotSchema.safeParse(value);
  if (!parsed.success || hasUnknownKeys(value, parsed.data)) return null;
  return parsed.data as AppearanceSnapshot;
}

/**
 * What a create or a replacement stores: the snapshot sent, as plain JSON,
 * parsed strictly (an unsupported version or built-in revision, an unknown or
 * forbidden property, or a value out of bounds is `invalid`), materialized
 * so it keeps its look whatever later built-in revisions do, parsed again,
 * and measured. Nothing is repaired or dropped. `limit` is for tests only:
 * no snapshot the schema admits comes near the real one (`model.test.ts`).
 */
export function prepareAppearance(
  input: unknown,
  limit: number = presetLimits.bytes,
): PreparedAppearance {
  const plain = toPlainJson(input);
  if (!plain.ok) return { ok: false, code: "invalid" };
  const snapshot = strictSnapshot(plain.value);
  if (!snapshot) return { ok: false, code: "invalid" };

  const stored = toPlainJson(materialize(snapshot));
  if (!stored.ok) return { ok: false, code: "invalid" };
  const materialized = strictSnapshot(stored.value);
  if (!materialized) return { ok: false, code: "invalid" };

  const bytes = compactBytes(stored.value);
  if (bytes > limit) return { ok: false, code: "too_large", bytes };
  return { ok: true, snapshot: materialized, bytes };
}

/**
 * A stored appearance as it is read: the same strict snapshot, or null when
 * it does not parse (written by a later version, or damaged). Never repaired.
 */
export function readStoredAppearance(stored: unknown): AppearanceSnapshot | null {
  const plain = toPlainJson(stored);
  return plain.ok ? strictSnapshot(plain.value) : null;
}

/* Operations */

/** JSON with every object's keys in order: the same request is the same text. */
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** What an operation asked for, as its fingerprint is taken. */
export type OperationRequest =
  | { kind: "create"; name: string; appearance: AppearanceSnapshot }
  | { kind: "duplicate"; sourceId: string; name: string };

export const operationKinds = ["create", "duplicate"] as const;
