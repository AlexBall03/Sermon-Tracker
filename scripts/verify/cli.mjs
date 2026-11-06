// The verification coordinator (docs/TESTING.md). One heavy job at a time,
// admitted only when memory allows, stopped if memory runs out, every result
// recorded against the code it ran on.
//
//   node scripts/verify/cli.mjs unit [--changed | <file or folder> ...] [--workers=N]
//   node scripts/verify/cli.mjs e2e --suite=main|lab|lab-prod|ownership [--project=P] [--browser=firefox|webkit] [spec ...]
//   node scripts/verify/cli.mjs build
//   node scripts/verify/cli.mjs phase
//   node scripts/verify/cli.mjs resume [run-id]
//   node scripts/verify/cli.mjs report [run-id]
//   node scripts/verify/cli.mjs measure -- <script> [args]

import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { needs, resolveConfig, workersFor } from "./config.mjs";
import { fingerprint as readFingerprint, irrelevant, parseStatus } from "./fingerprint.mjs";
import { inventoryHash, parseList, partition, validatePartition, weigh } from "./inventory.mjs";
import { spawnOwned, stopOwned } from "./processes.mjs";
import { startSampler, treeMemory, treeOf } from "./resources.mjs";
import {
  classifyPlaywright,
  classifyVitest,
  createRun,
  exitCode,
  loadRun,
  pendingUnits,
  runDir,
  saveRun,
  staleReason,
  summarize,
  verdict,
} from "./runs.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../../..");
const bin = {
  vitest: path.join(root, "node_modules/vitest/vitest.mjs"),
  playwright: path.join(root, "node_modules/@playwright/test/cli.js"),
  next: path.join(root, "node_modules/next/dist/bin/next"),
  tsc: path.join(root, "node_modules/typescript/bin/tsc"),
  eslint: path.join(root, "node_modules/eslint/bin/eslint.js"),
  prettier: path.join(root, "node_modules/prettier/bin/prettier.cjs"),
};

// The browser suites: their configuration, the server each needs, and its port.
const suites = {
  main: { config: "playwright.config.ts", server: "start", port: 3100, env: "E2E_BASE_URL" },
  "lab-prod": {
    config: "playwright.lab-prod.config.ts",
    server: "start",
    port: 3300,
    env: "E2E_BASE_URL",
  },
  lab: { config: "playwright.lab.config.ts", server: "dev", port: 3200, env: "LAB_BASE_URL" },
  ownership: { config: "playwright.ownership.config.ts", server: null },
};

