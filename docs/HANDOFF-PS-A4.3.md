# Handoff: PS-A4.3, Semantic Sermon Header, Footer & Pagination Integration

A4.3 is A1-UI.2C ([migration document](PREACHER-STUDIO-MIGRATION.md), A1-UI.2C; [roadmap](ROADMAP.md)).

- **Starting point:** branch `dev`, HEAD `457662001ad1abe7d7e505e5c2c6450cc6ca3b21` ("Phase A4.2C is done"), clean working tree (verified with `git rev-parse` and `git status`).
- **At the end:** the same HEAD. Every change below is uncommitted in the working tree. Nothing was staged, committed, pushed, branched, merged, or deployed.
- **Database:** no migration, no new table or column, and no database command run. The development database was used only by the application and the signed-in journeys.
- **Packages:** no new package.

## 1. Objective and scope

Build UI.2C and nothing past it:

- the semantic sermon header (the canonical title and the optional subtitle) on the first page;
- first-page and later-page presentation;
- an optional running header;
- a footer with page numbers;
- a sermon's own page settings governing pagination;
- Outline Settings → Header & Footer;
- the library's idea editor made revision-checked, as a consistency dependency (owner).

**Recorded and not built:** the UI.3 drag-and-drop requirements (section 13).

**Not touched:** UI.2D, UI.3, UI.4, BUG-002 (A4.6), and anything unrelated.

## 2. Owner decisions implemented

| Decision                                               | How                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ideas.title` is the one title                         | The document never holds a title. The header edits the idea's title through `renameSermonTitle` → `renameIdeaAt`.                                                                                                                                                                        |
| Title saves are online only (decision 1)               | No sync type and no device queue. A title not yet saved is kept in the field and guards leaving; a lost answer is reconciled before any resend. The title is read-only while the device holds queued changes to the sermon. The header says an unsaved title is lost on close or reload. |
| Library saves are revision-checked (decision 2)        | `updateIdea(id, input, expectedRevision)` → `updateIdeaAt`. A stale save writes nothing, keeps the form, and offers "Save mine over it" or "Discard mine" (confirmed).                                                                                                                   |
| The header sits high, as in Google Docs                | Half an inch from the top edge (or half the margin), between the side margins. It pushes the first page's text down only when it does not fit in the margin.                                                                                                                             |
| The title is centred by default and configurable       | `header.titleAlign` (left, center, right) in Header & Footer.                                                                                                                                                                                                                            |
| The running header is off by default                   | `runningHeader.enabled: false` for new outlines.                                                                                                                                                                                                                                         |
| Page numbers are on, right, and bold for new documents | `newDocumentPage()` in `initialDocument`.                                                                                                                                                                                                                                                |
| Settings live in Outline Settings → Header & Footer    | A third category, in the same session and draft.                                                                                                                                                                                                                                         |
| Canonical page setup (the owner's follow-up)           | A sermon's own `doc.attrs.page` governs paper, margins, header, and footer. A device preference never overrides it. Compatibility: a document with no page of its own is drawn as before and is written only by a person's change.                                                       |
| Old documents keep their look                          | `page: null` means the device's paper and margins, no running header, and plain numbers at the right, as before A4.3.                                                                                                                                                                    |
| Plan review, clarifications 1–4                        | Sections 6, 9, 7, and 10.                                                                                                                                                                                                                                                                |

## 3. Repository state

See the file list in section 4. `git status` at the end lists only those files. The owner commits.

## 4. Files

**Added:**

- `src/features/editor-lab/pagination/page-config.ts`: resolves a page (null, v1, or v2) into setup, header, and footer; `newDocumentPage`; `pageWith`.
- `src/features/editor-lab/styles/preview-key.ts`: the styles plugin's key, in its own module so the paginator can read a draft without an import cycle.
- `src/features/sermon-editor/header/sermon-header.tsx`: `SermonHeader`, the title and subtitle fields.
- `src/features/sermon-editor/header/title-save.ts`: the title saver, a pure state machine.
- `src/features/sermon-editor/header/use-sermon-title.tsx`: the host's hook and `TitleStatus`.
- `src/features/sermon-editor/appearance/header-footer-settings.tsx`: the Header & Footer category.
- `src/app/api/ideas/[id]/heading/route.ts`: `GET` of the title and revision, owner-scoped, `private, no-store`.
- Tests:
  - `src/features/editor-lab/page-config.test.ts`
  - `src/features/editor-lab/v4/header-footer.test.ts`
  - `src/features/sermon-editor/header/{title-save,sermon-header,use-sermon-title}.test.*`
  - `src/app/api/ideas/[id]/heading/route.test.ts`
  - `tests/lab/header-footer.spec.ts`
  - `tests/e2e/sermon-header.spec.ts`
- This handoff.

**Changed:**

- **Ideas:** `ideas.ts` (`renameIdeaAt`, `ideaHeading`), `actions.ts` (`updateIdea` requires a revision, `renameSermonTitle`, `changeIdeaKind` returns its revision), `schemas.ts` (`renameInput`), and `components/idea-editor.tsx` (the draft's revision, the conflict panel).
- **Outlines and host:** `outlines.ts` (`getOutlineSermon` returns the revision); `app/(app)/outlines/[id]/page.tsx`; `sermon-editor/host/outline-document-host.tsx`; `sermon-editor/sermon-workspace.tsx` (`title` and `editable` props, the header beside the editor, `PrintPageStyle always`).
- **Styles:** `styles/model.ts` (`pageSetupV2Schema`, `headerFooterSchema`, `pageConfigSchema`); `styles/draft.ts` (`{ layer: "page" }`, `draftPage`, the plan's `headerFooter`); `styles/plugin.ts` (Apply writes the page; page edits are not styles); `styles/render.ts` (the running header's size and color).
- **Pagination:** `pagination/geometry.ts` (page 0's own top and height, pt↔px) and `pagination/plugin.ts` (`pageFromDocument`, `pageInForce`, `setPageSettings`, `previewPageSetup`, `setHeaderHeight`, `setHeadingTitle`, the draft preview, running-header copies, data attributes).
- **Editor components:** `components/page-view.tsx` (document-mode paper and margins, following the editor, `PrintPageStyle always`) and `components/page-scaler.tsx` (works without `ResizeObserver`).
- **v4:** `v4/validate.ts` (validates `subtitle` and `page`), `v4/extensions.ts` (`pageFromDocument: true`), and `v4/components/editor-lab-v4.tsx` (a local title).
- **CSS:** `lab.css` (first-page padding and spacer, number position and weight, running header, the header printed with the editor) and `v4/lab-v4.css` (the header).
- **Persistence:** `sermon-editor/persistence/initialization.ts` (new outlines get `newDocumentPage()`).
- **Appearance:** `appearance/{outline-settings,preview,session,controls}.tsx/ts` (the category, the two-page preview, the session's page, and the page in the pending summary).
- **Dictionaries:** `en|es` `ideas.ts`, `sermonEditor.ts`, `editorLab.ts`.
- **Tests changed:**
  - unit: `ideas.test.ts`, `actions.test.ts`, `tag-actions.test.ts`, `idea-editor.test.tsx`, `apply-ideas.test.ts`, `core.test.ts`, `initialization.test.ts`, `appearance-dialogs.test.tsx`;
  - lab: `tests/lab/config.ts` (the new spec) and `tests/lab/pdf-text.ts` (an opt-in `placed` reading that follows `cm`).
- **Documentation:** `AGENTS.md`, `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `docs/BUGS.md`.

