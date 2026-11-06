# Testing and verification

How tests are run on the development machine without running it out of
memory, and how a result is recorded so that nothing unrun or interrupted can
pass for a pass. Built in the Testing Infrastructure Stabilization checkpoint
([handoff](HANDOFF-TEST-INFRA.md)). What to verify, and when, is "How much to
verify" in `ARCHITECTURE.md`; this file is how.

## Commands

| Command                                                                                    | What it runs                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:changed`                                                                   | The unit tests affected by the uncommitted changes, found by Vitest through the module graph (`vitest list --changed`), batched and guarded. Use it while building.                                                                                                                                        |
| `npm run verify:unit -- <file or folder> ...`                                              | The unit tests named, or every test under a folder (each name must match at least one test).                                                                                                                                                                                                               |
| `npm run verify:unit`                                                                      | The whole unit suite, in batches.                                                                                                                                                                                                                                                                          |
| `npm run verify:build`                                                                     | `next build` (never `npm run build`, which has a migration step), once per version of the code.                                                                                                                                                                                                            |
| `npm run verify:e2e -- --suite=<suite> [spec ...] [--project=desktop] [--browser=firefox]` | One browser suite (`main`, `lab`, `lab-prod`, or `ownership`), one unit per spec and project, on a server the coordinator starts and stops. `main` and `lab-prod` build first, or reuse this code's build. `--browser=firefox` or `webkit` draws the desktop project with that engine, for a screen check. |
| `npm run verify:phase`                                                                     | Everything, one job at a time: type checking, lint and formatting of the changed files, the whole unit suite, the build, and the four browser suites. For integration and release boundaries.                                                                                                              |
| `npm run verify:resume [-- <run id>] [--skip-failed]`                                      | Runs again what an interrupted or failed run did not pass, if the code is still what it ran on. `--skip-failed` goes on without running a failed unit again (it stays failed).                                                                                                                             |
| `npm run verify:report [-- <run id>]`                                                      | Shows a run's results and whether they still apply to the code as it is.                                                                                                                                                                                                                                   |
| `node scripts/verify/cli.mjs measure -- <script> [args]`                                   | Runs one Node script as an owned process and reports its process tree's peak memory and the lowest free memory seen. For measuring, not for verifying.                                                                                                                                                     |

Arguments after `--` go to the coordinator (`npm run verify:unit -- src/features/ideas`).

**Long runs go in steps.** Any command takes `--max-units=N`: it runs at most N
units and stops, and `npm run verify:resume -- --max-units=N` goes on from
there in the same run. Run long work this way, in the foreground, a few units
at a time, reading free memory between steps. Claude Code ends a background
command when the machine runs low on memory (its guard stays on), and a step
of a few minutes is never left half done. The whole unit suite is nine batches
of two to five minutes each with one worker (about 26 minutes).

**Do not** run the whole suite another way: not a bare `npx vitest run`, not
`npx playwright test` over a whole configuration, and never two heavy jobs at
once (a build beside a browser suite, two servers, two suites). A single test
file or a few, run directly while writing them
(`npx vitest run src/features/x/y.test.ts`), is fine: the Vitest
configuration caps workers at two.

## Resource policy

The defaults are in `scripts/verify/config.mjs`, each from a measurement
recorded in the handoff. Any can be changed for a run with a flag
(`--reserve-mb=1500`) or an environment variable (`VERIFY_RESERVE_MB=1500`).
Do not lower one to get a job admitted: free memory instead.

- **One heavy job at a time.** A Vitest batch, a build, a server and the
  browser suite that uses it: never two of these side by side.
- **Admission.** A job starts only when free physical memory, less what the
  job needs at its measured peak, stays above the reserve (1 GB). Otherwise it
  waits up to three minutes for memory to come back, then is recorded
  `not_started` and the run stops there.
- **Critical level.** While a job runs, memory is read every two seconds. If
  free physical memory falls below 350 MB, or free commit below 1.5 GB, the job
  (and only the job) is stopped and recorded `resource_exhausted`. The run
  stops; resume it once memory is back.
- **Measured needs** (peak working set, MB): a Vitest worker 1,400 and Vitest
  itself 300; `next build` 3,000; `next start` 500; `next dev` 2,800; one
  browser unit 1,400.
- **Vitest workers.** At most two, and only as many as fit above the reserve.
  With 4 GB free, one. A run never starts more workers because the machine has
  more CPUs.
- **Playwright.** One worker in every configuration unless `PW_WORKERS` says
  otherwise. Each run's artifacts go to a folder of its own
  (`.verify/runs/<run>/artifacts/<unit>`, or `test-results/<configuration>`
  outside the coordinator).

## Batches

The unit inventory is what Vitest discovers (`vitest list --filesOnly`), never
a glob of ours, so a new test file is in the next run with no change here.
Files are sorted and packed into batches of at most 40 weight, where a file
that opens an in-memory database weighs 3 and any other 1. Before a run
starts, the coordinator proves every file is in exactly one batch (no
omission, no duplicate, nothing outside the inventory). After each batch it
reads Vitest's JSON report and proves the files that ran are exactly the
files planned; anything else is an infrastructure error, never a pass.

Batches are checkpoints, not a memory measure: since the database fix (below)
memory does not build up from file to file in a worker. They are where a run
checks memory again and where a resume starts from.

## Results

Every run is a folder in `.verify/runs/` (ignored by Git): `run.json` (the
plan, each unit's status, counts, peak memory, and time, and the lowest free
memory of the run), `summary.md`, and each unit's log and JSON report.

| Status               | Meaning                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passed`             | It ran to the end and everything passed.                                                                                                                                                                             |
| `failed`             | A test failed, or Vitest exited non-zero with every test passing (an error no test caught).                                                                                                                          |
| `infra_error`        | It could not run or report properly: no report, the wrong files ran, a server would not start, or every browser test skipped itself without the test account.                                                        |
| `resource_exhausted` | The coordinator stopped it for memory.                                                                                                                                                                               |
| `interrupted`        | Stopped by Ctrl+C.                                                                                                                                                                                                   |
| `not_started`        | Never started: not enough memory, or the run stopped earlier.                                                                                                                                                        |
| `skipped`            | Left out on purpose: a browser unit in which every test skips itself by its own stated reason (a desktop-only spec on the phone project), recorded with those reasons, and only when the test account is configured. |

