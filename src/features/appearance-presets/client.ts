import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import type { DefaultTarget } from "./model";
import { presetLimits, prepareAppearance } from "./model";
import type {
  DefaultActionResult,
  PresetActionResult,
  createAppearancePreset,
  deleteAppearancePreset,
  duplicateAppearancePreset,
  getAppearanceDefault,
  getAppearancePreset,
  renameAppearancePreset,
  replaceAppearancePresetAppearance,
  setAppearanceDefault,
} from "./actions";
import { settledDelete, settledRename, settledReplace, type Settled } from "./reconcile";

/*
 * The browser's side of a preset change (A4.2C): one place that sends each
 * change and decides what an answer that never came means. Settings' My
 * Presets and Outline Settings both send through here. Nothing is retried by
 * itself (A4.2B: no automatic retry, no queue); "Try again" resends exactly
 * what was sent.
 *
 * - A create or duplicate is an `Intent`: its payload and `operationId` are
 *   fixed when the person presses the button, and a retry sends the same
 *   object. Within the ledger's guaranteed retention (30 days from the first
 *   send) that is safe: the server answers it from the ledger. Past it, the
 *   same request is refused here and the person is sent to the list.
 * - A rename, replace, delete, or default change is never resent blindly.
 *   After a lost or failed answer it is read back (`getAppearancePreset`,
 *   `getAppearanceDefault`) and judged (`reconcile.ts`): `applied`,
 *   `not_applied` (the same request, at the same revision, may be tried
 *   again), or `superseded` (something changed it since: shown as it is).
 *
 * A thrown call and a `failed` answer are both uncertain: the server may have
 * committed before the answer was lost.
 */

export type PresetActions = {
  create: typeof createAppearancePreset;
  duplicate: typeof duplicateAppearancePreset;
  get: typeof getAppearancePreset;
  rename: typeof renameAppearancePreset;
  replace: typeof replaceAppearancePresetAppearance;
  remove: typeof deleteAppearancePreset;
  getDefault: typeof getAppearanceDefault;
  setDefault: typeof setAppearanceDefault;
};

const day = 24 * 60 * 60 * 1000;

/** A create or duplicate, fixed when the person asked for it. */
export type Intent =
  | {
      kind: "create";
      startedAt: number;
      payload: { operationId: string; name: string; appearance: AppearanceSnapshot };
    }
  | {
      kind: "duplicate";
      startedAt: number;
      payload: { operationId: string; sourceId: string; name: string };
    };

export function createIntent(
  name: string,
  appearance: AppearanceSnapshot,
  now = Date.now(),
): Intent {
  return Object.freeze({
    kind: "create",
    startedAt: now,
    payload: Object.freeze({
      operationId: crypto.randomUUID(),
      name,
      appearance: structuredClone(appearance),
    }),
  }) as Intent;
}

export function duplicateIntent(sourceId: string, name: string, now = Date.now()): Intent {
  return Object.freeze({
    kind: "duplicate",
    startedAt: now,
    payload: Object.freeze({ operationId: crypto.randomUUID(), sourceId, name }),
  }) as Intent;
}

/** Whether the ledger is still guaranteed to answer this intent again. */
export const retryable = (intent: Intent, now = Date.now()) =>
  now - intent.startedAt < presetLimits.retentionDays * day;

/** What became of a send, for the screen to say. */
export type Sent<R> =
  | { status: "done"; result: R }
  /** The server answered and refused; `result` says why. */
  | { status: "refused"; result: R }
  /** No answer could be trusted, and nothing proves what happened. Try again sends the same. */
  | { status: "uncertain" }
  /** Read back after a lost answer. */
  | {
      status: "settled";
      settled: Settled;
      current: PresetActionResult | DefaultActionResult | null;
    }
  /** A create or duplicate too old to resend safely. */
  | { status: "expired" };

const call = async <R extends { ok: boolean; code?: string }>(run: () => Promise<R>) => {
  try {
    const result = await run();
    return result.ok || result.code !== "failed" ? result : null;
  } catch {
    return null;
  }
};