const [command, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const positional = rest.filter((a) => !a.startsWith("--"));
const flag = (name) =>
  flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`))?.split("=")[1] ??
  (flags.includes(`--${name}`) ? true : undefined);
const config = resolveConfig(flags);
if (flag("workers")) config.maxWorkers = Number(flag("workers"));

const say = (line) => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------- memory

let latest = null;
const waiters = new Set();
let current = null; // the job being watched: { identity, seen, peakMb, stop }
let activeRun = null;

const lowest = { free: Infinity, commit: Infinity };

function onSample(snap) {
  latest = snap;
  lowest.free = Math.min(lowest.free, snap.freeMB);
  if (snap.commitFreeMB !== null) lowest.commit = Math.min(lowest.commit, snap.commitFreeMB);
  if (activeRun) {
    const m = activeRun.memory;
    m.minFreeMb = Math.min(m.minFreeMb ?? Infinity, snap.freeMB);
    if (snap.commitFreeMB !== null)
      m.minCommitFreeMb = Math.min(m.minCommitFreeMb ?? Infinity, snap.commitFreeMB);
  }
  for (const job of [current, ...servers.values()].filter(Boolean)) {
    if (!job.identity) continue;
    const tree = treeOf(snap.procs, job.identity, job.seen);
    for (const p of tree)
      if (!job.seen.some((s) => s.pid === p.pid && s.created === p.created)) job.seen.push(p);
    job.peakMb = Math.max(job.peakMb ?? 0, treeMemory(tree).wsMB);
  }
  const critical =
    snap.freeMB < config.criticalFreeMb ||
    (snap.commitFreeMB !== null && snap.commitFreeMB < config.criticalCommitFreeMb);
  if (critical && current && !current.stoppedFor) {
    say(
      `  memory critical (${snap.freeMB} MB free, ${snap.commitFreeMB} MB commit free): stopping ${current.label}`,
    );
    current.stop("memory");
  }
  for (const w of waiters) w();
}

const nextSample = () =>
  new Promise((resolve) =>
    waiters.add(function w() {
      waiters.delete(w);
      resolve();
    }),
  );

/** Waits until `needMb` fits above the reserve; false if it never does. */
async function admit(needMb, label) {
  const deadline = Date.now() + config.admitWaitMs;
  let told = false;
  while (Date.now() < deadline) {
    if (!latest) await nextSample();
    if (latest.freeMB - needMb >= config.reserveMb) return true;
    if (!told)
      say(
        `  waiting for memory for ${label}: ${latest.freeMB} MB free, needs ${needMb} + ${config.reserveMb} reserve`,
      );
    told = true;
    await nextSample();
  }
  return false;
}

// ---------------------------------------------------------------- jobs

const servers = new Map();
let interrupted = false;

async function runJob({ label, args, env, logFile, needMb }) {
  if (!(await admit(needMb, label))) return { notAdmitted: true };
  const log = openSync(logFile, "a");
  const started = Date.now();
  const job = { label, seen: [], peakMb: 0, stoppedFor: null };
  const spawned = spawnOwned(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", log, log],
  });
  job.identity = await spawned.identity;
  job.stop = (reason) => {
    job.stoppedFor = reason;
    // Without an identity (the processes could not be read), only the child itself can be stopped.
    if (job.identity) stopOwned(job.identity, { recorded: job.seen });
    else spawned.child.kill();
  };
  current = job;
  if (interrupted) job.stop("interrupt");
  const exit = await spawned.exited;
  current = null;
  // Anything it left behind (a worker, a browser) is its own and is stopped too.
  const leftover = await stopOwned(job.identity, { recorded: job.seen });
  closeSync(log);
  return {
    exit,
    stoppedFor: job.stoppedFor,
    peakMb: job.peakMb,
    seconds: Math.round((Date.now() - started) / 1000),
    leftover: leftover.length,
  };
}

function portBusy(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      socket.once("connect", () => (socket.destroy(), resolve(true)));
      socket.once("error", () => resolve(false));
    });
  return Promise.all([probe("127.0.0.1"), probe("::1")]).then((r) => r.some(Boolean));
}

/** Read only: refuses to start a server on a development database that is behind. */
function checkDatabase() {
  let out;
  try {
    out = execFileSync(process.execPath, ["scripts/db/cli.mjs", "status", "dev"], {
      cwd: root,
      encoding: "utf8",
    });
  } catch (error) {
    return `the database status could not be read: ${String(error.message).split("\n")[0]}`;
  }
  const pending = /Migrations:\s+\d+ applied, (\d+) pending/.exec(out);
  if (!pending) return "the database status said nothing of migrations";
  if (Number(pending[1]) > 0)
    return `the development database has ${pending[1]} pending migrations (the owner migrates it)`;
  if (!/Check:\s+ok/.test(out)) return "the database check refused";
  return null;
}

async function startServer(suite, dir) {
  const spec = suites[suite];
  const existing = flag("base-url");
  if (existing) return { url: existing };
  if (await portBusy(spec.port))
    return {
      error: `port ${spec.port} is in use by a process this run did not start; stop it or pass --base-url=`,
    };
  const dbProblem = checkDatabase();
  if (dbProblem) return { error: dbProblem };
  if (spec.server === "start" && !buildIsCurrent())
    return { error: "no production build of this code (run the build first)" };
  const need = spec.server === "dev" ? needs.nextDev : needs.nextStart;
  if (!(await admit(need, `${suite} server`)))
    return { error: "not enough memory for the server", resource: true };
  const args = [bin.next, spec.server, "--port", String(spec.port)];
  const log = openSync(path.join(dir, `server-${suite}.log`), "a");
  // The application under test runs as the suite's own configuration runs it.
  const env = {
    ...process.env,
    SERMON_DOCUMENT_CONVERSION: process.env.SERMON_DOCUMENT_CONVERSION ?? "on",
  };
  const spawned = spawnOwned(process.execPath, args, {
    cwd: root,
    env,
    stdio: ["ignore", log, log],
  });
  const server = {
    label: `${suite} server`,
    identity: await spawned.identity,
    seen: [],
    peakMb: 0,
    log,
  };
  servers.set(suite, server);
  const url = `http://localhost:${spec.port}`;
  const deadline = Date.now() + (spec.server === "dev" ? 240_000 : 120_000);
  while (Date.now() < deadline && !interrupted) {
    const state = await Promise.race([
      spawned.exited.then(() => "exited"),
      nextSample().then(() => "tick"),
    ]);
    if (state === "exited") break;
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return { url, server };
    } catch {
      // Not listening yet.
    }
  }
  await stopServer(suite);
  return { error: "the server did not start (see its log)" };
}