A run **passes** only when every unit passed (or was skipped as above). A run
with a failure and nothing else unfinished **fails**. Anything else is
**incomplete**. Exit codes: 0 passed, 1 failed, 2 incomplete or refused. A run
stops at the first unit that could not run at all, or that memory stopped.

**The fingerprint.** A run records HEAD and a hash of the content of every
path Git reports as changed from it (modified, staged, deleted, renamed, or
untracked and not ignored). Markdown and `docs/` are left out: writing a
handoff does not make a finished run stale. Everything else counts, the test
code and the coordinator's own included. A resume, and the build's reuse, are
refused when the fingerprint (or, for the unit suite, the set of test files)
has changed since; `verify:report` says whether a run is current.

## Servers and processes

- The coordinator starts what a browser suite needs itself: `next start` on
  this code's build (3100 for `main`, 3300 for `lab-prod`), or `next dev`
  (3200, `lab`). It never runs `npm run dev` or `npm run build`, so no test
  run migrates a database. The Playwright configurations themselves run
  `next build` and `next dev` too, when used without the coordinator.
- Before starting a server it runs `node scripts/db/cli.mjs status dev`, which
  only reads, and refuses to go on if the development database has pending
  migrations. Migrating it is the owner's.
- A port in use by anything this run did not start is refused, not reused and
  never stopped. To test against a server you started yourself, pass
  `--base-url=http://localhost:<port>`.
- Each process the coordinator starts is recorded by its PID and its creation
  time. Stopping one stops it and its descendants, found through those
  identities: a child is attributed to the process that held its parent's PID
  when the child was created, so a PID reused by an unrelated process is never
  claimed. Each is ended with `taskkill /PID <pid> /F` (never `/T`, never by
  image name or port). Every job's leftover processes are stopped when it
  ends, every server when its suite ends, and all of them on Ctrl+C.

## In-memory databases

`createTestDatabase()` (`src/db/testing.ts`) and `recordingDatabase()` close
their PGlite instance through `src/db/test-lifecycle.ts`: an instance made
during a test (its `beforeEach` included) after that test's own `afterEach`,
one made outside a test (`beforeAll`) after the file's own `afterAll`, and one
whose migrations fail at once. A test that makes a `new PGlite()` itself wraps
it in `ownTestClient(...)`. A closed database refuses every query ("PGlite is
closed"). Each instance holds about 240 MB outside the JavaScript heap, and an
unclosed one is never reclaimed (TEST-005 in `BUGS.md`): never make one
another way.

## Known limitations

- Free memory is the operating system's reading (on Windows,
  `Win32_OperatingSystem`); the coordinator cannot tell what other
  applications will do next, so the reserve is the margin.
- A process is identified by a snapshot taken just after it starts. One that
  exits within that moment has no identity, and anything it started cannot be
  attributed to it. If the snapshot itself fails, only the direct child can be
  stopped.
- Between the snapshot that finds a tree and the call that ends a member there
  are milliseconds in which a PID could be reused; the creation time is not
  checked again in that window.
- Signed-in suites need `E2E_CLERK_USER_EMAIL` in `.env.local`. Without it
  every signed-in spec skips itself, and the coordinator records that unit as
  an infrastructure error, never a pass.
- Firefox and WebKit (`--browser`) are screen checks, read by hand.
  `page.pdf()` is Chromium's alone, and the specs' sign-in helper
  (`clerk.signIn` followed at once by `page.goto`) races Clerk's own redirect in
  both engines (TEST-009), so most signed-in specs stop before their first
  check there: limitations of the tests, not results about the application.
- The lab suite is the tightest workload. `next dev` grows to about 2.7 GB as
  it compiles the lab's routes, and with the usual desktop applications open,
  free memory reached about 0.5 GB during its units: above the critical level,
  with admission holding later units back until memory returned. Close large
  applications before it, or run it in steps.
- A build is admitted only with about 4 GB free (3 GB at its peak, plus the
  reserve). With less, it waits and is recorded `not_started`.