**Removed:** nothing.

## 5. Schema and persistence

- **`doc.attrs.page` version 2** (`pageSetupV2Schema`, strict):
  - `paper` and `margins` in points, with version 1's bounds and text-area rule;
  - `header: { titleAlign }`;
  - `runningHeader: { enabled, subtitle }`;
  - `pageNumbers: { enabled, align, weight }`.
- Version 1 is read as it is and never repurposed. Any person's change writes version 2.
- **Validation:** `restoreV4` now refuses a bad `subtitle` or `page`; before A4.3 only v3's validator checked them.
  - No stored document can be newly refused: nothing wrote either field in production before A4.3 (verified by search).
  - Lab fixtures with version 1 still restore (`core.test.ts`).
- **New outlines:** `initialDocument` writes `newDocumentPage()`.
- **Conversion** keeps `page: null`; its read-back (`documentToLegacy`) would report any page as a loss.
- **Computed geometry is never stored:** header height, first-page offset, and page count are view state.
- **Personal presets:** the snapshot contract is unchanged. The header and footer are page settings, never appearance (section 7).

## 6. Title authority and concurrency

- **Server:** `renameIdeaAt` runs in one transaction:
  - an owner-scoped `SELECT … FOR UPDATE`;
  - a different revision → `stale` with the current title, and nothing written;
  - the same title → `unchanged`, and nothing written;
  - otherwise it writes `title`, `revision + 1`, and `last_developed_at` (a title change is development, as in `updateIdeaAt`), and `updated_at` moves.
  - Notes, subject, passages, tags, kind, classification, and archive are untouched (tested).
  - Two renames at one revision: at most one succeeds (tested on PGlite; real-concurrency proof is the row lock, as for `updateIdeaAt`).
- **Action:** `renameSermonTitle`:
  - `authorize("active")`, owner from the session, strict input;
  - coded answers: `renamed`, `unchanged`, `stale`, `missing`, `invalid`, `failed`, `unauthorized`;
  - revalidates the library, dashboard, idea page, and `/outlines`, never `/outlines/[id]`;
  - logs only `describeDatabaseError`.
- **Browser:** the saver (`title-save.ts`):
  - **Requests:** one at a time, against a known revision.
  - **Lost answers:** a timeout (15 s), a thrown call, or `failed` is uncertain. The request is held and read back once (`GET /api/ideas/<id>/heading`, a plain fetch, 10 s).
  - **The read:** R0+1 with the sent title is saved. Past R0 otherwise, it is released (a conflict, unless the title already matches). Still at R0, it stays held.
  - **Resends:** only the held request itself, the same title against the same R0, and only on "Try again". The server's check lets at most one of the two land. A newer title waits.
  - **Conflicts:** "Keep mine" sends against the current revision; "Use theirs" drops mine. Nothing is automatic, and late answers are dropped.
