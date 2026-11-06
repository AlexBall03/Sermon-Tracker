// Memory readings for the verification coordinator (docs/TESTING.md).
//
// A snapshot is the operating system's memory counters plus every process
// with its parent and creation time. On Windows that is one PowerShell CIM
// query; elsewhere `ps` and `os`. Creation times are what make process
// ownership safe (processes.mjs): a PID alone can be reused.

import { spawn, execFile } from "node:child_process";
import os from "node:os";
import readline from "node:readline";

const isWindows = process.platform === "win32";
const MB = 1024 * 1024;

// One block per snapshot: "OS,<freeKB>,<totalKB>,<commitFreeKB>,<commitLimitKB>",
// then "P,<pid>,<ppid>,<created FILETIME>,<workingSet>,<privateBytes>" lines, then "END".
const query = `
$o = Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory,TotalVisibleMemorySize,FreeVirtualMemory,TotalVirtualMemorySize
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("OS,$($o.FreePhysicalMemory),$($o.TotalVisibleMemorySize),$($o.FreeVirtualMemory),$($o.TotalVirtualMemorySize)")
foreach ($p in Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,WorkingSetSize,PrivatePageCount) {
  $c = if ($p.CreationDate) { $p.CreationDate.ToFileTimeUtc() } else { 0 }
  $lines.Add("P,$($p.ProcessId),$($p.ParentProcessId),$c,$($p.WorkingSetSize),$($p.PrivatePageCount)")
}
$lines.Add("END")
[Console]::Out.Write(($lines -join "\`n") + "\`n")
[Console]::Out.Flush()
`;

/** Parses one snapshot block (exported for tests). */
export function parseSnapshot(lines, at = Date.now()) {
  const snap = {
    at,
    freeMB: null,
    totalMB: null,
    commitFreeMB: null,
    commitLimitMB: null,
    procs: [],
  };
  for (const line of lines) {
    const f = line.trim().split(",");
    if (f[0] === "OS") {
      const [free, total, commitFree, commitLimit] = f.slice(1).map(Number);
      Object.assign(snap, {
        freeMB: Math.round(free / 1024),
        totalMB: Math.round(total / 1024),
        commitFreeMB: Math.round(commitFree / 1024),
        commitLimitMB: Math.round(commitLimit / 1024),
      });
    } else if (f[0] === "P") {
      const [pid, ppid, created, ws, priv] = f.slice(1).map(Number);
      snap.procs.push({ pid, ppid, created, ws, priv });
    }
  }
  return snap;
}

function powershell(args) {
  return spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
    {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    },
  );
}

/** One snapshot of memory and processes. */
export async function snapshot() {
  if (!isWindows) return posixSnapshot();
  const child = powershell(["-Command", query]);
  const lines = [];
  const rl = readline.createInterface({ input: child.stdout });
  for await (const line of rl) lines.push(line);
  return parseSnapshot(lines);
}

async function posixSnapshot() {
  const out = await new Promise((resolve, reject) =>
    execFile("ps", ["-A", "-o", "pid=,ppid=,etimes=,rss="], (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    ),
  );
  const now = Date.now();
  const procs = out
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number))
    // Second resolution: creation times are rounded to the second.
    .map(([pid, ppid, etimes, rss]) => ({
      pid,
      ppid,
      created: Math.floor((now - etimes * 1000) / 1000),
      ws: rss * 1024,
      priv: rss * 1024,
    }));
  return {
    at: now,
    freeMB: Math.round(os.freemem() / MB),
    totalMB: Math.round(os.totalmem() / MB),
    commitFreeMB: null,
    commitLimitMB: null,
    procs,
  };
}

/**
 * Which process created `child`: among the identities known (live or recorded),
 * the one with the child's parent PID that was created most recently before
 * it. A PID taken over by a later process is therefore never its parent.
 */
export function creatorOf(child, known) {
  let best = null;
  for (const p of known) {
    if (p.pid !== child.ppid || p.created > child.created) continue;
    if (!best || p.created > best.created) best = p;
  }
  return best;
}

const key = (p) => `${p.pid}@${p.created}`;

/**
 * The live processes descended from `root` ({pid, created}), root included if
 * it is still alive. `recorded` are identities seen earlier in the same tree
 * (a parent that has already exited still links its children).
 */
export function treeOf(procs, root, recorded = []) {
  const known = [...procs];
  for (const r of [root, ...recorded]) if (!procs.some((p) => key(p) === key(r))) known.push(r);
  const members = new Set([key(root), ...recorded.map(key)]);
  // Repeat until stable: children are found through their creator.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of known) {
      if (members.has(key(p)) || p.pid === 0 || p.pid === p.ppid) continue;
      const creator = creatorOf(p, known);
      if (creator && members.has(key(creator))) {
        members.add(key(p));
        grew = true;
      }
    }
  }
  return procs.filter((p) => members.has(key(p)));
}

/** Total working set and private bytes of a tree, in MB. */
export function treeMemory(tree) {
  let ws = 0;
  let priv = 0;
  for (const p of tree) {
    ws += p.ws;
    priv += p.priv;
  }
  return { count: tree.length, wsMB: Math.round(ws / MB), privateMB: Math.round(priv / MB) };
}

/**
 * Samples every `intervalMs` from one long-lived PowerShell (a new one per
 * sample would cost more than it measures). Calls `onSample(snapshot)`.
 * Returns { stop() }. The sampler's own process is owned and stopped here.
 */
export function startSampler({ intervalMs, onSample }) {
  if (!isWindows) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        onSample(await snapshot());
      } catch {
        // A failed reading is skipped, never treated as low memory.
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    let timer = setTimeout(tick, 0);
    return { stop: () => ((stopped = true), clearTimeout(timer)) };
  }
  const loop = `while ($true) { ${query}; Start-Sleep -Milliseconds ${intervalMs} }`;
  const child = powershell(["-Command", loop]);
  const rl = readline.createInterface({ input: child.stdout });
  let block = [];
  rl.on("line", (line) => {
    if (line.trim() === "END") {
      const snap = parseSnapshot(block);
      block = [];
      onSample(snap);
    } else block.push(line);
  });
  return {
    stop: () => {
      rl.close();
      if (child.exitCode === null) child.kill();
    },
  };
}