async function stopServer(suite) {
  const server = servers.get(suite);
  if (!server) return null;
  servers.delete(suite);
  await stopOwned(server.identity, { recorded: server.seen });
  closeSync(server.log);
  return server.peakMb;
}

// ---------------------------------------------------------------- builds

const buildRecord = path.join(root, ".verify", "build.json");
const buildId = () =>
  existsSync(path.join(root, ".next/BUILD_ID"))
    ? readFileSync(path.join(root, ".next/BUILD_ID"), "utf8")
    : null;

function buildIsCurrent(fp = readFingerprint(root)) {
  if (!existsSync(buildRecord)) return false;
  const record = JSON.parse(readFileSync(buildRecord, "utf8"));
  return record.fingerprint === fp.hash && record.buildId === buildId();
}

// ---------------------------------------------------------------- units

async function runUnit(run, unit) {
  const dir = runDir(root, run);
  const logFile = path.join(dir, `${unit.id.replace(/[^\w.-]+/g, "_")}.log`);
  const prior = unit.status;
  if (prior !== "not_started")
    (unit.attempts ??= []).push({ status: prior, reason: unit.reason ?? null });
  delete unit.reason;
  delete unit.counts;
  let outcome;

  if (unit.kind === "vitest") {
    if (!latest) await nextSample();
    // Only as many workers as fit in memory now; at least one, admitted below.
    const workers = Math.max(1, workersFor(latest.freeMB, config));
    const report = path.join(dir, `${unit.id}.json`);
    const job = await runJob({
      label: unit.id,
      args: [
        bin.vitest,
        "run",
        "--reporter=dot",
        "--reporter=json",
        `--outputFile.json=${report}`,
        `--maxWorkers=${workers}`,
        ...unit.files,
      ],
      logFile,
      needMb: needs.vitestMain + workers * needs.vitestWorker,
    });
    if (job.notAdmitted) outcome = { status: "not_started", reason: "not enough memory to start" };
    else {
      const reportText = existsSync(report) ? readFileSync(report, "utf8") : null;
      outcome = {
        ...classifyVitest({
          root,
          planned: unit.files,
          exit: job.exit,
          reportText,
          stoppedFor: job.stoppedFor,
        }),
        peakMb: job.peakMb,
        seconds: job.seconds,
        workers,
      };
    }
  } else if (unit.kind === "command") {
    const job = await runJob({
      label: unit.id,
      args: unit.args.map((a) => bin[a] ?? a),
      logFile,
      needMb: needs.static,
    });
    if (job.notAdmitted) outcome = { status: "not_started", reason: "not enough memory to start" };
    else if (job.stoppedFor)
      outcome = { status: job.stoppedFor === "memory" ? "resource_exhausted" : "interrupted" };
    else if (job.exit.error) outcome = { status: "infra_error", reason: job.exit.error.message };
    else
      outcome = {
        status: job.exit.code === 0 ? "passed" : "failed",
        reason: job.exit.code === 0 ? undefined : `exit ${job.exit.code} (see the log)`,
        peakMb: job.peakMb,
        seconds: job.seconds,
      };
  } else if (unit.kind === "build") {
    const fp = readFingerprint(root);
    if (buildIsCurrent(fp))
      outcome = { status: "passed", reason: "this code's build already passed; reused" };
    else {
      const job = await runJob({
        label: unit.id,
        args: [bin.next, "build"],
        logFile,
        needMb: needs.nextBuild,
      });
      if (job.notAdmitted)
        outcome = { status: "not_started", reason: "not enough memory to start" };
      else if (job.stoppedFor)
        outcome = { status: job.stoppedFor === "memory" ? "resource_exhausted" : "interrupted" };
      else if (job.exit.error) outcome = { status: "infra_error", reason: job.exit.error.message };
      else if (job.exit.code !== 0)
        outcome = {
          status: "failed",
          reason: `next build exit ${job.exit.code} (see the log)`,
          peakMb: job.peakMb,
          seconds: job.seconds,
        };
      else {
        mkdirSync(path.dirname(buildRecord), { recursive: true });
        writeFileSync(
          buildRecord,
          JSON.stringify({ fingerprint: fp.hash, buildId: buildId(), run: run.id }),
        );
        outcome = { status: "passed", peakMb: job.peakMb, seconds: job.seconds };
      }
    }
  } else if (unit.kind === "playwright") {
    const suite = suites[unit.suite];
    const report = path.join(dir, `${unit.id.replace(/[^\w.-]+/g, "_")}.json`);
    const env = { PLAYWRIGHT_JSON_OUTPUT_NAME: report };
    if (suite.server) {
      if (!servers.has(unit.suite) && !run.serverUrls?.[unit.suite]) {
        const started = await startServer(unit.suite, dir);
        if (started.error) {
          outcome = {
            status: started.resource ? "not_started" : "infra_error",
            reason: started.error,
          };
          return finish(run, unit, outcome);
        }
        (run.serverUrls ??= {})[unit.suite] = started.url;
      }
      env[suite.env] = run.serverUrls[unit.suite];
    }
    if (unit.browser) env.PW_BROWSER = unit.browser;
    const args = [
      bin.playwright,
      "test",
      "-c",
      suite.config,
      "--reporter=dot,json",
      `--output=${path.join(dir, "artifacts", unit.id.replace(/[^\w.-]+/g, "_"))}`,
      "--workers=1",
      unit.spec,
      ...(unit.projects ?? []).map((p) => `--project=${p}`),
    ];
    const job = await runJob({ label: unit.id, args, env, logFile, needMb: needs.browser });
    if (job.notAdmitted) outcome = { status: "not_started", reason: "not enough memory to start" };
    else {
      const reportText = existsSync(report) ? readFileSync(report, "utf8") : null;
      outcome = {
        ...classifyPlaywright({
          exit: job.exit,
          reportText,
          stoppedFor: job.stoppedFor,
          spec: unit.spec,
          accountReady: accountReady(),
        }),
        peakMb: job.peakMb,
        seconds: job.seconds,
      };
    }
  }
  return finish(run, unit, outcome);
}