- **Where it can be edited:** only while `session.canEdit()`. A read-only tab renders no header at all (it shows the state panel). Not while `usePendingChanges` reports queued changes to the sermon.
- **Unsaved titles** hold `holdUnsavedWork` and the leave guard.
- **Library:**
  - `updateIdea` requires `expectedRevision`. The draft's revision moves only with this page's own save or kind change, or a passages-only change it took in (`attachScripture` from elsewhere).
  - A newer copy with any other change keeps the old revision, so the next save is refused.
- **Old clients and queued changes (clarification 1, audited):**
  - `IdeaEditor` is the only caller of `updateIdea`.
  - A tab running pre-A4.3 code sends no revision and is now refused ("This page is out of date… reload"), its words kept in its form. It can no longer write unchecked.
  - Queued `idea.update` always required `baseRevision` (`apply.ts`), so a queued change made before an editor rename is a `stale` conflict, never an overwrite (new regression test).
  - **Remaining limit:** the library editor's offline fallback (`keep` on a thrown call) still queues against the draft's revision. If that call had in fact committed, the queued copy later comes back as a stale conflict for the person to dismiss. This is unchanged from A4.2C's behavior, and nothing is overwritten.

## 7. Pagination and print

- **Geometry:**
  - `pageMetrics(setup, desk, firstTop)` gives page 0 its own text top and height. `contentTop`, `intoPage`, `breakFill`, and `pagesFor` use them. Later pages are unchanged.
  - `firstTop = max(mt, headerOffset + measured header height + 12px)`. The header's height comes from a `ResizeObserver` (view-only `setHeaderHeight`, ignored under 0.5px). Measurement stays within the existing 10-pass `measure()`.
- **Footer and running header:** numbers and running headers are drawn in the existing gaps and end element. The CSS reads `data-page-numbers` (off/left/center/right), `data-page-number-weight`, and `data-running-header`.
  - The running header is one line with an ellipsis, follows the title's position, and is sized and colored by `styles.runningHeader`.
- **What prints:**
  - The header prints with the page (`data-print-with-editor` in the print rule).
  - Screen-only parts (the "Add subtitle" button, a subtitle problem) are positioned out of the measured box, so the screen and the print paginate alike.
- **Printing:**
  - Prints are still always the whole document in Print Layout (BUG-010, `beforeprint`, view-only).
  - **Fixed in A4.3:** `PrintPageStyle` used to write `@page` only while React's view said Print. A print begun from Regular Layout therefore had no paper size. The sermon editor now always writes it (verified: an A4 sermon printed from Regular gives an A4 MediaBox).
- **Paper and margins:** in the sermon editor, the page-setup menu and the ruler write the document (`setPageSettings`: one undoable step, version 2). A dragged margin is previewed as view state and written once on release. Read-only tabs change nothing.
- **Unchanged:** the v3 lab and its device setup.
- **BUG-002 (keep-together) stays A4.6.**

## 8. Old-document compatibility

- **A document with no page** (every one stored before A4.3, and every converted one) is drawn as before: the device's paper and margins, no running header, plain numbers at the right, the title centred.
- **Nothing is written when one is opened.** Its first page change, or Apply in Header & Footer, writes version 2 from what it showed. Unit tests prove that opening writes nothing and that undo restores `null`.
- **Revision-1 preset parity:** `preset-parity.spec.ts` result in section 10.

## 9. Offline, recovery, and multiple tabs

- **Subtitle and page changes** are ordinary document transactions through the editor's dispatch. So the write guard, autosave, recovery drafts, and Undo cover them (`write-guard.test.ts` and `editor-adapter.test.ts` already exercised `subtitle`).
- **Reliability infrastructure:** no new coordinator, no new storage, no new sync type. IndexedDB, BroadcastChannel, Web Lock, and service-worker identities are unchanged.
- **The title** is not in a recovery draft, by design (online only). A crash before it is saved loses it, and the header says so.
- **The legacy editor** with conversion off is untouched: the editor files it uses changed only through the shared idea action (revision), which it does not call.

## 10. Tests run

### Static checks

| Check                  | Command                                | Result |
| ---------------------- | -------------------------------------- | ------ |
| Typecheck              | `npx tsc --noEmit -p .`                | clean  |
| Lint (changed files)   | `npx eslint <changed .ts/.tsx>`        | clean  |
| Format (changed files) | `npx prettier --write`, then `--check` | clean  |

### Unit and component tests (Vitest)

**The new and changed tests:**

