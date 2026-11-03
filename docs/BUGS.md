# Bug register

Started in A4.1 (3 November 2026). One entry per defect or approved request
that a checkpoint found, fixed, or deferred. Each says what it is, what was
proven, what changed, and what is still unchecked. Severity: P0 loses work or
blocks writing; P1 misleads or breaks a common task; P2 is a nuisance.
Status: **Open**, **Fixed** (built and checked as stated, awaiting the owner's
review), **Deferred** (approved for a named later checkpoint, not built).

## BUG-001: arrow keys throw the caret back to the start in a dense document

- **Severity:** P0. **Status:** Fixed (A4.1); broader checks pending (see below).
- **Reported:** the owner, in Chrome, in a dense sermon document: arrow keys
  sometimes stop moving the caret or send it somewhere else.
- **Reproduced:** `tests/lab/navigation.spec.ts`, real key presses in Chromium
  on `/lab/editor/v4`. In the "Print Layout test" fixture, which has three
  passages in a row, ArrowDown selected the middle passage and the next press
  put the caret on the document's first line. The walk looped there (400
  presses, never reaching the end); ArrowUp from the end reached the start
  through the same jump after 13 presses. Same in Regular and Print Layout.
- **Cause (traced):** a selected passage or page break that has a block with no
  text on both sides is drawn by ProseMirror as a browser selection between two
  uneditable elements. Chrome does not keep such a selection: on the next key it
  moves it to a place it can show (measured: the first heading, or the end of an
  earlier paragraph). ProseMirror reads that move from `selectionchange` as the
  person's choice. ProseMirror's own workaround (`temporarilyEditableNear`) is
  applied only to Safari and Chrome before version 63. The fold chevron,
  `CaretSync`, and the page gaps were suspects in the plan; the traces did not
  implicate them.
- **Fix:** `HeldSelection` (`src/features/editor-lab/v4/held-selection.ts`), in
  `labV4Extensions`, so the lab and the production editor both have it. Through
  ProseMirror's public `createSelectionBetween`, it keeps the editor's own
  selection when that selection is a selected block or gap cursor the browser
  cannot hold and the last input in the editor was a key. A click or a touch is
  always taken as it is. It changes no document and dispatches nothing.
- **Review fix (A4.1 review):** ProseMirror also asks `createSelectionBetween`
  while reading a change the browser typed itself (IME composition), about the
  _new_ document. The first version answered with the old document's
  selection, and ProseMirror threw `RangeError: Selection passed to
setSelection must point at the current document`. It now answers only about
  the current document (unit test, and the browser spec fails on any page
  error).
- **Checked:** unit `src/features/editor-lab/v4/navigation.test.ts` (7);
  browser `tests/lab/navigation.spec.ts`, desktop Chromium, both fixtures in
  both layouts (4 of 4 pass: Down reaches the last line, Up the first, no stall,
  no step backwards); browser `tests/lab/held-navigation.spec.ts`, desktop
  Chromium: from the middle of three passages, reached by the arrows, 13
  actions (below), each acting at the passage or nowhere, with no page error.
