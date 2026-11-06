// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  classifyPlaywright,
  classifyVitest,
  createRun,
  exitCode,
  invalidRun,
  loadRun,
  pendingUnits,
  runsDir,
  staleReason,
  verdict,
} from "./runs.mjs";

const root = path.resolve("/repo");
const planned = ["src/a.test.ts", "src/b.test.ts"];
const report = (over = {}) =>
  JSON.stringify({
    numPassedTests: 5,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: planned.map((f) => ({ name: path.join(root, f), status: "passed" })),
    ...over,
  });
const ok = { code: 0, signal: null, error: null };

describe("classifyVitest", () => {
  const classify = (args) =>
    classifyVitest({ root, planned, exit: ok, reportText: report(), ...args }).status;

  it("passes only a report of every planned file, with every test passed and exit 0", () => {
    expect(classify({})).toBe("passed");
  });

  it("is a failure when a test or a file failed", () => {
    expect(classify({ exit: { code: 1 }, reportText: report({ numFailedTests: 1 }) })).toBe(
      "failed",
    );
    const fileFailed = report({
      testResults: [
        { name: path.join(root, planned[0]), status: "failed" },
        { name: path.join(root, planned[1]), status: "passed" },
      ],
    });
    expect(classify({ exit: { code: 1 }, reportText: fileFailed })).toBe("failed");
  });

  it("is a failure when every test passed but Vitest exited 1 (an unhandled error)", () => {
    expect(classify({ exit: { code: 1 } })).toBe("failed");
  });

  it("is an infrastructure error with no report, a broken one, or a process that never started", () => {
    expect(classify({ reportText: null, exit: { code: 1 } })).toBe("infra_error");
    expect(classify({ reportText: '{"testResults": [' })).toBe("infra_error");
    expect(classify({ reportText: "{}" })).toBe("infra_error");
    expect(
      classify({ exit: { code: null, error: new Error("spawn ENOENT") }, reportText: null }),
    ).toBe("infra_error");
  });

  it("is an infrastructure error when the files that ran are not the files planned", () => {
    const one = report({ testResults: [{ name: path.join(root, planned[0]), status: "passed" }] });
    expect(classifyVitest({ root, planned, exit: ok, reportText: one })).toMatchObject({
      status: "infra_error",
      missing: [planned[1]],
    });
    const extra = report({
      testResults: [...planned, "src/c.test.ts"].map((f) => ({
        name: path.join(root, f),
        status: "passed",
      })),
    });
    expect(classifyVitest({ root, planned, exit: ok, reportText: extra })).toMatchObject({
      status: "infra_error",
      extra: ["src/c.test.ts"],
    });
  });

  it("names a stop for memory and a stop by the person apart from failures", () => {
    expect(classify({ stoppedFor: "memory", reportText: null })).toBe("resource_exhausted");
    expect(classify({ stoppedFor: "interrupt", reportText: null })).toBe("interrupted");
  });
});

