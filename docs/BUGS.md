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
  *new* document. The first version answered with the old document's
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
