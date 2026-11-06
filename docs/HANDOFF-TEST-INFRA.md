# Handoff: Testing Infrastructure Stabilization

6 November 2026. A standalone checkpoint before A1-UI.3, under its
descriptive name (no phase number yet). It changes no application code, no
schema, no migration, no package, and no flag. How tests are run from now on
is [docs/TESTING.md](TESTING.md).

## 1. Repository state

- **Start:** `dev` at `33c5629b26dd06e67fff06e35b69966f91592dc4` ("Phase A4.4 is
  done"), working tree clean.
- **End:** the same HEAD; every change below is unstaged and uncommitted.
  Nothing was staged, committed, pushed, deployed, or migrated; no feature flag
  was changed.
- **Not mine:** `.env.example` changed during the session (09:54), and this
  checkpoint did not change it: three commented variable names were
  uncommented, with empty values (`E2E_CLERK_USER_EMAIL=`,
  `PRODUCTION_DATABASE_URL=`, `SERMON_DOCUMENT_CONVERSION=`). Left as found,
  for the owner. It is part of the fingerprints below.

## 2. Root cause

**Confirmed (measured): unit tests never closed their in-memory databases
(TEST-005).**

- `createTestDatabase()` made a PGlite instance, migrated it, and returned
  only the Drizzle handle; nothing closed it, not even when the migration
  threw. 48 test files call it, almost all in `beforeEach`, so every test made
  one. `recordingDatabase()` did the same. Of 8 files with their own
  `new PGlite()`, one closed it.
- One instance holds about 238 MB outside the JavaScript heap (Node script,
  `--expose-gc`, 8 instances with migrations):

  | Instances handled by                                | Memory after 8                        | After forced GC                |
  | --------------------------------------------------- | ------------------------------------- | ------------------------------ |
  | references dropped, never closed (as the tests did) | RSS 1,910 MB, external 1,905 MB       | unchanged: **never reclaimed** |
  | `close()` after each                                | RSS about 440–490 MB, external 243 MB | flat                           |

- So a worker grew by about 240 MB per test that used a database, which
  matches A4.4's 1.8 GB worker.

**Confirmed, contributing:** the Vitest configuration had no worker limit, so
a bare `vitest run` on this 16-thread machine would start about 15 workers.

**Confirmed, a second defect found on the way (TEST-006):** an unhandled jsdom
error (`getClientRects`) in `appearance-dialogs.test.tsx` made every whole unit
run exit 1, although every test passed, so no whole run could ever pass. The
file's own stub ran too late; it now runs for the whole file.

**Ruled out by measurement:** memory building up from file to file in a worker
once databases are closed. The 19 `ideas` files in one worker peaked at
1,048 MB, no more than the heaviest single file. Fake timers are always
restored. Four files stub globals without unstubbing; that is isolation within
a file, not memory, and was left as it is.

**Unresolved hypotheses:** none about the memory. The jsdom environment costs
about 0.6–1 GB per worker at peak, a steady cost; splitting node and jsdom
projects was not justified by that.

## 3. Memory, before and after

Machine: 13.9 GB, 16 threads, Windows 11, with Chrome, ChatGPT, VS Code,
Discord and others open (free memory at rest 3.4–4.2 GB).

| Workload                                                     | Before                                                                      | After                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/features/ideas/classification.test.ts` alone, 1 worker  | tree peak 2,684 MB working set (3,521 private); lowest free memory **9 MB** | 899 MB (1,321 private); lowest free 2,970 MB                                                                                 |
| `src/features/outlines/entries.test.ts` (63 tests), 1 worker | not run before the fix (would have needed about 15 GB)                      | 1,269 MB                                                                                                                     |
| The whole unit suite                                         | A4.4: stopped twice, worker about 1.8 GB                                    | 227 files, 9 batches, highest batch 1,629 MB; lowest free 1,988 MB (first run), 2,501 MB (final run); **no stop for memory** |
| `next build`                                                 | —                                                                           | 2,780 MB peak, 31 s (Turbopack cache warm)                                                                                   |
| `next start` (main suite)                                    | —                                                                           | 351 MB                                                                                                                       |
| `next dev` (lab suite)                                       | —                                                                           | grows to 2,738 MB as it compiles the lab's routes                                                                            |
| One Playwright unit (browser and runner)                     | —                                                                           | 700–1,360 MB                                                                                                                 |

After every job the coordinator stopped what it had started, and free memory
returned to 3.4–4.2 GB between steps (checked before each step).

## 4. Files

**Added**

- `scripts/verify/`: the coordinator. `cli.mjs` (commands), `config.mjs`
  (policy and measured needs), `resources.mjs` (memory and process readings),
  `processes.mjs` (owned processes), `inventory.mjs` (inventory and batches),
  `fingerprint.mjs`, `runs.mjs` (results, statuses, classification). Tests:
  `inventory.test.mjs`, `runs.test.mjs`, `fingerprint.test.mjs`,
  `processes.test.mjs`.
- `src/db/test-lifecycle.ts` (closing databases), `src/db/test-lifecycle.test.ts`,
  and `src/db/lifecycle-fixtures/` (fixture files it runs in a child Vitest;
  not part of the suite: two fail on purpose).
- `tests/run-policy.ts` (Playwright workers, artifact folders, desktop engine).
- `docs/TESTING.md`, this handoff.

**Changed**

- `src/db/testing.ts`, `src/features/appearance-presets/testing.ts`: register
  the instance and close it on a failed migration.
- 8 test files with their own `new PGlite()` (the seven `src/db/*migration*` and
  `classification-tightening` tests, `appearance-presets/model.test.ts`): the
  constructor wrapped in `ownTestClient(...)`. No assertion changed.
- `src/features/sermon-editor/appearance/appearance-dialogs.test.tsx`: the
  existing Range stub moved to a file-level `beforeAll` (TEST-006). No
  assertion changed.
- `vitest.setup.ts` (lifecycle hooks), `vitest.config.mts` (`pool: "forks"`,
  `maxWorkers` 2 or `VITEST_MAX_WORKERS`).
- `playwright.config.ts`: `next build && next start` instead of
  `npm run build && npm run start` (no migration step); `E2E_BASE_URL`; one
  worker by default; its own artifact folder; the desktop engine from
  `PW_BROWSER`. Projects unchanged.
- `tests/lab/config.ts`: `next dev` instead of `npm run dev` (no migration);
  `E2E_BASE_URL` for `lab-prod`; artifact folders; desktop engine. Projects and
  spec list unchanged.
- `playwright.ownership.config.ts`: its own artifact folder.
- `package.json`: the `verify:*` scripts. `.gitignore`: `/.verify/`.
- `AGENTS.md`, `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/BUGS.md` (TEST-005
  to TEST-009). `docs/HANDOFF-PS-A4.4.md` is untouched: its record stands.

## 5. Commands

See [docs/TESTING.md](TESTING.md). In short: `npm run verify:changed` while
building; `verify:unit [-- paths]`; `verify:build`; `verify:e2e --
--suite=main|lab|lab-prod|ownership [specs] [--project=…] [--browser=…]`;
`verify:phase`; `verify:resume [-- --skip-failed]`; `verify:report`; and
`--max-units=N` on any of them to go in steps.

## 6. Database and process lifecycle

- **Databases:** registered on creation; closed after the test's own
  `afterEach` (made in a test or its `beforeEach`) or the file's own `afterAll`
  (made in `beforeAll`); closed at once on a failed migration; a closed one
  refuses queries. Proven by `test-lifecycle.test.ts`, running fixture files
  through the real setup in a child Vitest: the order of hooks and closes, a
  failing `beforeEach`, a failing `beforeAll`, a failed migration, and a query
  on a closed database (5 tests).
- **Processes:** identified by PID and creation time; descendants found by
  which process held the parent PID when each child was created; each ended
  with `taskkill /PID … /F`, never `/T`, never by name or port. Proven by
  `processes.test.mjs` with real processes: an owned process and its child
  stopped while a sleeper of the test's own survives; a live process with a
  matching PID but another creation time never touched (PID reuse); pure
  cases of PIDs reused by older and newer processes; a command that cannot
  start; arguments and paths with spaces and shell characters, with no shell.
- **Servers:** started by the coordinator after a read-only database status
  check and a free-port check, stopped when their suite ends; a busy port is
  refused, never reused or stopped.
- **Found while running:** `spawnOwned` waited for its identity before
  returning, so a short child's piped output was drained by Node before a
  caller could read it; it now returns at once with the identity as a
  promise.

## 7. Inventory and batches

Vitest's own discovery, 227 files (the 222 of A4.4 plus
`test-lifecycle.test.ts` and the four coordinator tests); no path is a
substring of another. Final run `2026-11-06T19-23-50-108Z-33c5629`, inventory
hash `1e3726acc4e2661f`, every file in exactly one batch (validated before the
run, and the files that ran checked against each batch's report):

| Batch   | Files | First … last                                                                             | Tests passed | Peak MB | Seconds |
| ------- | ----- | ---------------------------------------------------------------------------------------- | ------------ | ------- | ------- |
| unit-01 | 28    | `scripts/bible/dataset.test.mjs` … `components/layout/leave-guard.test.tsx`              | 335          | 1,006   | 117     |
| unit-02 | 18    | `components/layout/loading.test.tsx` … `admin/components/users-table.test.tsx`           | 108          | 1,599   | 74      |
| unit-03 | 26    | `admin/users.test.ts` … `editor-lab/v4/compat.test.ts`                                   | 638          | 1,011   | 158     |
| unit-04 | 28    | `editor-lab/v4/editing.test.ts` … `ideas/relation-actions.test.ts`                       | 606          | 878     | 186     |
| unit-05 | 24    | `ideas/relations.test.ts` … `outlines/components/numbering-dialog.test.tsx`              | 332          | 941     | 207     |
| unit-06 | 24    | `outlines/components/outline-editor.test.tsx` … `pwa/components/install-notice.test.tsx` | 449          | 1,264   | 271     |
| unit-07 | 30    | `pwa/components/offline-message.test.tsx` … `sermon-editor/host/save-status.test.ts`     | 616          | 974     | 272     |
| unit-08 | 30    | `sermon-editor/insert-menu.test.ts` … `settings/components/bible-settings.test.tsx`      | 563          | 1,091   | 154     |
| unit-09 | 19    | `settings/components/church-ministry-settings.test.tsx` … `src/lib/unsaved-work.test.ts` | 211          | 1,091   | 134     |

Every batch ran with one worker: with about 4 GB free, one fits above the
reserve.

## 8. Verification results

Fingerprints (HEAD `33c5629` plus the working tree): **`7a95fc07cdaa4433` is the
final code.** Earlier fingerprints differ from it only in test infrastructure:
`ba635bbe…` lacks the later coordinator changes (`cli.mjs`, `runs.mjs`,
`config.mjs`) and `tests/run-policy.ts`'s engine choice; `0073eaa3…` lacks the
engine choice and the measured needs. No application file differs between any
of them and `33c5629`.

| Check                                                                                                                                                                                         | Run on                    | Result                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator tests (`scripts/verify`)                                                                                                                                                          | final                     | 43 passed                                                                                                                                                              |
| Database lifecycle tests                                                                                                                                                                      | final (in the unit suite) | 5 passed                                                                                                                                                               |
| Type check (`tsc --noEmit -p .`)                                                                                                                                                              | final                     | clean                                                                                                                                                                  |
| ESLint, changed files                                                                                                                                                                         | final                     | clean                                                                                                                                                                  |
| Prettier, changed files                                                                                                                                                                       | final                     | clean                                                                                                                                                                  |
| **Whole unit suite** (`verify:unit`)                                                                                                                                                          | **final**                 | **passed: 227 files, 3,858 tests, 0 failed, 0 skipped**                                                                                                                |
| Whole unit suite, first complete run                                                                                                                                                          | `ba635bbe`                | passed: 227 files, 3,857 tests                                                                                                                                         |
| First attempt (background)                                                                                                                                                                    | `cd2beab1`                | **incomplete:** 3 batches passed, then Claude Code's memory guard ended the shell; batch 4 recorded `infra_error` (25 files missing), 5–9 could not start. Not counted |
| `next build` (`verify:build`)                                                                                                                                                                 | `ba635bbe`                | passed (warning: no font override values for Atkinson Hyperlegible Next)                                                                                               |
| `next build`                                                                                                                                                                                  | final                     | **not started:** 3.5–3.6 GB free, admission needs 4 GB                                                                                                                 |
| Signed-in editor journeys, `main` on `next start`: `sermon-document`, `sermon-header`, `sermon-appearance`, `sermon-compatibility`, `offline-ideas`, `offline-outlines`, `appearance-presets` | `ba635bbe`                | **passed:** 35 passed, 0 failed, 9 skipped (each by its spec's own project choice: phone-only on desktop, desktop-only or PDF on the phone)                            |
| Two-tab ownership (`ownership`)                                                                                                                                                               | final                     | passed 8 of 8                                                                                                                                                          |
| Production lab exclusion (`lab-prod`)                                                                                                                                                         | `ba635bbe`                | passed 4 of 4                                                                                                                                                          |
| Production lab exclusion                                                                                                                                                                      | final                     | not started (needs the final build)                                                                                                                                    |
| **Whole lab suite** (`lab`, desktop and mobile, 24 units)                                                                                                                                     | `0073eaa3`                | **failed:** 74 passed, 6 failed (below), 7 units skipped by design                                                                                                     |
| `preset-parity`                                                                                                                                                                               | `0073eaa3`                | **passed** (desktop; the phone project skips by design)                                                                                                                |
| Firefox and WebKit, desktop screen specs                                                                                                                                                      | `b69e6ee0`                | blocked by TEST-009 (below)                                                                                                                                            |

**The six lab failures:**

| Unit                        | Test                                                 | Classification                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v4@desktop`                | "a deletion the browser makes on its own…", line 298 | Known, pre-existing (TEST-004)                                                                                                                                                                            |
| `navigation@mobile`         | "walk Print Layout test in Regular", line 216        | Known, pre-existing (TEST-004)                                                                                                                                                                            |
| `pagination@mobile`         | P3, line 539                                         | Known, pre-existing, intermittent (TEST-004)                                                                                                                                                              |
| `pagination@desktop`        | P3, line 542                                         | The same intermittent P3 (A4.3 saw line 542 too; `BUGS.md` notes P3 on long-running dev servers)                                                                                                          |
| `editor@desktop`            | rich titles: Ctrl+B bolds "ight", line 389           | **TEST-007, new, 4 of 4.** Not classified: A4.3 recorded `editor` 8/8 on desktop; application code unchanged by this checkpoint; A4.4's lab changes have nothing about keys or selection; no baseline run |
| `persistence-probe@desktop` | the row-lock case, line 206                          | **TEST-008, new to the record, 2 of 2.** No run recorded since A2.3B.2D                                                                                                                                   |

**Firefox and WebKit:** the specs' sign-in helper races Clerk's redirect in
both engines (TEST-009), so most signed-in specs stop at sign-in. In WebKit,
three screen checks ran and passed (header, long title, and pages never
overlap on every paper; the header in the paper's ink in a dark theme; a
format at a collapsed cursor). One differed by rounding only. PDF tests are
Chromium-only. Print in Firefox and Safari is still unverified, as A4.4 said.

## 9. A4.4 carry-forward

| A4.4 outstanding check                                                              | Result                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Vitest batch 3 (twice interrupted)                                                  | Done: every file of it in the whole-suite run, which passed on the final code                             |
| Whole lab suite, both projects                                                      | Done: failed with the six failures above. Four are known; TEST-007 and TEST-008 are open and unclassified |
| `preset-parity.spec.ts`                                                             | Passed                                                                                                    |
| `npx next build`                                                                    | Passed on `ba635bbe` (application identical to `33c5629`); not re-run on the final fingerprint (memory)   |
| Signed-in journeys on `next start`, offline, recovery, two-tab ownership, read-only | Passed                                                                                                    |
| Firefox and WebKit                                                                  | Blocked for most specs (TEST-009); three WebKit screen checks passed; printing unverified                 |

## 10. Known limitations and remaining issues

- The lab suite is the tightest workload. During it, free memory reached about
  0.5 GB with the owner's usual applications open: above the critical level,
  and admission held later units back until memory returned (two runs stopped
  there and were resumed). The needs were raised to the measured peaks.
- A build needs about 4 GB free to be admitted. It was not admitted for the
  final fingerprint while 3.5–3.6 GB was free.
- Claude Code ends background commands when memory runs low; long work runs
  in foreground steps (`--max-units`), as `TESTING.md` says.
- Process identity has two narrow windows (`TESTING.md`, "Known
  limitations").
- TEST-007, TEST-008, TEST-009 are open; TEST-003 and TEST-004 are unchanged.

## 11. Owner actions

1. Decide about `.env.example` (changed during the session, not by this
   checkpoint).
2. With large applications closed (about 4.5 GB free), run
   `npm run verify:build`, then `npm run verify:e2e -- --suite=lab-prod`, to
   bring the build and `lab-prod` onto the final fingerprint.
3. Name a checkpoint for TEST-007 (compare `editor.spec.ts` at `f77fd0a`, or
   trace it), TEST-008, and TEST-009 (a test change: wait for Clerk's redirect
   after signing in).
4. Assign this checkpoint a phase number if wanted; the handoff's file name
   can follow.

## 12. Verdict

**Ready for the owner's review and commit, with the reservations below.**

- **Ready:** the memory defect is found, measured, and fixed. The coordinator
  runs the complete unit suite within measured memory, proves complete coverage,
  stops only its own processes, and records interrupted or partial work as
  such. The whole unit suite passed on the final code, and the signed-in
  journeys and ownership passed.
- **Not complete:**
  - the build and `lab-prod` on the final fingerprint (memory; owner action 2);
  - the lab suite's two new, unclassified failures (TEST-007, TEST-008);
  - Firefox and WebKit, blocked by the test helper (TEST-009).

  None of these comes from a change in this checkpoint: no application file
  differs from `33c5629`. They are A4.4-era and earlier questions now visible
  because the whole suite can finally run.