function finish(run, unit, outcome) {
  Object.assign(unit, outcome);
  saveRun(root, run);
  const c = unit.counts
    ? ` ${Object.entries(unit.counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}`
    : "";
  say(
    `[${unit.id}] ${unit.status}${c}${unit.peakMb ? `, peak ${unit.peakMb} MB` : ""}${unit.seconds !== undefined ? `, ${unit.seconds} s` : ""}${unit.reason ? ` (${unit.reason})` : ""}`,
  );
  return unit;
}

async function execute(run, units) {
  activeRun = run;
  const sampler = startSampler({ intervalMs: config.sampleMs, onSample });
  const onInterrupt = () => {
    if (interrupted) return;
    interrupted = true;
    say("Interrupted: stopping what this run started.");
    current?.stop("interrupt");
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);
  try {
    // --max-units=N: run at most N units now and leave the rest for `resume`.
    const limit = Number(flag("max-units")) || Infinity;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (interrupted) break;
      if (i >= limit) {
        say(
          `Stopped after ${limit} units, as asked: ${units.length - i} left (npm run verify:resume).`,
        );
        break;
      }
      const done = await runUnit(run, unit);
      // A suite's server is stopped as soon as its last unit is done.
      if (unit.kind === "playwright" && units[i + 1]?.suite !== unit.suite) {
        const peak = await stopServer(unit.suite);
        if (peak) (run.serverPeaks ??= {})[unit.suite] = peak;
        delete run.serverUrls?.[unit.suite];
      }
      // No more heavy work once memory ran out: the rest stays not started.
      if (
        done.status === "resource_exhausted" ||
        (done.status === "not_started" && done.reason?.includes("memory"))
      ) {
        say("Stopping: not enough memory to go on. Close other applications and resume.");
        break;
      }
      // Nothing of it could run (no report at all): the next units would fail the same way.
      if (done.status === "infra_error" && !done.counts) {
        say("Stopping: a job could not run at all. See its log, then resume.");
        break;
      }
    }
  } finally {
    for (const suite of [...servers.keys()]) await stopServer(suite);
    if (interrupted)
      for (const u of units)
        if (u.status === "not_started" && !u.reason) u.reason = "run interrupted";
    if (interrupted && current === null)
      for (const u of units) if (u.status === "not_started") u.reason ??= "run interrupted";
    sampler.stop();
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    delete run.serverUrls;
    saveRun(root, run);
    activeRun = null;
  }
  say("");
  say(summarize(run));
  say(`Verdict: ${verdict(run)}. Results: ${path.relative(root, runDir(root, run))}`);
  return exitCode(run);
}

