# Handoff: PS-A4.2A, Advanced Appearance

3 November 2026. Branch `dev`, from `7c9d3b6` ("Phase A4.1 is done"). Not committed: every change is unstaged for the owner's review.

A4.2A is the advanced appearance approved under A1-UI.2B.3:

- typography and spacing by semantic depth;
- how a point's number looks;
- the numbering, in Outline Settings;
- the preset's container values shown as numbers;
- refinements to the built-in presets.

It also defines the pure-data contract that personal presets (A4.2B storage, A4.2C UI) will use. Neither of those is built.

## Owner decisions applied

1. Per-depth and number presentation is a sparse `styles.levels` in `doc.attrs.styles`. The dormant `layout.levels` stays stored and is neither drawn nor written.
2. The schema is widened additively under `version: 1`. No migration, nothing normalized, and every stored value keeps its meaning.
3. Numbering is a new **Outline Settings → Numbering** category. It shares the one Appearance session and draft, so one Apply and one undo step cover numbering and appearance together.
4. Single-valued container and section numbers moved from CSS to preset code, with visual parity. Theme colors and context-dependent values are described as such.
5. Safeguards, from the second approval:
   - An unreadable layout is refused, never replaced.
   - Built-in preset revisions are immutable, and revision 1 keeps today's look.
   - The numbering preview is view state only.
   - The snapshot is a contract only.
   - Appearance resets never touch numbering.

## What was built

### Schema (`src/features/editor-lab/styles/model.ts`)

