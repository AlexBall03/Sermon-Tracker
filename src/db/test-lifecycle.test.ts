// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it, vi } from "vitest";

import { testDatabaseLifecycle } from "./test-lifecycle";
import { createTestDatabase } from "./testing";

// The migration fails here, to prove the database is closed when it does.
vi.mock("drizzle-orm/pglite/migrator", () => ({
  migrate: vi.fn(async () => {
    throw new Error("migration failed on purpose");
  }),
}));

describe("createTestDatabase", () => {
  it("closes the database when the migrations fail", async () => {
    const close = vi.spyOn(PGlite.prototype, "close");
    await expect(createTestDatabase()).rejects.toThrow("migration failed on purpose");
    // Closed at once, not left for the end of the test.
    expect(testDatabaseLifecycle.open()).toEqual({ test: 0, file: 0 });
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});

/*
 * The fixtures in lifecycle-fixtures run in a child Vitest with the suite's
 * own setup file, so the real hooks and their real order are what is tested.
 * Each logs what it does and every close (log.ts).
 */
describe("the lifecycle in a real run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "db-lifecycle-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (fixture: string) => {
    const logFile = path.join(dir, `${fixture}.log`);
    const report = path.join(dir, `${fixture}.json`);
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "src/db/lifecycle-fixtures/vitest.config.mjs",
        "--reporter=json",
        `--outputFile=${report}`,
        `lifecycle-fixtures/${fixture}.fixture.ts`,
      ],
      { env: { ...process.env, LIFECYCLE_LOG: logFile }, encoding: "utf8", timeout: 120_000 },
    );
    const json = JSON.parse(readFileSync(report, "utf8")) as {
      numPassedTests: number;
      numFailedTests: number;
      testResults: { name: string }[];
    };
    const log = readFileSync(logFile, "utf8").trim().split("\n");
    return { status: result.status, json, log };
  };

  it("closes a test's database after its own afterEach, and a file's after its own afterAll", () => {
    const { status, json, log } = run("normal");
    expect(status).toBe(0);
    expect(json.numPassedTests).toBe(2);
    expect(json.testResults).toHaveLength(1);
    expect(log).toEqual([
      "created file",
      "created t1",
      "ran t1",
      "afterEach used t1",
      "close t1",
      "created t2",
      "t1 database refused after close",
      "ran t2",
      "afterEach used t2",
      "close t2",
      "afterAll used file",
      "close file",
    ]);
  });

  it("closes the database of a beforeEach that fails", () => {
    const { status, json, log } = run("before-each-fails");
    expect(status).not.toBe(0);
    expect(json.numFailedTests).toBe(1);
    expect(log).toEqual(["created failing-each", "close failing-each"]);
  });

  it("closes the database of a beforeAll that fails", () => {
    const { status, log } = run("before-all-fails");
    expect(status).not.toBe(0);
    expect(log).toEqual(["created failing-all", "close failing-all"]);
  });

  it("leaves nothing open in this file", () => {
    expect(testDatabaseLifecycle.open()).toEqual({ test: 0, file: 0 });
  });
});