describe("classifyPlaywright", () => {
  const pw = (stats, extra = {}) =>
    JSON.stringify({ stats, errors: [], suites: [{ file: "a.spec.ts" }], ...extra });
  const classify = (args) =>
    classifyPlaywright({ exit: ok, spec: "tests/lab/a.spec.ts", ...args }).status;

  it("passes when tests passed and nothing failed", () => {
    expect(classify({ reportText: pw({ expected: 3, skipped: 2, unexpected: 0 }) })).toBe("passed");
  });

  it("fails on an unexpected result", () => {
    expect(classify({ exit: { code: 1 }, reportText: pw({ expected: 3, unexpected: 1 }) })).toBe(
      "failed",
    );
  });

  it("never passes a run in which no test ran without the test account", () => {
    expect(classify({ reportText: pw({ expected: 0, skipped: 7, unexpected: 0 }) })).toBe(
      "infra_error",
    );
    const nothing = pw({ expected: 0, skipped: 0, unexpected: 0 });
    expect(classify({ reportText: nothing, accountReady: true })).toBe("infra_error");
  });

  it("records a unit whose every test skips by design, with the account there, as skipped with its reasons", () => {
    const byDesign = pw(
      { expected: 0, skipped: 2, unexpected: 0 },
      {
        suites: [
          {
            file: "a.spec.ts",
            specs: [
              {
                tests: [
                  {
                    status: "skipped",
                    annotations: [{ type: "skip", description: "Desktop only." }],
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    expect(
      classifyPlaywright({
        exit: ok,
        spec: "tests/lab/a.spec.ts",
        reportText: byDesign,
        accountReady: true,
      }),
    ).toMatchObject({ status: "skipped", skips: ["Desktop only."] });
  });

  it("is an infrastructure error on a global error, a missing report, or another spec running", () => {
    expect(
      classify({
        exit: { code: 1 },
        reportText: pw(
          { expected: 0, unexpected: 0 },
          { errors: [{ message: "webServer failed" }] },
        ),
      }),
    ).toBe("infra_error");
    expect(classify({ reportText: null, exit: { code: 1 } })).toBe("infra_error");
    expect(
      classify({
        reportText: pw(
          { expected: 1 },
          { suites: [{ file: "a.spec.ts" }, { file: "held-a.spec.ts" }] },
        ),
      }),
    ).toBe("infra_error");
  });
});

describe("runs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "verify runs "));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const fingerprint = { head: "abcdef1234567", hash: "1111", changed: 0 };
  const inventory = { files: 2, hash: "aaaa" };

  it("is complete only when every unit passed or was skipped on purpose", () => {
    const run = createRun(root, {
      kind: "unit",
      fingerprint,
      inventory,
      config: {},
      units: [{ id: "u1" }, { id: "u2" }],
    });
    expect(verdict(run)).toBe("incomplete");
    run.units[0].status = "passed";
    expect(verdict(run)).toBe("incomplete");
    expect(exitCode(run)).toBe(2);
    run.units[1].status = "failed";
    expect(verdict(run)).toBe("failed");
    run.units[1].status = "resource_exhausted";
    expect(verdict(run)).toBe("incomplete");
    run.units[1].status = "interrupted";
    expect(verdict(run)).toBe("incomplete");
    expect(pendingUnits(run).map((u) => u.id)).toEqual(["u2"]);
    run.units[1].status = "skipped";
    expect(verdict(run)).toBe("passed");
    expect(exitCode(run)).toBe(0);
  });

  it("reads a run back, and refuses one that is truncated or invalid", () => {
    const run = createRun(root, {
      kind: "unit",
      fingerprint,
      inventory,
      config: {},
      units: [{ id: "u1" }],
    });
    expect(loadRun(root, run.id).id).toBe(run.id);
    const broken = path.join(runsDir(root), "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(path.join(broken, "run.json"), '{"id": "broken", "units": [');
    expect(() => loadRun(root, "broken")).toThrow();
    expect(() => loadRun(root, "missing")).toThrow();
    expect(invalidRun({ id: "x", kind: "unit", fingerprint, units: [] })).toMatch(/no units/);
    expect(
      invalidRun({
        id: "x",
        kind: "unit",
        fingerprint,
        units: [
          { id: "a", status: "passed" },
          { id: "a", status: "passed" },
        ],
      }),
    ).toMatch(/repeated/);
    expect(
      invalidRun({ id: "x", kind: "unit", fingerprint, units: [{ id: "a", status: "great" }] }),
    ).toMatch(/unknown status/);
    expect(invalidRun({ id: "x", kind: "unit", units: [{ id: "a", status: "passed" }] })).toMatch(
      /fingerprint/,
    );
  });

  it("refuses to resume on changed code or a changed set of tests", () => {
    const run = { fingerprint, inventory };
    expect(staleReason(run, { fingerprint, inventory })).toBeNull();
    expect(staleReason(run, { fingerprint: { ...fingerprint, hash: "2222" }, inventory })).toMatch(
      /code changed/,
    );
    expect(staleReason(run, { fingerprint, inventory: { hash: "bbbb" } })).toMatch(
      /test files changed/,
    );
  });
});
