// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { defaults, resolveConfig, workersFor } from "./config.mjs";
import {
  compareExecuted,
  inventoryHash,
  parseList,
  partition,
  validatePartition,
} from "./inventory.mjs";

const files = Array.from({ length: 30 }, (_, i) => `src/f${String(i).padStart(2, "0")}.test.ts`);
const weights = Object.fromEntries(files.map((f, i) => [f, i % 4 === 0 ? 3 : 1]));
const config = { ...defaults, batchWeight: 10 };

describe("partition", () => {
  it("puts every file in exactly one batch, within the weight, in a stable order", () => {
    const batches = partition(files, weights, config);
    expect(validatePartition(files, batches).ok).toBe(true);
    for (const b of batches) expect(b.weight).toBeLessThanOrEqual(config.batchWeight);
    expect(batches.flatMap((b) => b.files)).toEqual([...files].sort());
    // The same inventory in another order gives the same batches.
    expect(partition([...files].reverse(), weights, config)).toEqual(batches);
  });

  it("gives a file heavier than the limit a batch of its own rather than dropping it", () => {
    const batches = partition(["a", "b"], { a: 50, b: 1 }, config);
    expect(batches.map((b) => b.files)).toEqual([["a"], ["b"]]);
  });

  it("takes in a new file and changes the inventory's hash", () => {
    const added = [...files, "src/new.test.ts"];
    expect(inventoryHash(added)).not.toBe(inventoryHash(files));
    const batches = partition(added, weights, config);
    expect(validatePartition(added, batches).ok).toBe(true);
    expect(batches.some((b) => b.files.includes("src/new.test.ts"))).toBe(true);
  });
});

describe("validatePartition", () => {
  const batches = () => partition(files, weights, config);

  it("finds a duplicate", () => {
    const b = batches();
    b[1].files.push(b[0].files[0]);
    expect(validatePartition(files, b)).toMatchObject({ ok: false, duplicates: [b[0].files[0]] });
  });

  it("finds an omission", () => {
    const b = batches();
    const dropped = b[0].files.pop();
    expect(validatePartition(files, b)).toMatchObject({ ok: false, omitted: [dropped] });
  });

  it("finds a file that is not in the inventory, and a repeated batch id", () => {
    const b = batches();
    b[0].files.push("src/ghost.test.ts");
    b[1].id = b[0].id;
    expect(validatePartition(files, b)).toMatchObject({
      ok: false,
      unknown: ["src/ghost.test.ts"],
      duplicateIds: [b[0].id],
    });
  });
});

describe("compareExecuted", () => {
  it("says what was planned and did not run, and what ran unplanned", () => {
    expect(compareExecuted(["a", "b"], ["b", "c"])).toEqual({ missing: ["a"], extra: ["c"] });
  });
});

describe("discovery", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verify inventory "));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Vitest's own discovery, on a project of its own (the path has spaces on purpose).
  const list = () => {
    const out = path.join(dir, "list.json");
    execFileSync(process.execPath, [
      "node_modules/vitest/vitest.mjs",
      "list",
      "--filesOnly",
      `--json=${out}`,
      "--root",
      dir,
      "--config",
      path.join(dir, "vitest.config.mjs"),
    ]);
    return parseList(
      dir,
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(out)}, "utf8"))`],
        { encoding: "utf8" },
      ),
    );
  };

  it("finds the files Vitest finds, and a file added later", () => {
    writeFileSync(
      path.join(dir, "vitest.config.mjs"),
      'export default { test: { include: ["**/*.test.mjs"] } };\n',
    );
    mkdirSync(path.join(dir, "a"), { recursive: true });
    writeFileSync(path.join(dir, "a", "one.test.mjs"), "");
    writeFileSync(path.join(dir, "a", "not-a-test.mjs"), "");
    expect(list()).toEqual(["a/one.test.mjs"]);
    writeFileSync(path.join(dir, "a", "two.test.mjs"), "");
    expect(list()).toEqual(["a/one.test.mjs", "a/two.test.mjs"]);
  });

  it("refuses output that is not a list of files", () => {
    expect(() => parseList(dir, "{}")).toThrow();
    expect(() => parseList(dir, '[{"name":"x"}]')).toThrow();
    expect(() => parseList(dir, "[")).toThrow();
  });
});

describe("config", () => {
  it("takes the environment, then flags, and refuses a value that is not a number", () => {
    expect(resolveConfig([], { VERIFY_RESERVE_MB: "1500" }).reserveMb).toBe(1500);
    expect(resolveConfig(["--reserve-mb=2000"], { VERIFY_RESERVE_MB: "1500" }).reserveMb).toBe(
      2000,
    );
    expect(() => resolveConfig(["--max-workers=lots"])).toThrow();
  });

  it("starts only as many workers as fit above the reserve", () => {
    expect(workersFor(10_000, defaults)).toBe(defaults.maxWorkers);
    expect(workersFor(defaults.reserveMb + 300 + 1400, defaults)).toBe(1);
    expect(workersFor(defaults.reserveMb, defaults)).toBe(0);
  });
});