| Area                                                                                              | Files                                                     | Result            |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------- |
| Rename and the library's revision check                                                           | `ideas.test.ts`, `actions.test.ts`, `tag-actions.test.ts` | 40, 26, 11 passed |
| Library conflict UI                                                                               | `idea-editor.test.tsx`                                    | 37 passed (5 new) |
| Sync: a queued edit after a rename                                                                | `apply-ideas.test.ts`                                     | 11 passed         |
| Heading read route                                                                                | `app/api/ideas/[id]/heading/route.test.ts`                | 3 passed          |
| Page model and first-page geometry, all five papers                                               | `page-config.test.ts`                                     | 13 passed         |
| Validator: subtitle and page                                                                      | `core.test.ts`                                            | passed            |
| New outlines' page                                                                                | `initialization.test.ts`                                  | 5 passed          |
| Page settings, Header & Footer draft, Undo, conflicts, resets, preset isolation, v3 lab unchanged | `v4/header-footer.test.ts`                                | 17 passed         |
| Outline Settings → Header & Footer, Spanish                                                       | `appearance-dialogs.test.tsx`                             | 29 passed (3 new) |
| Header, title saver, hook                                                                         | `header/*.test.*`                                         | 25 passed         |

The hook test under Strict Mode failed when the bug in section 11 was put back, and passes without it.

**The whole unit suite, in A4.2C's three batches** (`--maxWorkers=2`):

| Batch     | Directories                                    | Result                      |
| --------- | ---------------------------------------------- | --------------------------- |
| 1         | `appearance-presets`, `editor-lab`, `outlines` | 48 files, 1146 passed       |
| 2         | `sermon-editor`, `sync`, `offline`, `account`  | 49 files, 799 passed        |
| 3         | everything else                                | 124 files, 1835 passed      |
| **Total** |                                                | **221 files, 3,780 passed** |

Batch 2 also reported one unhandled `getClientRects` error. A4.2C recorded the same error as pre-existing at `0c27feb`.

### Browser runs (Playwright, Chromium)

**How they ran:**

- Signed in as the development Clerk user.
- A `next dev` server I started on port 3200 (conversion on under `next dev`).
- One worker at a time, aimed at the running server with `LAB_BASE_URL`, or with a scratchpad copy of the e2e configuration. Nothing was built or migrated by Playwright.

**New lab spec, `tests/lab/header-footer.spec.ts`:**

| Test                                                 | Project | Result | What it measures                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry on every paper                              | desktop | passed | Every text line of the sermon against the header, page-number, and running-header rectangles. With a long title on Letter, the header runs 48–148 px and the text starts at 160 px (margin 96). Letter, Legal, A4, A5, and Half Letter, plus a wide-margin case: no overlap, numbers in their own bottom margins, running headers in their own top margins. |
| Running header, bold numbers, Undo and Redo, the PDF | desktop | passed | Set through Outline Settings, then printed. PDF and screen agree: 3 pages. Each number at y = 1012 of 1056 (bottom margin 960–1056). The running header at y = 52 on pages 2 and 3 (top margin 96). The title at y = 74, inside the header's box. Every other line is inside its text area. Printing changed nothing.                                       |
| Printing from Regular Layout                         | desktop | passed | An A4 sermon prints with an A4 MediaBox, not Letter, and with the same number of pages.                                                                                                                                                                                                                                                                     |
| The phone                                            | mobile  | passed | Regular Layout. The header is above the writing, the title is editable, and "Add subtitle" is at least 44 px.                                                                                                                                                                                                                                               |

**Existing lab specs** (one run of every spec in the lab configuration):

| Spec                  | Desktop                                                            | Mobile        |
| --------------------- | ------------------------------------------------------------------ | ------------- |
| `preset-parity`       | 1 of 1 passed: revision 1 unchanged against the `7c9d3b6` baseline | —             |
| `print-workspace`     | 2 of 2 passed                                                      | —             |
| `appearance-levels`   | 5 of 5 passed                                                      | 1 of 1 passed |
| `typography`          | 8 of 8 passed                                                      | —             |
| `editor` (the v3 lab) | 8 of 8 passed                                                      | 5 of 5 passed |
| `pagination`          | 12 of 14 passed                                                    | 2 of 3 passed |
| `v4`                  | 10 of 11 passed                                                    | —             |
| `navigation`          | 4 of 4 passed                                                      | 2 of 3 passed |

**What failed in that run, and what became of it:**

