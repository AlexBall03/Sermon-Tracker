# Handoff: PS-A4.4, Final Presentation Refinements (A1-UI.2D)

Starting point: `dev` at `f77fd0a` ("Phase A4.3 is done", parent `4576620`), clean working tree, no later commits. End state: uncommitted changes in the working tree (section 14). No migration, no schema or document-version change, no new package, no change to the conversion switch, nothing staged, committed, pushed, or deployed. The owner commits.

## 1. Objective and scope

A1-UI.2D, built as A4.4 (owner, D1):

- **Dark editing paper,** independent of the application theme.
- **Print color modes:** Color, Grayscale, and Black & White.
- **Print independence:** a print never takes the screen's theme or paper.
- **Final review of the built-in presets.**

Not touched:

- UI.3: drag-and-drop, context menus, slash commands, the Insert and mobile-toolbar redesign.
- UX-005.
- A4.6/UI.4: BUG-002 and BUG-011, keep-with-next, fragmentation.
- PDF or Word export, schema, sync, and conversion.

## 2. Owner decisions implemented

|     | Decision                                                                                                                | Where                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| D1  | A4.4 is A1-UI.2D                                                                                                        | `ROADMAP.md`, migration document                           |
| D2  | Dark paper is a device preference for every sermon, independent of the theme                                            | `presentation/preferences.ts`, `v4/paper.ts`               |
| —   | **Automatic until chosen** (asked during planning): Automatic / Light / Dark. Automatic keeps the look from before A4.4 | `paperShown`                                               |
| D3  | Color, Grayscale, Black & White                                                                                         | lab CSS, `colors.ts`, `render.ts`                          |
| D4  | The default is remembered on the device; a one-time choice for one print; no per-sermon storage; no migration           | `print-job.ts`, `printing-settings.tsx`                    |
| D5  | Conservative preset review; any change goes in a new revision                                                           | No change was justified (section 8)                        |
| D6  | View menu: paper. Outline Settings → Printing: print colors and preview                                                 | `view-menu.tsx`, `outline-settings.tsx`                    |
| D7  | Color by default; dark paper never prints                                                                               | `paperShown` (light while printing), the print token reset |

**The owner's four required refinements:**

1. **Dark paper styles the document only.** The dark tokens apply to `:is(.lab-editor, .sermon-header, .sermon-paper)[data-paper="dark"]`, never to `<html>` or to the application's bar, menus, dialogs, or toolbar. The browser spec checks that the toolbar's background never changes with the paper.
2. **Stored colors keep their meaning.**
   - Stored colors are never rewritten. Dark paper draws each color's existing dark variant; exact and per-theme colors stay the person's.
   - Grayscale transforms colors where they are drawn: CSS relative colors, plus `--ink-g`/`--fill-g` beside the existing `--ink-d` for inline marks and highlight pairs. Black & White blackens text and lines and clears fills.
   - Both reach inline formatting, highlights, components, single-node appearances, the header, the running header, page numbers, and user-defined colors.
3. **Starting a print is deterministic.**
   - Printing's "Print" closes Outline Settings. The print starts in an effect after React has removed the window, plus one frame.
   - The mode is handed to the print job only then (`printWith`). The job captures it at `beforeprint` and clears it at `afterprint`.
   - A request that never starts expires (`printRequestTimeout`). Opening another window first drops it. A thrown `print()` leaves nothing behind.
4. **A print in progress is isolated.**
   - The mode is captured once per print. A second `beforeprint` or another tab's `storage` event changes nothing until `afterprint`.
   - This is tested in a unit test and in Chromium.

## 3. Repository state

Before: `dev` at `f77fd0a`, clean. After: section 14. Only read-only Git commands were used. The baseline was compared from a `git archive` copy in the scratchpad.

## 4. Files

**New**

- `src/features/sermon-editor/presentation/preferences.ts`: the two device preferences.
- `src/features/sermon-editor/presentation/print-job.ts`: the mode of each print.
- `src/features/sermon-editor/presentation/use-presentation.ts`: hooks that keep the editor's paper on the choice and install the print job.
- `src/features/sermon-editor/presentation/presentation.test.ts`.
- `src/features/sermon-editor/appearance/printing-settings.tsx`.
- `tests/lab/print-color.spec.ts`.

**Changed**

- **Editor core:** `editor-lab/v4/paper.ts` (`PaperTheme` gains `automatic`; `paperShown`; the option is a getter, read again on every load) and `v4/extensions.ts` (a `paper` option).
- **Colors:**
  - `styles/colors.ts` (`grayOf`);
  - `styles/render.ts` (`darkScope`, `grayCss`, grayscale rules in the generated sheet);
  - `styles/plugin.ts` and `schema/formatting.ts` (`--ink-g`/`--fill-g`; rendered markup only, no data change).
