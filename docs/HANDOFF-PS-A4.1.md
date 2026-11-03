# Handoff: PS-A4.1, Editor Reliability & Cursor Navigation

3 November 2026. Branch `dev`, on HEAD `e915142`. Nothing staged, committed,
pushed, or deployed; `SERMON_DOCUMENT_CONVERSION` untouched. No schema change,
no migration.

**Status: implemented, partly verified.** The fixes are built and pass the
targeted checks below. The broader verification is pending (§E), so A4.1 is
**not** fully verified.

The session was interrupted by a Windows crash while a full unit run and a
browser sweep ran at once. It was resumed with a reduced test load: one test
process at a time, one worker, Chromium only.

## A. What changed

| File | Change |
|---|---|
| `src/features/editor-lab/v4/held-selection.ts` (new) | `HeldSelection`: the fix for BUG-001 |
| `src/features/editor-lab/v4/extensions.ts` | registers `HeldSelection` after `CaretSync` (lab and production share this list) |
| `src/features/editor-lab/v4/navigation.test.ts` (new) | unit tests for BUG-001 |
| `tests/lab/navigation.spec.ts` (new) | browser walk with real arrow keys; asserts no stall, no step back, both ends reached |
| `tests/lab/held-navigation.spec.ts` (new, review) | from a boxed-in passage reached by the arrows: 13 actions (keys, IME, copy/paste, focus) act at the passage or nowhere; fails on any page error |
| `tests/lab/config.ts` | the lab suite also matches `navigation.spec.ts` (and so `held-navigation.spec.ts`) |
| `src/features/offline/queue.ts`, `model.ts`, `offline.test.ts` | BUG-003: queue order by `orderedAt`, then a per-owner `sequence` |
| `src/features/preferences/preferences.test.ts` | BUG-004: the mock gains `deleteIdentity` |
| `docs/BUGS.md` (new) | the bug register |

Two throwaway investigation specs from before the crash (`nav-debug`,
`nav-exp`) were moved out of the repository, not deleted, to the session's
scratch folder; they are not needed to run anything.

## B. BUG-001: what it was and how it is fixed

See `docs/BUGS.md` for the full record. In short, Chrome cannot keep a browser
selection between two uneditable blocks (three passages in a row, a passage
next to a page break), moves it on the next key, and ProseMirror took that move
as the person's. `HeldSelection` keeps the editor's own selection through
ProseMirror's public `createSelectionBetween` only when:

- the selection is a selected block or a gap cursor;
- no end of it can be held by the browser;
- the last input in the editor was a key (a click or touch is always taken);
- the reading is about the current document (when the browser typed text
  itself, ProseMirror asks about the new one, and that is left to it).

It changes no document and dispatches nothing, so navigation never makes a
document change, a revision, a save, or `markDeveloped`. Untouched: the
schema, persistence, autosave, recovery, sessions, the write guard, the
structural guard, offline authority, folding, `CaretSync`, and pagination.

## C. Other fixes

- **BUG-003** (offline queue order) and **BUG-004** (`preferences.test.ts`
  loading): built in the interrupted session, intact after the crash, re-run
  here. See the register.

## D. Checks that ran

### Final review pass (after the review fixes)

| Command | Result |
|---|---|
| `npx vitest run src/features/editor-lab/v4 --maxWorkers=1` | 14 files, 319 tests passed (navigation.test.ts: 7) |
| `npx vitest run src/features/offline src/features/sync src/features/preferences/preferences.test.ts --maxWorkers=1` | 15 files, 203 tests passed |
| `npx playwright test -c playwright.lab.config.ts tests/lab/held-navigation.spec.ts --project=desktop --workers=1` | 1 passed (13 actions, no page error) |
| `npx playwright test -c playwright.lab.config.ts tests/lab/navigation.spec.ts --project=desktop --workers=1 -g "Print Layout test in Print"` | 1 passed (the original failing walk) |
| `npm run typecheck`; `npx eslint` and `npx prettier --check` on the changed code | clean |

