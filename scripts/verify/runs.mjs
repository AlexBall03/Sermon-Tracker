// Verification runs: what was planned, what happened, and what it was run on
// (docs/TESTING.md, "Results"). A run is a folder under .verify/runs; its
// run.json is rewritten whole (write, then rename) after every change.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { compareExecuted, relative } from "./inventory.mjs";

export const statuses = [
  "passed",
  "failed", // a test or an assertion failed, or an error the tests did not catch
  "infra_error", // the job could not run or report properly
  "resource_exhausted", // stopped by the coordinator for memory
  "interrupted", // stopped by the person (Ctrl+C)
  "not_started",
  "skipped", // left out on purpose, with a reason
];

export function runsDir(root) {
  return path.join(root, ".verify", "runs");
}

export function createRun(root, { kind, fingerprint, inventory, config, units }) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${fingerprint.head.slice(0, 7)}`;
  const dir = path.join(runsDir(root), id);
  mkdirSync(dir, { recursive: true });
  const run = {
    id,
    kind,
    createdAt: new Date().toISOString(),
    fingerprint,
    inventory,
    config,
    units: units.map((u) => ({ ...u, status: "not_started" })),
    memory: { minFreeMb: null, minCommitFreeMb: null },
  };
  saveRun(root, run);
  return run;
}

export function runDir(root, run) {
  return path.join(runsDir(root), run.id);
}

export function saveRun(root, run) {
  const file = path.join(runDir(root, run), "run.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(run, null, 2));
  renameSync(`${file}.tmp`, file);
  writeFileSync(path.join(runDir(root, run), "summary.md"), summarize(run));
}

/** A run read back, refused when it is not one this coordinator wrote. */
export function loadRun(root, id) {
  const ids = existsSync(runsDir(root)) ? readdirSync(runsDir(root)).sort() : [];
  const chosen = id ?? ids.at(-1);
  if (!chosen) throw new Error("No verification run yet.");
  const file = path.join(runsDir(root), chosen, "run.json");
  if (!existsSync(file)) throw new Error(`No run ${chosen}.`);
  const run = JSON.parse(readFileSync(file, "utf8"));
  const problem = invalidRun(run);
  if (problem) throw new Error(`Run ${chosen} is not readable: ${problem}`);
  return run;
}

export function invalidRun(run) {
  if (!run || typeof run !== "object") return "not an object";
  if (typeof run.id !== "string" || typeof run.kind !== "string") return "no id or kind";
  if (!run.fingerprint?.hash || !run.fingerprint?.head) return "no fingerprint";
  if (!Array.isArray(run.units) || run.units.length === 0) return "no units";
  const ids = new Set();
  for (const u of run.units) {
    if (typeof u.id !== "string" || ids.has(u.id)) return `unit id missing or repeated: ${u.id}`;
    ids.add(u.id);
    if (!statuses.includes(u.status)) return `unit ${u.id} has an unknown status: ${u.status}`;
  }
  return null;
}

/** complete and passed, failed, or incomplete (anything not run to a verdict). */
export function verdict(run) {
  const done = (s) => s === "passed" || s === "skipped";
  if (run.units.every((u) => done(u.status))) return "passed";
  if (
    run.units.some((u) => u.status === "failed") &&
    run.units.every((u) => done(u.status) || u.status === "failed")
  )
    return "failed";
  return "incomplete";
}

export function exitCode(run) {
  return { passed: 0, failed: 1, incomplete: 2 }[verdict(run)];
}

/** Units a resume runs again: all but those already passed or skipped. */
export function pendingUnits(run) {
  return run.units.filter((u) => u.status !== "passed" && u.status !== "skipped");
}

/** Why an earlier run cannot be resumed on the tree as it is, or null. */
export function staleReason(run, { fingerprint, inventory }) {
  if (run.fingerprint.hash !== fingerprint.hash)
    return `the code changed since (run on ${run.fingerprint.hash}, now ${fingerprint.hash})`;
  if (run.inventory && inventory && run.inventory.hash !== inventory.hash)
    return "the set of test files changed since";
  return null;
}

/**
 * A Vitest batch's status from its exit and its JSON report. Only a report
 * that names every planned file, and nothing else, can pass.
 */
export function classifyVitest({ root, planned, exit, reportText, stoppedFor }) {
  if (stoppedFor === "memory")
    return { status: "resource_exhausted", reason: "stopped: memory below the critical level" };
  if (stoppedFor === "interrupt") return { status: "interrupted", reason: "stopped by the person" };
  if (exit?.error)
    return { status: "infra_error", reason: `could not start: ${exit.error.message}` };
  let report;
  try {
    report = JSON.parse(reportText ?? "");
  } catch {
    return { status: "infra_error", reason: `no readable report (exit ${exit?.code})` };
  }
  if (!Array.isArray(report?.testResults))
    return { status: "infra_error", reason: "report has no testResults" };
  const executed = report.testResults.map((r) => relative(root, path.resolve(r.name)));
  const { missing, extra } = compareExecuted(planned, executed);
  const counts = {
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? 0,
    skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    files: executed.length,
  };
  if (missing.length || extra.length)
    return {
      status: "infra_error",
      reason: `files not as planned (missing ${missing.length}, extra ${extra.length})`,
      counts,
      missing,
      extra,
    };
  const failedFiles = report.testResults
    .filter((r) => r.status === "failed")
    .map((r) => relative(root, path.resolve(r.name)));
  if (counts.failed > 0 || failedFiles.length)
    return {
      status: "failed",
      reason: `${counts.failed} failed tests, ${failedFiles.length} failed files`,
      counts,
      failedFiles,
    };
  // Every test passed but Vitest still failed: an error the tests did not catch.
  if (exit?.code !== 0)
    return {
      status: "failed",
      reason: `exit ${exit?.code} with every test passing (an unhandled error; see the log)`,
      counts,
    };
  return { status: "passed", counts };
}

/** A Playwright run's status from its exit and its JSON report. */
/** The reasons skipped tests gave (their annotations), each once. */
export function skipReasons(report) {
  const reasons = new Set();
  const walk = (s) => {
    for (const sp of s.specs ?? [])
      for (const t of sp.tests ?? [])
        if (t.status === "skipped")
          for (const a of t.annotations ?? []) if (a.description) reasons.add(a.description);
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of report.suites ?? []) walk(s);
  return [...reasons];
}

/**
 * A Playwright run's status from its exit and its JSON report. `accountReady`
 * says the signed-in test account is configured: only then can a unit in which
 * every test skipped itself be a skip by design (a desktop-only spec on the
 * phone) rather than a missing prerequisite.
 */
export function classifyPlaywright({ exit, reportText, stoppedFor, spec, accountReady = false }) {
  if (stoppedFor === "memory")
    return { status: "resource_exhausted", reason: "stopped: memory below the critical level" };
  if (stoppedFor === "interrupt") return { status: "interrupted", reason: "stopped by the person" };
  if (exit?.error)
    return { status: "infra_error", reason: `could not start: ${exit.error.message}` };
  let report;
  try {
    report = JSON.parse(reportText ?? "");
  } catch {
    return { status: "infra_error", reason: `no readable report (exit ${exit?.code})` };
  }
  const s = report?.stats;
  if (!s) return { status: "infra_error", reason: "report has no stats" };
  const counts = {
    passed: s.expected ?? 0,
    failed: s.unexpected ?? 0,
    flaky: s.flaky ?? 0,
    skipped: s.skipped ?? 0,
  };
  const errors = (report.errors ?? []).map((e) => String(e.message ?? e).split("\n")[0]);
  // The spec named must be the only file that ran (a filter matches by substring).
  const ran = (report.suites ?? []).map((s) => String(s.file).split("\\").join("/"));
  if (spec && ran.some((f) => !spec.endsWith(f)))
    return {
      status: "infra_error",
      reason: `unplanned spec files ran: ${ran.filter((f) => !spec.endsWith(f)).join(", ")}`,
      counts,
    };
  if (counts.failed > 0)
    return { status: "failed", reason: `${counts.failed} failed`, counts, errors };
  if (errors.length) return { status: "infra_error", reason: errors[0], counts, errors };
  if (exit?.code !== 0)
    return { status: "infra_error", reason: `exit ${exit?.code} with nothing failed`, counts };
  if (counts.passed === 0) {
    const skips = skipReasons(report);
    // Every test skipped itself, by its own stated reason, with the account there.
    if (accountReady && counts.skipped > 0)
      return {
        status: "skipped",
        reason: `every test skips here: ${skips.join("; ")}`,
        counts,
        skips,
      };
    // Otherwise a prerequisite (the test account) is missing. Never a pass.
    return {
      status: "infra_error",
      reason: "no test ran: every test skipped itself",
      counts,
      skips,
    };
  }
  return { status: "passed", counts };
}

export function summarize(run) {
  const lines = [
    `# Verification run ${run.id}`,
    "",
    `- Kind: ${run.kind}`,
    `- HEAD: ${run.fingerprint.head}, tree ${run.fingerprint.hash} (${run.fingerprint.changed} changed paths)`,
    run.inventory
      ? `- Unit inventory: ${run.inventory.files} files, hash ${run.inventory.hash}`
      : null,
    `- Verdict: **${verdict(run)}**`,
    `- Lowest free memory: ${run.memory.minFreeMb ?? "?"} MB, lowest free commit: ${run.memory.minCommitFreeMb ?? "?"} MB`,
    "",
    "| Unit | Status | Counts | Peak MB (tree) | Seconds | Note |",
    "| --- | --- | --- | --- | --- | --- |",
  ].filter((l) => l !== null);
  for (const u of run.units) {
    const c = u.counts
      ? Object.entries(u.counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")
      : "";
    lines.push(
      `| ${u.id} | ${u.status} | ${c} | ${u.peakMb ?? ""} | ${u.seconds ?? ""} | ${u.reason ?? ""} |`,
    );
  }
  return lines.join("\n") + "\n";
}