- **CSS:**
  - `app/globals.css`: dark tokens on the document surface, `--brand-ink-gray`;
  - `editor-lab/lab.css`: dark gates, print-mode rules, header print reset, `data-print-never`, dark-paper swatches;
  - `v4/lab-v4.css`: dark gates, studio print-mode rules, `color-scheme: light` in print (BUG-014), preview padding (BUG-013).
- **Workspace:**
  - `sermon-workspace.tsx`: paper follows the device, print job installed, `.sermon-paper`;
  - `view-menu.tsx`: Paper radio group;
  - `header/sermon-header.tsx`: `paperShown`;
  - `components/toolbar.tsx` and `formatting/color-control.tsx`: the swatch shows the paper it is on.
- **Outline Settings:**
  - `outline-settings.tsx`: the Printing category;
  - `dialogs.tsx`: the print request;
  - `modal.tsx`: `data-print-never`;
  - `preview.tsx`: the `printColor` prop; paper through the extension option.
- **i18n:** `sermonEditor.view.paper` and `editorLab.appearance.printing`/`categories.printing`, in English and Spanish.
- **Tests:**
  - `typography.test.ts`: two expectations updated for the intentional markup and selector changes, neither weakened;
  - `appearance-dialogs.test.tsx` and `view-menu.test.tsx`: new suites;
  - `tests/lab/pdf-text.ts`: `pdfColors`, `pdfPageSizes`, `pdfDarkAreas`;
  - `tests/lab/config.ts`: `print-color` added to the allow-list.