/** Sends a create or duplicate; on a lost answer, `uncertain` (send the same intent again). */
export async function sendIntent(
  actions: PresetActions,
  intent: Intent,
  now = Date.now(),
): Promise<Sent<PresetActionResult>> {
  if (!retryable(intent, now)) return { status: "expired" };
  const result = await call(() =>
    intent.kind === "create" ? actions.create(intent.payload) : actions.duplicate(intent.payload),
  );
  if (!result) return { status: "uncertain" };
  return result.ok ? { status: "done", result } : { status: "refused", result };
}

type Read = { revision: number; name: string; appearance?: AppearanceSnapshot } | null;

/** The preset as a fresh read says it is, or undefined when even the read failed. */
async function readBack(
  actions: PresetActions,
  id: string,
): Promise<{ read: Read; result: PresetActionResult | null } | undefined> {
  const result = await call(() => actions.get(id));
  if (!result) return undefined;
  if (result.ok && result.preset) {
    return {
      read: {
        revision: result.preset.revision,
        name: result.preset.name,
        appearance: result.appearance,
      },
      result,
    };
  }
  if (result.code === "not_found") return { read: null, result: null };
  if (result.code === "unreadable" && result.preset) {
    return { read: { revision: result.preset.revision, name: result.preset.name }, result };
  }
  return undefined;
}

export type RenameSent = { id: string; expectedRevision: number; name: string };
export type ReplaceSent = { id: string; expectedRevision: number; appearance: AppearanceSnapshot };
export type DeleteSent = { id: string; expectedRevision: number };

export async function sendRename(
  actions: PresetActions,
  sent: RenameSent,
): Promise<Sent<PresetActionResult>> {
  const result = await call(() => actions.rename(sent));
  if (result) return result.ok ? { status: "done", result } : { status: "refused", result };
  const back = await readBack(actions, sent.id);
  if (!back) return { status: "uncertain" };
  // Names are compared as the server stores them: trimmed.
  return {
    status: "settled",
    settled: settledRename({ ...sent, name: sent.name.trim() }, back.read),
    current: back.result,
  };
}

export async function sendReplace(
  actions: PresetActions,
  sent: ReplaceSent,
): Promise<Sent<PresetActionResult>> {
  const result = await call(() => actions.replace(sent));
  if (result) return result.ok ? { status: "done", result } : { status: "refused", result };
  const back = await readBack(actions, sent.id);
  if (!back) return { status: "uncertain" };
  // What the server stores is the materialized form: compare with that.
  const prepared = prepareAppearance(sent.appearance);
  if (!prepared.ok) return { status: "uncertain" };
  return {
    status: "settled",
    settled: settledReplace(
      { expectedRevision: sent.expectedRevision, appearance: prepared.snapshot },
      back.read,
    ),
    current: back.result,
  };
}

export async function sendDelete(
  actions: PresetActions,
  sent: DeleteSent,
): Promise<Sent<PresetActionResult>> {
  const result = await call(() => actions.remove(sent));
  if (result) return result.ok ? { status: "done", result } : { status: "refused", result };
  const back = await readBack(actions, sent.id);
  if (!back) return { status: "uncertain" };
  return { status: "settled", settled: settledDelete(sent, back.read), current: back.result };
}

export type DefaultSent = { target: DefaultTarget; expectedRevision: number };

const sameTarget = (a: DefaultTarget, b: DefaultTarget) =>
  a.kind === "builtin"
    ? b.kind === "builtin" && a.preset === b.preset
    : b.kind === "personal" && a.presetId.toLowerCase() === b.presetId.toLowerCase();

/**
 * A default change. After a lost answer the default is read again: success
 * only when it names the target at exactly the next revision; still at the
 * revision sent is `not_applied`; anything else is `superseded`.
 */
export async function sendDefault(
  actions: PresetActions,
  sent: DefaultSent,
): Promise<Sent<DefaultActionResult>> {
  const result = await call(() => actions.setDefault(sent));
  if (result) return result.ok ? { status: "done", result } : { status: "refused", result };
  const back = await call(() => actions.getDefault());
  if (!back?.ok || !back.default) return { status: "uncertain" };
  const now = back.default;
  const settled: Settled =
    now.revision === sent.expectedRevision + 1 && sameTarget(now.target, sent.target)
      ? "applied"
      : now.revision === sent.expectedRevision
        ? "not_applied"
        : "superseded";
  return { status: "settled", settled, current: back };
}
