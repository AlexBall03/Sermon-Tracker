# Handoff: PS-ER1, Interaction Hardening (schema v4 lab)

This phase touches only the v4 lab (`/lab/editor/v4`, `src/features/editor-lab/v4`), its two dictionaries, and its lab spec. Nothing is saved, synced, or sent. v3, the shared lab files, and the production outline editor are unchanged. It builds on the v4 prototype (commit `3834d71`; [migration document](PREACHER-STUDIO-MIGRATION.md) §15.10, which records the owner's decisions D1–D5).

## Start here

- **Commands:** `v4/commands.ts`
  - `boundaryDeletion` (with `protectedDeletion` and `enterOverSelection` built on it)
  - `deletionNotice`
  - `tab` and `shiftTab` (`increaseLevel`, `indentProse`, `moveOutSelected`, `outdentProse`)
  - `moveOutRange`, shared by `moveOut`
- **Keys:** `v4/keymap.ts`.
- **Guard, notices, drop, browser input:** `v4/plugins.ts`
  - `unsafe` and `endsPointUnsafely`, with the text backstop `deletedText` / `coverable`
  - `nativeNotice`
  - `dropTransaction` and `dropInternal`
  - the `beforeinput` and `compositionstart` handlers
- **Ownership comparison:** `reparented` in `v4/ownership.ts`.
- **Tests:** `v4/interaction.test.ts` (new) and `tests/lab/v4.spec.ts` (the PS-ER1 block).

## Defects resolved

| #   | Defect (investigation)                                                                                                                                                       | Now                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ctrl/Shift+Backspace and Ctrl+Delete (and the macOS variants) at a point's edge did nothing                                                                                  | Same as the plain key; in the middle of words left to the browser                                                                                                                                                                                                                  |
| 2   | Enter over a selection from writing into a heading did nothing                                                                                                               | Protected deletion; the boundary is the break; caret at the heading's start                                                                                                                                                                                                        |
| 3   | Enter from a heading into writing turned the writing into a point, or was refused on a role point                                                                            | Writing stays writing with its depth and owner; role and IDs kept                                                                                                                                                                                                                  |
| 4   | Drag-moving a selection that ends in a heading was refused                                                                                                                   | The protected deletion removes the source                                                                                                                                                                                                                                          |
| 5   | IME over a selection into a heading **ended the point** (checked in Chromium: `"BodyあB"`)                                                                                   | `compositionstart` deletes the selection the protected way first                                                                                                                                                                                                                   |
| 6   | A deletion the browser makes itself (context menu, virtual keyboard, `execCommand`) **merged a heading into writing**, and the guard let it through (reproduced in Chromium) | `beforeinput` deletions run the v4 command. The guard also refuses a pure deletion after which a vanished point's words still survive                                                                                                                                              |
| 7   | Depth could pass 32, and the document then would not reload                                                                                                                  | Capped in `increaseLevel`, `addPoint("child")`, `proseToPoint`, and `indentProse`; the guard refuses any other out-of-range depth                                                                                                                                                  |
| 8   | Native deletion of whole points was silent, and a deleted parent's later subpoints were reparented without notice                                                            | `points_deleted` (with `reparented`), or `ownership_changed`, for every ordinary change. Nothing is repaired                                                                                                                                                                       |
| 18  | **New:** an internal drag went through the paste rules, where an unstamped slice is foreign, so a moved point got **new IDs** and lost its lineage                           | v4 drops its own drags (`dropTransaction`): a move keeps the same nodes (a whole-block selection takes the blocks, leaving no empty heading behind); a copy gets the identity step's `derivedFrom`; a moved introduction keeps its role; the slice lands at the drop point's level |

Silent refusals now report `change_refused`, except during a composition, for the editor's own follow-up changes, and for the deletion a cut makes before its protected one. The notice has no Undo button.

## Behavior (D1–D5)

- **Tab:**
  - in a list, sink the item (the first item does not move the list);
  - on a point, increase the level;
  - in writing, move it into the open point above, only if no other block changes owner;
  - otherwise unhandled, so focus moves on.
- **Shift+Tab:**
  - in a list, lift the item;
  - on a point, Move Out (the group, after the parent's group; consecutive siblings together);
  - in writing, outdent in place only if no other block changes owner, never moved;
  - otherwise unhandled, so focus moves back.
- **Other keys:** `decreaseLevel` (the adopting outdent) is the toolbar's "Outdent in place" only. Alt+Shift+→/← are unchanged.

## The guard's text check (integrity review)

The guard first decides by **ID** which points a change removed; survivors are never examined, and text is never used to pick or match a point. For a removed point that the mapping counts as wholly deleted, the text check asks whether the change was a pure deletion of text that could have removed that point's words. If not, the words survived elsewhere and the change is refused.

- **It only adds refusals:** it never allows a change that the ID and mapping checks refuse.
- **It never refuses a real deletion:** in a pure deletion, the stretch actually removed is always one of the stretches the check considers. A point really inside it is always "coverable", whatever identical words stand next to it.
- **It does not change attributes:** a surviving point's `role`, `sourcePointId`, and lineage are never read or changed by the guard.
- **Undo and redo pass the guard untouched.** They restore the exact earlier document.
- **One accepted ambiguity:** an edit the browser makes itself, whose result reads exactly as if a point were deleted (writing "Same" before a point "Same", and the browser leaves one "Same"), cannot be told apart by text and is let through, as it was before PS-ER1.
  - It is reported (`points_deleted`, with the source link and the reparented blocks) and undone whole.
  - It is reached only with no key or `beforeinput` the editor routes. Keys, `beforeinput` deletions, and compositions all go through the protected deletion first.

These cases are tested in `interaction.test.ts`, under "points whose words are the same".

## Tests

**Passed:**

- `vitest run src/features/editor-lab/v4`: **120 passed**.
  - That is the 79 that existed before PS-ER1, plus 41 new in `interaction.test.ts`.
  - Two existing assertions were updated to the new notice shape. One of them now expects the deletion report it used to lack.
- `vitest run src/features/editor-lab src/i18n "src/app/(app)/lab"`: **534 passed** (17 files).
- `tsc --noEmit` and ESLint are clean; Prettier was applied.
- **Browser** (desktop Chromium, signed in, `LAB_BASE_URL`): each PS-ER1 test passed 3/3. Those tests are:
  - Ctrl+Backspace;
  - Enter over a selection;
  - Tab moving focus out and back;
  - Shift+Tab Move Out;
  - cut and paste back;
  - the browser's own deletion;
  - IME, at a caret and over a selection.
- **Deterministic placement:** the PS-ER1 browser tests place the caret or the selection through the editor (`place`, `selectIntoB`), never with arrow keys.

**Failed or flaky (pre-existing):**

- Three tests from before PS-ER1 click and then press Home or arrow keys: Enter in a heading's middle, typing over a selection, and Backspace.
  - They sometimes lose those caret moves before any v4 code runs.
  - Measured side by side on two copies of the tree (HEAD, and HEAD plus PS-ER1), served the same way (webpack), with identical tests:
    - Enter in a heading's middle: 2/5 on both;
    - typing over a selection: 5/5 vs 4/5;
    - Backspace: 5/5 on both.
  - On a busy Turbopack dev server they fail more; the Backspace test failed 0/5 there.
- The spec is serial, so one such failure skips every test after it. **The whole spec has not passed in a single run.**
- The existing Backspace test was changed in one way: it now waits 600 ms between its two edits, because history joins adjacent changes made within 500 ms into one undo step. It still moves the caret with Home.
- These tests were not reworked; that is left as test hygiene for later.

**Not tested:**

- dragging text in a real browser (Playwright starts the drag but delivers no drop; `dropTransaction` is unit-tested);
- real IMEs (CDP's `Input.imeSetComposition` is not one);
- Android and iOS keyboards;
- macOS key variants (bound only on macOS);
- the phone layout.

## Deferred (outside this phase)

- **v3 has defect 18 too:** `clipboard.ts` (shared) re-keys any drag within the document. v3 and the shared file were left alone.
- Block-type shortcuts and list toggles over a range that includes a point are still refused as a whole (now with the notice).
- Pasting several blocks into the middle of a heading sends the heading's tail into the last pasted block (conventional).
- Enter in an empty point that owns content adds another empty point.
- An edit that both inserts and deletes text, made by the browser itself outside a composition (no such path was found on desktop), is guarded by the mapping alone.
- Typed markers, numbering under the introduction and conclusion, presentation as style or view, and production storage remain open (§15.10).
