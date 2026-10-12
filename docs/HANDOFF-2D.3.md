# Phase 2D.3 Handoff — Data Tightening, Compatibility & Final Hardening

Written 12 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) and [DATABASE.md](DATABASE.md) ("Phase 2D.3 migration") are the reference; this is the summary.

**Status: complete and verified, with one failure outside this phase.** Every check passes except one end-to-end journey from Phase 2C.1B (saved Scripture), whose test is out of date; see section E.

## A. Implementation summary

- **Migration `0008_idea_classification_tightening`**: rewrites the two classification values from before Phase 2D.1 and then makes the table refuse them.
- **The schema and the library query no longer admit the old values.** `storedIdeaStatuses` is gone; the status and type filters match the current values only.
- **One defensive read is kept** (`asRead`), on purpose; see section G.
- **The signed-in end-to-end journeys ran for the first time.** Six things in `tests/e2e/library.spec.ts` were wrong in the test, none in the application; they are corrected.
- **A signed-in browser pass** at phone and desktop widths, both themes, both languages.
- **One interface fix**: in the library's list view a sermon's type and format were cut off, and on an archived sermon vanished entirely, at most widths. They now wrap to a second line instead.

No new feature, dependency, navigation item, action, or string.

## B. Legacy data normalization

The audit covered every CHECK in migrations `0001` to `0007`, `schema.ts`, `model.ts`, the Zod schemas, `asRead`, and every write in `ideas.ts`.

| Stored before         | Becomes         | Why it is not a guess                                           |
| --------------------- | --------------- | --------------------------------------------------------------- |
| `status = 'captured'` | `'idea'`        | The same status under its old name; `asRead` already read it so |
| `sermon_type IS NULL` | `'unspecified'` | Both say no type was chosen; `asRead` already read it so        |

- No other old value exists: `developing`, `ready`, `topical`, and `expository` kept their names, and `intended_format` has been NOT NULL with a CHECK since it was added.
- Nothing is inferred from a title, notes, tags, or passages.
- **A migration was necessary**: the table still admitted both old values, and rows from before 2D.1 may hold them.
- It was applied to the **development** database with `npm run db:migrate:dev`. It has **not** been applied to production.

## C. Database and domain invariants

| Invariant                                     | Where it is enforced                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A status is one of the four                   | `ideas_status_check` (now without `captured`); `z.enum(ideaStatuses)` in every schema                      |
| A sermon type is one of the four, never null  | `ideas_sermon_type_check` and `NOT NULL` (new); `z.enum(sermonTypes)`                                      |
| A format is one of the four, never null       | `ideas_intended_format_check` and `NOT NULL` (since `0007`); `z.enum(intendedFormats)`                     |
| A format or type applies only to a sermon     | `ClassificationSection` (chosen), `IdeaResults` (shown), `kind = 'sermon'` beside both filters (found)     |
| Archiving is apart from status                | `archived_at` only, through `archiveIdea` / `restoreIdea`, which pin `updated_at` and name no other column |
| A save leaves an unnamed classification alone | `ideaUpdate` has no defaults; an undefined column is not written                                           |
| Every read and write is the owner's           | `owner_id` in the WHERE clause of every statement in `ideas.ts` (unchanged)                                |
| The old values are never written again        | Nothing in the code writes them, and the table now refuses them                                            |

**Deliberately not a database constraint:** "only a sermon has a format or type". The columns are kept when an idea is reclassified so that turning it back into a sermon loses nothing, and the code in production saves a point's whole draft with them. A CHECK would discard data and fail live saves. This is the one place the brief's wording and the established model differ; the model was kept.

## D. Files changed

**New**

- `drizzle/0008_idea_classification_tightening.sql`, `drizzle/meta/0008_snapshot.json`
- `src/db/classification-tightening.test.ts`
- `docs/HANDOFF-2D.3.md`

**Modified, code**

- `src/db/schema.ts` — `status` enum, the two CHECKs, `sermon_type` NOT NULL
- `src/features/ideas/model.ts` — `storedIdeaStatuses` and `StoredIdeaStatus` removed
- `src/features/ideas/ideas.ts` — the two filter allowances removed; `asRead` exported and described as a guard; `IdeaRecord` is now `Idea`
- `src/features/ideas/components/library/idea-results.tsx` — three class changes on the list row (details wrap; wider details column from 1280px; a two-line title between 768px and 1280px)
- `drizzle/meta/_journal.json` — generated

**Modified, tests**

- `src/features/ideas/classification.test.ts` — the "saved before the rename" block now checks that the table refuses both old values and that `asRead` maps those two and nothing else
- `src/features/ideas/library.test.ts` — one fixture row no longer uses the old values
- `tests/e2e/library.spec.ts` — selectors only (section E)

**Modified, documentation**

- `docs/DATABASE.md`, `docs/ROADMAP.md`, `ARCHITECTURE.md`, `AGENTS.md`

Prettier was run on the files above by name and on nothing else.

## E. Testing results

Final runs, after every change in this phase. The first attempt at them was stopped by the machine running low on memory; they were run again one at a time, the unit suite with four workers and the end-to-end suite with three.