- **The hidden caret.** While such a block is selected, Chrome moves its own
  (hidden) caret again at the start of every key, before any handler runs.
  What each action does from there (measured):
  - typing a letter, Enter, Backspace, Delete, and paste act on the selected
    passage, through the editor's own selection;
  - IME composition: ProseMirror replaces the selected block and types in the
    next text block, its rule for any selected block. Without `HeldSelection`
    it moved the selection to Chrome's place first and typed at the top;
  - Shift+ArrowUp/Down, PageUp/Down, Home, End: nothing happens; the passage
    stays selected (known limit: they do not extend or move from a passage
    boxed in by others; before A4.1 they started from the document's top);
  - focus away and back: the passage stays selected.
- **Not yet checked:** the phone project, Firefox, WebKit, the production
  editor on `/outlines/[id]` in a browser (same extension list, not driven), a
  real IME or a Mac dead key (simulated through the DevTools protocol only),
  and walks after typing, undo, insert, or folding.

## BUG-002: short components split across pages; no keep-together

- **Severity:** P2. **Status:** Deferred to A4.6 / UI.4 (approved, not built).
- Print Layout and printing may split a short component (a heading from its
  first line, a short passage or note) across a page boundary, and may leave an
  empty fragment. Approved: keep-together for short components and
  keep-with-next for headings.

## UX-001: footer page numbers

- **Status:** Deferred to A4.3 / UI.2C (approved, not built).
- An optional footer, off by default, whose page numbers are right-aligned and
  bold by default, and customisable.

## BUG-003: the offline queue could send two changes in the wrong order

- **Severity:** P1. **Status:** Fixed (A4.1).
- **Found:** `src/features/offline/ideas/ideas.test.ts` failed intermittently
  on order. The queue sorted by `createdAt`, then by the random `opId`; two
  changes queued in the same millisecond (or after the clock moved back) could
  be listed, and so sent, newest first. For two edits of one idea that sends
  the older words last.
- **Fix:** each queued change gets, in the enqueue's own IndexedDB transaction
  (`queue.ts`, `putMutation`), an `orderedAt` (the clock's time, or the latest
  of the owner's queued changes if the clock moved back) and a per-owner
  `sequence`. `byAge` orders by `orderedAt`, then `sequence`, then opId. No
  database version step: records queued before have neither, are ordered by
  `createdAt`, and are not rewritten, dropped, or duplicated. `createdAt` keeps
  the clock's own time.
- **Review fix (A4.1 review):** the first version put every record without a
  `sequence` before every record with one. A tab still running the code from
  before A4.1 (until it reloads after an update) queues records without one,
  so its newer change would have been sent before an older one; after the
  first is acknowledged the queue re-bases the rest (`rebaseFollowing`), so the
  older words would have won silently. Ordering by time first places such a
  change where it was made. Test: "places a change from a tab still on older
  code by the time it was made".
- **Checked:** four tests in `src/features/offline/offline.test.ts` (same
  millisecond and clock moved back, records from before, a tab on older code,
  owners apart); `src/features/offline`, `src/features/sync`, and
  `preferences.test.ts`: 15 files, 203 tests pass.
- **Reviewed:** every new record is made by `putMutation`; every rewrite
  spreads the record, so both fields are kept; the queue is read and the record
  added in one readwrite transaction (IndexedDB runs two tabs' such
  transactions one after the other); neither field leaves the device (the sync
  agent sends named fields only). The order is one total order, the same in
  every tab; among records that have a place it is their places' order.
- **Residual risk:** a tab on older code still sorts by `createdAt` alone when
  it runs the sync itself, so a same-millisecond tie can still go either way
  there, as before A4.1. Enqueueing reads the owner's whole queue once (bounded
  by the queue's size).

## BUG-004: `preferences.test.ts` did not load

- **Severity:** P2 (tests only). **Status:** Fixed (A4.1).
- The test's mock of `@/features/admin/clerk` predated `deleteIdentity`, which
  account deletion now imports, so the file failed to load. The mock gains that
  one function; no assertion changed. 31 tests pass.

## UX-002: Minimal's reminder and script looked alike

- **Severity:** P2. **Status:** Fixed in revision 2 of Minimal (A4.2A).
- **Found:** A1-UI.2B.1. Seen again in the A4.2A review (Chromium screenshot of the component gallery): a reminder and a script were both thin outlined boxes without a fill, told apart only by their small label.
- **Fix:** in Minimal's revision 2, a script is a double rule beside its words and has no box (`presets.ts`, `revisionTwo`).
  - Revision 1 is unchanged (owner's safeguard), so an outline stored before A4.2A keeps the old look until a person chooses the preset again or accepts "Use the updated design".
- **Checked:** screenshots of revisions 1 and 2, light and dark.
  - `levels.test.ts`: revision 1's values are unchanged and revision 2 has the refinement.
  - `preset-parity.spec.ts`: revision 1 has the same computed styles as `7c9d3b6`.

## A1 limitation: deeper subpoints shared the subpoint style

- **Status:** Fixed (A4.2A). Levels (`styles.levels`) give each depth its own typography, spacing, and number. They are edited in Outline Settings → Appearance → Levels.

## BUG-008: `tests/lab/v4.spec.ts` was written against fixtures and controls that later changed

- **Severity:** P2 (tests only). **Status:** Fixed (A4.2A acceptance pass); not caused by A4.2A.
- **Cause (traced in git):**
  - `openV4` waited for `[data-id="p-a"]`, which is only in the "Writing that belongs to a parent point" fixture. The lab has opened "When Idols Fall" by default since `6dd3556`; the spec dates from `a62d28d`.
  - "Print Layout paginates" clicked a "Print" radio. A desktop window has always been in Print Layout with no switch since A1-UI.1 (`f94ef8b`, `layoutSwitch={!desktop}`).
- **Fix:**
  - `openV4` chooses that fixture as a person would (the Document menu).
  - The print test uses the switch only where one is shown, and still asserts `data-layout="print"`, page gaps, and typing in Print Layout.
  - No assertion was removed or loosened.
- **Checked:** desktop Chromium, dev server. 13 of 14 tests pass. The 14th is BUG-009, which fails identically on `7c9d3b6`.

## BUG-009: no notice when the browser's own deletion is refused at a heading

- **Severity:** P2. **Status:** Deferred: the notice is approved, to be built in a later editor-reliability checkpoint. Pre-existing; not caused by A4.2A.
- **Test:** `tests/lab/v4.spec.ts`, "a deletion the browser makes on its own never merges a heading into writing". It uses `document.execCommand("forwardDelete")` at the end of the writing just before a subpoint heading.
  - The protection works: the heading is not merged, and both of the test's text assertions pass.
  - The expected notice (`sermon-editor-notice`) never appears.
- **Reproduced on `7c9d3b6`:** the same spec was run against a `git archive` copy of that commit and failed identically, so this predates A4.2A.
- A4.2A changed no guard, keymap, command, or notice code (`git diff --name-only`).
- **Open question for the owner:** should a silently prevented browser deletion still tell the person? The test says yes. PS-ER1 says the guard "says when it refuses", but this deletion may now be prevented before the guard (`beforeinput`).

## TOOL-001: `next dev --webpack` draws the application without Tailwind's utilities

- **Status:** Closed, not a defect (unsupported configuration; nothing to fix).
- **Cause:** since the initial commit Tailwind is processed only by the Turbopack loader (`turbopack.rules` → `@tailwindcss/turbopack`, `next.config.ts`). There is no PostCSS configuration, so webpack never runs Tailwind.
- **Supported workflows are all Turbopack:** `npm run dev`, `next build` / `npm run build` (Vercel), and the lab and e2e Playwright configurations. Nothing in the repository uses `--webpack`.
- **Where it touched A4.2A:** only the preset-parity baseline. It was recorded from a `git archive` copy of `7c9d3b6` on webpack, because Turbopack refuses a `node_modules` linked from outside the project.
  - That comparison reads the computed styles of the editor's own CSS (which webpack does load), and it passes on both bundlers.
  - On Turbopack the colors of borders that are not drawn are ignored; they differ only by the bundler's CSS order.

## BUG-010: printing on a desktop printed the editor's toolbar, in Regular Layout

- **Severity:** P1. **Status:** Fixed (A4.2A acceptance, approved by the owner). Pre-existing since A1-UI.1 (`f94ef8b`); not caused by A4.2A.
- **Reported:** the owner, 3 November 2026. Chrome's own print preview (Ctrl+P) of `/lab/editor/v4` showed the header, the toolbar, the layout switch on "Regular", and the outline in Regular Layout.
- **Cause:**
  - On a desktop the workspace is in Print Layout only while the window matches `desktopQuery`, `(min-width: 64rem) and (pointer: fine)`.
  - A print is laid out at the paper's width (Letter is 816px), under 64rem. So `useDesktop` turned false mid-print, and `SermonWorkspace` switched to Regular Layout.
  - The print stylesheet (`lab.css`) hides the application only around `.lab-editor[data-layout="print"]`.
- **Fix** (the existing print infrastructure; no second renderer, no workspace redesign):
  - `useDesktop` (`sermon-editor/layout.ts`) keeps its answer from `beforeprint` to `afterprint`, and while print media matches. A print is never "a smaller window". Once the print ends it follows the window again.
  - The Paginator's `beforeprint` (`pagination/plugin.ts`), only where `printsInPrintLayout` is set:
    - It puts an editor in Regular Layout into Print Layout in the same view-only transaction that sets `printing`, then measures.
    - `afterprint` gives the layout back.
    - Only `labV4Extensions` sets the option, so a sermon prints in Print Layout from either layout, while the v3 lab, the unchanged baseline, prints as before.
  - The print root no longer prints the theme's background behind the sermon editor's pages (`html`, `v4/lab-v4.css`; `lab.css` is unchanged). With background graphics on, it had shown as a tint with white bands at the page gaps.
  - Metadata transactions only: no document step, no history, no tab layout written, nothing autosave or recovery sees.
- **Regression tests:**
  - `src/features/sermon-editor/layout.test.ts` (4): print media and `beforeprint` never turn a desktop into a smaller window; a real resize is followed after the print.
  - `src/features/editor-lab/v4/print.test.ts` (3): Regular is printed in Print Layout and restored; the document is identical, there are no history steps, and every transaction is metadata only; the v3 lab is unchanged; Print Layout stays.
  - `tests/lab/print-workspace.spec.ts` (2, desktop Chromium): `beforeprint`, then a paper-wide viewport and print media, then `afterprint`. In Print Layout with nothing outside the editor shown, from a desktop and from a window in Regular Layout; the layout is restored and the document is unchanged.
    - **Against `7c9d3b6` it fails exactly as reported:** Regular Layout, 44 controls outside the editor printed.
- **PDFs, opened in installed Google Chrome's own viewer:**
  - Made through `beforeprint` and `page.pdf`, for "When Idols Fall" (3 pages) and the "Print Layout test" (7 pages): Minimal r1, Minimal r2, Balanced, Expressive.
  - Every page is the document alone on white paper, with page numbers, no toolbar, controls, sidebar, or scrollbars.
  - Minimal r2's script is a rule beside the words; r1's is a box.
- **Not changed:** pagination. `pagination.spec.ts` passes 14 of 14, including P11 (print breaks where the screen does, Letter and A4) and P1 (the v3 lab's plain print reference).
  - Headings left apart from their writing at a page's foot (the Conclusion; "Under subpoint 3") are BUG-002, deferred.
- **Not checked:** Chrome's own Print dialog after the fix (owner's check); Firefox and Safari printing.

## TEST-001: Playwright's `page.pdf()` of the sermon workspace

- **Status:** Resolved. Its toolbar and blank pages were BUG-010. After the fix the same PDFs are the document alone.

## BUG-009 decision

- The owner approved a brief, nonintrusive notice when the structural guard refuses a destructive edit. **Deferred** to a later editor-reliability checkpoint (not built in A4.2A).

## Note: pagination P3 on a long-running dev server

- In the acceptance pass `pagination.spec.ts` P3 (the caret across a page gap) failed against the owner's dev server that had been running all session.
- It passed against a fresh Turbopack server with the same code, and on webpack with both `7c9d3b6` and the working tree. No defect was found; no entry is open for it.

## Open, carried from earlier handoffs (not yet re-run in A4.1)

- **BUG-005:** `src/features/ideas/components/idea-editor.test.tsx` was
  reported flaky under full-suite load. It passed 8 runs in a row alone in the
  interrupted session; not reproduced, cause unknown. Open.
- **BUG-006:** `tests/e2e/pwa.spec.ts`, four failures reported earlier. Not
  re-run (needs a production build). Open, unclassified.
- **BUG-007:** legacy outline editor E2E (`outline-editor.spec.ts`,
  `outlines-integration.spec.ts`): "Add point after Add from Saved Point adds
  nothing" and a 5-minute timeout, seen in A3. Not re-run. Open, unclassified.
- **SEC-001:** review of database-error logging (`describeDatabaseError` could
  carry query parameters, i.e. document content, into a log) and
  `npm audit --omit=dev`. Not done in A4.1. Open.
