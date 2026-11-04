import { and, eq, sql } from "drizzle-orm";

import { appearancePresets, users, type AppUser } from "@/db/schema";
import { isForeignKeyViolation, type Database } from "@/db/types";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { fallbackBuiltinPreset, type BuiltinPresetId } from "./builtin";
import type { DefaultTarget } from "./model";
import { readStoredAppearance } from "./model";
import { lockAccount } from "./presets";

/*
 * An account's default appearance (A4.2B): built-in Minimal, Balanced, or
 * Expressive, or one of its own presets, exactly one of the two (the table's
 * CHECK). Balanced for every account that chose nothing else. A4.2C copies
 * what it resolves to into a new outline's document; it is never a live link,
 * and changing it restyles no document.
 *
 * A change locks the account's row first and the preset's second, as every
 * preset change does (`presets.ts`), and names the default revision it was
 * made against.
 */

export type AccountDefault = { target: DefaultTarget; revision: number };

type DefaultColumns = Pick<
  AppUser,
  | "defaultBuiltinAppearancePreset"
  | "defaultPersonalAppearancePresetId"
  | "appearanceDefaultRevision"
>;

/** The default as a row says it: what a request's own account row already holds. */
export function accountDefaultOf(row: DefaultColumns): AccountDefault {
  const target: DefaultTarget = row.defaultPersonalAppearancePresetId
    ? { kind: "personal", presetId: row.defaultPersonalAppearancePresetId }
    : { kind: "builtin", preset: row.defaultBuiltinAppearancePreset ?? fallbackBuiltinPreset };
  return { target, revision: row.appearanceDefaultRevision };
}

export async function getAccountDefault(
  db: Database,
  ownerId: string,
): Promise<AccountDefault | null> {
  const [row] = await db
    .select({
      defaultBuiltinAppearancePreset: users.defaultBuiltinAppearancePreset,
      defaultPersonalAppearancePresetId: users.defaultPersonalAppearancePresetId,
      appearanceDefaultRevision: users.appearanceDefaultRevision,
    })
    .from(users)
    .where(eq(users.id, ownerId));
  return row ? accountDefaultOf(row) : null;
}

export type SetDefaultOutcome =
  | { status: "updated"; default: AccountDefault }
  | { status: "unchanged"; default: AccountDefault }
  | { status: "conflict"; default: AccountDefault }
  | { status: "not_found" }
  | { status: "account_unavailable" };

const sameTarget = (a: DefaultTarget, b: DefaultTarget) =>
  a.kind === "builtin"
    ? b.kind === "builtin" && a.preset === b.preset
    : b.kind === "personal" && a.presetId.toLowerCase() === b.presetId.toLowerCase();

/**
 * Makes `target` the account's default, against `expectedRevision`. A stale
 * revision is `conflict` and writes nothing, even when the target is already
 * the default; the target already chosen at the revision named is
 * `unchanged`, with no write. A personal preset must be the account's and
 * still exist: it is held (`FOR KEY SHARE`) until the change commits, so a
 * delete cannot slip between, and the composite key refuses it regardless.
 */
export async function setAccountDefault(
  db: Database,
  ownerId: string,
  input: { target: DefaultTarget; expectedRevision: number },
): Promise<SetDefaultOutcome> {
  try {
    return await db.transaction(async (tx): Promise<SetDefaultOutcome> => {
      const account = await lockAccount(tx, ownerId);
      if (!account) return { status: "account_unavailable" };
      const current = accountDefaultOf({
        defaultBuiltinAppearancePreset: account.defaultBuiltin,
        defaultPersonalAppearancePresetId: account.defaultPersonal,
        appearanceDefaultRevision: account.defaultRevision,
      });
      if (current.revision !== input.expectedRevision)
        return { status: "conflict", default: current };
      if (sameTarget(current.target, input.target))
        return { status: "unchanged", default: current };

      if (input.target.kind === "personal") {
        const [preset] = await tx
          .select({ id: appearancePresets.id })
          .from(appearancePresets)
          .where(
            and(
              eq(appearancePresets.id, input.target.presetId),
              eq(appearancePresets.ownerId, ownerId),
            ),
          )
          .for("key share");
        if (!preset) return { status: "not_found" };
      }

      const [row] = await tx
        .update(users)
        .set({
          ...(input.target.kind === "builtin"
            ? {
                defaultBuiltinAppearancePreset: input.target.preset,
                defaultPersonalAppearancePresetId: null,
              }
            : {
                defaultBuiltinAppearancePreset: null,
                defaultPersonalAppearancePresetId: input.target.presetId,
              }),
          appearanceDefaultRevision: sql`${users.appearanceDefaultRevision} + 1`,
        })
        .where(
          and(eq(users.id, ownerId), eq(users.appearanceDefaultRevision, input.expectedRevision)),
        )
        .returning({
          defaultBuiltinAppearancePreset: users.defaultBuiltinAppearancePreset,
          defaultPersonalAppearancePresetId: users.defaultPersonalAppearancePresetId,
          appearanceDefaultRevision: users.appearanceDefaultRevision,
        });
      if (!row) return { status: "conflict", default: current };
      return { status: "updated", default: accountDefaultOf(row) };
    });
  } catch (error) {
    // The composite key, after the transaction ended: the preset is not the account's.
    if (isForeignKeyViolation(error)) return { status: "not_found" };
    throw error;
  }
}

/** Puts the account back on built-in Balanced. */
export function clearAccountDefault(db: Database, ownerId: string, expectedRevision: number) {
  return setAccountDefault(db, ownerId, {
    target: { kind: "builtin", preset: fallbackBuiltinPreset },
    expectedRevision,
  });
}

export type ResolvedDefault =
  | { source: "builtin"; preset: BuiltinPresetId; revision: number }
  | { source: "personal"; presetId: string; snapshot: AppearanceSnapshot; revision: number }
  | { source: "unreadable"; presetId: string; revision: number };

/**
 * What a new outline would start from (A4.2C's entry point; nothing calls it
 * yet): the built-in preset, or the personal preset's validated snapshot to
 * copy. One read. A personal default that does not parse is `unreadable`,
 * never quietly replaced.
 */
export async function resolveAccountDefault(
  db: Database,
  ownerId: string,
): Promise<ResolvedDefault | null> {
  const [row] = await db
    .select({
      defaultBuiltinAppearancePreset: users.defaultBuiltinAppearancePreset,
      defaultPersonalAppearancePresetId: users.defaultPersonalAppearancePresetId,
      appearanceDefaultRevision: users.appearanceDefaultRevision,
      appearance: appearancePresets.appearance,
    })
    .from(users)
    .leftJoin(
      appearancePresets,
      and(
        eq(appearancePresets.id, users.defaultPersonalAppearancePresetId),
        eq(appearancePresets.ownerId, users.id),
      ),
    )
    .where(eq(users.id, ownerId));
  if (!row) return null;
  const { target, revision } = accountDefaultOf(row);
  if (target.kind === "builtin") return { source: "builtin", preset: target.preset, revision };
  const snapshot = readStoredAppearance(row.appearance);
  return snapshot
    ? { source: "personal", presetId: target.presetId, snapshot, revision }
    : { source: "unreadable", presetId: target.presetId, revision };
}