| Failure                                                                   | Classification                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pagination` P1/P2 (desktop)                                              | **Caused by A4.3 in test code, fixed.** My first change to `tests/lab/pdf-text.ts` changed the coordinates P1's `@page`-margin reference relies on. The transform-following reading is now opt-in (`placed`), and P1/P2 and P11 pass again. |
| `pagination` P3 (desktop)                                                 | Passed when rerun alone. `BUGS.md` already notes it as flaky on a long-running dev server.                                                                                                                                                  |
| `pagination` P3 (mobile)                                                  | **Pre-existing, intermittent.** Classified in the final verification (below).                                                                                                                                                               |
| `navigation` "walk Print Layout test in Regular" (mobile, BUG-001's walk) | **Pre-existing.** Classified in the final verification (below).                                                                                                                                                                             |
| `v4` "a deletion the browser makes on its own…" (desktop)                 | **Pre-existing.** Classified in the final verification (below).                                                                                                                                                                             |

**New signed-in journeys, `tests/e2e/sermon-header.spec.ts`:** 3 of 3 passed on desktop.

- **A new outline:** numbers right and bold, the title centred. The title is renamed and "Title saved" shown. The subtitle is saved by autosave. After a reload both are back, and the library shows the new title.
- **Two places:** a library draft older than the editor's rename is refused, kept, and saved over only on "Save mine over it". The editor's next title is then refused as changed elsewhere; "Use theirs" shows the library's, and a reload agrees.
- **Header & Footer:** applied (left title, running header, normal-weight numbers) and kept after a reload. A second tab is read-only and has no title field.

The first run of this spec found the defect in section 11, which was fixed before the passing run.

### The first pass's stopped run

The first pass's run of the remaining signed-in specs was stopped by Claude Code for low memory before it reported. Before it stopped, four test folders recorded failures. None is a verdict on the code:

- `appearance-presets`: a missing Playwright trace file. I had briefly started a lab test against the baseline at the same time, and the two runs collided in the shared `test-results` folder.
- `sermon-document`'s conflict journey: `ERR_CONNECTION_REFUSED` when the server was stopped.
- Two `sermon-compatibility` journeys: cut off, with no error recorded.

Every one of these specs was run again, alone, in the final verification below, and passed.

## 10a. Final verification (5 November 2026, second pass)

**Discipline:**

- **Before:** branch `dev`, HEAD `4576620`, 57 changed files, nothing staged; 5 GB of 14 GB free.
- **Servers:** one server and one Playwright command at a time, one worker, each run with its own `--output` folder. Each server was stopped (and its process confirmed gone) before the next was started.
- **The baseline** is a `git archive` copy of HEAD in the session's scratchpad, its `node_modules` a junction to the repository's, served with `next dev --webpack` (Turbopack does not follow the junction). Its files match HEAD (compared, ignoring line endings). Nothing in the repository or its Git state was touched.
- **Memory:** after the WebKit run, Claude Code again stopped the last dev server for low memory. Every check below had already finished, and nothing was restarted. All my servers were then confirmed stopped; no process I did not start was touched.

### Production compile

| Command                                                | Result                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `npx next build` (not `npm run build`, which migrates) | Compiled successfully (9.8 s); 56 of 56 pages generated; exit 0. |

The one warning, "Failed to find font override values for font `Atkinson Hyperlegible Next`", is the same warning A4.2C recorded.

### The three lab failures

| Test                                                                                         | A4.3                                                                | Baseline `4576620`                                                  | Classification                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v4` "a deletion the browser makes on its own never merges a heading into writing" (desktop) | fails: `sermon-editor-notice` not shown (line 298)                  | fails the same way                                                  | **Pre-existing baseline defect.** The content is protected (both text assertions pass); only the refusal notice is missing. A4.3 does not touch the guard: `v4/plugins.ts` is identical to HEAD, and the header's view-only transactions never clear the notice. |
| `navigation` "walk Print Layout test in Regular" (mobile)                                    | fails: `up.stalls` (line 216)                                       | fails the same way                                                  | **Pre-existing baseline defect** (BUG-001's walk on the phone).                                                                                                                                                                                                  |
| `pagination` P3, the caret across a page gap (mobile, v3 lab)                                | `--repeat-each=3` under webpack: 2 of 3 passed, failing at line 539 | `--repeat-each=3` under webpack: 2 of 3 passed, failing at line 539 | **Pre-existing intermittent defect.** Same assertion, same rate. The first A4.3 run under Turbopack failed at line 539 and then at line 542, the matching ArrowUp step.                                                                                          |

All three specs are unchanged from HEAD.

### Signed-in journeys

**Setup:** a production build (`next start`, port 3100), `SERMON_DOCUMENT_CONVERSION=on`, desktop and mobile projects, one spec per command. Clerk's "FAPI request failed … Test ended" lines at teardown are noise.

| Spec                   | Result                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sermon-header` (new)  | 4 passed (3 desktop + the new-outline journey on the phone), 2 desktop-only skipped                                                                  |
| `sermon-document`      | 15 passed, 1 phone-only skipped. Covers read-only until Edit here, offline recovery, the save conflict, Back/Forward, and another account's outline. |
| `sermon-appearance`    | 1 passed, 1 skipped                                                                                                                                  |
| `appearance-presets`   | 2 passed (save, apply, undo, default, a new outline from it, delete; the phone layout), 2 skipped                                                    |
| `sermon-compatibility` | 7 passed, 3 skipped                                                                                                                                  |
| `library`              | 4 passed (desktop and mobile)                                                                                                                        |
| `scripture-ideas`      | 2 passed (passages added to an idea from the Bible: the library editor takes in the new revision)                                                    |

### Conversion off, offline, and the legacy editor

**Setup:** the same build with `SERMON_DOCUMENT_CONVERSION=off`, the production default.

| Spec                             | Result                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offline-outlines`               | 4 passed, desktop and mobile. Includes an outline that became a sermon document, reviewed and not edited with no connection: the `documentAuthoritative` protection holds. |
| `offline-ideas`                  | 2 passed. The device's copy works with no connection; the library editor's offline fallback is unchanged.                                                                  |
| `outlines-integration` (desktop) | failed at line 197, **the same line as TEST-003 at the baseline**                                                                                                          |
| `outline-editor` (desktop)       | timed out at line 166 (read from its trace), **the same line as TEST-003**                                                                                                 |

**Old documents, through the real switch** (a scratchpad probe that made and then deleted its own sermon):

1. With conversion off, a new outline opened in the legacy editor, and `GET /api/sermon-documents/<id>` answered 404.
2. The same build was then served with conversion on, and the outline was opened. It converted on opening and showed the historical presentation:
   - `data-page-numbers="right"`, weight `normal`, running header `off`, title centred, the sermon's title in the header;
   - after 3 s, the stored document had `page: null` at revision 0, and the save status was still `unchanged`. **Opening wrote nothing.**
3. New outlines (above) get numbers on, right, and bold.

**Old clients, queued changes, read-only tabs, autosave and recovery** (requirement 6):

- **Old clients:** a page without a revision is refused (`actions.test.ts`), and a queued change made before a rename is a stale conflict (`apply-ideas.test.ts`).
- **Read-only tabs:** `sermon-header` (no title field) and `sermon-document` (read-only until Edit here).
- **Autosave and recovery:** `sermon-document` (offline recovery, the conflict that keeps both).

### Firefox and WebKit (lab, `/lab/editor/v4`, dev server)

**Setup:** the repository's `tests/lab/header-footer.spec.ts`, run through a scratchpad configuration whose project is Desktop Firefox or Desktop Safari (WebKit), named `desktop` so the desktop tests run.

**One setup step made robust for Firefox:** Firefox aborted the first navigation to the lab while the sign-in page was still forwarding the new session (`NS_BINDING_ABORTED`). The spec now waits for the sign-in page to settle and retries that one navigation once, only for an abort. No assertion changed. That edit was not run again in Chromium, because the server was stopped for memory; it changes nothing in Chromium's path when no abort occurs.

| Browser                             | Geometry on every paper                                                                                                                                                           | Running header and bold numbers                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Firefox (Playwright `firefox-1555`) | **passed:** Letter, Legal, A4, A5, Half Letter, wide margins. Header 48–148 px for the long title, text from 160 px. Letter is 2 pages here against 3 in Chromium (font metrics). | Every on-screen step passed, including Undo/Redo and the overlap checks. It then stopped at `page.pdf`, which is Chromium only. |
| WebKit (Playwright `webkit-2370`)   | **passed**, the same papers, 3 pages on Letter                                                                                                                                    | the same: passed on screen; no PDF in WebKit                                                                                    |

**PDF and printing are verified in Chromium only.** Firefox and Safari printing (their own print dialogs) are not verified.

### Test data

**Audited** (read-only probe) before any new run:

- the account default was **Balanced**;
- there were **no personal presets** and no "A4.2C …" sermons;
- eight `e2e` ideas existed.

**Deleted, by exact title**, after dating each from its own timestamp. Each is inside the stopped run's window (5 November 18:57–19:03 UTC) and matches the specs that run included:

- `e2emw3wyc41desktop conflict sermon` (`sermon-document`)
- `E2E desktop 1793905138075` (`scripture-ideas`)
- `e2emw3ws2qfdesktop plain point` (`library`)
- `e2emw3wr6z7desktop beta mercy` (`library`)

**Left alone:** the four older ones, from 29 October, before this session: `e2emvu178t1…`, `e2emvtxci9e…`, `e2emvtwfpo2…`, and `e2emvtw2ldv…`.

**Also deleted:** the historical probe's two sermons (one left by a probe mistake, a URL read before navigation), by their exact pattern.

**Nothing to restore:** the default is Balanced and there are no presets.

**Note:** this session's passing journeys clean up after themselves. Whether `library.spec.ts` deletes its own ideas on success was not checked; any it left are named `e2e<stamp>…` with a 5 November stamp.

### Still not verified

- Firefox and Safari **printing** (PDF and print dialogs), real phones and touch, screen readers, and Chrome's own Print dialog.
- The repository's whole end-to-end suite beyond the specs above (Bible, preaching record, onboarding, tour, PWA, dashboard, saved Scripture): A4.3 does not touch those features.
- `sermon-header` on the phone beyond its first journey (the other two are desktop-only by design).

## 10b. Commit-readiness check (5 November 2026, third pass)

**Asked for:** rerun the Chromium `header-footer` spec after the Firefox setup change, with one worker and an isolated results folder.

**What it found, in order:**

1. **The Firefox setup change hung Chromium** (test code). On a dev server Chromium's network is never idle (background downloads), so the unbounded `waitForLoadState("networkidle")` held every test to its 90 s limit (8 of 8 failed in setup). It is now bounded to 5 s. The one retry of an aborted navigation stays.
2. **A real defect, BUG-012, printing from Regular Layout with the sermon header.** `beforeprint` switched to Print Layout before React could move or re-measure the header, so a real Regular-started print had the header as a block above the text, pushing the pages down. Two more defects of the same kind were found and fixed with it:
   - a long title clipped on a narrower paper (the fields were sized in JavaScript only when their words changed);
   - the title nearly invisible in a dark theme (the owner's screenshot).

   **Fixed in the application** (`docs/BUGS.md`, BUG-012):
   - the header's place follows the editor's layout in CSS;
   - its fields grow in CSS;
   - the paginator reads its height itself in `beforeprint`;
   - it carries the editor's `data-paper`.

   Files: `header/sermon-header.tsx`, `v4/lab-v4.css` (the header block rewritten), `pagination/plugin.ts` (`readHeader`), and the `sermon-page` wrapper in `sermon-workspace.tsx` and `appearance/preview.tsx`.

3. **The Regular-print test itself had a race** (test code). It compared with pages measured before the verses arrived and before printing's expansion. It now waits for every full passage's verses and compares the PDF with the screen _as prepared for print_ (between `beforeprint` and `afterprint`): page count, numbers in their bottom margins, the title in the first page's header region, every other line in its text area, and the document unchanged.
4. **BUG-011 seen again:** on A5 with a long title, a passage label in the bottom margin falls on page 4's number. The spec sets that label aside for the number check, as it already did for the text-area check, and says why. Every other line stays strictly checked.
5. **The owner's Introduction report** is recorded as UX-005 (existing A3 behavior; options in `BUGS.md`) and not changed here.

**Runs after the fixes** (one server and one command at a time, one worker, isolated results folders):

| Check                                                                 | Result                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lab `header-footer` (Chromium, `next dev`)                            | **5 of 5 passed:** geometry on every paper (Half Letter's long title is 3 lines, text from 215 px); running header and bold numbers with the PDF; Regular-started print (3 pages screen = 3 printed, A4); the dark-theme ink (title `rgb(23, 24, 27)` = the paper's); the phone |
| Lab `print-workspace`                                                 | 2 of 2 passed                                                                                                                                                                                                                                                                   |
| Lab `preset-parity`                                                   | 1 of 1 passed (revision 1 unchanged)                                                                                                                                                                                                                                            |
| Unit: `appearance-presets`, `editor-lab`, `outlines`, `sermon-editor` | 81 files, 1,759 passed. The one known `getClientRects` error is the same jsdom one as before. Includes the new `beforeprint` header test.                                                                                                                                       |
| `npx next build` (rebuilt with the fixes)                             | compiled; 56 of 56 pages; the known font warning only                                                                                                                                                                                                                           |
| `sermon-header` (production build, conversion on)                     | 4 passed (desktop 3, phone 1), 2 skipped                                                                                                                                                                                                                                        |
| `sermon-document` (same build)                                        | 15 passed, 1 skipped                                                                                                                                                                                                                                                            |
| Static checks                                                         | typecheck, lint, and formatting clean                                                                                                                                                                                                                                           |

**Not rerun after these fixes:**

- the other signed-in specs;
- Firefox and WebKit, since the setup change only bounds a wait in that browser path.

Those specs do not reach the header's CSS or `readHeader` beyond what `sermon-header` and `sermon-document` cover.

**All servers were stopped and confirmed gone.** No process I did not start was touched.

## 11. Known defects, risks, deferred work

**Found and fixed during A4.3:**

- **The header's title saver in development.**
  - **Cause:** React's Strict Mode runs effects twice. The hook's cleanup disposed the saver, which lived in `useState` and so was never made again, and every later title was dropped silently.
  - **Fix:** the saver is not disposed from an effect. It holds nothing that needs ending.
  - **Test:** a Strict Mode test that fails with the bug.
  - Production renders effects once, but the bug was real.
- **`PrintPageStyle` wrote no `@page` when a print began in Regular Layout.** The printed paper fell back to the browser's own. Fixed for the sermon editor (`always`).
- **A preview made again under the header** (switching to Header & Footer) briefly held a destroyed editor, and its effect threw. Both the header and the preview now ignore a destroyed editor.
- **`restoreV4` validated neither `subtitle` nor `page`.** It now does.

**Open:**

- **BUG-011 (new, pre-existing, P2):** a Scripture passage's label can be drawn in a page's bottom margin when its passage falls at a page's foot.
  - **Proved:** a probe of `/lab/editor/v4` with the first-page offset inactive (a short title, so page 1 is laid out as before A4.3), sweeping the top margin from 72 to 240 px. Labels were drawn up to about 58 px into the margin.
  - **Belongs with:** keep-together, A4.6 (`BUGS.md`).
  - The A4.3 geometry spec checks every other line, and the label against the header and the numbers.
- **Three pre-existing lab failures** (section 10a): the v4 guard's notice after an `execCommand` deletion, the phone's arrow-key walk, and phone P3 (intermittent). All three also fail at the baseline. Recorded in `BUGS.md` as TEST-004.
- **TEST-003** (the legacy outline editor specs) is unchanged: the same lines as the baseline.
- **Remaining limits, by design or deferred:**
  - **An unsaved title** is lost if the page is closed or reloaded (online only, owner's decision). The header says so, and the leave guard asks first.
  - **A new editor session for the same tab** (after "Edit here" elsewhere and back, or after the back-forward cache) starts a new title saver. A title still held by the old one is lost then. Leaving is guarded while one is held.
  - **The library's offline fallback** can queue a copy of a save whose answer was lost and that had in fact committed. It returns as a stale conflict to dismiss, never an overwrite (unchanged).
  - **A device preference** still draws pages for documents with no page of its own. That is the compatibility policy. The first change writes the document's own page.
  - **Page Setup and Printing categories** of Outline Settings stay for their checkpoints. Paper and margins are changed from the toolbar's Page setup menu and the ruler, which now write the document.
  - **SEC-001** (release readiness) is unchanged and not reviewed here. A4.3 adds no logging of documents, titles, or SQL parameters: the new actions log only `describeDatabaseError`, and the route logs only that.
- **Deferred:** BUG-002 and BUG-011 (A4.6), UI.2D, UI.3 (including drag-and-drop, section 13), UI.4.

## 12. Manual acceptance checklist (owner)

Desktop (Chrome, then Firefox and Safari if you can):

1. Open a new outline (conversion on). The title is centred near the top of page 1, and the page numbers are bold at the bottom right.
2. Click the title, type a long one, and press Enter. "Title saved" appears beside the save indicator, and the first page's text moves down only if the title no longer fits in the margin. Reload; open the library: the same title.
3. Add a subtitle, then press Ctrl+Z. The subtitle goes. Ctrl+Shift+Z brings it back. The title is not undone.
4. Open Outline Settings → Header & Footer:
   - change the title's position, turn on the header on later pages (with the subtitle), turn off bold;
   - the pages behind and the two-page preview change, and nothing is saved until Apply;
   - Cancel puts it back; Apply and then one Ctrl+Z undoes it all.
5. Page setup → paper A4; drag a margin. One undo step each. Reload: the paper and margin are kept.
6. Print (Ctrl+P), from Print Layout and from a narrow window in Regular Layout:
   - only the sermon;
   - the header on page 1, the running header on later pages;
   - numbers where the screen shows them;
   - the chosen paper.
7. With the outline open in a second tab: it is read-only, with no title field. "Edit here" moves editing.
8. In the library, open the sermon in one tab; rename it in the editor; save in the library. You are told it changed and your words stay. Try "Save mine over it" and "Discard mine".
9. An outline from before A4.3: it looks exactly as before (plain numbers at the right). Nothing is saved by opening it.
10. In Spanish: the header, Header & Footer, and the conflict messages.

Phone:

11. Regular Layout: the header above the writing, the title editable with the keyboard open, "Add subtitle" easy to tap, and Print Layout's pages if you switch.

Also outstanding (owner): printing in Firefox and Safari, and on a real phone.

## 13. UI.3 drag-and-drop: recorded, not implemented

The owner's approved requirements are recorded as future architecture:

- in `docs/PREACHER-STUDIO-MIGRATION.md` (A1-UI.3, "Approved future requirement: drag-and-drop");
- in `docs/ROADMAP.md` ("A1-UI.3, future: drag-and-drop").

They cover:

- component drag-and-drop from the Insert palette;
- **whole-point-group movement by default**, using the v4 order-and-depth ownership;
- Scripture from the Bible in the Workspace Panel and from Saved Scripture, as the existing passage node with references and translation only;
- Saved Points;
- one shared validated insert/move path;
- one undo step per drop;
- touch and keyboard alternatives;
- the existing integrity guarantees.

**No drag-and-drop code was written or enabled in A4.3.**

## 14. Verdict

**READY WITH NONBLOCKING LIMITATIONS** (final verification, 5 November 2026; confirmed by the commit-readiness check, section 10b, after BUG-012 was found and fixed).

**Built:**

- the header, the title and its revision-checked save, the subtitle;
- the canonical page, first-page geometry, the running header, page numbers on and bold for new outlines;
- Header & Footer;
- the library's revision check.

**Verified:**

- the production compile;
- the whole unit suite;
- every signed-in journey that covers it, on desktop and phone, with conversion on and off;
- `offline-outlines` and `offline-ideas`;
- old documents keeping their look without being written;
- Chromium's screen-to-PDF geometry;
- Firefox's and WebKit's on-screen geometry.

**Every failure seen is classified and none is A4.3's:**

- three pre-existing lab defects (TEST-004);
- TEST-003, at the baseline's lines;
- BUG-011, pre-existing.

**Nonblocking limitations:**

- printing in Firefox and Safari is not verified (no PDF there);
- Firefox and WebKit were not rerun after BUG-012's CSS change;
- UX-005 (restoring an Introduction; where Insert → Introduction puts it) is the owner's decision, for UI.3;
- the documented by-design limits in section 11.

**Commits and deployment stay with the owner.** The conversion switch is unchanged.

**The UI.3 drag-and-drop requirements are documented and not implemented.**
