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

- **Status:** Fixed (A4.3 / UI.2C, 5 November 2026; [handoff](HANDOFF-PS-A4.3.md)).
- Approved first as an optional footer, off by default, whose page numbers are
  right-aligned and bold by default, and customisable.
- **Owner's decision (5 November 2026):** page numbers are **on by default for
  new sermon documents**, right-aligned and bold. A document stored before
  A4.3 (no page of its own) keeps what it always drew: numbers on, plain, at
  the right, until a person changes its page.
- **Built:** Outline Settings → Header & Footer turns them on or off and sets
  their position (left, centre, right) and weight; they follow the real
  pagination, and the screen's Print Layout and the printed pages agree.

## BUG-014: a dark theme printed every page on a near-black canvas

- **Severity:** P1 (printing). **Status:** Fixed (A4.4, 5 November 2026).
- **Found** by `tests/lab/print-color.spec.ts` (a PDF reader of fills, `pdfDarkAreas` in `tests/lab/pdf-text.ts`): in a Turbopack dev bundle with the dark theme, Chrome's PDF had an opaque `#121212` rectangle covering every page, under the sheet.
- **Cause:** the root is transparent in print (BUG-010's review) while `<html>` keeps the dark `color-scheme` next-themes gives it, so Chrome paints its own dark canvas behind the page.
- **Fix:** `html:has(.lab-editor[data-studio][data-layout="print"]) { color-scheme: light !important; }` in print (`v4/lab-v4.css`).
- **Evidence:** after the fix, no dark fill of a fifth of a page or more in any mode, paper, theme, or editing paper (the spec's three papers × three modes from a dark theme on dark paper).
- **Origin not proven:** the baseline cannot be served on Turbopack from a `git archive` copy (TOOL-001), and on webpack neither tree shows it. A4.4 changed nothing on `<html>` or its `color-scheme`, so it is most likely pre-existing; recorded as found and fixed in A4.4.
- **Unchecked:** Firefox and Safari printing (they may treat a dark canvas differently).

## BUG-013: a preview of pages covered its first lines with the header

- **Severity:** P2 (a preview only; never the outline or a print). **Status:** Fixed (A4.4, 5 November 2026).
- **Found** in A4.4's Printing preview, then seen in A4.3's Header & Footer preview on the lab's fixtures: the title was drawn over the introduction.
- **Cause:** `.lab-appearance-preview .lab-editor` gave every preview editor a box's padding (16 px on top), which outranked Print Layout's paper margins (`--first-top`, `lab.css`), so the text started at the top of the page instead of below the header. The state was right (`--first-top: 96px`); only the CSS was wrong.
- **Fix:** the box's padding, width, and growth are for a flowing preview only (`:not([data-layout="print"])`); a preview of pages is drawn as the paper is.
- **Evidence:** computed `padding-top` is the first page's top (96 px) and the header no longer overlaps (screenshots in the A4.4 handoff's run).

## BUG-012: the sermon header in Regular-started prints, narrow papers, and dark themes

- **Severity:** P1 (printing). **Status:** Fixed (A4.3 commit-readiness check, 5 November 2026).
- **Found** by `tests/lab/header-footer.spec.ts`, and by the owner's screenshot (the faint title).
- **Printing from Regular Layout.**
  - **Cause:** the header's place and measured height followed React. `beforeprint` puts the editor in Print Layout and measures at once, before React renders again, so the header stayed a block above the text at its Regular height, and the printed pages were pushed down by it.
  - **Fix:** the header's place follows the editor's layout in CSS (`.sermon-page:has(… [data-layout="print"])`, `v4/lab-v4.css`), and the paginator reads its height itself in `beforeprint` (`readHeader`, `data-page-header`). Unit test in `v4/header-footer.test.ts`.
  - **Evidence:** a Regular-started A4 print in Chromium matches the screen prepared for print (pages, numbers in their margins, every line in its text area).
- **A long title on a narrow paper was clipped.**
  - **Cause:** the fields were sized in JavaScript only when their words changed, never when the paper changed.
  - **Fix:** they now grow in CSS (a hidden copy of the words in the same grid cell), so a narrower page adds the line it needs (A5: the text starts at 181 px, not 148).
- **The title was nearly invisible in a dark theme** (the owner's screenshot).
  - **Cause:** the header sits on Print Layout's white paper but outside the editor, so it took the dark theme's near-white ink.
  - **Fix:** it now carries the editor's `data-paper`, so it takes the paper's tokens.
  - **Evidence:** the browser test compares the title's computed color with the paper's ink (both `rgb(23, 24, 27)` in a dark theme).

## UX-005: restoring an Introduction, and where Insert → Introduction puts it

- **Severity:** P2. **Status:** Open; recorded for the owner's decision (UI.3, the Insert workflow). Not changed in A4.3, which is limited to UI.2C.
- **Reported by the owner (5 November 2026, `/lab/editor/v4`):**
  - the Introduction heading became ordinary writing ("The point is now ordinary writing…", the existing rule for Backspace at a heading's start; the notice offers Undo);
  - with the caret on an empty line at the top, Insert → Introduction put the new Introduction below the opening writing instead of at the caret.
- **Cause (existing behavior, A3):** `insertRolePoint` (`v4/commands.ts`) places an Introduction just before the first main point, and at the caret only when the sermon has no main point. Top-level writing before "I." therefore stays above it. It never turns existing writing into the Introduction.
- **Options for the owner:**
  - **(a)** insert at the caret's line whenever that is before the first main point (still refusing any placement that would change an existing block's owner);
  - **(b)** a "Make this the Introduction" action on a line of writing, which turns that line back into the Introduction heading in one undoable step;
  - **(c)** both.
  - Each must keep one Introduction per sermon and the v4 ownership guards.

## BUG-011: a passage's label can be drawn in a page's bottom margin

- **Severity:** P2. **Status:** Open, pre-existing; deferred to A4.6 with
  keep-together (BUG-002).
- **Found (A4.3 verification, 5 November 2026):** `tests/lab/header-footer.spec.ts`
  measured every text line of `/lab/editor/v4` against its page's text area.
  When a Scripture passage falls at a page's foot, its label
  (`.lab-passage-label`, a flex box) is drawn below the text area, up to about
  58 px into the bottom margin.
- **Pre-existing, proved:** a probe with the first page's header offset
  inactive (a short title, so page 1 is laid out as before A4.3), sweeping the
  top margin from 72 to 240 px on Letter, found it at several margins.
- **Not yet checked:** whether the printed page shows the same (the A4.3 PDF
  check's fixture did not place a passage at a page's foot).
- **Seen in the commit-readiness check:** on A5 with a long title, such a
  label falls on that page's number (page 4). The geometry spec sets the label
  aside for the number check too, and says why.
- The A4.3 spec checks every other line, and the label against the header and
  the page numbers, and says why it sets the label aside.

## UX-004: the library could write over a title saved in the sermon editor

- **Severity:** P2. **Status:** Fixed (A4.3, 5 November 2026).
- **Found (A4.3 audit):** the library's idea editor saved online with no
  revision, so a page opened before a title was changed in the sermon editor
  could save its older title (and everything else in its form) over it.
- **Fix:** the online save names the revision its draft began from
  (`updateIdea(id, input, expectedRevision)` → `updateIdeaAt`); a stale save
  writes nothing, keeps the form, and offers "Save mine over it" (against the
  revision the idea has now) or "Discard mine" (after a confirmation). The
  draft's revision moves only with a change this page made or one it took in
  (passages added elsewhere).
- **Old clients:** a page loaded before A4.3 sends no revision and is now told
  to reload, with its words kept in its form; it can no longer write without
  a check. Queued offline changes always carried their revision and are
  unchanged.

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

## Note (A4.2C): the development database has no migration 0021

- **Found:** A4.2C's verification, 4 November 2026, on `npm run dev:next`.
  Every signed-in page fails ("Something went wrong") because the account
  read selects A4.2B's three `users` columns, which the development
  database does not have yet.
- **Not a defect in the code:** `0021` (A4.2B) has not been applied to
  development; applying it (`npm run dev` migrates) is the owner's.
- **Effect on verification:** the signed-in Playwright journeys
  (`tests/e2e/appearance-presets.spec.ts`, `sermon-appearance.spec.ts`) and
  the lab specs, which are signed in, could not run in A4.2C. Run them after
  applying `0021` (`docs/HANDOFF-PS-A4.2C.md`, owner checklist).
- **Resolved the same day:** the owner applied `0021` to development; the
  preset journey and the lab specs then ran (`docs/HANDOFF-PS-A4.2C.md`,
  "Browser runs").

## TEST-002: `sermon-compatibility` clicked "As a subpoint" mid-animation

- **Severity:** P2 (test only). **Status:** Fixed (A4.2C verification, test change only).
- **Seen:** `tests/e2e/sermon-compatibility.spec.ts`, the saved-point
  journey: `locator.check: Element is outside of the viewport` on the
  "As a subpoint" radio of Add from a saved point.
- **Pre-existing, proved:** the unchanged spec at `27a9b90` (a `git archive`
  copy served by its own dev server, A4.2C absent) failed the same way once
  in two warm runs. On A4.2C's code it failed twice in two.
- **Cause (measured):** the radio is a visually hidden input (`peer sr-only`
  in `Segmented`). With a probe that measured it before the click, it sat
  at (640, 186) inside the 1280×720 viewport and the dialog, and the
  journey passed. The spec used `check({ force: true })`, which skips
  Playwright's wait for the element to be stable, so it clicked while the
  dialog's opening animation (zoom and fade) was still running. A person
  clicks the visible label, and the input is reachable by keyboard: not an
  application defect.
- **Fix:** the spec clicks the visible label ("As a subpoint") and asserts the
  radio is checked. Afterwards, desktop passed 1 + 3 (`--repeat-each=3`), and
  mobile passed.
- **Not changed:** the idea page's `check({ force: true })` on the Sermon
  radio (not in an animating dialog; passes in every spec).

## TEST-003: the legacy outline editor specs fail at the baseline

- **Severity:** P2 (tests of the legacy editor, which production still uses
  while conversion is off). **Status:** Open, pre-existing, cause not traced.
- **Seen (A4.2C verification), on a production build served with
  `SERMON_DOCUMENT_CONVERSION=off`:**
  - `outlines-integration.spec.ts` fails at line 197: after "Add point",
    heading "II." is not focused.
  - `outline-editor.spec.ts` times out at line 166, clicking the "Heading,
    I." box before "Move down".
- **Pre-existing, proved:** both fail at the same lines on a production build
  of `27a9b90`, served from a `git archive` copy with the same switch. Both
  specs are unchanged since then.
- **Before that point both pass:** a new outline is made in the legacy
  editor, a saved point is added, and words are saved. A4.2C's creation path
  works with conversion off; a separate probe confirmed no sermon document
  and no default applied.
- **On a dev server** both also fail earlier and for another reason:
  `locator('[data-status]')` also matches the Next.js dev-tools badge (strict
  mode). They are written for the production build.
- **Next:** trace the focus and toolbar steps in the legacy editor (or update
  the specs if the editor changed on purpose), in a checkpoint the owner
  names.

## TEST-004: three lab tests that fail at the baseline

- **Severity:** P2 (lab tests). **Status:** Open, pre-existing, cause not traced.
- **Classified in A4.3's final verification (5 November 2026).** Each was rerun alone against A4.3 and against a `git archive` copy of `4576620`, served with `next dev --webpack`. The specs are unchanged from HEAD.
- **The failures:**
  - `tests/lab/v4.spec.ts` "a deletion the browser makes on its own never merges a heading into writing" (desktop): the content is protected, but `sermon-editor-notice` is not shown (line 298). Fails the same way at the baseline.
  - `tests/lab/navigation.spec.ts` "walk Print Layout test in Regular" (mobile): `up.stalls` is not empty (line 216). Fails the same way at the baseline.
  - `tests/lab/pagination.spec.ts` P3 (mobile, the v3 lab): intermittent. With `--repeat-each=3`, 2 of 3 pass on both A4.3 and the baseline, failing at line 539 (the caret's page after ArrowDown across a gap).
- **Next:** trace each in a checkpoint the owner names.

## TEST-005: unit tests never closed their in-memory databases

- **Severity:** P1 (test infrastructure: it ran the development machine out
  of memory and stopped A4.4's verification twice). **Status:** Fixed
  (Testing Infrastructure Stabilization, 6 November 2026;
  [handoff](HANDOFF-TEST-INFRA.md)).
- **Seen:** A4.4's third Vitest batch, stopped twice with the machine
  critically low on memory and one worker at about 1.8 GB.
- **Cause (measured):** `createTestDatabase()` made a PGlite instance, ran the
  migrations, and returned only the Drizzle handle; nothing ever closed it.
  Forty-eight test files call it, almost all in `beforeEach`, so every test made
  one. An instance holds about 238 MB outside the JavaScript heap, and one that
  is no longer referenced is **never reclaimed**, even after a forced garbage
  collection: eight unclosed instances held 1.9 GB in one process to the end.
  Eight closed one after another kept the process at about 440 MB. Of the eight
  test files that make a `new PGlite()` themselves, one closed it.
- **Effect, before and after,** on `src/features/ideas/classification.test.ts`
  alone, one worker: process tree peak 2,684 MB working set and 3,521 MB
  private before, 899 MB and 1,321 MB after; the machine's lowest free memory
  9 MB before, 2,970 MB after.
- **Fix:** `src/db/test-lifecycle.ts` registers every instance
  (`createTestDatabase`, `recordingDatabase`, `ownTestClient(new PGlite())`)
  and `vitest.setup.ts` closes it after its test (or file) ends, after the
  file's own hooks; an instance whose migrations fail is closed at once. Proven
  by `src/db/test-lifecycle.test.ts`, which runs fixture files in a child
  Vitest with the real setup: the order of hooks and closes, a failing
  `beforeEach`, a failing `beforeAll`, a failed migration, and a query on a
  closed database refused.

## TEST-006: an unhandled jsdom error made every whole unit run exit 1

- **Severity:** P2 (test only). **Status:** Fixed (Testing Infrastructure
  Stabilization).
- **Seen:** A4.4 (its section 11, at the baseline too):
  `TypeError: target.getClientRects is not a function` after
  `appearance-dialogs.test.tsx` "keeps focus inside while open…". Every test
  passes, but Vitest exits 1, so no whole run could ever pass.
- **Cause:** jsdom gives a `Range` no geometry, and ProseMirror asks for it
  when focus goes back to the outline. The file stubbed it, but inside a later
  test, after the test that needs it had run.
- **Fix:** the same stub, installed once for the file in a `beforeAll`. No
  assertion changed; 34 of 34 pass with no unhandled error.

## TEST-007: the v3 lab's rich-title bold selects one character short

- **Severity:** P2 (lab test of the v3 baseline lab). **Status:** Open, cause
  not traced, not classified as pre-existing or as a regression.
- **Seen:** Testing Infrastructure Stabilization, 6 November 2026, four runs of
  four, on `next dev` (Turbopack), desktop: `tests/lab/editor.spec.ts:389`,
  "schema v2: rich titles, leaving a point with Enter, and a paste between
  documents". After End and five Shift+ArrowLeft in the title "Walking in the
  Light" (italic and underlined), Ctrl+B bolds "ight", not "Light". The phone
  project passes.
- **What is known:** the application code is the same as `33c5629`; this
  checkpoint changed no application file and not the spec. A4.3's handoff
  records `editor` as 8 of 8 passing on desktop at `f77fd0a`. A4.4's changes to
  `src/features/editor-lab` are colors, paper, and CSS, with nothing about
  keys or selection.
- **Not done:** a run of the same spec at `f77fd0a`. A `git archive` copy
  cannot be served on Turbopack (TOOL-001), and webpack draws the lab without
  Tailwind's utilities, so that comparison was left to the owner.
- **Next:** trace it (or compare with the baseline) in a checkpoint the owner
  names.

## TEST-008: the persistence probe's row-lock case times out

- **Severity:** P2 (development-only probe of A2.3B.2D). **Status:** Open,
  cause not traced.
- **Seen:** Testing Infrastructure Stabilization, two runs of two, desktop:
  `tests/lab/persistence-probe.spec.ts:206`, "server execution: the GET
  completes while the save waits inside Next.js on a row lock". The test holds
  a row lock on the development database and waits up to 30 s for the
  application's save to wait behind it; no waiting statement appears. The
  other test of the spec passes.
- **What is known:** the application code is the same as `33c5629`. No run of
  this spec is recorded after A2.3B.2D (A4.2A's handoff lists it as not run),
  so whether it passed more recently is unknown. It depends on the remote
  development database and on timing inside `next dev`.
- **Next:** trace it in a checkpoint the owner names.

## TEST-009: the lab's sign-in helper races Clerk's redirect in Firefox and WebKit

- **Severity:** P2 (test only). **Status:** Open, recorded.
- **Seen:** Testing Infrastructure Stabilization, desktop project drawn by
  Firefox and by WebKit (`--browser`). After `clerk.signIn`, the spec's
  `page.goto` is aborted (Firefox: `NS_BINDING_ABORTED`; WebKit: "interrupted
  by another navigation to /dashboard"), so most signed-in specs stop before
  their first check. Chromium does not abort it.
- **What did run in WebKit** (and passed): the header, a long title, and the
  pages never overlap on every paper; the header is drawn in the paper's ink in
  a dark theme; a format chosen at a collapsed cursor applies to what is typed
  next. One typography check differed by rounding only (`21.333334px` against
  `21.3333px`). `page.pdf()` is Chromium's only.
- **Next:** wait for the redirect after signing in (a test change, the owner's
  call), then run the screen specs in both engines.

## UX-003: the default for new outlines looked unresponsive

- **Severity:** P2. **Status:** Fixed (A4.2C).
- **Seen:** `appearance-presets.spec.ts`. The radio for the default stayed on
  the old choice until the server answered, so a click looked as if nothing
  happened.
- **Fix:** while the change is sent, the radio shows the choice (the group is
  `aria-busy`, and every other change is disabled). It then settles on what
  the server answered, or on what a read back proved; a failure goes back to
  the current default. Unit tests, plus the browser journey, passed after.

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
