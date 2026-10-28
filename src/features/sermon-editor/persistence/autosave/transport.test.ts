// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { documentV4, pointV4 } from "@/features/editor-lab/v4/fixtures";
import { documentTransport, type TransportDependencies } from "./transport";

/*
 * The real transport: saves through the Server Action (A2.3B.2A), reads
 * through a plain GET (A2.3B.2D). It never throws, and no answer is uncertain.
 */

const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const content = documentV4([pointV4("p-1", "Grace", 1)]);
const request = { outlineId, content, expectedRevision: 8, sequence: 41 };

function transport(save: unknown, fetch: unknown = vi.fn()) {
  return documentTransport({ save, fetch } as unknown as TransportDependencies);
}

const json = (status: number, body: unknown, type = "application/json") =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": type },
  });

/** A read answered by one response, with the fetch it was asked through. */
async function readWith(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn(typeof response === "function" ? response : async () => response);
  const save = vi.fn();
  const outcome = await transport(save, fetch).read(outlineId);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  return outcome;
}

describe("documentTransport.save", () => {
  it("sends the outline, the content, and the expected revision, never the sequence", async () => {
    const save = vi.fn(async () => ({ ok: true, message: "", revision: 9 }));
    const fetch = vi.fn();
    const outcome = await transport(save, fetch).save(request);
    expect(save).toHaveBeenCalledWith(outlineId, content, 8);
    expect(fetch).not.toHaveBeenCalled();
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

describe("documentTransport.read (A2.3B.2D)", () => {
  it("is one plain same-origin GET, never cached, never the read Server Action", async () => {
    const fetch = vi.fn(async () => json(200, { ok: true, message: "", content, revision: 9 }));
    const readAction = vi.fn();
    const t = documentTransport({
      save: vi.fn(),
      fetch,
      // Even handed one, the transport has no way to call a read action.
      read: readAction,
    } as unknown as TransportDependencies);
    expect(await t.read(outlineId)).toEqual({ kind: "found", content, revision: 9 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/sermon-documents/${outlineId}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    expect(readAction).not.toHaveBeenCalled();
  });

  it("puts the ID in the path encoded, so it can never name another address", async () => {
    const fetch = vi.fn(async () => json(400, { ok: false, message: "", code: "invalid" }));
    await transport(vi.fn(), fetch).read("../../x?y=1#z");
    expect(fetch).toHaveBeenCalledWith(
      "/api/sermon-documents/..%2F..%2Fx%3Fy%3D1%23z",
      expect.anything(),
    );
  });

  it("maps each of the route's answers through readOutcome", async () => {
    const cases: [Response, unknown][] = [
      [
        json(200, { ok: true, message: "", content, revision: 0 }),
        { kind: "found", content, revision: 0 },
      ],
      [json(404, { ok: false, message: "", code: "missing" }), { kind: "missing" }],
      [json(400, { ok: false, message: "", code: "invalid" }), { kind: "missing" }],
      [
        json(409, { ok: false, message: "", code: "unreadable", revision: 4 }),
        { kind: "unreadable", revision: 4 },
      ],
      [json(401, { ok: false, message: "Sign in" }), { kind: "unauthorized" }],
      [json(403, { ok: false, message: "No access" }), { kind: "unauthorized" }],
      [json(503, { ok: false, message: "", code: "failed" }), { kind: "failed" }],
      [
        json(
          200,
          { ok: true, message: "", content, revision: 3 },
          "application/json; charset=utf-8",
        ),
        { kind: "found", content, revision: 3 },
      ],
    ];
    for (const [response, expected] of cases) {
      expect(await readWith(response)).toEqual(expected);
    }
  });

  it("takes anything it cannot send or understand as failed, never found", async () => {
    const answers: (Response | (() => Promise<Response>))[] = [
      // The network.
      () => Promise.reject(new TypeError("Failed to fetch")),
      // Not JSON, or not JSON at all.
      json(200, "<!doctype html><title>Sign in</title>", "text/html"),
      json(200, "{ not json", "application/json"),
      new Response(JSON.stringify({ ok: true, content, revision: 1 }), { status: 200 }),
      // A body that is not an answer.
      json(200, null),
      json(200, [1, 2]),
      json(200, { content, revision: 1 }),
      // A success without what makes it one.
      json(200, { ok: true, message: "" }),
      json(200, { ok: true, message: "", content, revision: "9" }),
      json(200, { ok: true, message: "", content, revision: -1 }),
      json(200, { ok: true, message: "", content, revision: 1.5 }),
      json(200, { ok: true, message: "", content: "doc", revision: 1 }),
      json(200, { ok: true, message: "", content: [], revision: 1 }),
      // A status and a body that disagree.
      json(200, { ok: false, message: "", code: "missing" }),
      json(404, { ok: true, message: "", content, revision: 1 }),
      json(404, { ok: false, message: "" }),
      json(401, { ok: false, message: "", code: "missing" }),
      json(409, { ok: false, message: "", code: "unreadable", revision: "x" }),
      json(503, { ok: false, message: "" }),
      // A status the route never gives.
      json(500, { ok: false, message: "", code: "failed" }),
      json(302, { ok: true, message: "", content, revision: 1 }),
      json(206, { ok: true, message: "", content, revision: 1 }),
      // A body that cannot be read.
      async () =>
        ({
          status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
          json: () => Promise.reject(new Error("aborted")),
        }) as unknown as Response,
    ];
    for (const answer of answers) {
      expect(await readWith(answer)).toEqual({ kind: "failed" });
    }
  });

  it("asks once and never again by itself, whatever the answer", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(() => Promise.reject(new TypeError("offline")));
      const t = transport(vi.fn(), fetch);
      await expect(t.read(outlineId)).resolves.toEqual({ kind: "failed" });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