- **Docs:** `AGENTS.md`, `ARCHITECTURE.md` (new "Editing paper and print colors"), `docs/ROADMAP.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `docs/BUGS.md` (BUG-013, BUG-014), and this file.

## 5. Presentation-state architecture

| State                        | Owner                             | Storage                                                               |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| Paper (Automatic/Light/Dark) | device                            | `localStorage` `sermon-paper`                                         |
| Default print color mode     | device                            | `localStorage` `sermon-print-color`                                   |
| A print's mode               | one print in this tab             | memory + `<html data-print-color>` from `beforeprint` to `afterprint` |
| Printing's temporary choice  | the open Outline Settings window  | React state                                                           |
| Layout, folding, expansion   | unchanged (tab / account+outline) | unchanged                                                             |

**The paper is plugin state** (`paperKey`). The workspace dispatches `paperMeta` with `addToHistory: false` and no steps.

- The write guard, autosave, recovery, and Undo never see it.
- A read-only tab may change it and stays read-only.
- `paperShown` is Automatic → light in Print Layout and none in Regular; Light/Dark → that paper in both layouts; light whenever `isPrinting`.

**The print color mode is not plugin state.** It is an attribute on an ancestor, so the header (outside ProseMirror), the editor, and the preview share one rule set, and nothing has to re-render in `beforeprint`.

## 6. Persistence and compatibility

**Preferences**

- Strictly validated (`includes`). An unknown or unreadable value is the default.
- A refused write is held in memory for the page, and nothing throws.
- Followed across tabs (`storage`). No IndexedDB, Web Lock, BroadcastChannel, sync type, polling, or server request.
- The browser spec records every non-GET request, Server Action, or document read made while switching paper: none.

**Documents**

- Nothing reads or writes `doc.attrs.page`, styles, or layout for A4.4.
- A page-null (pre-A4.3) document keeps its device paper and margins.
- Version 1 and version 2 pages are unchanged.
- Opening a document writes nothing. No `sermon-tracker*` name was touched.

**Defaults**

- Automatic paper draws exactly as before.
- Color mode sets no attribute, so a Color print is today's print. The one exception is the BUG-014 fix, which affects the dark theme only.

## 7. Print color behavior

**Color:** the document's own colors on white paper. The print token reset now covers the header too, so on dark paper it never takes ivory ink.

**Grayscale:**

- Every color keeps its OKLCH lightness and loses its chroma, alpha kept.
- In CSS, on the `--x-*` component properties, the frames, the numbers, the references, the `--sermon-*` hues, the paper ink (`--brand-ink-gray`), and the generated sheet's text colors.
- Inline colors and highlights use `--ink-g`/`--fill-g`, worked out with `grayOf`.
- The kinds stay apart by shape (wash, box, rule, dashed box, double rule), label, and gray weight.

**Black & White:**

- All text in the sheet and header is black, including the `::before` labels and numbers.
- Fills are transparent; highlights are underlined.
- Every visible line is solid black (`rgb(from … 0 0 0 / calc(alpha * 1000))`), and invisible ones stay invisible.
- A Balanced study note, which has a wash only, gets a dotted outline.
- Distinction comes from line style and labels, with no large fills.

**Paint only:** no width, padding, or font changes. The PDF spec proves identical pages and line positions across the three modes on each paper.

**Preview:**

- Outline Settings → Printing shows the sample outline (every component kind, labelled "Sample pages · printed in …") in the same read-only editor, paginator, and header, on white paper.
- `data-print-color` is set on its page, read by the same rules as the print.
- Choosing a mode changes neither the draft nor the outline.

**Lifecycle:** BUG-010 kept. `beforeprint` still puts the editor in Print Layout and measures synchronously; `afterprint` restores the layout and paper. The `<html>` attribute is set and removed by the job's own listeners.

**Not printed:** Outline Settings and its preview (`data-print-never`), checked by printing with the window open.

## 8. Preset review (no revision changes)

**How:**

- Screenshots of the component gallery and "When Idols Fall" in Minimal, Balanced, and Expressive, under print media in Color, Grayscale, and Black & White.
- Taken by the spec's `LAB_SHOTS` test, then compared side by side.

**Findings:**

- **Minimal:** revision 2's double-rule script stays distinct from its boxed reminder in every mode.
- **Balanced:** its kinds read apart in grayscale (wash, ochre box now gray, copper rule, slate box). In B&W its study notes would have lost their wash entirely; the B&W policy gives them a dotted outline, a print rule rather than a preset change.
- **Expressive:** its stronger fills gray to distinct weights; nothing overly aggressive in print.

**Decision:** no visual change to any released preset. No revision 3; revision 1 and 2 objects and CSS are untouched. `preset-parity.spec.ts` was not re-recorded; see section 10 for its run.

## 9. Offline, recovery, and multiple tabs

- Paper and print mode are view state and device storage only. They create no revision, autosave operation, recovery draft, or conflict.
- A read-only tab follows the paper (unit and component tests) and cannot edit.
- Taking over editing is unrelated to presentation.
- Both preferences work offline, since they make no request.

## 10. Tests run

**Static checks:** `npx tsc --noEmit -p .` clean, ESLint clean on the changed files, Prettier `--check` clean on the changed files.

**Vitest** (`--maxWorkers=2`, in three batches):

| Batch                                    | Result                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| appearance-presets, editor-lab, outlines | 48 files, 1,147 passed                                                                                                                      |
| sermon-editor, sync, offline, account    | 50 files, 828 passed. One unhandled jsdom `getClientRects` error after "keeps focus inside…", which occurs at the baseline too (section 11) |
| the rest                                 | not run: see the addendum                                                                                                                   |

The new tests:

- `presentation.test.ts`: 19 tests covering preferences (defaults, invalid values, refused storage, cross-tab), the print job (capture, isolation, one-time choice, cancelled / failed / never-started prints, counted install), the paper matrix, load, read-only, and `grayOf`.
- 5 Printing component tests.
- 5 View menu paper tests.

**Browser** (`tests/lab/print-color.spec.ts`, Chromium, `next dev` on port 3200, no migration step):

- Desktop: 7 of 7 passed.
- Mobile (Pixel 7): 2 passed, 5 skipped (desktop-only by design).

Covered:

- The paper matrix: two themes × two layouts × three papers, with sheet and text luminance, document JSON, caret, `scrollTop`, layout, and chrome background unchanged, and no write requests.
- PDFs in the three modes on Letter (3 pages), A4 (3), and half Letter (5), from a dark theme on dark paper with a long title:
  - exact MediaBox;
  - identical lines across modes;
  - Grayscale only r=g=b, B&W only black and white, Color contains colors;
  - no dark area;
  - state during printing (light paper, Print Layout, the mode) and after (dark paper, attribute removed).
- Printing from Regular Layout on dark paper.
- Another tab's change during a print.
- The Printing preview's computed colors per mode, and its Print button: dialog and preview gone before `beforeprint`, default unchanged.
- Ctrl+P with Outline Settings open.

**Visual review:** the screenshots in section 8, and the Printing panel at phone width (Pixel 7).

**Whole lab suite, production compile, signed-in journeys, Firefox and WebKit:** not run; see the addendum.

## 11. Defects and classification

| ID                                   | What                                                                                                                     | Classification                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BUG-014                              | Dark theme printed a near-black canvas under every page (Turbopack bundle)                                               | Found in A4.4, fixed. Most likely pre-existing: the baseline can't be served on Turbopack (TOOL-001), and A4.4 changed nothing on `<html>` |
| BUG-013                              | Previews of pages: the header covered the first lines (preview padding outranked the paper's margins)                    | Pre-existing, from the A4.3 Header & Footer preview; fixed                                                                                 |
| —                                    | jsdom `getClientRects` unhandled error in `appearance-dialogs.test.tsx`                                                  | Pre-existing: reproduced at the baseline copy (29/29 pass, same error). A4.4's own test stubs Range geometry so it adds none               |
| —                                    | A first spec draft wrongly flagged the ink color as a "dark page" and counted the background Bible download as a request | Test issue, corrected in the spec (dark areas are now measured by size)                                                                    |
| BUG-002, BUG-011, TEST-003, TEST-004 |                                                                                                                          | Unchanged, not touched                                                                                                                     |

## 12. Outstanding limitations

- **Firefox and Safari printing are not verified.** Relative colors (`oklch(from …)`) need Chrome 119+, Safari 16.4+, and Firefox 128+; an older browser falls back to Color for those rules.
- **The one-time Print:** if a browser returns from `print()` before printing and the print starts more than 10 s later, that print uses the default.
- **Grayscale lightness:** OKLCH lightness keeps luminance close (within 0.6 of contrast against white in tests) but not identical to a printer driver's own grayscale.
- **The Black & White dotted note outline is Balanced-only**, where notes otherwise have no line.
- **Real phones and screen readers:** not checked here (owner).

## 13. Manual acceptance checklist (owner)

**Desktop Chrome**

1. View → Paper → Dark in the light theme: the sheet and header turn dark, while the toolbar, menus, and Outline Settings stay light. Typing, Undo, and the caret are unaffected.
2. Switch the app to the dark theme with Light paper: white sheet, dark interface.
3. Automatic: Print Layout is white; on a narrow window, Regular follows the theme.
4. With Dark paper, Ctrl+P: Chrome's dialog shows white pages in Color.
5. Outline Settings → Printing: the preview changes for Grayscale and Black & White. Press Print: the window closes and Chrome's dialog opens in that mode. Cancel it, then Ctrl+P: the default (Color) is used.
6. "Use as default on this device" with Grayscale. Ctrl+P is now Grayscale, and another tab shows the new default.
7. Print in Black & White from Chrome's dialog with background graphics on and off: black text, outlined boxes, no fills.
8. Open an outline saved before A4.3 (no page of its own): same paper, margins, and numbers as before.
9. Header & Footer preview: the title no longer covers the first lines.

**Phone**

10. View → Paper in Regular and Print Layout: no keyboard, no jump, no layout switch.
11. Outline Settings → Printing on a narrow screen: the categories scroll, the modes are tappable, and the preview can be hidden.

**Read-only tab**

12. Open the same outline in a second tab: Paper works there, and editing stays disabled.

## 14. Git status

Uncommitted, unstaged:

- **Modified:** `AGENTS.md`, `ARCHITECTURE.md`, `docs/BUGS.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `docs/ROADMAP.md`, `src/app/globals.css`, the editor-lab files of section 4, the sermon-editor files of section 4, four i18n dictionaries, `tests/lab/config.ts`, `tests/lab/pdf-text.ts`.
- **New:** `src/features/sermon-editor/appearance/printing-settings.tsx`, `src/features/sermon-editor/presentation/`, `tests/lab/print-color.spec.ts`, `docs/HANDOFF-PS-A4.4.md`.

