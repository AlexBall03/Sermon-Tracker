import { describe, expect, it } from "vitest";

import {
  serverSaveStatus,
  type AutosaveState,
  type NetworkState,
} from "../persistence/autosave/model";
import { describeSave } from "./save-status";

/*
 * The save indicator's words (A3): one for each status `serverSaveStatus`
 * gives, "Saved" for `saved` only, and leaving guarded exactly while words
 * are not yet on this device.
 */

const local = (over: Partial<AutosaveState> = {}): AutosaveState =>
  ({
    changed: false,
    sequence: 2,
    localSequence: 2,
    confirmedSequence: 1,
    revision: 8,
    local: "idle",
    storageError: null,
    refusal: null,
    saving: null,
    refusalRecord: null,
    disposed: false,
    ...over,
  }) as AutosaveState;

const network = (over: Partial<NetworkState> = {}): NetworkState => ({
  phase: "idle",
  revision: 8,
  base: { revision: 8, provenance: "server", canonical: true },
  submission: null,
  confirmedSequence: 1,
  due: false,
  outcome: null,
  block: null,
  reading: false,
  retrying: false,
  reconciliation: null,
  online: true,
  waiting: false,
  recovery: null,
  ...over,
});

const cases: [string, AutosaveState, NetworkState][] = [
  ["saved", local({ sequence: 2, confirmedSequence: 2 }), network({ confirmedSequence: 2 })],
  [
    "unchanged",
    local({ changed: false, sequence: 0, localSequence: 0, confirmedSequence: 0 }),
    network(),
  ],
  ["pending", local({ changed: true, local: "scheduled" }), network()],
  ["local", local(), network()],
  ["saving", local(), network({ phase: "saving" })],
  ["waiting", local(), network({ phase: "scheduled" })],
  ["offline", local(), network({ online: false })],
  ["unresolved", local(), network({ phase: "reconciling" })],
  ["failed", local(), network({ phase: "failed" })],
  [
    "stalled",
    local(),
    network({
      phase: "failed",
      recovery: { kind: "save", retries: 5, limit: 5, status: "exhausted", delayMs: 0 },
    }),
  ],
  [
    "blocked",
    local(),
    network({ phase: "blocked", block: { reason: "conflict", origin: "server" } }),
  ],
  ["unprotected", local({ storageError: "quota", localSequence: 1 }), network()],
  ["attention", local({ refusal: { reason: "too_large", bytes: 9, limit: 3 } }), network()],
  ["disposed", local(), network({ phase: "disposed" })],
];

describe("describeSave", () => {
  it.each(cases)("says something fitting for %s", (expected, l, n) => {
    expect(serverSaveStatus(l, n)).toBe(expected);
    const view = describeSave(l, n);
    if (expected === "disposed") {
      expect(view).toBeNull();
      return;
    }
    expect(view?.status).toBe(expected);
    // "Saved" only when the server confirmed the current content.
    expect(view?.label === "saved").toBe(expected === "saved");
  });

  it("guards leaving only while words are not yet on this device", () => {
    for (const [status, l, n] of cases) {
      const view = describeSave(l, n);
      if (!view) continue;
      expect(view.guardLeaving, status).toBe(status === "pending" || status === "unprotected");
    }
    // A save scheduled after typing, while the words are still being written to the device.
    const typing = describeSave(
      local({ localSequence: 1, local: "writing" }),
      network({ phase: "scheduled" }),
    );
    expect(typing).toMatchObject({ label: "pending", guardLeaving: true, holdsWork: true });
  });

  it("holds the application update for anything not on the server or this device", () => {
    expect(describeSave(...(cases[0].slice(1) as [AutosaveState, NetworkState]))?.holdsWork).toBe(
      false,
    );
    expect(describeSave(local(), network())?.holdsWork).toBe(false);
    expect(describeSave(local(), network({ phase: "saving" }))?.holdsWork).toBe(true);
    expect(describeSave(local(), network({ online: false }))?.holdsWork).toBe(true);
  });

  it("offers only the action that applies, and none that runs by itself", () => {
    const view = (l: AutosaveState, n: NetworkState) => describeSave(l, n)?.action ?? null;
    expect(
      view(local(), network({ phase: "blocked", block: { reason: "conflict", origin: "server" } })),
    ).toBe("review");
    expect(
      view(
        local(),
        network({ phase: "blocked", block: { reason: "unauthorized", origin: "server" } }),
      ),
    ).toBe("signIn");
    expect(view(local({ storageError: "quota", localSequence: 1 }), network())).toBe("retryLocal");
    expect(view(...(cases[9].slice(1) as [AutosaveState, NetworkState]))).toBe("recover");
    // Retried by itself while a retry is scheduled; the person may once none is.
    expect(
      view(
        local(),
        network({
          phase: "failed",
          recovery: { kind: "save", retries: 1, limit: 5, status: "scheduled", delayMs: 1000 },
        }),
      ),
    ).toBeNull();
    expect(view(local(), network({ phase: "failed" }))).toBe("retry");
    expect(view(local(), network())).toBeNull();
  });

  it("says too large for a refusal the server or the device made for size", () => {
    const refused = network({
      phase: "blocked",
      block: { reason: "refused", origin: "server" },
      outcome: { kind: "refused", sequence: 2, code: "too_large" },
    });
    expect(describeSave(local(), refused)?.label).toBe("tooLarge");
  });
});

describe("never claiming the words are on the device before they are", () => {
  it("says pending, not offline or a conflict, while the newest words are still being written", () => {
    const writing = local({ changed: true, local: "writing" });
    expect(describeSave(writing, network({ online: false }))?.label).toBe("pending");
    expect(
      describeSave(
        writing,
        network({ phase: "blocked", block: { reason: "conflict", origin: "server" } }),
      )?.label,
    ).toBe("pending");
    // Once written, it says where they are.
    expect(describeSave(local(), network({ online: false }))?.label).toBe("offline");
  });

  it("says not kept when the device refused them, whatever the server is doing", () => {
    const refused = local({ storageError: "quota", localSequence: 1 });
    expect(describeSave(refused, network({ online: false }))).toMatchObject({
      label: "unprotected",
      action: "retryLocal",
      guardLeaving: true,
    });
  });
});
