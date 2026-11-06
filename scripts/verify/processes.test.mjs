// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";

import { afterAll, describe, expect, it } from "vitest";

import { spawnOwned, stopOwned } from "./processes.mjs";
import { creatorOf, parseSnapshot, snapshot, treeOf } from "./resources.mjs";

// Creation times are what tell a process from a later one given the same PID.
describe("treeOf", () => {
  const p = (pid, ppid, created) => ({ pid, ppid, created, ws: 1, priv: 1 });

  it("finds children and grandchildren", () => {
    const procs = [p(10, 1, 100), p(11, 10, 110), p(12, 11, 120), p(20, 1, 105)];
    expect(treeOf(procs, { pid: 10, created: 100 }).map((x) => x.pid)).toEqual([10, 11, 12]);
  });

  it("never claims a process older than the root that has the root's PID as its parent", () => {
    // 30 was started by an earlier process 10, which exited before our 10 was given its PID.
    const procs = [p(10, 1, 200), p(30, 10, 150), p(31, 10, 210)];
    expect(treeOf(procs, { pid: 10, created: 200 }).map((x) => x.pid)).toEqual([10, 31]);
  });

  it("claims nothing when the root's PID now belongs to another process", () => {
    // Our 10 (created 100) exited; an unrelated 10 (created 300) started a child.
    const procs = [p(10, 1, 300), p(40, 10, 310)];
    expect(treeOf(procs, { pid: 10, created: 100 })).toEqual([]);
  });

  it("still finds the children of an owned parent that exited, but not the new owner of its PID", () => {
    // Our 10 started 11 and exited; 11 started 12. Then an unrelated 10 started 13.
    const procs = [p(11, 10, 110), p(12, 11, 120), p(10, 1, 300), p(13, 10, 310)];
    const tree = treeOf(procs, { pid: 10, created: 100 }, [{ pid: 11, created: 110 }]);
    expect(tree.map((x) => x.pid)).toEqual([11, 12]);
  });

  it("takes the most recent earlier holder of a PID as a child's creator", () => {
    const known = [p(10, 1, 100), p(10, 1, 200)];
    expect(creatorOf(p(50, 10, 250), known).created).toBe(200);
    expect(creatorOf(p(50, 10, 150), known).created).toBe(100);
    expect(creatorOf(p(50, 10, 50), known)).toBeNull();
  });
});

describe("parseSnapshot", () => {
  it("reads the system's counters and its processes", () => {
    const snap = parseSnapshot([
      "OS,2048000,14000000,4096000,32000000",
      "P,10,1,133000000000000000,1048576,2097152",
      "garbage",
    ]);
    expect(snap).toMatchObject({
      freeMB: 2000,
      commitFreeMB: 4000,
      procs: [{ pid: 10, ppid: 1, ws: 1048576 }],
    });
  });
});

/*
 * Real processes, all started by this test. A sleeper of the test's own
 * stands in for an unrelated process: it must survive everything the
 * coordinator stops, and the test stops it itself at the end.
 */
describe("stopping owned processes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verify processes "));
  const sleeper = path.join(dir, "sleep for a while.mjs");
  writeFileSync(sleeper, "setInterval(() => {}, 1000);\n");
  const parent = path.join(dir, "parent with child.mjs");
  writeFileSync(
    parent,
    `import { spawn } from "node:child_process";
const child = spawn(process.execPath, [${JSON.stringify(sleeper)}], { stdio: "ignore" });
console.log(child.pid);
setInterval(() => {}, 1000);
`,
  );
  const unrelated = [];
  afterAll(() => {
    for (const u of unrelated) u.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const settle = async (pid) => {
    for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  };
  const startUnrelated = () => {
    const u = spawn(process.execPath, [sleeper], { stdio: "ignore" });
    unrelated.push(u);
    return u;
  };

  it("stops an owned process and its child, and leaves an unrelated process running", async () => {
    const other = startUnrelated();
    const owned = spawnOwned(process.execPath, [parent], { stdio: ["ignore", "pipe", "ignore"] });
    const [line] = await readline
      .createInterface({ input: owned.child.stdout })
      [Symbol.asyncIterator]()
      .next()
      .then((r) => [r.value]);
    const grandchild = Number(line);
    const identity = await owned.identity;
    expect(identity.pid).toBe(owned.child.pid);
    expect(alive(grandchild)).toBe(true);

    const stopped = await stopOwned(identity);
    await owned.exited;
    await settle(grandchild);
    // On Windows a console process may also have a console host of its own: part of the tree too.
    expect(stopped.map((s) => s.pid)).toEqual(
      expect.arrayContaining([owned.child.pid, grandchild]),
    );
    expect(stopped.map((s) => s.pid)).not.toContain(other.pid);
    expect(stopped.map((s) => s.pid)).not.toContain(process.pid);
    expect(alive(grandchild)).toBe(false);
    expect(alive(other.pid)).toBe(true);
  }, 60_000);

  it("never stops a live process whose creation time is not the one recorded (a reused PID)", async () => {
    const other = startUnrelated();
    const snap = await snapshot();
    const real = snap.procs.find((p) => p.pid === other.pid);
    expect(real).toBeTruthy();
    // The identity of an earlier process that had this PID.
    const stopped = await stopOwned({ pid: other.pid, created: real.created - 10_000_000 });
    expect(stopped).toEqual([]);
    await new Promise((r) => setTimeout(r, 300));
    expect(alive(other.pid)).toBe(true);
  }, 60_000);

  it("stops nothing for a process that has already exited", async () => {
    const owned = spawnOwned(process.execPath, ["-e", "setTimeout(() => {}, 200)"], {
      stdio: "ignore",
    });
    const identity = await owned.identity;
    await owned.exited;
    expect(await stopOwned(identity)).toEqual([]);
  }, 60_000);

  it("reports a command that cannot start, with no identity to stop", async () => {
    const owned = spawnOwned(path.join(dir, "no such program.exe"), [], { stdio: "ignore" });
    const exit = await owned.exited;
    expect(await owned.identity).toBeNull();
    expect(exit.error).toBeTruthy();
    expect(await stopOwned(await owned.identity)).toEqual([]);
  });

  it("passes paths and arguments with spaces without a shell", async () => {
    const echo = path.join(dir, "echo args.mjs");
    writeFileSync(echo, "console.log(JSON.stringify(process.argv.slice(2)));\n");
    const owned = spawnOwned(
      process.execPath,
      [echo, "two words", 'a "quote"', "&& echo injected"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    owned.child.stdout.on("data", (d) => (out += d));
    await owned.exited;
    expect(JSON.parse(out)).toEqual(["two words", 'a "quote"', "&& echo injected"]);
  });
});
