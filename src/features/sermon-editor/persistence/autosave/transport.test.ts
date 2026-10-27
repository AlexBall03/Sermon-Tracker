// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { documentV4, pointV4 } from "@/features/editor-lab/v4/fixtures";
import { actionTransport, type DocumentActions } from "./transport";

/* The transport over the Server Actions (A2.3B.2A): never throws, and no answer is uncertain. */

const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const content = documentV4([pointV4("p-1", "Grace", 1)]);
const request = { outlineId, content, expectedRevision: 8, sequence: 41 };

function transport(save: unknown, read: unknown = vi.fn()) {
  return actionTransport({ save, read } as unknown as DocumentActions);
}

describe("actionTransport.save", () => {
  it("sends the outline, the content, and the expected revision, never the sequence", async () => {
    const save = vi.fn(async () => ({ ok: true, message: "", revision: 9 }));
    const outcome = await transport(save).save(request);
    expect(save).toHaveBeenCalledWith(outlineId, content, 8);
    expect(outcome).toEqual({ kind: "confirmed", sequence: 41, revision: 9 });
  });

  it("takes a throw, nothing, or something that is not an answer as no answer", async () => {
    const answers = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => {
        throw new Error("sync");
      },
      async () => undefined,
      async () => null,
      async () => "<html>413</html>",
      async () => ({ message: "no ok" }),
    ];
    for (const answer of answers) {
      expect(await transport(answer).save(request)).toEqual({
        kind: "failed",
        sequence: 41,
        uncertain: true,
      });
    }
  });

  it("maps every answer through saveOutcome", async () => {
    const cases: [unknown, unknown][] = [
      [
        { ok: true, message: "" },
        { kind: "failed", uncertain: true },
      ],
      [
        { ok: false, message: "", code: "stale", revision: 12 },
        { kind: "conflict", code: "stale" },
      ],
      [
        { ok: false, message: "", code: "missing" },
        { kind: "conflict", code: "missing" },
      ],
      [
        { ok: false, message: "", code: "invalid", problems: [] },
        { kind: "refused", code: "invalid" },
      ],
      [
        { ok: false, message: "", code: "failed" },
        { kind: "failed", uncertain: true },
      ],
      [{ ok: false, message: "Sign in" }, { kind: "unauthorized" }],
    ];
    for (const [answer, expected] of cases) {
      expect(await transport(async () => answer).save(request)).toMatchObject({
        sequence: 41,
        ...(expected as object),
      });
    }
  });
});

describe("actionTransport.read", () => {
  it("maps answers through readOutcome and failures to failed", async () => {
    const found = transport(vi.fn(), async () => ({ ok: true, message: "", content, revision: 9 }));
    expect(await found.read(outlineId)).toEqual({ kind: "found", content, revision: 9 });
    const thrown = transport(vi.fn(), () => Promise.reject(new Error("offline")));
    expect(await thrown.read(outlineId)).toEqual({ kind: "failed" });
    const garbage = transport(vi.fn(), async () => 42);
    expect(await garbage.read(outlineId)).toEqual({ kind: "failed" });
    const missing = transport(vi.fn(), async () => ({ ok: false, message: "", code: "missing" }));
    expect(await missing.read(outlineId)).toEqual({ kind: "missing" });
  });
});
