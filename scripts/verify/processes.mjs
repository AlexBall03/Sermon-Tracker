// Processes the verification coordinator owns (docs/TESTING.md).
//
// The coordinator stops only what it started: a process is named by its PID
// and its creation time, and its descendants are found through that identity
// (resources.mjs, treeOf). Nothing here finds a process by port or by name.

import { spawn, execFile } from "node:child_process";

import { snapshot as liveSnapshot, treeOf } from "./resources.mjs";

const isWindows = process.platform === "win32";

/**
 * Starts `file` with `args` and no shell (the repository's path has spaces,
 * and a shell would own the real process). Returns at once, so a caller can
 * read the child's output before it exits: { child, identity, exited }, where
 * `identity` resolves to { pid, created }, or null if the process never
 * started or had already exited (then there is nothing of it to stop).
 */
export function spawnOwned(
  file,
  args,
  { cwd, env, stdio = "inherit", snapshot = liveSnapshot } = {},
) {
  const child = spawn(file, args, { cwd, env, stdio, windowsHide: true, detached: !isWindows });
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal, error: null }));
    child.once("error", (error) => resolve({ code: null, signal: null, error }));
  });
  const identity =
    child.pid === undefined
      ? Promise.resolve(null)
      : snapshot()
          .then((snap) => {
            const self = snap.procs.find((p) => p.pid === child.pid);
            return self ? { pid: self.pid, created: self.created } : null;
          })
          // No reading of the processes: its identity is unknown (the caller can still stop the child itself).
          .catch(() => null);
  return { child, identity, exited };
}

function kill(pid) {
  if (!isWindows) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
    return Promise.resolve();
  }
  // One PID, never /T: the tree is worked out here, with creation times.
  return new Promise((resolve) =>
    execFile("taskkill", ["/PID", String(pid), "/F"], { windowsHide: true }, () => resolve()),
  );
}

/**
 * Stops the owned process `identity` and every live descendant. `recorded`
 * are identities seen in the tree before (so the children of a parent that
 * already exited are still found). A process whose PID matches but whose
 * creation time does not is someone else's and is never touched.
 * Returns the identities stopped.
 */
export async function stopOwned(
  identity,
  { recorded = [], snapshot = liveSnapshot, killFn = kill } = {},
) {
  if (!identity) return [];
  const stopped = [];
  const seen = [...recorded];
  // A process may start a child while it is being stopped: look again, a few times.
  for (let round = 0; round < 4; round++) {
    const snap = await snapshot();
    const tree = treeOf(snap.procs, identity, seen);
    if (tree.length === 0) break;
    // The root first, so it starts nothing more.
    tree.sort((a, b) => a.created - b.created);
    for (const p of tree) {
      seen.push({ pid: p.pid, created: p.created });
      await killFn(p.pid);
      stopped.push({ pid: p.pid, created: p.created });
    }
  }
  return stopped;
}
