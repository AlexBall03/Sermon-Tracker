// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import {
  createIntent,
  duplicateIntent,
  retryable,
  sendDefault,
  sendDelete,
  sendIntent,
  sendRename,
  sendReplace,
  type PresetActions,
} from "./client";
import { prepareAppearance } from "./model";

/*
 * The browser's handling of preset answers (A4.2C): the same intent resent
 * after a lost create, and a read back (never a resend) after any other
 * change whose answer was lost.
 */

const appearance: AppearanceSnapshot = {
  version: 1,
  preset: "minimal",
  presetRevision: 2,
  numbering: { version: 1, preset: "decimal" },
};
const meta = (revision: number, name = "Mine") => ({
  id: "11111111-1111-4111-8111-111111111111",
  name,
  revision,
  basePreset: "minimal" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const lost = () => Promise.reject(new TypeError("Failed to fetch"));

function actions(overrides: Partial<PresetActions>): PresetActions {
  const never = () => {
    throw new Error("not expected");
  };
  return {
    create: never,
    duplicate: never,
    get: never,
    rename: never,
    replace: never,
    remove: never,
    getDefault: never,
    setDefault: never,
    ...overrides,
  } as PresetActions;
}

describe("a create or duplicate", () => {
  it("is fixed when asked for: its ID and payload never change, whatever is retried", async () => {
    const intent = createIntent("Mine", appearance);
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.payload)).toBe(true);
    const sent: unknown[] = [];
    const create = vi.fn(async (payload: unknown) => {
      sent.push(payload);
      if (sent.length === 1) throw new TypeError("Failed to fetch");
      return { ok: true, message: "Preset saved.", id: "x", replayed: true };
    });
    const a = actions({ create: create as never });
    expect(await sendIntent(a, intent)).toEqual({ status: "uncertain" });
    expect((await sendIntent(a, intent)).status).toBe("done");
    expect(sent[0]).toBe(sent[1]);
  });

  it("treats a `failed` answer as uncertain: it may have committed", async () => {
    const a = actions({
      duplicate: (async () => ({ ok: false, code: "failed", message: "" })) as never,
    });
    expect(
      await sendIntent(a, duplicateIntent("11111111-1111-4111-8111-111111111111", "Copy")),
    ).toEqual({
      status: "uncertain",
    });
  });

  it("is never resent once the ledger's retention may have passed", async () => {
    const intent = createIntent("Mine", appearance, 0);
    expect(retryable(intent, 29 * 86_400_000)).toBe(true);
    expect(retryable(intent, 30 * 86_400_000)).toBe(false);
    const create = vi.fn();
    expect(await sendIntent(actions({ create: create as never }), intent, 31 * 86_400_000)).toEqual(
      {
        status: "expired",
      },
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("passes a definite refusal through", async () => {
    const a = actions({
      create: (async () => ({ ok: false, code: "duplicate_name", message: "taken" })) as never,
    });
    expect(await sendIntent(a, createIntent("Mine", appearance))).toMatchObject({
      status: "refused",
      result: { code: "duplicate_name" },
    });
  });
});

describe("a change whose answer was lost is read back, never resent", () => {
  it("rename: applied, not applied, superseded", async () => {
    const sent = { id: meta(1).id, expectedRevision: 1, name: " New " };
    const rename = vi.fn(lost);
    for (const [read, expected] of [
      [meta(2, "New"), "applied"],
      [meta(1, "Mine"), "not_applied"],
      [meta(3, "Other"), "superseded"],
    ] as const) {
      const a = actions({
        rename: rename as never,
        get: (async () => ({ ok: true, message: "", preset: read, appearance })) as never,
      });
      expect(await sendRename(a, sent)).toMatchObject({ status: "settled", settled: expected });
    }
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it("replace compares with the stored, materialized form", async () => {
    const stored = prepareAppearance(appearance);
    if (!stored.ok) throw new Error("not prepared");
    const a = actions({
      replace: lost as never,
      get: (async () => ({
        ok: true,
        message: "",
        preset: meta(2),
        appearance: stored.snapshot,
      })) as never,
    });
    expect(await sendReplace(a, { id: meta(1).id, expectedRevision: 1, appearance })).toMatchObject(
      {
        status: "settled",
        settled: "applied",
      },
    );
  });

  it("delete: gone is applied", async () => {
    const a = actions({
      remove: lost as never,
      get: (async () => ({ ok: false, code: "not_found", message: "" })) as never,
    });
    expect(await sendDelete(a, { id: meta(1).id, expectedRevision: 1 })).toMatchObject({
      status: "settled",
      settled: "applied",
    });
  });

  it("stays uncertain when the read back fails too", async () => {
    const a = actions({ rename: lost as never, get: lost as never });
    expect(await sendRename(a, { id: meta(1).id, expectedRevision: 1, name: "x" })).toEqual({
      status: "uncertain",
    });
  });

  it("default: success only for the target at exactly the next revision", async () => {
    const target = { kind: "builtin", preset: "minimal" } as const;
    const read = (revision: number, preset: "minimal" | "balanced") =>
      actions({
        setDefault: lost as never,
        getDefault: (async () => ({
          ok: true,
          message: "",
          default: { target: { kind: "builtin", preset }, revision },
        })) as never,
      });
    expect(await sendDefault(read(3, "minimal"), { target, expectedRevision: 2 })).toMatchObject({
      settled: "applied",
    });
    expect(await sendDefault(read(2, "balanced"), { target, expectedRevision: 2 })).toMatchObject({
      settled: "not_applied",
    });
    expect(await sendDefault(read(4, "minimal"), { target, expectedRevision: 2 })).toMatchObject({
      settled: "superseded",
    });
    expect(await sendDefault(read(3, "balanced"), { target, expectedRevision: 2 })).toMatchObject({
      settled: "superseded",
    });
  });
});