| Check               | Result                             | Notes                                                              |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck` | **Pass**                           |                                                                    |
| `npm run lint`      | **Pass**                           |                                                                    |
| `npm run test`      | **Pass, 1,140 of 1,140**           | 65 files. Was 1,135 in 64                                          |
| `npm run build`     | **Pass**                           | Migrations skipped outside a production deploy                     |
| `npm run test:e2e`  | **67 passed, 2 failed, 1 skipped** | Signed in, on a production build, against the development database |

- **Passed, signed in, for the first time:** both library journeys (search, filters, tags, views, the way back; classify, archive, find among the archived, restore), the Bible reader's, and Scripture to an idea, on desktop and mobile.
- **Failed: `tests/e2e/saved-scripture.spec.ts`, on both projects, at its first step.** It waits for a response whose address ends in `/marks`. Since Phase 2C.2 the reader asks for `/marks?t=…` (`use-chapter-marks.ts`), so the wait never ends and the test times out before it selects a verse. The test is out of date; nothing in it reached the application, and it left nothing behind. It was not changed here: it belongs to Phase 2C.1B, has never run, and may need more than this one correction. The correction is to compare `new URL(response.url()).pathname` instead.
- **Skipped:** the landing page's mobile menu test on the desktop project, by its own condition.

**What was wrong in the end-to-end test** (written blind in 2B.2 and 2D.2):

- "Library" matched the header's link, not the idea page's way back.
- `getByText` matched a copy of the previous page that Next keeps hidden; such checks now ask for the visible one.
- "All" is now both a tag mode and an archive choice.
- The browser's Back was pressed before the idea page had opened.
- The archive choice was `check()`ed, which fails on a control whose state follows the address.

## F. Browser verification

Signed in as the development test account, against the owner's dev server and the development database, with Playwright.

- **Viewports:** 375×812 (touch) and 1280×900 throughout; the list view also at 768 and 1024.
- **Themes:** light and dark. **Languages:** English and Spanish. Seven of the eight combinations ran to the end; desktop, dark, Spanish covered the editor, the guide, the dropdown, the archive confirmation, and an archived idea before its session was signed out by Clerk.

**Checked by measurement on every screen:** no horizontal page overflow; the sermon-type guide, an open dropdown, and the archive confirmation wholly inside the window; the guide button and Restore at least 32px on touch. Nothing failed.

**Checked by behavior:**

- The section is closed by default; Enter on it opens it and `aria-expanded` follows.
- A sermon shows three dropdowns, a point one.
- The guide opens from the keyboard and shows all four entries with the right definition and example, in both languages (the text was read back, not only seen).
- The picker's search does not return an archived idea and does return an active one.
- The dashboard does not list an archived idea.
- An archived idea opens by its address, shows "Archived {date}" with Restore and no Archive button; restoring it there kept "On Hold · Full-Length · Expository".
- The default library leaves the archived idea out; `archived=all` shows it with its badge, status, and Restore; combined filters, chips, and counts agree.

**Looked at as screenshots:** the editor closed and open, the guide on a phone, the filter panel with five filters in force, quick capture with the section under "More details", the archived notice, and the list and card views.

**Not looked at:** pagination past one page with real volume, the "every idea is archived" state (it needs an account with nothing active), and editing a classification then leaving without saving. The first and third are covered by the passing end-to-end journey and by component tests.

## G. Data safety and compatibility

- `0008` changes two columns on rows that held an old value and nothing else. `updated_at` is set by the application, not a trigger, so no idea moves in the library. Tags, references, owners, notes, and archive dates are untouched; the migration test compares all of them before and after, for two accounts.
- If a row holds a value on neither list, re-adding the CHECK fails, the whole migration rolls back, the production build fails, and the previous deployment keeps serving.
- **Order with the deployment.** The owner confirmed the 2D.1 release is live in production. That code writes only the current values, so every save it makes while `0008` runs satisfies the tighter table. The test runs that code's insert and update against it.
- **`asRead` is kept.** Preview deployments share the development database, which only `npm run dev` migrates, so new code can meet a database `0008` has not reached. It maps the two old values and nothing else, and a test holds it to that.
- **`?status=captured` in an address still reads as `idea`.** That is an old bookmark, not stored data.

## H. Outstanding issues

- **`tests/e2e/saved-scripture.spec.ts` fails for a reason of its own** (section E). It is a test fault from an earlier phase, not a fault in saved Scripture, which this phase did not touch.
- **A failed end-to-end run leaves its ideas and tags behind.** Its cleanup uses the same page that failed. This session's leftovers (prefixes `e2emv5…` and `qamv5…`) were all removed and the count confirmed at zero.
- **The visual pass switched the test account to Spanish and back.** It was confirmed in English at the end.
- **Between 768px and 1280px an archived sermon's list row is two lines tall**, and its title is short at 768px. Nothing is cut off.
- **The Spanish wording is still the agent's**, not a native speaker's. No inconsistency was found, and none was changed.
- Unchanged, as decided: tag counts include archived ideas; `attachReferences` does not check for archiving; no bulk actions; no undo toast.

## I. Required manual actions

1. **Review and commit.** No Git command was run.
2. **Release.** Merging to `master` applies `0008` during the production build; there is no manual migration step. Do not push a second release with a migration while it builds. After it, do not roll back to a release from before 2D.1.
3. Optional, before releasing: `npm run db:status -- prod` shows `0008` as the one pending migration.
4. Optional, any time: correct `tests/e2e/saved-scripture.spec.ts` as section E describes and run it.

`E2E_CLERK_USER_EMAIL` is now set in `.env.local`; nothing more is needed for the signed-in tests. On this machine the suites are gentler on memory as `npm run test -- --maxWorkers=4` and `npm run test:e2e -- --workers=3`.

## J. Readiness for Phase 2E

Ready. The classification and archive model needs no further change: a preaching occurrence will reference `ideas.id`, nothing about it is stored on the idea, and archiving an idea must not remove it. No blocker is known.

## K. Process cleanup

- The first, background run of the final checks was stopped by Claude Code for low memory. Its orphaned Vitest process and eight workers were then terminated by this session. The checks were run again in the foreground and ended by themselves.
- No server started by this session is running; port 3100 is free. The end-to-end server stopped with each run.
- The dev server on port 3000 is the owner's and was not touched.
- No temporary route was added. The scripts and screenshots are in the session's scratch folder, outside the repository.
