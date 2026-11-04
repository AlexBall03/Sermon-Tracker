"use server";

import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { failure } from "@/features/sermon-editor/persistence/failure";
import { dictionary, formatNumber, type Dictionaries } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { accountDefaultOf, setAccountDefault, type AccountDefault } from "./defaults";
import {
  createPresetInput,
  deletePresetInput,
  duplicatePresetInput,
  listPresetsInput,
  presetIdSchema,
  presetLimits,
  renamePresetInput,
  replacePresetInput,
  setDefaultInput,
} from "./model";
import * as service from "./presets";
import type { PresetMeta, PresetPage } from "./presets";

/*
 * The actions over personal appearance presets (A4.2B), for A4.2C's screens.
 * Each one authorises itself (`authorize("active")`), takes the owner from
 * the session, and parses its whole input before any database work; nothing
 * it accepts can name an account. A missing preset and another account's are
 * the same `not_found`. Nothing is revalidated (no page shows presets yet),
 * nothing is queued offline: a change needs the server, and a failure is an
 * answer the person sees. A failure is logged as its kind and code only
 * (`failure`), never with a name or an appearance.
 *
 * After an answer that never came, a create or duplicate is sent again with
 * the same `operationId`; anything else is read back (`getAppearancePreset`)
 * and judged with `reconcile.ts`, never sent again blindly.
 */

export type PresetActionCode =
  | "unauthorized"
  | "invalid"
  | "too_large"
  | "not_found"
  | "unreadable"
  | "conflict"
  | "duplicate_name"
  | "limit_reached"
  | "operation_reused"
  | "account_unavailable"
  | "failed";

export type PresetActionResult = ActionResult & {
  code?: PresetActionCode;
  /** The preset as it now is (null after a replayed create whose preset was deleted since). */
  preset?: PresetMeta | null;
  /** For a create or duplicate: the preset made, and whether this answer is a repeat. */
  id?: string;
  replayed?: boolean;
  /** For `get`. */
  appearance?: AppearanceSnapshot;
  /** For `conflict`: the revision now stored. */
  revision?: number;
  /** For `unchanged`: true when nothing was written. */
  unchanged?: boolean;
  /** For a delete: whether the account's default went back to Balanced, and its revision. */
  defaultReset?: boolean;
  defaultRevision?: number;
  /** For `too_large` and `limit_reached`. */
  limit?: number;
};

export type PresetListResult = ActionResult & { code?: PresetActionCode; page?: PresetPage };

export type DefaultActionResult = ActionResult & {
  code?: PresetActionCode;
  default?: AccountDefault;
  unchanged?: boolean;
};

type Messages = Dictionaries["appearancePresets"]["actions"];

async function context() {
  const locale = await getLocale();
  return { locale, t: dictionary(locale, "appearancePresets").actions };
}

const refused = (
  code: PresetActionCode,
  message: string,
  extra: Partial<PresetActionResult & DefaultActionResult> = {},
) => ({ ...extra, ok: false, code, message });

async function actor() {
  const access = await authorize("active");
  return access.ok ? access : { ...access, code: "unauthorized" as const };
}

function kilobytes(locale: Awaited<ReturnType<typeof context>>["locale"]) {
  return `${formatNumber(locale, presetLimits.bytes / 1024)} KB`;
}

type Common =
  | { status: "duplicate_name" }
  | { status: "limit_reached"; limit: number }
  | { status: "operation_reused" }
  | { status: "invalid" }
  | { status: "too_large"; bytes?: number }
  | { status: "account_unavailable" }
  | { status: "not_found" }
  | { status: "unreadable" }
  | { status: "conflict"; revision: number };

function refusal(
  outcome: Common,
  { locale, t }: { locale: Awaited<ReturnType<typeof context>>["locale"]; t: Messages },
): PresetActionResult {
  switch (outcome.status) {
    case "duplicate_name":
      return refused("duplicate_name", t.duplicateName);
    case "limit_reached":
      return refused("limit_reached", t.limitReached(formatNumber(locale, outcome.limit)), {
        limit: outcome.limit,
      });
    case "operation_reused":
      return refused("operation_reused", t.operationReused);
    case "invalid":
      return refused("invalid", t.invalidAppearance);
    case "too_large":
      return refused("too_large", t.tooLarge(kilobytes(locale)), { limit: presetLimits.bytes });
    case "account_unavailable":
      return refused("account_unavailable", t.accountUnavailable);
    case "not_found":
      return refused("not_found", t.notFound);
    case "unreadable":
      return refused("unreadable", t.unreadable);
    case "conflict":
      return refused("conflict", t.conflict, { revision: outcome.revision });
  }
}