The compile-only build below ran before the review fixes and was not repeated.

### Recovery session

| Command | Result |
|---|---|
| `npx vitest run src/features/editor-lab/v4/navigation.test.ts --maxWorkers=1` | 5 passed |
| `npx vitest run src/features/editor-lab/v4 src/features/offline/offline.test.ts src/features/offline/ideas src/features/preferences/preferences.test.ts --maxWorkers=1` | 17 files, 374 tests passed |
| `npx playwright test -c playwright.lab.config.ts tests/lab/navigation.spec.ts --project=desktop --workers=1` (run as two `-g` halves) | 4 of 4 passed: both fixtures, Regular and Print |
| `npx next build` (compile only, no migration) | succeeded (56 pages; the existing Atkinson font-override warning) |
| `npm run typecheck` | clean |
| `npx eslint` on the changed files | clean |
| `npx prettier --check` on the changed files | clean for the new files; the older edited files differ only by CRLF (the working copy's `core.autocrlf=true`), content already formatted |

Before the fix, the same walk on "Print Layout test" looped back to the first
line (recorded in the interrupted session; not re-run, to save load).

## E. Pending (not run; do not count as passed)

Run these later in small batches, one at a time:

1. `npx vitest run --maxWorkers=1`, the whole unit suite, once.
2. `tests/lab/navigation.spec.ts` on the `mobile` project; then the rest of the
   lab suite (`npm run test:e2e:lab`).
3. Firefox and WebKit for the navigation spec (not installed or launched in
   this session by the owner's instruction).
4. `tests/e2e/sermon-document.spec.ts` on a production build, with a
   navigation journey on `/outlines/[id]` (not written yet).
5. Workstream C: BUG-005 (`idea-editor.test.tsx` flake), BUG-006
   (`pwa.spec.ts`), BUG-007 (legacy outline E2E with conversion off).
6. SEC-001: database-error logging review and `npm audit --omit=dev`.
7. Walks after typing, undo, insert, and folding; a real IME and a Mac dead
   key (only simulated through the DevTools protocol here).
8. One compile-only build after the review fixes.

## F. Risks

- With a boxed-in block selected, Chrome's hidden caret is elsewhere at every
  key. Measured: every edit acts at the block; Shift+ArrowUp/Down, PageUp/Down,
  Home, and End do nothing there (they no longer start from the top, but do
  not extend or move either).
- IME composition on a selected block replaces it and types in the next text
  block (ProseMirror's rule for any selected block), not where the block was.
- A tab still on the code from before A4.1 sorts the queue by time alone when
  it runs the sync, as before.
- If Chrome's behaviour differs on a phone or in another browser, the rule still
  applies only in the narrow case above; other browsers are unchecked.

## G. Owner's manual checklist

In Chrome, on `/lab/editor/v4` ("Print Layout test", then "When Idols Fall")
and on a converted outline at `/outlines/<id>`, in Regular then Print Layout:

- [ ] Walk the whole document with ArrowDown, then ArrowUp: the caret never
      jumps back to the top and reaches each end.
- [ ] Put three passages in a row (or a passage beside a page break) and walk
      across them both ways.
- [ ] Select the middle passage with the arrows, then type a letter, Enter,
      and Backspace: each acts at the passage, never at the top.
- [ ] Click into text right after selecting a passage: the caret goes where
      you clicked.
- [ ] Shift+Arrow across components, Home/End, Ctrl+Home/End (from a passage
      boxed in by others, these do nothing: expected).
- [ ] On a Spanish keyboard, select a boxed-in passage and type an accented
      letter: it lands next to the passage, never at the top.
- [ ] Navigation alone never changes the save indicator.
- [ ] Briefly repeat in Firefox and on a real phone.

## H. Later A4 checkpoints (approved, not built here)

Proper page splitting of short components (BUG-002, A4.6 / UI.4) and the
optional footer with bold, right-aligned page numbers (UX-001, A4.3 / UI.2C).

## I. Ready for review?

Yes, for code review. Not ready to call A4.1 verified until §E has run.