No commit, push, deployment, migration, or flag change.

## 15. UI.3 and later: recorded, not implemented

- **Drag-and-drop stays as approved in the migration document** (A1-UI.3): dragging a point or subpoint moves its whole semantic group (subpoints, writing, Scripture, notes, scripts, descendants) by the v4 ownership model, keeping IDs, validity, Undo, autosave, and recovery.
- **UX-005** stays for the owner in UI.3.
- **A4.6/UI.4** (BUG-002, BUG-011) stays deferred.

**Recommended next phase:** A1-UI.3, starting with UX-005's decision and the drag-and-drop architecture, or A4.6 if pagination fragmentation is the higher priority.

## Addendum: what was not run, and the verdict

**Not run (environment):**

- **Vitest batch 3** (everything outside the first two batches): started twice. Both times Claude Code stopped it because the machine was critically low on memory; one worker had reached about 1.8 GB. No result, so no claim. Rerun: `npx vitest run --maxWorkers=1 --exclude "src/features/{appearance-presets,editor-lab,outlines,sermon-editor,sync,offline,account}/**"`. A4.4 changes no file there except the i18n dictionaries, whose own test (`src/i18n/i18n.test.ts`) is in that batch.
- **Whole lab suite** (`npm run test:e2e:lab` on both projects): started once, stopped by me when the session's usage limit was reached, after 4 passes and no failures. Not complete. `preset-parity.spec.ts` is in it and was therefore not run.
- **Production compile** (`npx next build`, not `npm run build`): not run.
- **Signed-in journeys on `next start`** (`tests/e2e/sermon-*.spec.ts`, offline, recovery, the two-tab ownership spec): not run. The paper's read-only behavior and its lack of requests are covered by unit, component, and lab tests only.
- **Firefox and WebKit:** not run, for the screen or for printing.

**Verdict: NOT READY.** The features are complete and pass every check that ran; the phase-wide checks above must run before the owner commits.