/** Saves a new preset. Send it again with the same `operationId` if no answer came. */
export async function createAppearancePreset(input: unknown): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = createPresetInput.safeParse(input);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.createPreset(getDb(), access.user.id, parsed.data);
    if (outcome.status !== "created") return refusal(outcome, messages);
    return {
      ok: true,
      message: messages.t.created,
      id: outcome.id,
      preset: outcome.preset,
      replayed: outcome.replayed,
    };
  } catch (error) {
    console.error("Appearance preset create failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

/** Saves a copy of one of the account's presets under a new name. Safe to send again. */
export async function duplicateAppearancePreset(input: unknown): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = duplicatePresetInput.safeParse(input);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.duplicatePreset(getDb(), access.user.id, parsed.data);
    if (outcome.status !== "created") return refusal(outcome, messages);
    return {
      ok: true,
      message: messages.t.created,
      id: outcome.id,
      preset: outcome.preset,
      replayed: outcome.replayed,
    };
  } catch (error) {
    console.error("Appearance preset duplicate failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

/** One page of the account's presets, in name order; appearances only when asked for. */
export async function listAppearancePresets(input: unknown = {}): Promise<PresetListResult> {
  const access = await actor();
  if (!access.ok) return access;
  const { t } = await context();
  const parsed = listPresetsInput.safeParse(input ?? {});
  if (!parsed.success) return refused("invalid", t.invalid);

  try {
    const page = await service.listPresets(getDb(), access.user.id, parsed.data);
    return { ok: true, message: t.loaded, page };
  } catch (error) {
    console.error("Appearance preset list failed:", failure(error));
    return refused("failed", t.failed);
  }
}

/** One preset with its validated appearance. Also the read that settles an uncertain change. */
export async function getAppearancePreset(id: unknown): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = presetIdSchema.safeParse(id);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.getPreset(getDb(), access.user.id, parsed.data);
    if (outcome.status === "not_found") return refusal(outcome, messages);
    if (outcome.status === "unreadable") {
      return refused("unreadable", messages.t.unreadable, { preset: outcome.preset });
    }
    const { appearance, ...preset } = outcome.preset;
    return { ok: true, message: messages.t.loaded, preset, appearance };
  } catch (error) {
    console.error("Appearance preset read failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

function changed(
  outcome: service.ChangeOutcome,
  done: string,
  messages: Awaited<ReturnType<typeof context>>,
): PresetActionResult {
  if (outcome.status === "updated") return { ok: true, message: done, preset: outcome.preset };
  if (outcome.status === "unchanged") {
    return { ok: true, message: messages.t.unchanged, preset: outcome.preset, unchanged: true };
  }
  return refusal(outcome, messages);
}

/** Renames a preset made against `expectedRevision`. */
export async function renameAppearancePreset(input: unknown): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = renamePresetInput.safeParse(input);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.renamePreset(getDb(), access.user.id, parsed.data);
    return changed(outcome, messages.t.renamed, messages);
  } catch (error) {
    console.error("Appearance preset rename failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

/** Replaces a preset's appearance, made against `expectedRevision`. */
export async function replaceAppearancePresetAppearance(
  input: unknown,
): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = replacePresetInput.safeParse(input);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.replacePresetAppearance(getDb(), access.user.id, parsed.data);
    return changed(outcome, messages.t.replaced, messages);
  } catch (error) {
    console.error("Appearance preset update failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

/** Deletes a preset made against `expectedRevision`; the default falls back to Balanced with it. */
export async function deleteAppearancePreset(input: unknown): Promise<PresetActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const messages = await context();
  const parsed = deletePresetInput.safeParse(input);
  if (!parsed.success) return refused("invalid", messages.t.invalid);

  try {
    const outcome = await service.deletePreset(getDb(), access.user.id, parsed.data);
    if (outcome.status !== "deleted") return refusal(outcome, messages);
    return {
      ok: true,
      message: outcome.defaultReset ? messages.t.deletedDefault : messages.t.deleted,
      defaultReset: outcome.defaultReset,
      defaultRevision: outcome.defaultRevision,
    };
  } catch (error) {
    console.error("Appearance preset delete failed:", failure(error));
    return refused("failed", messages.t.failed);
  }
}

/** The account's default appearance, from the account row this request already read. */
export async function getAppearanceDefault(): Promise<DefaultActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const { t } = await context();
  return { ok: true, message: t.loaded, default: accountDefaultOf(access.user) };
}

/** Makes a built-in preset or one of the account's own its default, against `expectedRevision`. */
export async function setAppearanceDefault(input: unknown): Promise<DefaultActionResult> {
  const access = await actor();
  if (!access.ok) return access;
  const { t } = await context();
  const parsed = setDefaultInput.safeParse(input);
  if (!parsed.success) return refused("invalid", t.invalid);

  try {
    const outcome = await setAccountDefault(getDb(), access.user.id, parsed.data);
    switch (outcome.status) {
      case "updated":
        return { ok: true, message: t.defaultSaved, default: outcome.default };
      case "unchanged":
        return { ok: true, message: t.unchanged, default: outcome.default, unchanged: true };
      case "conflict":
        return refused("conflict", t.defaultConflict, { default: outcome.default });
      case "not_found":
        return refused("not_found", t.notFound);
      case "account_unavailable":
        return refused("account_unavailable", t.accountUnavailable);
    }
  } catch (error) {
    console.error("Appearance default change failed:", failure(error));
    return refused("failed", t.failed);
  }
}