// ---------------------------------------------------------------- planning

function listUnitFiles(extra = []) {
  const out = path.join(root, ".verify", `list-${process.pid}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(process.execPath, [bin.vitest, "list", "--filesOnly", `--json=${out}`, ...extra], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const files = parseList(root, readFileSync(out, "utf8"));
  writeFileSync(out, "");
  return files;
}

/** Inventory files named exactly, or under a folder named; every name must find one. */
function selectFiles(inventory, names) {
  const norm = names.map((n) => n.split("\\").join("/").replace(/\/$/, ""));
  for (const n of norm)
    if (!inventory.some((f) => f === n || f.startsWith(`${n}/`)))
      throw new Error(`No test file is ${n} or under it.`);
  return inventory.filter((f) => norm.some((n) => f === n || f.startsWith(`${n}/`)));
}

function planUnits({ changed = false, names = [] } = {}) {
  const inventory = listUnitFiles();
  const files = changed
    ? listUnitFiles(["--changed"])
    : names.length
      ? selectFiles(inventory, names)
      : inventory;
  const prefix = changed ? "changed" : names.length ? "selected" : "unit";
  const batches = partition(files, weigh(root, files, config), config, prefix);
  const check = validatePartition(files, batches);
  if (!check.ok)
    throw new Error(`The batches do not cover the tests exactly: ${JSON.stringify(check)}`);
  return {
    inventory: {
      files: inventory.length,
      hash: inventoryHash(inventory),
      selected: files.length,
      batches: batches.map((b) => ({ id: b.id, files: b.files.length })),
    },
    units: batches.map((b) => ({ id: b.id, kind: "vitest", files: b.files })),
  };
}

function planSuite(suite, specs = []) {
  const spec = suites[suite];
  if (!spec) throw new Error(`Unknown suite ${suite}: ${Object.keys(suites).join(", ")}`);
  // --browser=firefox|webkit: the desktop project drawn by that engine (tests/run-policy.ts).
  const browser = flag("browser") ? String(flag("browser")) : null;
  const projects = browser
    ? ["desktop"]
    : flag("project")
      ? String(flag("project")).split(",")
      : null;
  const env = { ...process.env, ...(browser ? { PW_BROWSER: browser } : {}) };
  const out = execFileSync(
    process.execPath,
    [
      bin.playwright,
      "test",
      "-c",
      spec.config,
      "--list",
      "--reporter=json",
      ...specs,
      ...(projects ?? []).map((p) => `--project=${p}`),
    ],
    { cwd: root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 },
  );
  const report = JSON.parse(out);
  // Each spec file and the projects it has tests in: one unit for each pair, so
  // every unit is short enough to finish, and a resume starts close to where it stopped.
  const files = new Map();
  const walk = (s, file) => {
    const own = s.file ? s.file.split(path.sep).join("/") : file;
    for (const sp of s.specs ?? [])
      for (const t of sp.tests ?? []) {
        if (!files.has(own)) files.set(own, new Set());
        files.get(own).add(t.projectName);
      }
    for (const child of s.suites ?? []) walk(child, own);
  };
  for (const s of report.suites ?? []) walk(s, null);
  const testDir = path
    .relative(root, report.config?.rootDir ?? root)
    .split(path.sep)
    .join("/");
  return [...files.keys()].sort().flatMap((file) =>
    [...files.get(file)].sort().map((project) => ({
      id: `${suite}:${path.basename(file, ".spec.ts")}@${project}${browser ? `-${browser}` : ""}`,
      kind: "playwright",
      suite,
      spec: [testDir, file].filter(Boolean).join("/"),
      projects: [project],
      browser,
    })),
  );
}

/** The signed-in test account is configured (its address, never printed). */
function accountReady() {
  if (process.env.E2E_CLERK_USER_EMAIL) return true;
  const file = path.join(root, ".env.local");
  return existsSync(file) && /^\s*E2E_CLERK_USER_EMAIL\s*=\s*\S/m.test(readFileSync(file, "utf8"));
}

function changedSourceFiles() {
  const out = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  });
  return parseStatus(out).filter((f) => existsSync(path.join(root, f)));
}

function planStatic() {
  const changed = changedSourceFiles();
  const lintable = changed.filter((f) => /\.(m?[jt]sx?|cjs)$/.test(f) && !irrelevant(f));
  const formattable = changed.filter((f) => /\.(m?[jt]sx?|cjs|json|css|md)$/.test(f));
  const units = [{ id: "static:tsc", kind: "command", args: ["tsc", "--noEmit", "-p", "."] }];
  if (lintable.length)
    units.push({ id: "static:eslint", kind: "command", args: ["eslint", ...lintable] });
  if (formattable.length)
    units.push({
      id: "static:prettier",
      kind: "command",
      args: ["prettier", "--check", ...formattable],
    });
  return units;
}

// ---------------------------------------------------------------- commands

async function main() {
  const fp = readFingerprint(root);
  const runConfig = { ...config, node: process.version, platform: process.platform };

  if (command === "unit") {
    const plan = planUnits({ changed: Boolean(flag("changed")), names: positional });
    if (plan.units.length === 0) return (say("No test is affected by the changes."), 0);
    const kind = flag("changed") ? "unit-changed" : positional.length ? "unit-selected" : "unit";
    const run = createRun(root, {
      kind,
      fingerprint: fp,
      inventory: plan.inventory,
      config: runConfig,
      units: plan.units,
    });
    say(
      `Run ${run.id}: ${plan.inventory.selected} of ${plan.inventory.files} test files in ${plan.units.length} batches.`,
    );
    return execute(run, run.units);
  }
  if (command === "e2e") {
    const suite = flag("suite");
    const units = planSuite(suite, positional);
    if (units.length === 0) throw new Error("No spec matched.");
    const run = createRun(root, {
      kind: `e2e-${suite}`,
      fingerprint: fp,
      config: runConfig,
      units,
    });
    if (suites[suite].server === "start")
      run.units.unshift({ id: "build", kind: "build", status: "not_started" });
    saveRun(root, run);
    return execute(run, run.units);
  }
  if (command === "build") {
    const run = createRun(root, {
      kind: "build",
      fingerprint: fp,
      config: runConfig,
      units: [{ id: "build", kind: "build" }],
    });
    return execute(run, run.units);
  }
  if (command === "phase") {
    const unit = planUnits();
    const units = [
      ...planStatic(),
      ...unit.units,
      { id: "build", kind: "build" },
      ...planSuite("main"),
      ...planSuite("ownership"),
      ...planSuite("lab-prod"),
      ...planSuite("lab"),
    ];
    const run = createRun(root, {
      kind: "phase",
      fingerprint: fp,
      inventory: unit.inventory,
      config: runConfig,
      units,
    });
    say(
      `Run ${run.id}: ${units.length} units (${unit.inventory.files} test files in ${unit.units.length} batches, then the build and the browser suites).`,
    );
    return execute(run, run.units);
  }
  if (command === "resume") {
    const run = loadRun(root, positional[0]);
    const inventory = run.inventory ? { hash: inventoryHash(listUnitFiles()) } : null;
    const stale = staleReason(run, { fingerprint: fp, inventory });
    if (stale) {
      say(`Run ${run.id} cannot be resumed: ${stale}. Start a new run.`);
      return 2;
    }
    // --skip-failed: go on without running again what already failed a test (it stays failed).
    const pending = pendingUnits(run).filter(
      (u) => !(flag("skip-failed") && u.status === "failed"),
    );
    if (pending.length === 0)
      return (
        say(`Run ${run.id} has nothing left to run. Verdict: ${verdict(run)}.`),
        exitCode(run)
      );
    say(`Resuming ${run.id}: ${pending.length} of ${run.units.length} units.`);
    return execute(run, pending);
  }
  if (command === "report") {
    const run = loadRun(root, positional[0]);
    say(summarize(run));
    const stale = staleReason(run, { fingerprint: fp, inventory: null });
    say(stale ? `Not current: ${stale}.` : "Current: run on the code as it is now.");
    return exitCode(run);
  }
  if (command === "measure") {
    const args = process.argv.slice(process.argv.indexOf("--") + 1);
    const sampler = startSampler({ intervalMs: 1_000, onSample });
    const job = await runJob({
      label: "measure",
      args,
      logFile: path.join(root, ".verify", "measure.log"),
      needMb: 0,
    });
    sampler.stop();
    say(
      JSON.stringify({
        exit: job.exit?.code,
        seconds: job.seconds,
        peakTreeMb: job.peakMb,
        leftover: job.leftover,
        lowestFreeMb: lowest.free,
        lowestCommitFreeMb: lowest.commit,
      }),
    );
    return job.exit?.code ?? 2;
  }
  say(
    readFileSync(fileURLToPath(import.meta.url), "utf8")
      .split("\n")
      .slice(4, 13)
      .map((l) => l.replace(/^\/\/ ?/, ""))
      .join("\n"),
  );
  return 2;
}

mkdirSync(path.join(root, ".verify"), { recursive: true });
main().then(
  (code) => process.exit(code ?? 0),
  (error) => {
    console.error(error.message);
    process.exit(2);
  },
);