- **`styles.levels`:** a record keyed "1" to `maxDepth` (32, the v4 schema's own bound; no new limit). Each value is a sparse `levelStyleSchema`:
  - text: font, size, bold, italic, underline, color;
  - spacing: line height, space before and after (no indent, because a level's place is its depth's);
  - `titleColor`;
  - the number: `markerVisible`, `markerFont`, `markerSize`, `markerBold`, `markerItalic`, `markerAlign` (left or right), `markerGap` (0–36pt), `hanging`, and `notationColor` (its color, an existing name with its existing meaning).
  - Invalid keys, empty records, and empty levels are refused.
- **The number on component types:** the point and subpoint type styles (`componentStyleSchemas`) also accept the number fields.
  - `appearanceSchemas`, the contract of a node's own `appearance`, is split from them and is exactly as before. So paste, `narrowAppearance`, and the v4 validator's node checks are unchanged.
- **`defaults.levelIndent`:** the indent per outline level, 6–72pt. Accepted on the defaults only, not on named styles.
- **`presetRevision`:** 1 or 2, optional. Left out, it means revision 1.
- No database migration: the shape is canonical JSON, validated by the same core (`restoreSermonDocument`, `canonicalDocument`).

### Resolver (`resolve.ts`, `context.ts`)

`componentLayers` and `resolveComponent` take an optional depth. For a point or subpoint that plays no role, the cascade is:

1. preset defaults → outline defaults;
2. preset type style → outline type style;
3. **preset level → outline level** (new);
4. the node's own appearance → its `format` → inline marks.

- `resolveAt` passes a point's depth, so the toolbar and the highlight pairs follow levels.
- A point with a named style keeps that style's look. A role's heading has no level.
- A point whose depth changes resolves its new depth's level, and nothing is copied onto the node.
- `LayerSource` adds `presetLevel` and `level`. Controls name them "From level N" or "From the preset".

### Drawing (`render.ts`, `v4/lab-v4.css`, `v4/numbering.ts`)

- **Level rules:** a rule `p.lab-v4-point[data-depth="d"]:not([data-role])` is written only for a depth that some level sets.
  - It comes after the type rules (same specificity as the main-point rule, later in the sheet; more specific than the subpoint rule) and before the named-point rules.
  - It reads its type's instance properties, so a node's own value still wins. This order was checked in Chromium.
- **The number:** drawn from `--x-marker-*` on the numbered heading, plus whole rules for `content: none` (hidden) and `--x-hang: 0px` (not hanging).
  - An unset `--x-marker-*` makes the `::before` declaration inherit, so an uncustomized number is drawn exactly as before.
  - The column estimate now multiplies `--x-label-n` (the label's estimate in em, from the numbering decoration) by the number's own size.
  - A node's own number color, `--ps-<type>-i-notation`, is read first.
- **Indent per level:** `--ps-step` on the editor, studio presets only. The phone override is untouched when no indent is set.
- **Numbering preview:** the numbering plugin reads the drafted numbering from the preview transaction's meta, never from the state still being built. It previews only a configuration that validates, and it rebuilds labels only when the preview changes.

### Draft, Apply, Undo (`draft.ts`, `plugin.ts`)

- **New paths:** `{ layer: "level", depth, field }`, `{ layer: "presetRevision" }`, and `{ layer: "numbering" }`.
  - A numbering edit holds the whole `NumberingConfig`. Its base is the committed `layout.numbering`, so the existing conflict contract applies (compared with `same()`).
- **`applyPlan`:** before anything is written, it checks orphans, conflicts, the styles schema, each instance's contract, and the numbering.
  - The numbering is accepted only when the stored layout parses and the result passes `numberingConfigSchema` and `outlineLayoutSchema`.
  - An unreadable layout refuses the whole draft: `invalid`, and nothing is written.
  - An appearance-only draft never touches `layout`.
- **`applyAppearanceDraft`:** one transaction of `DocAttrStep`s and attribute steps, closed in history: one undo step, or nothing.
- **Resets:**
  - `restoreOutline`, `restorePreset`, and `restoreOriginal` also clear every level.
  - None of them touches the numbering, and the confirmation texts now say so.
  - `resetLayer({ layer: "level", depth })` resets one level.
  - Single components are kept, as before.
- **Speed:** while only the numbering edit changes (typing a prefix), the merged styles are reused (`plugin.ts`, `lastMerge`), so the sheet and the decorations are not redrawn per keystroke.

### Presets (`presets.ts`)

- **Moved to code:** `presets.ts` now holds every single-valued number that the CSS drew as a token:
  - each section's opening rule and closing line;
  - a passage's and a script's lines, style, corners, and space above, below, and inside;
  - a note's line width and its space above and below.
  - The values are exact (1px is 0.75pt; the rhythm values are 4, 6, 8, and 10pt). The removed tokens are listed in the `lab-v4.css` diff.
- **Left to the CSS:** a note's per-kind accent, corners, and inside space; space relative to the text (`rem`, narrower on phones); and theme colors. The controls say "Varies by note type", "Relative to text size", or "Theme color".
- **Immutable revisions:** `presetAt(id, revision)` is the only lookup.
  - Revision 1 is today's presets object, unchanged.
  - Revision 2 differs only in **Minimal's script**, which is now a double rule beside its words with no box. In revision 1 a reminder and a script were both thin outlined boxes (UX-002, screenshot evidence below).
  - Balanced and Expressive are the same objects in revision 2. Reviewed in screenshots, there was no evidence to change them.
  - The editor carries `data-preset-revision` only past revision 1, for CSS refinements; revision 2 needs none.
- **Revision choice:** choosing a preset writes the latest revision with it. "Use the updated design" (shown only when the latest revision differs) is an ordinary draft edit and is never applied by itself.

### Controls (`src/features/sermon-editor/appearance`)

- **Appearance tabs:** Outline, Components, and **Levels**.
  - Levels has a level picker: "Level 1 · Main points", "Level 2 · Subpoints", Levels 3–8, plus any deeper level the outline uses, each marked "(in this outline)".
  - It has the Typography, Spacing, and **Number** groups and "Reset level N".
- **Components:** the Main point and Subpoint types gain the Number group.
- **Component Appearance** for one point is unchanged in its fields, but its sources now include its level.
- **Shared defaults** gain "Indent per outline level (pt)".
- **Numbering category:** the legacy dialog's style choice and level editor, moved to a shared `outlines/components/numbering-fields.tsx` (the legacy dialog uses the same parts, with no behavior change). It shows a validation message and the conflict line.
  - Over an unreadable layout it shows "can't be read … Nothing was changed" and offers no control.
- **Effective values:** an unset number field shows the value it has (shown, hanging as the preset hangs, the heading's face, size, weight, and slant), named "From the heading" or "From the preset".
- **One session:** the session is shared across categories and tabs. The pending line lists "numbering", and the preview sample gained a third-level point.
- **Languages:** every new string is in `en` and `es` (`editorLab.ts`).

### Snapshot contract (`styles/snapshot.ts`; A4.2B/C consume it)

This is pure data: no storage, no account, no resolver.

- `appearanceSnapshotSchema` and the `AppearanceSnapshot` type hold `preset`, `presetRevision`, defaults, named, components, levels, and numbering. Never node appearance, the running header, or view state.
- `snapshotAppearance(styles, numbering, fallback)`. Given `mergeStyles(stored, draft)` it gives the snapshot the person is previewing.
- `materialize(snapshot)` writes the revision's code values under the snapshot's own, so an applied snapshot keeps its look when a later revision refines the preset. Theme colors and CSS-only treatments still follow the theme and the CSS by design.
- `snapshotDraft(snapshot, styles, doc, draft)` turns a snapshot into ordinary draft edits: `restoreOutline` first, then each value, the preset and revision, and the numbering. Applying is the usual preview, Apply, Undo, and conflict path, and single components are kept. An invalid snapshot gives `null`.

## Compatibility

- **Documents stored before A4.2A:** they parse unchanged (tested) and draw identically.
  - The evidence is `tests/lab/preset-parity.spec.ts`: computed styles of every block, `::before`, and `::after` in two fixtures, three presets, and both themes, compared with `preset-parity.baseline.json`.
  - The baseline was recorded from `7c9d3b6` served from a `git archive` copy. The comparison found **0 differences** on webpack.
  - On Turbopack it also passes, once the colors of zero-width borders are ignored. Those differences come from the bundler's CSS order and cannot be seen (TOOL-001).
- **Converted outlines:** styles are null and the layout comes from `layoutFromNumbering`. They are unaffected, and nothing writes their layout but a person's Apply.
- **Older code:** a client running code from before A4.2A refuses a document that uses the new keys (strict schema), as it would any later widening.
  - In practice that means a tab on old code until it reloads, and only for a document someone has already given levels, markers, a level indent, or `presetRevision`. Choosing a preset now writes `presetRevision: 2`.
  - The refusal is a refusal, never a rewrite: the A2/A3 rules keep the stored document and any recovery draft as they are.
  - Ship A4.2A before anyone uses the new controls on a device that might still run older code. Production conversion is off, so production has no such documents today.
- **Not touched:** persistence, autosave, recovery, the session and multi-tab modules, conversion and its switch, the database, and the legacy outline editor's behavior.

## Tests run (commands and results)

Run one at a time; Vitest with `--maxWorkers=2`, Playwright with `--workers=1`.

| Check                          | Command                                                                                          | Result                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Typecheck                      | `npx tsc --noEmit -p .`                                                                          | clean                                                        |
| Lint (changed files)           | `npx eslint <changed .ts/.tsx>`                                                                  | clean                                                        |
| Format (changed files)         | `npx prettier --write <changed>`                                                                 | formatted                                                    |
| New unit suite                 | `npx vitest run src/features/editor-lab/v4/levels.test.ts`                                       | 31 passed                                                    |
| Dialog suite                   | `npx vitest run src/features/sermon-editor/appearance`                                           | 26 passed (5 new)                                            |
| Unit batch 1                   | `npx vitest run src/features/editor-lab --maxWorkers=2`                                          | 24 files, 710 passed                                         |
| Unit batch 2                   | `npx vitest run src/features/sermon-editor src/features/outlines --maxWorkers=2`                 | 38 files, 833 passed                                         |
| Unit batch 3                   | every other `src/features/*`, `src/app`, `src/i18n`, `src/lib`, `src/components`, `src/db`       | 135 files, 1934 passed                                       |
| Preset parity (browser)        | `LAB_BASE_URL=… npx playwright test -c playwright.lab.config.ts preset-parity --project=desktop` | passed: webpack 0 differences; Turbopack passes              |
| Levels and numbering (browser) | `… appearance-levels` (desktop and mobile projects)                                              | 6 passed                                                     |
| A4.1 navigation (browser)      | `… navigation.spec --project=desktop`                                                            | 5 passed                                                     |
| Typography (browser)           | `… typography.spec --project=desktop`                                                            | 8 passed                                                     |
| v4 workspace (browser)         | `… v4.spec --project=desktop`, after the BUG-008 fix                                             | 13 of 14 passed; 1 failed identically on `7c9d3b6` (BUG-009) |
| Production editor (browser)    | `npx playwright test tests/e2e/sermon-appearance.spec.ts --project=desktop` (dev server on 3100) | 1 passed                                                     |
| Production compile             | `npx next build` (not `npm run build`, which migrates)                                           | compiled; 56/56 pages generated                              |

**Updated tests and why:**

- Four existing assertions encoded the old design, and they now state the new contract:
  - `presentation.test.ts`: the preset's numeric treatments are now emitted as properties, and the notation regex allows a wrapped `var(`.
  - `appearance.test.ts`: a value the preset gives in code has no CSS fallback.
- Two dialog expectations now include `presetRevision: 2`.
- No validation was weakened.

**Covered in the browser** (`tests/lab/appearance-levels.spec.ts`):

- A level previews without a document change and applies in one undo step.
- CSS order: level over type, node over level, named style over both.
- A number's look changes no label, and numbering changes no text.
- A numbering edit and a level edit apply as one transaction and one undo, and the draft is kept across categories.
- An unreadable layout is never replaced.
- On a phone (Pixel 7): no sideways scroll, and Apply and Cancel are in view.

**Not run or not verified:**

- The whole end-to-end suite (`tests/e2e`), and `pagination.spec`, `editor.spec`, and `persistence-probe.spec`.
- Firefox, WebKit, and a real phone or touch device.
- A real on-screen keyboard.
- Chrome's own Print dialog (Ctrl+P) after the BUG-010 fix. The PDFs were made through `beforeprint` and `page.pdf` and opened in Chrome's viewer; Firefox and Safari printing were not checked.
- Screen readers.
- The remaining A4.1 broader checks: still pending, as `BUGS.md` says.

## Visual review evidence

Screen screenshots from desktop Chromium are in the session scratchpad, not in the repository (the PDFs there are not print evidence: TEST-001):

- Component gallery and "When Idols Fall", each preset, light and dark, revision 1.
- Minimal revision 2.

Findings:

- Minimal r1: the reminder and the script are both outlined boxes. Fixed in r2.
- Expressive: hierarchy and contrast read well in both themes. No change.
- Balanced: no change.
- Deeper subpoints share the subpoint look in every preset. That is now customizable per level; no preset default was changed, to avoid churn.

## Bugs

Updated in `docs/BUGS.md`:

- **UX-002:** Minimal's note and script similarity. Fixed in revision 2.
- **A1 limitation:** typography by depth. Fixed.
- **BUG-008:** `v4.spec.ts` was written against a fixture and a control that later changed. Fixed in the acceptance pass (test only, no assertion loosened).
- **BUG-009:** the browser's own refused deletion shows no notice. Open, pre-existing (fails identically on `7c9d3b6`).
- **TOOL-001:** webpack without Tailwind. Closed, not a defect: every supported workflow is Turbopack.
- **BUG-010:** printing on a desktop printed the toolbar, in Regular Layout. P1, pre-existing (`f94ef8b`). **Fixed** in this checkpoint with the owner's approval (below).
- **TEST-001:** resolved by the BUG-010 fix.
- **BUG-009:** the notice is approved and deferred to a later editor-reliability checkpoint.
- **Untouched:** BUG-002 (A4.6), UX-001 (A4.3), BUG-005, BUG-006, BUG-007, SEC-001.

## Resource impact

- No new database calls, server requests, routes, actions, timers, or polling.
- Preview is client-side view state. Apply is one document change, saved by the existing autosave with its existing coalescing.
- The sheet is rebuilt only when the styles in force change. Level rules are written only for depths a level sets.
- The numbering labels are rebuilt when the previewed numbering or the structure changes, never while the numbering edit is the same.

## Manual review checklist (owner)

1. Start the lab: `npm run dev:next`, then `/lab/editor/v4`, "When Idols Fall".
2. Open Outline Settings → Appearance → Levels → "Level 3". Set Size 15 and Number color red.
   - Only the two third-level points change.
   - Cancel leaves nothing behind. Apply, then one Ctrl+Z, undoes it.
3. On Level 1, turn off "Show number" and turn off "Hanging number". The words move into the number's column, and nothing else changes.
4. Open Numbering → Decimal. The outline previews `2.1.`. Go back to Appearance: the draft is still there.
   - Apply once. Ctrl+Z restores both the numbering and the level.
5. Open Components → Scripture passages. Radius shows 3 (Balanced), not "Preset design". Preacher notes → corner radius shows "Varies by note type".
6. Choose Minimal. Its script is a double rule beside the words.
   - An outline already on Minimal keeps its look and offers "Use the updated design".
7. Narrow the window to a phone width: no sideways scroll, Apply and Cancel visible. Repeat in Spanish (Settings → language).
8. **Print:** Ctrl+P → Save as PDF, from Print Layout and (in a narrow window) from Regular Layout, for each preset and Minimal revision 2.
   - Expect the document alone, on white paper, with page numbers.
   - Check numbers, indents, lines, fills, and page breaks. BUG-002 (a heading left at a page's foot) is known and deferred.
9. On `/outlines/[id]` for an outline with a document: apply a level and a numbering, reload, and both are still there. This is automated in `tests/e2e/sermon-appearance.spec.ts`; check it by hand once.

## Acceptance pass (owner's request, after the first report)

- **Production editor (`tests/e2e/sermon-appearance.spec.ts`, new; 1 passed).** The development Clerk user and database, signed in.
  - Setup: a sermon and outline made for the run, converted on opening (development only), with a point and a subpoint added through the Insert menu.
  - In Outline Settings, Level 1's size and Numbering → Decimal were set and applied once.
  - After Apply, Undo, Redo, and a reload, the server's document (`GET /api/sermon-documents/[id]`) equals the editor's JSON, and its revision moves exactly once per save.
  - Undo gives back the pre-Apply document exactly; Redo gives the applied one exactly.
  - The preview moved no revision. The reload draws the level (15pt) and the label `1.`.
  - The run's sermon is deleted at the end. Nothing in production was touched, and conversion stays off in production.
- **BUG-008 fixed** and the v4 spec run: 13 of 14 pass; the 14th is BUG-009, reproduced on `7c9d3b6`.
- **TOOL-001** traced to the Turbopack-only Tailwind loader (`next.config.ts`) and closed: unsupported, nothing to fix.
- **Print:** BUG-010 found from the owner's Ctrl+P preview, and fixed (next section).
- **Diff review.**
  - Removed two unused exports (`markerFields`, `presetRevisions`) and the unused `numberingPreview`.
  - The bounds of the indent and the number's gap are now read from the model in `fields.ts`, not repeated.
  - No removal outside A4.2A's own replacements. No change to persistence, autosave, recovery, session, conversion, the guard, or the database.
  - Kept on purpose: `setOutlinePreset` (a command no UI calls; tests use it) still writes no revision, so it makes a revision-1 outline as before.
  - A known limit: on a phone's Regular Layout the narrower CSS step (`--ps-step: 1.25rem`) still applies over a custom indent per level, as it does over the preset's.
- **Re-run after the changes:** typecheck clean.
  - Vitest `src/features/editor-lab/v4`, `schema-v3`, `sermon-editor/appearance`, `outlines/components`: 20 files, 469 passed.
  - Playwright `preset-parity` and `appearance-levels`: 7 passed.

## BUG-010 fix (owner-approved, in this checkpoint)

**The change:**

- `sermon-editor/layout.ts`: `useDesktop` holds its answer from `beforeprint` to `afterprint`, and while print media matches.
- `pagination/plugin.ts`: the option `printsInPrintLayout`. With it, the Paginator's `beforeprint` puts Regular into Print Layout in its existing view-only transaction, and `afterprint` restores it.
- `v4/extensions.ts`: `labV4Extensions` sets that option.
- `v4/lab-v4.css`: the print root does not print the theme's background.
- The v3 lab (`lab.css`, `labExtensions`) is unchanged.

Nothing reaches the document, its history, autosave, or recovery.

**Evidence:**

- Unit: `layout.test.ts` 4 and `print.test.ts` 3.
- Browser: `tests/lab/print-workspace.spec.ts` 2 passed. It fails on `7c9d3b6` exactly as reported (Regular, 44 controls printed).
- PDFs opened in Chrome's viewer: "When Idols Fall" (3 pages) and the "Print Layout test" (7 pages), for Minimal r1, Minimal r2, Balanced, and Expressive. Every page is the document alone on white paper.
- Re-run after the fix, on a fresh Turbopack dev server:

| Check                                                     | Result                        |
| --------------------------------------------------------- | ----------------------------- |
| `pagination.spec` (desktop)                               | 14/14 (P11 Letter and A4; P1) |
| `v4.spec` + `navigation.spec` (desktop)                   | 18/18, excluding BUG-009      |
| `preset-parity`                                           | 1/1                           |
| `appearance-levels`                                       | 6/6                           |
| `print-workspace`                                         | 2/2                           |
| Production editor (`tests/e2e/sermon-appearance.spec.ts`) | 1/1                           |
| Vitest `editor-lab`, `sermon-editor`, `outlines`          | 64 files, 1550 tests          |
| Typecheck, lint, format (changed files)                   | clean                         |

## For A4.2B (personal preset storage)

- **Store:** an `AppearanceSnapshot`, validated with `appearanceSnapshotSchema` both on the server and when read back. Store the `materialize`d form when the preset must stay independent of later built-in revisions.
- **Never store:** a node's appearance, sermon content, IDs, `layout.levels`, or view state.
- **Apply:** only through `snapshotDraft` into the Appearance session, then the usual Apply (`applyAppearanceDraft`). Never write `doc.attrs.styles` or `layout` directly.
- **Account default** (A4.2C): when an outline is created from it, write the snapshot's values explicitly. Never make it a live reference.
- **Keep:**
  - revision immutability (a new built-in refinement is revision 3; never edit revision 1 or 2);
  - `preset-parity.spec.ts` passing, and never re-record its baseline to make a revision-1 change pass;
  - appearance resets independent of numbering.
