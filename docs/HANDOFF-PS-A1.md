# Handoff: A1, Unified Editor Workspace Integration

A1 is the first checkpoint of the full-product integration program. It puts schema v4's document model (flat blocks, semantic `depth`, derived ownership) and its PS-ER1 hardening into v3's editing workspace. The result is one editor, built to be mounted in the application later without being rebuilt.

It runs only at the development route `/lab/editor/v4`. Nothing is saved, synced, or sent. `/lab/editor` (v3) stays as the baseline, and no production route, table, or migration changed.

The decisions behind it are in the [migration document](PREACHER-STUDIO-MIGRATION.md) §15.10 (D1–D5, PS-ER1) and the owner's A1 brief, including the adjustments made during review.

## Where it lives

The editor itself is production-intended: `src/features/sermon-editor/`. It has no fixtures, no lab diagnostics, and no knowledge of routes.

- **`sermon-workspace.tsx`: `SermonWorkspace`.** One document in the full workspace:
  - header: the way back, slots for the start and end, and the numbering;
  - one toolbar row;
  - the writing area: Regular, or Print Layout with the margin ruler;
  - a Document Styles pane;
  - a notice line;
  - a load-refused banner.
- **`structure-tools.tsx`:** the structure controls; v4 commands only.
- **`notice.ts`:** the words of a structural notice.

The lab composes around the editor, in `src/features/editor-lab/v4/components/`:

- **`editor-lab-v4.tsx`:**
  - the fixture picker (v4's three documents and every v3 lab document, migrated as it opens);
  - the prototype badge;
  - a link to the v3 baseline;
  - the device's default layout (a stand-in for Settings).
- **`inspector.tsx`:** Structure (who owns each block), Insert (a Scripture passage, an inline reference), JSON, and Checks (reload and compare).

Pieces extracted from the v3 workspace so both use one implementation (v3 is rewired to them, with the same behavior):

- `components/workspace-frame.tsx` (the full-window frame);
- `components/page-view.tsx` (layout, paper, margins, expansion, `ViewControls`, the default-layout select);
- `components/numbering-select.tsx`;
- the exported toolbar groups in `components/toolbar.tsx`.

## What the editor does

- **Writing.** Ordinary writing works as in a word processor: Enter, Backspace, Delete, Shift+Enter, lists, quotations, undo and redo.
- **Formatting.** All of v3's formatting, on writing and on points: paragraph style, font, size, bold/italic/underline, text color, highlight, alignment, spacing, Clear formatting, lists, and **Quotation** (new on the toolbar).
- **Point styles.**
  - In a point, the paragraph-style menu sets the point's look: "Component style" or a named style. It stays the same point (`setNamedStyle`, now point-aware).
  - Alignment and spacing apply to points too.
  - The v4 lab's separate "Point look" menu is gone.
- **Structure, on demand.** The labels say what each action affects.
  - **On the row:**
    - **Point**, a toggle: "Turn into point" in writing; "Remove point, keep content" in a point, where it shows as pressed;
    - New point, New subpoint;
    - "Increase level, with its content";
    - "Move out, with its content".
  - **Under More**, headed "This point and its content":
    - move up and down, with its content;
    - **Duplicate point and its content** (new for v4);
    - Outdent in place (takes in what follows);
    - Delete point and its content.
  - **Under More**, headed "This point": Make introduction, Make conclusion, Remove role.
- **Keys (unchanged).**
  - Tab and Shift+Tab per D1/D5;
  - Alt+Shift+arrows to move, indent, or move out;
  - Ctrl+Enter for a new point, Ctrl+Shift+Enter for a new subpoint;
  - StarterKit's formatting shortcuts.
- **Components look as in v3.**
  - Points and subpoints take their component styles and numbering labels.
  - The introduction and the conclusion are framed as v3 framed its sections, with a rule above and below. The frame goes around the role's heading and everything it owns (`roleFrames` in `v4/plugins.ts`).
  - On a phone, levels are drawn in 0.75rem each, as v3 does.
- **Always an outline.** Depth is always drawn as an outline. The Outline/Manuscript switch was removed at the owner's request: a sermon, however fully scripted, is an outline with writing in it.
- **Gutter mark removed.** The v4 prototype's mark beside the caret's group is removed: it was a validation aid, not part of the editor. Ownership is still shown in the lab's Structure tab.
- **Layout.**
  - Regular and editable Print Layout use the existing pagination. Since A1-UI.1 a desktop shows Print Layout only, and a smaller window starts in Regular ("Layout and paper" below).
  - **Page setup** (paper, Reset margins, and how to drag the margins) is one labelled menu, replacing the bare paper list and the "reset" arrow icon.
- **Document Styles.**
  - Opened by **Edit styles**, beside the paragraph-style menu.
  - It changes how Normal Text, Title, Subtitle, and Headings 1–4 look throughout the sermon. It previews first and applies on Apply.
  - It has its own Close button.
- **Integrity.** Every PS-ER1 protection is unchanged: the guard, protected deletion, `beforeinput`, IME, drops, notices, and depth limits. Notices show in a line at the foot of the workspace, with Undo except for a refused change.
- **Opening a document.**
  - Every document is validated as it opens. Older ones are migrated.
  - A document that is refused leaves the editor read-only and lists the problems. It is never shown as an empty document.

## New commands (`v4/commands.ts`)

- **`insertPassage(reference)`.**
  - Places a Scripture passage after the block the selection ends in (or after a selected passage or page break).
  - It belongs where that block belongs; after a point heading, to that point.
  - The depth is not assumed. The anchor's depth is tried first, then each shallower one, and a depth is used only if no block already in the document changes owner (`reparented`). Otherwise the command does not apply.
  - It is one undo step.
- **`duplicatePointGroup`.**
  - Inserts a copy of the point's group straight after it.
  - The identity step gives the copies new IDs with `derivedFrom`. A role is not copied.
  - Nothing else changes owner.

## Tests

**Passed:**

- **Unit tests:** `vitest run src/features/editor-lab src/i18n "src/app/(app)/lab"` passed **572** (18 files). This includes the new `v4/workspace.test.ts` (38 tests):
  - passage insertion in nine kinds of place;
  - passage insertion at **every top-level block of every lab document** (stress excepted), each time checking that no owner changed, that the passage is the expected owner's, and that one undo restores the exact document;
  - duplicate;
  - the named-style, alignment, spacing, and clearing rules on points;
  - every lab document opening in v4 with all its text.
- **Updated assertion:** one existing assertion in `editing.test.ts` changed. The paragraph-style command now gives a point a look, where before it refused.
- **Static checks:** `tsc --noEmit` and ESLint are clean; Prettier was applied.
- **Browser, desktop Chromium, signed in.** These ran against the owner's own dev server through `LAB_BASE_URL`; it was not started or stopped here.
  - `tests/lab/v4.spec.ts`: **11/11** passed, excluding the three tests below. They include:
    - the new A1 test: Bold, a heading look, and the Point toggle in a point, then Undo;
    - the Regular → Print test, which types in Print Layout.
  - `tests/lab/typography.spec.ts`: 8/8.
  - `tests/lab/editor.spec.ts` (v3): 7/7, excluding one flaky test.
- **Visual check:** screenshots of v3 and v4 at desktop (1280 px) and phone (Pixel 7) width, on the same documents.

**Failed or flaky (pre-existing, not caused by A1):**

- **Three v4 click-then-arrow-key tests** (Enter in a heading's middle, typing over a selection, Backspace) passed together 1 time in 3. Each failure was "Enter in a heading's middle", which PS-ER1 measured at 2/5 before A1.
- **v3's "schema v2: rich titles" test** lost `Shift+ArrowLeft` presses once (the same class of flake).
- **Spec waits fixed.** Both specs waited for the page heading, which `lab.css` hides behind the workspace (unchanged at HEAD). They now wait for the workspace's `data-ready`. This is the one change made to `editor.spec.ts`.

**Not run:**

- the v4 spec at phone size (it skips itself);
- `pagination.spec.ts`;
- real phones, IMEs, and Safari/Firefox;
- a production build.

## Limitations and deferred work

- **Saved points** cannot be inserted yet (v3's lab-only Insert tool had a fixture version). A v4 "point from a saved point" command is needed.
- **v3's Legacy and Measure tabs** were not carried into the v4 inspector.
- **Component appearance:** the Balanced presentation and outline-level component colors are built in A1-UI.1 (below). A node's own appearance, the customization UI, and **print color modes** are not built yet.
- **The toolbar wraps to two rows** at about 1280 px, as v3's does. On a phone it scrolls sideways.
- **Docs-like simplification** is a direction, not yet done: menus for less-used controls, a compact alignment control. It is a design pass of its own.
- **Production-intended code still imports lab modules.** `src/features/sermon-editor` imports the shared modules in `src/features/editor-lab`: extensions, commands, styles, pagination, and toolbar parts. Moving them is a relocation, not a rewrite.
- **Interface words** stay in the `editorLab` dictionary.
- **Still open from §15.10:** typed markers, numbering under the introduction and conclusion, and production storage.

## A1-UI.1: Component presentation and spacing (21 October 2026)

The first of A1's UI/UX checkpoints. **A1 is not complete:** A1-UI.2 and A1-UI.3 follow, and A1-UI.1 awaits the owner's screenshot review.

### Approved direction

- **Three presentation presets:**
  - **Minimal:** traditional, compact, little decoration.
  - **Balanced:** the default.
  - **Expressive:** stronger colors, fills, and accents.
- **Presets are appearance only.** They are not editing modes or schemas, and they never change an outline's content, structure, or identities.
- **Precedence, later wins:**
  1. the preset;
  2. the outline's own component and named styles (`doc.attrs.styles`);
  3. a node's own `format` or `appearance`;
  4. marks.
- **Named text styles keep their place in that cascade.** A point given a named style stays a point.

### Built in A1-UI.1: the Balanced foundation

- **Presets in the resolver.**
  - **`styles/presets.ts`:** the presets as data, the cascade's first level.
    - `baseline` is the earlier look, unchanged. The v3 lab uses it, so `/lab/editor` looks exactly as before.
    - `balanced` is the sermon editor's default.
  - **Additive changes:** `resolveNamed`, `resolveComponent`, `resolveAt`, and `styleSheet` take the preset, defaulting to baseline.
  - **The styles extension:**
    - takes a `preset` option;
    - shows it as `data-preset` on the editor;
    - exposes it as `presetInForce(state)`. The toolbar and Document Styles read built-in values from it.
- **Balanced typography (candidates for screenshot review, not settled):**
  - **Reading face, Source Serif 4:** prose, Scripture, and scripts, at 12pt with 1.4 line height and 4pt between paragraphs.
  - **Structure face, Source Sans 3 (bold):**
    - main points, 13pt;
    - subpoints, 12pt;
    - introduction and conclusion headings, 13pt;
    - headings.
  - **Notes:** Source Sans 3 at 10.5pt.
- **Vertical rhythm:**
  - A main point opens 12pt of space and a subpoint 6pt.
  - A heading keeps 2–3pt to its own writing.
  - Containers use a 2/4/8/14pt rhythm (`--rhythm-*`).
  - The v4 point's extra `margin-top` is removed under Balanced, so the spacing controls tell the truth.
- **Component treatments** (`v4/lab-v4.css`, all under `[data-preset="balanced"]`). Each component is told apart by structure, not by shades of grey:
  - **Point numbers:** the heading's color and weight.
  - **Introduction and conclusion:** a gold rule above the role's heading and a hairline after everything it owns. The frame comes from `roleFrames`, unchanged, so ownership is untouched.
  - **Scripture passage:** no card; a thin burgundy rule, the reference in semibold sans, and the verses in the reading face.
  - **Inline references:** a burgundy tint, no longer the emerald of actions.
  - **Preacher note:** a light amber tint, a 3px accent, and its kind as a small label.
  - **Script:** no fill, a double rule, and a "Script" label.
  - **Lists and quotations:** on the same rhythm. A quotation's rule is neutral.
- **Tokens:** semantic `--sermon-*` tokens over new brand hues (`globals.css`), with paper values in Print Layout's print rules. Emerald is not used for any of it.
- **Component colors, level 2: the outline's own colors are now drawn.**
  - **Where they go:** `styleSheet` emits `--ps-<component>-<part>` (light and paper) and `-d` (dark, screen only) on the editor. Each component reads them on its own element.
  - **Three cases stay apart:**
    - unset means the preset's treatment;
    - `null` means transparent, or the theme's text color;
    - a color is drawn in each theme's variant, and Exact stays exact.
  - **Readable text:** text on a component fill is judged with the fill (`inkOn`), and a title color colors its title.
  - **The path for level 3:** a node's appearance (A1-UI.2) sets the same properties inline on the node, where it wins by inheritance with no specificity contest.
- **Labels and assistive technology** (`v4/labels.ts`):
  - Notes and scripts get decorations that carry the label (`data-component-label`) and give the same words to assistive technology: `role="note"` or `"group"`, with `aria-roledescription`.
  - They are never stored, selected, or copied.
  - The words are in the `editorLab` dictionary (`v4.components`), in English and Spanish.

### Layout and paper (owner's decisions, finalizing A1-UI.1)

- **Desktop: Print Layout only.**
  - A desktop is a window of 64rem or more with a fine pointer (`desktopQuery`).
  - The Regular/Print switch is not shown there, and neither is the passage-expansion button, which acts only in Regular.
  - Page setup and the margin ruler stay. The sheet is centered on the desk.
- **Mobile: Regular by default, Print Layout if chosen.**
  - Regular fills the width and follows the theme.
  - Print Layout can be chosen from the toolbar, and that choice is this tab's (`sessionStorage`).
  - The rule is `src/features/sermon-editor/layout.ts`: `useDesktop`, `workspaceLayout`, and `initialWorkspaceLayout`.
  - The lab's "default layout" select is gone from `/lab/editor/v4`; v3 keeps it.
  - The mobile toolbar is unchanged (A1-UI.3).
- **Resizing and switching change only the view.**
  - Crossing the desktop width (resizing, rotating) moves between the two layouts without touching the outline, its selection, or its history.
  - A switch keeps the place in view: the caret if the editor has focus, else the block at the top of the writing area (`keepingPlace`, `page-view.tsx`).
- **White paper.**
  - Print Layout's sheet is white in both themes; the desk and the interface follow the theme.
  - **How:** the editor carries `data-paper="light"` (`v4/paper.ts`, view state only), and it takes the light theme's tokens (`globals.css`). Every dark-theme variant is scoped away from it: the generated sheet's dark rules, `.lab-ink`/`.lab-fill` in `lab.css`, and Balanced's `-d` rules. Text, the person's own colors, and component treatments therefore show as they print.
  - **Printed output** never depends on the theme: the print rules in `lab.css` set paper colors.
- **Dark paper (approved; its control is A1-UI.2).**
  - An optional dark editing surface, like Word's Switch Background.
  - It is display only: never saved, never printed, and independent of the presets.
  - `PaperV4` already holds `"light" | "dark"`; A1-UI.2 adds the control that dispatches `paperMeta`.

### Fixed in finalizing

- **The blank Print Layout screenshot** had two causes:
  - **Desktop: a scroll position.** Switching Regular → Print kept the old `scrollTop`, which on a short outline pointed at blank paper below the text. The switch now keeps the place in view.
  - **Phone: a genuine defect.** The Segmented control's radio input is `sr-only` (absolutely positioned), and its nearest positioned ancestor was the fixed workspace, not the toolbar. When the input took focus at the toolbar's end, the browser scrolled the whole `overflow: hidden` workspace sideways, leaving it blank. `ToolbarRow` is now `relative` (shared with v3, which had the same latent defect).
- **Spacing:** writing that comes back to an outer level after a group (a point's writing after its subpoints, the document's after a point) is set 8pt apart (`lab-v4-resume`, from ownership; view only).
- **Phone header:** the header's start keeps at least 15rem, so the numbering menu wraps below it instead of overlapping.

### What each component supports today

| Component                                       | Rendered and styled   | Created in the editor                     |
| ----------------------------------------------- | --------------------- | ----------------------------------------- |
| Introduction, Conclusion                        | Yes, framed           | Yes (More → Make introduction/conclusion) |
| Main point, Subpoint (any depth)                | Yes                   | Yes                                       |
| Prose, headings, lists, quotations, line breaks | Yes                   | Yes                                       |
| Scripture reference (inline)                    | Yes                   | Lab inspector only                        |
| Scripture passage                               | Yes                   | Lab inspector only                        |
| Preacher note                                   | Yes, labelled by kind | **No**                                    |
| Script                                          | Yes, labelled         | **No**                                    |
| Page break                                      | Yes (unchanged)       | **No**                                    |

### Required for A1-UI.3, not optional for A1

These are not optional for A1's completion:

- **Insert and convert:** a Preacher Note, a Script, and a Page Break, from the toolbar and the keyboard. That means turning selected writing into a note or script and back, and choosing a note's kind.
- **Scripture in the editor's own UI:** a passage and an inline reference, not only the lab inspector.

### Deferred to A1-UI.2 or later

- **A1-UI.2:**
  - the dark-paper control (the display preference above);
  - the preset chooser, and the Minimal and Expressive data and CSS;
  - where the chosen preset is kept (the outline, the account, or the device; an open decision);
  - the component customization UI, and saving personal styles;
  - **drawing a node's own `appearance`.** It is accepted and stored but not yet drawn. For example, the migrated "Styles and Script" introduction's yellow fill does not show.
- **Print color modes** (grayscale, black and white). The B&W distinctions above hold without color, but there is no mode switch.
- **Component typography by depth:** deeper subpoints share the subpoint style and are told apart by indentation and numbering.

### Verification

- **Unit tests:** `vitest run src/features/editor-lab src/i18n "src/app/(app)/lab"` passed **589** in 19 files. This includes the new `v4/presentation.test.ts` (17 tests), which covers:
  - the baseline sheet unchanged, with no component variables;
  - Balanced as level 1 under outline styles and node format;
  - toolbar values;
  - identical JSON and ownership under either preset;
  - unset, off, color, and Exact-in-dark;
  - readable text on a fill;
  - title color;
  - labels with their roles, never in the JSON or HTML;
  - the layout rule (desktop → Print, else Regular or this tab's choice);
  - light paper only in Print Layout;
  - switching layout or paper changes no JSON, caret, or history;
  - the dark rules excluding light paper.
- **Static checks:** `tsc --noEmit`, ESLint, and Prettier are clean.
- **Browser:** a dev server on port 3200, started and stopped here, in the owner's signed-in Chrome.
  - Covered:
    - desktop Print Layout only, white paper in light and dark;
    - phone width in a 412px frame: Regular following the theme, and Print chosen from the toolbar;
    - the place kept across a switch;
    - resizing across the desktop width both ways;
    - fixtures `rolesAnywhere`, migrated `stylesAndScript`, and `lampAndPath`.
  - The v3 lab still reports `data-preset="baseline"` with no component variables.
- **Not run:**
  - the Playwright lab specs (`E2E_CLERK_USER_EMAIL` is not set here);
  - a real phone;
  - print preview on paper;
  - a production build.

## A1-UI.2A: Balanced visual refinement (21 October 2026)

**Status: READY FOR VISUAL REVIEW.** The work is implemented and checked in screenshots, but the owner has not accepted it. **A1 is not complete.**

### What changed

- **A realistic benchmark sermon.**
  - `whenIdolsFall` in `v4/fixtures.ts` ("When Idols Fall", 1 Samuel 5) is the lab's opening document.
  - It contains:
    - an introduction;
    - three main points with subpoints, one of them three levels deep;
    - four full passages and two inline references;
    - a note, a list, a quotation, a script;
    - a conclusion.
  - **Its title and subtitle are placeholders.** They are ordinary paragraphs styled Title and Subtitle, standing in for the dedicated sermon header (A1-UI.2C). They are not a title system.
- **Hanging point numbers (Balanced only).**
  - A numbered point's number sits in a column of its own, and every line of the heading aligns after it.
  - **Width.** The column is one step (22pt), or wider for a longer label: `max(step, label + gap)`.
    - The label's width is a generous estimate from its characters (`labelEm`, `v4/numbering.ts`), put on the heading as `--x-label` by the numbering decoration. Nothing is measured, so nothing waits on fonts or layout.
    - The label is also a minimum width, never a fixed one, so an estimate that falls short moves the first words along and never overlaps them.
  - **First-line indent.** `render.ts` writes a point's first-line indent as `calc(<style's indent> − var(--x-hang))`, so a style's own first-line indent still adds. A node's inline `format` still wins outright.
  - **Checked in the browser:**
    - Traditional, Numeric, and Decimal (`2.1.1.`);
    - a custom `POINT VIII:` / `(a)` / `II.a.1.` style;
    - wrapped headings at large sizes;
    - six levels;
    - numbering off.
- **Indentation follows the outline (Balanced only).**
  - One step per level, in points, so Print Layout prints as it shows.
  - A subpoint's number stands under its parent's words. Writing, lists, passages, notes, and scripts align with the words of the point they belong to.
  - Inside the introduction and conclusion everything is drawn one level out, so a role reads as a section.
  - **Limits:** eight levels at most (176pt). On a phone in Regular Layout, the step is 1.25rem with at most 6.25rem.
  - A top-level list's bullets stand in the column of their level's words.
  - It is all CSS in `lab-v4.css` over `--v4-indent`. Depth, ownership, and numbering are untouched.
- **One structural face for labels.**
  - These now use the outline's structural face (Source Sans 3) instead of the app's interface font:
    - passage references;
    - verse numbers;
    - inline references;
    - note and script labels.
  - The face is the preset's `structureFont`, drawn as `--ps-structure-font`.
  - Each label reads its own property first (`--ps-scripture-label-font`, `--ps-note-label-font`, `--ps-script-label-font`; none is written yet), so A1-UI.2B can customize each apart from the others and from the points.
- **Introduction and conclusion rule at a page top.**
  - **Before:** a role heading that began a new page lost its accent rule, which stayed on the box at the bottom of the previous page. Print Layout moves lines, not boxes, past a page gap.
  - **Now:** the rule is drawn inside the heading's first line, so it moves with the words.
  - **Cost:** the rule keeps 1px of width, without which it would sit alone beside the gap. The heading is therefore 1px to the right; this is not visible at reading size.
- **Smaller refinements.**
  - A section ends with 8pt after its hairline, not 14pt.
  - An inline reference is never taller than its line.
  - A passage reference is slightly smaller and letter-spaced.
  - Verse numbers are quieter.
- **The type scale is unchanged.** Sizes, weights, and spacing in `presets.ts` stayed at A1-UI.1's values: they read well once the indentation was fixed, so the toolbar's reported values did not change.

### Defects fixed

- **A phone in Print Layout broke pages differently from the paper.**
  - **Cause:** `lab-v4.css`'s phone indents applied in Print Layout too. v3 guards against this; v4 did not.
  - **Fix:** they are now Regular Layout only.
  - **Verified:** in a 412px frame, a subpoint's indent is 58.67px, the desktop value, where it was 40.96px. The lines and the first page break match the desktop sheet.
- **Printing showed rules and fills through the page margins.**
  - **Cause:** the page gaps print transparent (`lab.css`). A passage's rule, or a note's or frame's fill, that runs across a page showed through the margins.
  - **Fix:** under Balanced, the gaps print white and cover them, as the screen does.
  - **Not yet verified on paper.** This is reasoned from paint order.

### Files changed

- **Styles:**
  - `src/features/editor-lab/styles/presets.ts`: `structureFont` and `hangingNumbers`; the baseline sets neither.
  - `src/features/editor-lab/styles/render.ts`: the hang-aware first-line indent, and `--ps-structure-font`. Both are off for the baseline.
- **Editor:**
  - `src/features/editor-lab/v4/lab-v4.css`;
  - `src/features/editor-lab/v4/numbering.ts`: `labelEm` and the `--x-label` decoration.
- **Lab:**
  - `src/features/editor-lab/v4/fixtures.ts`;
  - `src/features/editor-lab/v4/components/editor-lab-v4.tsx`: opens the benchmark.
- **Words:** `src/i18n/dictionaries/{en,es}/editorLab.ts`, the benchmark's label.
- **Tests:** `src/features/editor-lab/v4/presentation.test.ts`.
- **Not touched:** the schema, ownership, commands, the guard, pagination, and the v3 lab.

### Tests

**Passed:**

- **Unit tests:** `vitest run src/features/editor-lab src/i18n "src/app/(app)/lab"` passed **595**. That is 589 plus the benchmark's runs in the existing workspace tests, plus 5 new tests in `presentation.test.ts`:
  - the hanging first-line indent, and the baseline without it;
  - the structural face, drawn only by Balanced;
  - label estimates for longer and custom labels;
  - the estimate is a decoration, never in the JSON or HTML;
  - the benchmark opens unchanged, with identical JSON and ownership under either preset.
- **Changed assertion:** one existing assertion now allows the structural face, which is not a color: "unset draws no component property".
- **Static checks:** `tsc --noEmit` and ESLint are clean; Prettier was applied.
- **Browser:** the owner's dev server on port 3000 (a second `next dev` is refused; it was not stopped), in the owner's signed-in Chrome.
  - Covered:
    - desktop Print Layout: the benchmark, `rolesAnywhere`, "Six levels deep", and "Styles and Script" (the outline's own colors and styles still win);
    - a 412px frame: Regular, and Print chosen from the toolbar;
    - a narrower window in Regular, dark theme;
    - a grayscale filter;
    - the v3 lab still `baseline`, with no `--ps-` or `--x-hang`.

**Not run:**

- the Playwright lab specs (`E2E_CLERK_USER_EMAIL` is not set here);
- print preview or a PDF;
- a real phone;
- a production build.

### Remaining visual issues (for owner review)

| Issue                                                                                                                                                                        | Status                                                                                                       | Belongs to                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Points deeper than a subpoint share the subpoint's type and are told apart by indentation and number only.                                                                   | Pending                                                                                                      | UI.2B (typography by depth needs a style level)    |
| A custom label's column is estimated, so a few pixels of extra space can show after a long label.                                                                            | Partly resolved in A1-UI.2A.1 (figures recalibrated, one column per depth); per-level marker settings remain | UI.2B (per-level marker settings)                  |
| A heading can be left alone at the foot of a page (no keep-with-next), and a passage can split after one line.                                                               | Deferred with acceptance criteria (A1-UI.2A.1)                                                               | UI.4 (pagination), after UI.2C's per-page geometry |
| Space before a block that starts a new page stays at the foot of the previous page. It is harmless, but the gap at a page's foot varies.                                     | Pending                                                                                                      | UI.2C (pagination)                                 |
| White page gaps in print are reasoned, not yet seen on paper.                                                                                                                | Pending                                                                                                      | UI.4 (print verification)                          |
| The Title and Subtitle in the benchmark are styled paragraphs.                                                                                                               | Pending                                                                                                      | UI.2C (sermon header)                              |
| A quotation is told from Scripture only by its rule's color and the passage's reference line. This holds in grayscale, but a quotation could be more distinct in Expressive. | Pending                                                                                                      | UI.2B / UI.2D                                      |

### Header and footer: feasibility (read-only; nothing was changed)

**Conclusion:** architecturally feasible in principle, **not verified.** The float-based pagination needs real browser and printing tests before this approach is accepted.

**What exists today:**

1. **The title.**
   - It is the sermon's own, the idea's title, outside the document (`schema/nodes.ts`: "never stored here").
   - Lab documents also put body paragraphs styled Title or Subtitle in the content. These are freeform writing, not a title.
2. **The subtitle.** `doc.attrs.subtitle` is a validated plain string (`subtitleSchema`, `styles/model.ts`). Nothing draws it.
3. **Sources of title information:** three, besides the header contracts:
   - the idea's title;
   - `doc.attrs.subtitle`;
   - styled body paragraphs.
   - The header contracts are `doc.attrs.page.runningHeader` (`{ enabled, subtitle }`) and `styles.runningHeader` (`{ fontSize, color }`). Both are validated; nothing draws either.
4. **Page configuration.**
   - `doc.attrs.page` (`pageSetupSchema`: paper, margins in points, running header, page numbers) is validated only.
   - Pagination runs on the device's `PageSetup` in px (`pagination/preferences.ts`, `geometry.ts`).
   - **Page numbers already exist** as generated text: `.lab-page-number` in each gap and in the end element. They are always on and **they print**. That conflicts with "footer off by default", which UI.2C must decide.

**How pagination works:**

5. **Pages and breaks** (`pagination/plugin.ts`, `geometry.ts`):
   - Each page is a zero-width float spacer the height of the text area, then a full-width gap float (bottom margin + desk + top margin) that lines cannot sit beside.
   - An explicit break is given the height that reaches the next page (`breakFill`).
   - The geometry assumes **every page is alike** (one `stride`).
6. **A different first page.**
   - Only page 0 differs, so `pageAt`, `intoPage`, `breakFill`, and `pagesFor` extend with a page-0 offset, not per-page arrays.
   - The changes:
     - the first spacer takes its own height;
     - the editor's `padding-top` becomes top margin + first header;
     - each gap becomes bottom margin + footer + desk + top margin + later header.
7. **Footer space.** Reserve it in the gap and in the end element, which are already full-width, positioned, non-editable, and `aria-hidden`.
8. **Genuine repeated headers and footers** fit: non-editable copies drawn in the gaps are real reserved geometry, not an overlay on content.
9. **Changes needed:**
   - page-0 geometry;
   - header and footer regions;
   - their heights measured (ResizeObserver → CSS variables → re-paginate).
   - **The recommended model is Word's:** a header or footer lives inside its margin and pushes the text only when taller than it, so ordinary pages do not reflow.
   - The editable first-page header sits in the reserved top region, outside the ProseMirror body. Ownership, depth, and the guard therefore never see it.

**Phasing, verification, and risks:**

10. **What goes where:**
    - **UI.2C:** the geometry, the regions, the copies in the gaps, the page-number default and first-page suppression, and wiring the device setup with `doc.attrs.page` in the lab.
    - **UI.3:** the editing interactions (header click-to-edit, the footer options menu). _Superseded in part: basic title and subtitle editing and basic footer settings are now UI.2C ([First-time-user requirement](#first-time-user-requirement-owner-21-october-2026))._
    - **UI.4:** multi-page and print verification.
11. **Tests:**
    - geometry unit tests with an unlike first page;
    - `tests/lab/pagination.spec.ts` extended, checking that no line's rectangle intersects a header or footer rectangle on any page;
    - `page.pdf()` checks of page count and text positions with the existing `tests/lab/pdf-text.ts`.
12. **Blockers:** none found. **Risks:**
    - re-measuring when a header's height changes;
    - fonts arriving after the first measurement;
    - long unbreakable blocks;
    - printing from Regular Layout is not the paginated path;
    - the float technique itself across browsers, which only PDF and real printing will settle.

**Canonical title storage: options, not decided here (owner's decision for UI.2C/A2).** Existing title and subtitle data is preserved under every option.

- **(a) The title stays the idea's** (`ideas.title`), and the header shows and edits it.
  - Strength: one source, as today.
  - Cost: title edits live outside the document's undo history and its revisions, and A2 saves two things.
- **(b) The document holds the title** (a new attribute, beside `subtitle`), synchronized with `ideas.title`.
  - Strength: undo and revisions cover it.
  - Cost: two copies, needing a rule for which wins.
- **(c) The document holds it, and the idea's title becomes derived.**
  - Strength: one source inside the document.
  - Cost: it touches the library, search, and every list of ideas.

**Either way:**

- the subtitle stays `doc.attrs.subtitle`;
- header and footer options extend `pageSetupSchema` with a new version, never by repurposing version 1;
- legacy title-styled body paragraphs stay writing, never converted silently. UI.3 may offer "move to header".

### Checkpoint plan, reconciled

The A1-UI.1 section above deferred items to "A1-UI.2". The owner's A1-UI.2A brief splits that into four parts and adds UI.4, so each item moves without being dropped:

- **UI.2B:**
  - Minimal and Expressive;
  - the preset chooser, and where the choice is kept (open);
  - outline-wide and per-component customization;
  - drawing a node's own `appearance`;
  - formatting inheritance;
  - reset and restore;
  - saved personal styles.
- **UI.2C:**
  - the dedicated sermon header, with its title and subtitle;
  - the optional footer;
  - first and later pages;
  - pagination integration;
  - the page-number default.
- **UI.2D:**
  - the dark-paper control;
  - final preset refinement;
  - print independence;
  - print color modes (grayscale, black and white), which C1 may extend.
- **UI.3:** unchanged and required for A1. Also adds the header and footer editing interactions, context menus, shortcuts, and discoverability. _Basic header and footer editing has since moved to UI.2C ([First-time-user requirement](#first-time-user-requirement-owner-21-october-2026))._
- **UI.4:**
  - final visual acceptance;
  - component workflows;
  - structural regressions;
  - long sermons;
  - pagination and print;
  - mobile, browsers, and accessibility;
  - integrity.
- **Later:**
  - A2: persistence and revisions;
  - A3: signed-in editor integration;
  - B1: the Workspace Panel;
  - B2: KJV/RVG resources and dictionaries;
  - B3: My Outlines and templates;
  - C1: advanced printing and export;
  - C2: offline and PWA;
  - C3: production migration and release.

## A1-UI.2A.1: Balanced color refinement, numbering, and pagination review (21 October 2026)

**Status: APPROVED for checkpoint completion by the owner (21 October 2026),** subject to the verification not run (listed under Tests). **A1 is not complete.** Started from `dev` at `6dd3556` with a clean tree.

### The palette

The owner found Balanced's component colors too vivid in places, the dark screen above all (its hues were pastels). Every hue is now muted. Each has a paper value and a softened mid-tone for the dark screen (`-bright`). They are raw values in `globals.css` only:

| Hue                | Component                                  | Paper                           | Dark screen                                      |
| ------------------ | ------------------------------------------ | ------------------------------- | ------------------------------------------------ |
| burgundy           | Scripture                                  | `#7d3a40`                       | `#c4868c`                                        |
| slate              | Script                                     | `#45607f`                       | `#8fa5c2`                                        |
| amber (ochre)      | Reminder                                   | `#94661f`                       | `#c29a58`                                        |
| copper             | Cue                                        | `#985a35`                       | `#c4886a`                                        |
| violet, sage, teal | Question, Illustration, Application labels | `#5e5a85`, `#5b6e4c`, `#3d6b66` | `#a29ec8`, `#9fb08e`, `#8db3ad`                  |
| stone              | Note, Task, and the study notes' wash      | `#6e675d`                       | `#aaa398`                                        |
| gold               | Introduction and Conclusion                | unchanged                       | `--brand-gold-bright`, taken 18% toward charcoal |

- **Semantic tokens.** The semantic tokens are a hue per component (`--sermon-scripture`, `-script`, `-reminder`, `-cue`, `-question`, `-illustration`, `-application`, `-neutral`, `-section`) plus four strengths per theme:
  - `--sermon-tint`: 5% on paper, 9% dark;
  - `--sermon-line` (hairline): 24% / 26%;
  - `--sermon-wash` (the study notes' neutral fill): 3.5% / 4.5%;
  - `--sermon-ink` (how far a label is taken toward the text on paper): 80% / 100%.
- **Derived colors.** Fills, hairlines, and label inks are worked out from these on the editor itself (`--k-*` in `lab-v4.css`). Light paper (`[data-paper="light"]`) and printing (the paper block in `lab.css`) therefore swap only the hues.
- **Removed.** `--sermon-note`, `--sermon-note-ink`, and `--sermon-note-fill`. Nothing else read them.

### Treatment per component

A box is used where it helps the component, and a rule or plain typography where that serves it better. **In grayscale, the kinds are told apart by their label and their shape, never by hue alone.**

| Component                                 | Treatment                                                                                                                    | Why                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Scripture passage                         | A 2px burgundy rule, a faint burgundy wash (4%), right corners rounded 4px, the reference in burgundy ink                    | The rule is what says Scripture. The wash makes the verses one unit. No bordered card, so it never reads as an alert. |
| Inline reference                          | The pill, with a 7% tint and burgundy ink                                                                                    | The passage's family, quiet in a line                                                                                 |
| Script                                    | A closed box: slate hairline all round, the faintest slate wash (3.5%), 5px radius, "SCRIPT" in slate ink, the reading serif | Words to be said are set apart by shape (outlined) as well as hue                                                     |
| Reminder                                  | A soft ochre box: tint (7%) and its hairline, 5px radius, ochre label                                                        | Seen at a glance in the pulpit, never bright yellow                                                                   |
| Cue                                       | No fill: a 2px copper rule, copper label, square                                                                             | Same warm family as a reminder, a different shape and hue                                                             |
| Task                                      | A dashed stone hairline, no fill                                                                                             | Something still to do; the dash holds in grayscale                                                                    |
| Question, Illustration, Application, Note | One neutral stone wash, 5px radius, no rule. Only the small label carries a quiet hue of its own.                            | One family, so the page never turns into a rainbow. The label word gives the kind.                                    |
| Introduction, Conclusion                  | Unchanged: the in-line gold accent rule and its page-crossing mechanism. Only the dark gold is softened.                     | Already elegant                                                                                                       |
| Points, subpoints, prose                  | Unchanged                                                                                                                    | Structure and numbering are the cue                                                                                   |

**How a kind gets its treatment.** `.lab-note[data-kind="…"]` sets preset-only variables (`--k-hue`, `--k-fill`, `--k-line`, `--k-accent`, `--k-accent-w`, `--k-line-style`, `--k-radius`). The shared rule reads them only as fallbacks, so **the cascade is unchanged**:

- every drawn color (`--x-*`) reads the outline's own `--ps-*` first, and its `-d` variant on the dark screen;
- an outline's note colors recolor every kind and nothing else;
- a node's inline `--ps-*` still wins by inheritance.

**Checked in the browser.** The migrated "Styles and Script" fixture still draws its own note fill (on a cue, whose default has none) and its own teal script accent.

**Printing.** Passages, scripts, and inline references now print their fills (`print-color-adjust: exact`), as notes already did.

**Recorded for UI.2B; no schema change now.** Customization so far is by color only. These are style-model extensions:

- choosing a component's treatment (box, rule, outline, none);
- its corner radius;
- its border style;
- where its accent is drawn.

Today an outline can recolor a box's accent, but on a box that accent is its 1px edge.

### Review fixture

`componentGallery` ("Component gallery", lab only, in both languages) contains:

- all seven note kinds;
- two scripts and two passages;
- an inline reference;
- different components next to each other;
- a long reminder, passage, and script placed to cross pages in Print Layout.

`noteV4` gained an optional `kind`, with `reminder` still the default. `whenIdolsFall` is unchanged as the benchmark.

### Numbering review

Measured in Chrome against Source Sans 3 bold at 13pt (column = 22pt = 29.3px):

- **No overlap anywhere.** The label is a minimum width, never a fixed one. True for:
  - Traditional to `XII.`;
  - letters and figures;
  - `2.1.1.`;
  - `POINT VIII:`;
  - `(a)`;
  - `II.a.1.`.
- **Defect 1: figures were counted as narrow.** `labelEm` gave `1` the width of `I`, so `2.1.1.` drew 4.6px wider than its estimate. Its words nearly touched the number, and its first line started to the right of its wrapped lines.
  - **Fix:** figures are now 0.58em. Measured: 0.55–0.58em.
- **Defect 2: siblings had different columns.** Each heading had its own column, so point VIII's words started about 10px right of point I's.
  - **Fix:** `columnsByDepth` gives every numbered point at one depth the column of that depth's widest label. It stays deterministic: no DOM measuring and nothing waits on fonts. Still a decoration, never in the outline.
  - **Checked:** Traditional and Decimal on the benchmark. Words at each depth start at one x, and `2.1.1.`/`2.1.2.` keep clear space after the number.
- **Trade-off, kept on purpose.** When a depth's column is wider than one step, its headings' words stand a little right of the writing the point owns, which keeps its level's column. In Decimal, `2.1.` is about 5px. Per-level marker settings remain UI.2B.

### Pagination review

**Keep with next: deferred to A1-UI.4, not fixable narrowly here.**

- **Why.** `geometry.ts` assumes every page has the same stride (`pageAt`, `intoPage`, `breakFill`, `pagesFor`). Moving a stranded heading means ending that page short, so pages are no longer alike.
  - That needs per-page offsets, the same generalization UI.2C makes for the first-page header, which is its prerequisite.
  - A heading is also a plain paragraph with no node view, so the paginator cannot safely write a style on it.
- **Acceptance criteria:**
  1. A point heading's last line is never the last line on a page when its first owned block starts on the next.
  2. The same holds for an introduction or conclusion heading.
  3. Explicit page breaks still land exactly.
  4. Measurement still converges within `maxPasses`.
  5. The screen and the PDF agree.
- **Proposed tests:**
  - `geometry.test.ts` cases for an unlike page;
  - a `tests/lab/pagination.spec.ts` case with a heading at the foot of a page;
  - a `page.pdf()` check with `tests/lab/pdf-text.ts`.

**Rules and fills across pages (screen).** Checked in desktop Print Layout with the gallery:

- The Psalm 119:1–16 passage crosses page 2 to 3: its wash and rule stop at the bottom margin and resume under the next top margin, and the words stay clear of the gap. The gap floats are painted over in-flow backgrounds and borders.
- **New finding: an empty sliver.** When a container's first line moves to the next page, the part of its box above the gap stays on the previous page as a sliver with no words.
  - Seen with a cue at the foot of page 1: a few pixels of its copper rule.
  - Every bordered or filled container behaves this way, because pagination moves lines, not boxes. A container's top cannot be moved with its first line by CSS alone.
  - It belongs to the same "keep together, keep with next" work: **UI.4**.

**Printing.** Print preview, a PDF, and paper were not checked. The white page gaps in print are still reasoned, not seen.

**Mobile Print Layout.** In a 412px frame the subpoint indent is 58.67px, the desktop value, and page 2 starts at the same block as on the desktop.

### Grayscale and color printing

- **Grayscale (screen filter).** Every kind is told apart by its label and its shape: wash, ochre box, rule, outlined script, dashed task. The fills stay visible as light grays, and the labels read.
- **The reminder and the script.** Both are outlined boxes in gray. They also differ in their face (sans note against serif script), size, and label.
- **Print color modes** remain UI.2D/C1.

### Contrast (computed in Chrome, label against its own fill)

- **Paper.** Every label and reference is at least 6.0:1 (the reminder is the lowest).
- **Dark screen.**
  - Every label is at least 5.6:1.
  - The Scripture reference and the inline reference measured 4.6:1 at first. The dark burgundy was lifted to `#c4868c`, and they now measure 5.4:1 and 5.5:1.
- **Body text on every fill:** at least 12:1.

### Files changed

- `src/app/globals.css`: muted and new hues, and the per-theme semantic tokens and strengths.
- `src/features/editor-lab/lab.css`: the print block's paper tokens only.
- `src/features/editor-lab/v4/lab-v4.css`: the derived `--k-*` colors, and the passage, reference, note-kind, script, and dark rules.
- `src/features/editor-lab/v4/numbering.ts`: figure width in `labelEm`, and `columnsByDepth`.
- `src/features/editor-lab/v4/fixtures.ts`: `componentGallery`, and `noteV4`'s `kind`.
- `src/i18n/dictionaries/{en,es}/editorLab.ts`: the gallery's label.
- `src/features/editor-lab/v4/presentation.test.ts`.

**Not touched:**

- the schema, ownership, commands, the guard, undo, clipboard, and migration;
- pagination code;
- `presets.ts`, `render.ts`, and `resolve.ts`;
- the v3 lab (still `baseline`, which reads no `--sermon-*` or `--k-*`).

### Tests

**Unit tests.** `vitest run src/features/editor-lab src/i18n "src/app/(app)/lab"` passed **600** (595 plus 5 new). The 5 new tests:

- every component color in `lab-v4.css` reads the outline's `--ps-*` first;
- the dark block reads only the `-d` variants;
- the kinds' treatments live only under Balanced, and each kind is styled;
- the gallery opens with identical JSON under either preset, and holds all seven kinds;
- every point at one depth shares its widest label's column.

The label-estimate test also gained the measured figure widths, and the decoration test now asserts the per-depth column.

**Static checks.** `tsc --noEmit`, ESLint on the changed TypeScript, and Prettier are clean.

**Browser.** The owner's dev server on port 3000 (not started or stopped here), in Chrome. Turbopack twice kept serving an older `globals.css` after quick successive edits, and a later content change refreshed it. Screenshots, in `C:\Users\alexa\AppData\Local\Temp\claude-chrome-screenshots-H2OQJJ\`:

| File       | Shows                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| `…-35.jpg` | The gallery, Regular Layout, dark                                                       |
| `…-36.jpg` | The gallery's study notes, Print Layout, light paper                                    |
| `…-37.jpg` | Reminder, cue, script, and passage on paper, and the cue's sliver at the foot of page 1 |
| `…-38.jpg` | A passage crossing a page                                                               |
| `…-39.jpg` | The benchmark in desktop Print Layout, color                                            |
| `…-40.jpg` | The gallery in grayscale                                                                |
| `…-41.jpg` | Decimal numbering                                                                       |
| `…-42.jpg` | The benchmark in a 412px frame, Regular, dark                                           |

**Not run:**

- the full test suite;
- a production build;
- the Playwright lab specs (no Clerk E2E user);
- print preview, a PDF, or paper;
- a real phone.

### Outstanding, by checkpoint

- **UI.2B:**
  - Minimal and Expressive;
  - the preset chooser;
  - outline-wide and per-component customization, now including treatment, radius, border style, and accent placement;
  - local appearance overrides;
  - inheritance and reset;
  - personal styles;
  - per-level marker settings;
  - typography by depth;
  - a more distinct quotation in Expressive;
  - plain-language, discoverable appearance controls (below).
- **UI.2C:**
  - the sermon header and title/subtitle (the title-storage decision is still open), directly editable (below);
  - the optional footer and the page-number default, functional with basic settings (below);
  - first and later pages;
  - per-page geometry, which keep-with-next needs.
- **UI.2D:**
  - the dark-paper control;
  - final preset refinement;
  - print independence, including printing from Regular Layout in the dark theme, which still takes the dark hues;
  - print color modes.
- **UI.3:** as before, plus the insertion, creation, and mobile requirements below.
- **UI.4:**
  - keep-with-next and keep-together, including the empty-sliver finding, against the criteria above;
  - print and PDF verification of the gaps and fills;
  - long sermons;
  - mobile, browsers, and accessibility;
  - the first-time-user acceptance scenario (below).
- **Later:** A2, A3, B1, B2, B3, C1, C2, and C3 are unchanged.

## First-time-user requirement (owner, 21 October 2026)

**Critical product requirement:** a first-time user can create a complete, attractive sermon outline from a blank editor without having used the application or taken a tour. Recorded only; nothing is built here. Every earlier approved requirement stands; where this moves work between checkpoints, it says so.

- **UI.2B:** the appearance controls are discoverable and understandable without knowing what presets, semantic styles, or component schemas are.
- **UI.2C:**
  - **Sermon Title and optional Subtitle**, dedicated and directly editable in the semantic sermon header. Basic header editing is not postponed to UI.3. There is one canonical source; the title-storage decision (options above) is made in UI.2C, coordinated with A2 and A3.
  - **A functional optional footer** (still off by default), with discoverable basic configuration and correct pagination. Advanced interaction polish may wait for UI.3.
- **UI.3:**
  - **A prominently discoverable Insert workflow** for every semantic sermon component, with no reliance on the lab inspector.
  - **Intuitive creation** of main points, subpoints, Scripture references and passages, Preacher Notes, Scripts, and Page Breaks, with contextual actions and sensible keyboard behavior.
  - **Slash commands**, optional, as an extra convenience only: never the primary or the only way to insert anything.
  - **Substantially better mobile editing**, with controls for inserting components and formatting that work with the virtual keyboard.
- **UI.4:** an **acceptance scenario** in which a first-time user goes from a blank outline to a complete sermon through the real user-facing controls, with no tour and no development inspector.

## A1-UI.2B.1: Presets, customization foundation, and section boundaries (21 October 2026)

**Starting point:** branch `dev`, HEAD `21befbb`, clean working tree. Nothing was committed or deployed.

**Status:** implemented and tested, and checked in Chrome on the owner's dev server (port 3000, not started or stopped here). Minimal and Expressive are **visually reviewed by me only and provisional**; they need the owner's screenshot review. Nothing here is owner-approved or ready for production.

### What was built

- **Three presets a person may choose:** Minimal, Balanced (the default, unchanged), and Expressive (`styles/presets.ts`). The baseline stays the v3 lab's and is never offered.
  - **Minimal:** the reading serif throughout, compact spacing, hairlines in the text's own tones, no fills, section headings in small capitals, notes in italic serif. The note kinds keep their shapes (rule, box, dashed box).
  - **Expressive:** a stronger hierarchy (14pt points, 14.5pt sections, a Playfair Display title); sections and main-point numbers in the section ink; a 2.5px section rule; a 3px Scripture rule with a fuller wash; every note kind tinted in its own hue with a rule; a script between double rules; a quotation in italic with a heavier rule.
- **One set of rules, three looks** (`v4/lab-v4.css`).
  - Everything that was under `[data-preset="balanced"]` is now under `[data-studio]`, which the editor carries for every preset but the baseline. Specificity is unchanged.
  - Treatments that were fixed values became `--k-*` tokens, with Balanced's values as the defaults: Scripture rule width and radius, section rule width, hairline, and spacing, label size, case, and tracking, notation color, quotation rule.
  - Minimal and Expressive change only tokens, plus a few rules for treatments that have a different shape, under their own `data-preset`.
- **The chooser:** `PresetSelect` (`editor-lab/components/preset-select.tsx`, Appearance), in the `SermonWorkspace` header beside the numbering. Words are in `editorLab.appearance`, in both languages. The v3 lab has no chooser.

### Where the preset is stored (decision)

- **Storage.** The outline's choice is `doc.attrs.styles.preset`: `"minimal" | "balanced" | "expressive"`, optional.
- **How the schema changes.** It widens `documentStylesSchema` version 1, as the color objects did in B.2B: every earlier document keeps its meaning and no migration is needed. A reader older than this checkpoint refuses the field; the lab persists nothing, so no such reader holds one. The baseline can never be stored.
- **When it is left out,** the editor's `preset` option applies: Balanced in `SermonWorkspace`, the baseline in the v3 lab. So every existing document keeps its look.
- **It is an outline preference,** so changing it is a document change: one undoable transaction, through `setOutlinePreset`.
- **Kept apart, per the brief:**
  - the account's default for new outlines (later);
  - view state such as layout, paper, and folding (never stored, unchanged).
- **For A2:** when an outline is created from an account default, write `preset` explicitly. Otherwise a later change of the default would restyle old outlines.
- **A saved personal style (UI.2B.3)** is exactly a `DocumentStyles` value, `preset` included: validated by the same schema, and applied with `applyDocumentStyles`. Its storage belongs to the account (A2 or later). Nothing is persisted now.

### The style cascade and the new commands (`styles/plugin.ts`)

**The order is unchanged:**

1. the preset;
2. the outline's defaults and its named or component-type styles;
3. a node's own `appearance` (or its `format`);
4. marks.

**Rules each command follows.** Every command writes the smallest value that says what it means, as one undoable transaction, after validating against the existing schemas. An empty layer is removed, and the result is `null`, never `{}`.

- **`setOutlinePreset(id)`:** keeps every other style and override.
- **`resetOutlineToPreset()`:** "Restore the outline to its preset". Keeps only `version` and `preset`, and every node's own appearance.
- **`setComponentStyle(kind, style | null)`:** null resets that component type.
- **`setComponentAppearance(pos, appearance | null)`:** null resets that one component. A point with a role takes its section's contract.

**The preset in force follows the document.** It is read from `stylesInForce(state)?.preset` with the option as fallback (`presetIdOf`, `presetIdInForce`), so a Document Styles preview also previews a preset. The editor's `data-preset` and `data-studio` follow it, and the sheet redraws.

**Switching presets doesn't disturb editing:**

- **The editor is not remounted.**
- **Selection and focus are kept;** checked in Chrome and in the tests.
- **History holds one step per switch;** Undo and Redo walk them.

**Document Styles** now resolves inherited values under the draft's preset, not a fixed one.

### Model extensions (`styles/model.ts`)

- **Treatment properties.** All are bounded and from closed lists, and none is a CSS string:
  - `borderStyle`: solid, dashed, dotted, or double;
  - `borderWidth`: 0–4pt;
  - `accentWidth`: 0–6pt;
  - `radius`: 0–12pt.
- **Which components have them:**
  - sections: style, widths;
  - Scripture, notes, and scripts: all four;
  - points: none, since typography and numbering are their look.
- **How they are drawn:** as `--ps-<component>-border-style`, `-border-w`, `-accent-w`, and `-radius`, which the studio CSS reads before its tokens. `0` turns a line off.
- **`narrowAppearance`:** keeps an appearance to a kind's contract.
- **`userPresetIds`:** the three presets a person may choose.

### A single component's own appearance (level 3), now drawn

- **How it is drawn.** A node decoration carries the inline style (`appearanceStyle`, `render.ts`), resolved with the whole cascade and the appearance last. It writes only the properties the appearance sets, so everything else stays inherited.
  - Colors and treatments use the same `--ps-*` properties as the outline. Set inline on the node, they win by inheritance, with no specificity contest.
  - Text properties are `--ps-<component>-i-*`, which every component rule in the sheet now reads first. The style's value is the fallback, so Balanced's computed values are unchanged; checked against a snapshot of the sheet taken before the change.
- **Text on a fill** is judged with the node's own fill (`inkOn`).
- **A point's own `format`** still wins, being inline on the element itself.
- **A section's lines and fill** reach every block of the section (`roleFrames`).
- **Drawn only in a preset that draws components.** The baseline never drew one, so the v3 lab is unchanged.
- **Gaps closed in the same pass:**
  - The toolbar (`resolveAt`) now reports a point's own appearance and title color.
  - A passage's typography from `styles.components.scripture` is now drawn (studio presets only). It was validated but never rendered.
  - The v4 validator now checks the `appearance` of passages, notes, and scripts. It checked points only.
  - A copied section keeps its appearance on paste (the point parser accepts the section contract).
  - Wherever a role is taken away (`setRole(null)`, a pasted role dropped in `rebase`, the role copy in `commands.ts`), the appearance is narrowed to a point's, so the outline still validates.

### Section spacing: findings and fix

**Measured in Chrome**, _When Idols Fall_, Balanced, Print Layout at 100%.

- **Before:**
  - The Introduction's rule stood **37px** under the subtitle's last line and **10px** over the heading's capitals.
  - The rule sat 1.3px below the heading's box top. All of the section's space (the subtitle's 12pt space after, as padding, plus the frame's 14pt margin) was above it, and only 5pt plus the line's leading was below it.
- **Ruled out:** the plan suspected that the style sheet's `spaceBefore` outranked the frame margin. It did not: spacing is padding (`paragraph-css.ts`), and the margin applied.
- **Second defect, measured:** the closing hairline is `border-bottom` on the section's last block. The benchmark's Conclusion ends in a passage, and the passage's own `border` (transparent) drew over it, so that section had **no closing rule**.
- **Fix:**
  - **The rule's position.** It now stands at the top of the heading's box, lifted by the heading's own space before. The sheet writes it as `--x-space-before`. So the section's space is above the rule and the heading's below it, wherever the section stands.
  - **The space above.** It is the frame's `--k-section-before`, 10pt in Balanced. It gets a little more after a container (margins collapse) and very little after the title or subtitle, whose space after is already large.
  - **The closing hairline after a passage, note, or script** is drawn as a one-line shadow just under its box. A page gap still paints over it.
- **After** (rule-to-previous-words, rule-to-capitals):

  | Preset     | Introduction, after the subtitle | Conclusion, after prose |
  | ---------- | -------------------------------- | ----------------------- |
  | Balanced   | 19.7px, 13.6px                   | 18.7px, 13.6px          |
  | Minimal    | 16.5px, 16.5px                   |                         |
  | Expressive | 21.7px, 19.9px                   |                         |

  The Conclusion's closing hairline now draws under its passage.

- **Pagination.**
  - **Checked.** A Conclusion pushed to the top of a page carries its rule with its first line, and nothing is left at the foot of the previous page.
  - **Not changed.** Space before a block that starts a page still stays on the previous page (UI.2C, as before).
- **Limitations:**
  - **A container's closing hairline** is solid only and a few pixels shorter at each end; a section's own `borderStyle` reaches only a text block's hairline.
  - **A section heading given a named style** keeps its component's `--x-space-before`, so the rule then follows the component's spacing.

### Follow-up: the closing hairline (owner review, same day)

- **What the owner reported.** The Introduction's closing hairline looked pressed against the section's last words.
- **Measured.** The hairline was **5.3px** under the last line (the paragraph's own 4pt space after) and **25.9px** above the next point's words.
- **Second case.** Writing after a section stood **11.5px** under the hairline (the Conclusion in _rolesAnywhere_), because only a point brings its own space above.
- **Fix:**
  - **The space before the hairline.** A block that closes a section now keeps the section's closing space, `--k-section-close` (Balanced 9pt, Minimal 8pt, Expressive 10pt), in place of its space after. A paragraph's own inline `format` still wins.
  - **The space after it.** Whatever follows a section, other than a point or another section, keeps the space a section keeps above its opening rule.
- **After** (Balanced):
  - 12px from the last line to the hairline, then 25.9px before a point or 19.5px before writing;
  - Minimal: 11.1px and 21.3px;
  - Expressive: 14.1px and 31.2px.
- Screenshots: `…-59` to `…-63`.

### Cursor behaviour: findings and fixes

**Measured in Chrome** with selection probes: ProseMirror's selection, the DOM range's rects, and `coordsAtPos`. The fixture was _When Idols Fall_ in Print Layout.

**Filled headings: no defect found.** Every case gave the same position with the mouse and the keyboard, and the drawn caret matched ProseMirror's selection exactly:

- clicks at the heading's start and end, past its end, on the rule, and in the space above and below it;
- ArrowUp and ArrowDown across the boundary, which keep their horizontal place;
- ArrowLeft and ArrowRight across it;
- Home and End.

A click in the space above the rule goes to the nearer line (`ClickPlacement`). The plan's hypothesis about the atomic `::before` was refuted for text, so the rule mechanism was kept.

**Defect 1 (confirmed): an empty Introduction or Conclusion had no visible caret, and its rule vanished.**

- **Symptom.** In Print Layout (always, on a desktop) the empty heading's caret was drawn at **x = −444.8px**, off the page, and the rule shrank to a dot. Mouse and keyboard both reached the right position (offset 0), but nothing showed it.
- **Cause.** Print Layout's empty-line mark (`lab.css`) styles the same `::before` with higher specificity and set `width: 1px`. The frame's rule kept its `margin-right: calc(1px - 100%)`, which pulled the trailing break, where the caret is drawn, a line's width to the left.
- **Fix.** A more specific studio rule keeps the rule's own width for an empty heading. Its margin box is one pixel wide, so it still serves as the empty-line mark.
- **After.** The caret is at x = 178.2px, the rule is full width, and keyboard and mouse both land there.

**Defect 2 (confirmed): a structural key pressed straight after a click acted on the previous caret.**

- **Cause.** ProseMirror reads a click's caret from `selectionchange`. Chrome delivered it **69ms after `mouseup`**, while the `keydown` came at 4ms. ProseMirror's keydown flushes the DOM observer only when a read is already pending.
- **Effects observed:**
  - a click at a heading's end, then Backspace, **converted the heading**, as if at its start;
  - a click at its start, then Backspace, was refused by the guard ("would have broken a point apart") and moved the caret.
- **Fix (`v4/caret-sync.ts`, `CaretSync`; revised in the reliability review below).** Before any key reaches a handler, the selection is brought up to the browser's caret, using public API only. Nothing else changes; the guard, the schema, and the positions are untouched.
- **After, checked in Chrome with no pause between click and key:**
  - end, then Backspace, deletes one letter;
  - start, then Backspace, converts the point with its notice, as designed.

Neither defect is necessarily the exact one the owner saw. Both are the boundary inconsistencies that measurement found, and both are fixed.

### Final reliability review (owner's request, before commit)

**1. The caret fix no longer uses ProseMirror internals.**

- **The first fix** called `view.domObserver.flush()`. `domObserver` and `domSelectionRange()` are not in `prosemirror-view`'s public types (1.42.6), so the fix depended on an internal, unstable implementation.
- **The replacement** is `CaretSync` (`v4/caret-sync.ts`). It is a `handleKeyDown` at priority 1000, so it runs before every keymap, and it never consumes a key. It reads `document.getSelection()` through `view.posAtDOM` (public API) and, when the two differ, dispatches a plain `TextSelection` with an ordinary transaction.
- **It fails safely.** It does nothing, and the key goes on exactly as before, whenever:
  - the editor has no focus;
  - a composition is under way;
  - the browser's selection is outside the editor's text, or inside a `contenteditable="false"` node view or widget;
  - ProseMirror's selection is a gap cursor or a selected node (these are not drawn as a browser selection, so they cannot be compared);
  - `posAtDOM` throws;
  - either end does not land in a text block.
- **It is wider than before.** The first fix covered only the v4 structural keys. ProseMirror's own `keypress` and the guard's `handleTextInput` also replace a selection that spans blocks, so typing at once after clicking away from a selection could have replaced text that was no longer selected. `CaretSync` runs before every key, so that is covered too. A unit test covers it.
- **The internal hook is removed.** `domObserver` appears nowhere in `src`.

**2. The interaction matrix in Chrome, every key at once after the click, compared with the same key after a pause.** The two always matched.

- **Introduction (filled):**
  - click at the end, then type: the letter lands in the heading;
  - click at the end, then Backspace: deletes one letter, with no conversion;
  - click at the start, then Backspace: converts, the designed edge, with its Undo notice;
  - click at the end, then Delete: joins the next paragraph into the heading, which stays the same point. That is the approved PS-ER1 behavior ("join a heading's first line of writing into the heading, which stays the point").
  - click at the end, then Enter: a new line under the heading;
  - click at the end of the line before, then Delete: the caret moves to the heading's start, with no merge.
- **Introduction (empty):**
  - click, then type: fills the heading;
  - click, then Backspace: converts it to writing with its notice, since the heading still owns writing (designed).
- **Selections dragged with the mouse:**
  - from the subtitle into the heading, then typing: removes only what was selected, and the Introduction keeps its ID, role, and remaining words;
  - from the heading into the body, then Backspace: joins the rest into the heading, which stays the point;
  - Undo restored the exact JSON both times.
- **Conclusion:** end and Backspace, start and typing, and end and Enter, all as for the Introduction.
- **The rule followed throughout:** a structural conversion happened only where the person pressed Backspace at a heading's start, the designed command, and never because of where the caret had been before.

**3. Appearance integrity (unit test).** The sequence was: a preset change, a component style, two single-node appearances, both resets, and another preset change.

- **Steps:** they made only `DocAttrStep` and `AttrStep`, with no structural step.
- **Kept:** text and marks, IDs, and ownership were unchanged.
- **The guard:** sent no notice.
- **History:** Undo and Redo each restored every intermediate document exactly.

**4. Visual checks.**

- **The dark theme with light paper (desktop Print Layout).** All three presets draw the paper colors: text `#17181b` on white, and Expressive's section ink in its light-paper variant. The dark overrides exclude light paper as intended.
- **The phone width.** A 412px frame, the method A1-UI.2A.1 used, because the window could not be resized. It opens in Regular Layout on the dark screen in all three presets: no horizontal scroll, the section spacing and closing hairline hold, and Expressive's section ink switches to its dark variant.
- **Screenshots:** `…-64` to `…-69`.

**Tests (focused).** `vitest run src/features/editor-lab/v4 src/features/sermon-editor`: **222 passed**. That includes `appearance.test.ts`, now 36 tests: caret sync at a heading's start and end, typing after a gone selection, no action when unsure, no history, and the attribute-only integrity test. `tsc`, ESLint, and Prettier are clean on the changed files.

**Result:** no unresolved defect was found. UI.2B.1 is ready for owner approval, with the limitations below.

### Tests

- **Unit tests.**
  - `vitest run src/features/editor-lab src/features/sermon-editor src/i18n "src/app/(app)/lab"`: **631 passed**.
  - The new file `v4/appearance.test.ts` (31 tests) covers:
    - every preset's resolution and hierarchy;
    - `data-studio`;
    - storage and refusal of the baseline;
    - switching that keeps JSON, IDs, ownership, and selection;
    - undo and redo;
    - the three resets;
    - treatment bounds;
    - a node's appearance drawn, followed, and reset, with ink on its fill and a title color;
    - the baseline not drawing them;
    - section-wide parts;
    - the new validator checks;
    - section appearance through copied HTML;
    - narrowing on `setRole(null)` and on a pasted role;
    - the section CSS contracts;
    - the stale-selection key fix (its wiring: jsdom cannot lay out a DOM selection).
  - Four tests in `presentation.test.ts` were updated to the new sheet form. They are not looser: they still assert no outline property is set, and that every token is a studio preset's.
- **The style sheets, compared with a snapshot taken before the change:**
  - the baseline's: byte-identical, with and without styles;
  - Balanced's: identical once the new `var()` hooks and the passage rule are removed.
- **Static checks:** `tsc --noEmit`, ESLint on every changed file, and Prettier are clean.
- **Browser (Chrome):**
  - the matrix above;
  - all three presets on _When Idols Fall_ and the component gallery;
  - a passage given its own fill, rule, and radius beside an unchanged one;
  - type style against instance;
  - the three resets;
  - a Conclusion at the top of a page;
  - the v3 lab still `baseline` with no `--ps-` properties.
  - Screenshots are in `C:\Users\alexa\AppData\Local\Temp\claude-chrome-screenshots-H2OQJJ\` (`…-43` to `…-58`).
- **Not run:**
  - the full test suite;
  - a production build;
  - the Playwright lab specs (no Clerk E2E user);
  - print preview, PDF, or paper;
  - a real phone, or a resized browser window (a 412px frame instead);
  - Shift+Arrow selection across a boundary by hand (mouse selection was tested; keyboard selection is covered by the existing unit tests).

### Provisional, for owner review

- **Minimal's component similarity:** its reminder and script are both thin outlined boxes, told apart by the label and by italic against upright text. A different shape may be wanted. **Assigned to UI.2B.3** (final preset review).
- **Section-border fragmentation:** after a passage, note, or script, a section's closing hairline is a solid shadow a few pixels shorter at each end, so a section's own `borderStyle` reaches only a text block's hairline. Across a page, a bordered or filled container can leave an empty sliver (A1-UI.2A.1). **The hairline's form is assigned to UI.2B.2**, where the section's lines become editable; **the page behaviour to UI.4** (keep-together).
- Expressive's colors and weights are a first pass.
- The section spacing values (10pt above, the heading's space below): Balanced's numbers in `presets.ts` are unchanged; the rule moved and the frame's space shrank.

### Owner note: the sermon header (for UI.2C)

The owner asked, during this checkpoint, that the header sit higher, as in Google Docs: the title and subtitle in the page's top-margin header region, so the body starts higher and has more room. This is recorded for **UI.2C** (the semantic sermon header, title storage, and per-page geometry) and was not built here.

**Owner's decision (after the reliability review):**

- **Order.** The roadmap order stands: UI.2B.2 (the Appearance interface) comes next, and no header implementation or related architectural change is made before UI.2C.
- **When the title decision is made.** The canonical title-storage decision is taken when UI.2C begins.
- **What UI.2C keeps.** Every documented header and footer requirement stands for it:
  - the directly editable Sermon Title and optional Subtitle, in the dedicated header;
  - first-page and later-page presentation;
  - the optional footer, off by default.

### Assigned onward (nothing dropped)

- **UI.2B.2, the Appearance panel:**
  - the closing hairline's form after a container (see Provisional);
  - outline, component, and selection scopes, over `setOutlinePreset`, `setComponentStyle`, `setComponentAppearance`, and `resetOutlineToPreset`;
  - discoverable plain-language controls for every existing property and the new treatment properties;
  - the three resets as visible actions;
  - accent position, internal padding, and space around a container, which are not in the model yet;
  - per-label fonts (`--ps-<component>-label-font`, still unwritten).
- **UI.2B.3:**
  - typography and spacing by depth;
  - per-level marker settings;
  - saved personal styles (a `DocumentStyles` value; storage with A2);
  - final preset review, including Minimal's reminder and script.
- **UI.2C:** the header placement above; the rest is as before.
- **UI.2D:** the dark-paper control, print color modes, and final preset refinement (as before). Minimal and Expressive were checked on the dark screen in the review; dark paper itself waits for its control.
- **UI.4:** keep-with-next and keep-together, and the empty-sliver finding (as before).

### Files changed

- **Styles** (`src/features/editor-lab/styles/`): `model.ts`, `presets.ts`, `resolve.ts`, `render.ts`, `plugin.ts`, `context.ts`, `attributes.ts`.
- **v4** (`src/features/editor-lab/v4/`):
  - `lab-v4.css`;
  - `keymap.ts` (the first fix, since removed);
  - the new `caret-sync.ts` and its entry in `extensions.ts`;
  - `plugins.ts` (`rebase`, `roleFrames`);
  - `commands.ts` (role narrowing);
  - `validate.ts`;
  - `presentation.test.ts`;
  - the new `appearance.test.ts`.
- **Components:**
  - the new `src/features/editor-lab/components/preset-select.tsx`;
  - `components/document-styles.tsx`;
  - `src/features/sermon-editor/sermon-workspace.tsx`.
- **Words:** `src/i18n/dictionaries/{en,es}/editorLab.ts`.
- **Docs:** this file and `AGENTS.md`.
- **Not touched:**
  - the v3 lab and `lab.css`;
  - pagination;
  - the numbering engine;
  - the guard's rules;
  - migrations and the database.

## A1-UI.2B.2: The Appearance interface (21 October 2026)

**Starting point:** branch `dev`, HEAD `fd0911e`, clean working tree, matching the approved and committed A1-UI.2B.1. Nothing was committed or deployed, and there is no migration.

**Status:** implemented and tested, and checked in Chrome on the owner's dev server (port 3000, not started or stopped here). Ready for owner review; not owner-approved.

### The workflow

**One entry point: Appearance.** It is a labelled button in the `SermonWorkspace` header and replaces the preset dropdown (`PresetSelect` is deleted, by the owner's choice). Two other doors open the same panel:

- the toolbar's "Edit styles", beside the style menu, opens the Outline scope on the text style the caret is in;
- the structure tools' More menu has "Appearance of this component…", which opens Selected.

Document Styles is no longer in the sermon editor; the v3 lab keeps it unchanged.

**Three scopes over one draft:**

| Scope          | What it changes                                                                                                                                            | Where it is stored                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Outline**    | The preset (three cards, each with one line describing it), the shared defaults ("All text"), and the named styles (Normal, Title, Subtitle, Headings 1–4) | `styles.preset`, `styles.defaults`, `styles.named` |
| **Components** | Every component of one type: Introduction, Conclusion, Main points, Subpoints, Scripture passages, Preacher notes, Scripts                                 | `styles.components[kind]`                          |
| **Selected**   | One component only                                                                                                                                         | that node's `appearance`                           |

**Choosing the Selected component.** The target is the component's ID and the kind it was when chosen, never a position.

- **A passage** is chosen by clicking it: it is an atom, so a click selects it whole.
- **A note or a script** is chosen by a caret anywhere in its writing.
- **A point or section** is chosen by a caret in its heading.
- **Nothing else retargets.** Ordinary writing, a selection across components, and the title or subtitle leave the target where it was, and the panel says so ("Still customizing…"). Writing under a point never makes the point the target.
- **How it is shown.** The component is named in a card (kind, then its first words or a passage's reference), with "Show in outline". It also carries a quiet focus ring in the outline (`data-appearance-target`), which is view state, outside history, on screen only.
- **Focus.** Moving focus into the panel never changes the editor's selection, so the target holds while controls are used.

**Draft, preview, Apply, Cancel** (`styles/draft.ts`):

1. **Opening** reads what is committed. The draft is empty.
2. **Every adjustment** is one edit to one property, in any scope. Each edit keeps the committed value it started from (its base). Switching scope, component type, text style, or preset keeps the whole draft.
3. **The preview is the real outline.** It is `setStylesPreview({ draft })`: a meta-only transaction, kept out of history, that changes no document JSON. The plugin lays the draft over whatever is committed _at each moment_, so an Undo made while the panel is open shows through at once. A single component's preview goes through the same decoration and the same `roleFrames` as when committed (`appearanceInForce`). The merged styles are memoized per (committed styles, draft), so typing never redraws the sheet.
4. **Apply** is `applyAppearanceDraft(draft)`. The whole plan is checked first:
   - no conflict;
   - no orphan;
   - `documentStylesSchema`;
   - every component's appearance against its kind's schema.

   Only then is anything written: one transaction of `DocAttrStep` and `AttrStep`, marked `closeHistory` so it never joins the typing before it. It is undone in one step, or nothing is written at all.

5. **Cancel** discards the draft and ends the preview.
6. **Close (×)** discards the draft and closes the panel.
7. **Escape** works in layers. An open picker or menu closes first; otherwise focus goes back to the outline, and the panel and draft stay.

**Changes made elsewhere are never written over:**

- **A conflict** is a property whose committed value changed since it was edited, for example by an Undo or another change to the same property. It blocks Apply. The field says "Changed elsewhere since you began", with **Keep mine** or **Use current**, and the footer offers both for every conflict at once.
- **A change to a different property** of the same style is not a conflict, and Apply keeps it.
- **Resets are edits with bases too.** A reset names only the properties its layer sets at that moment, so a property set meanwhile by something else is left alone.
- **An orphan** is a single component's edit whose component is gone, or has become another kind (a main point indented into a subpoint, a role removed). Orphans block Apply, the panel says why, and **Discard those changes** removes them. They are never sent to another component.
- **A component that only moved** is still found by its ID and gets its edits.

**Values:** each property shows the value in force, and either **Customized** (with a reset) or **From** where it is inherited:

- "the preset";
- "shared defaults";
- "the Main points style" (in Selected).

The source is the last layer that sets it, read from `componentLayers` and `namedLayers` (`styles/resolve.ts`). The resolvers now cascade over those same lists, so there is still only one resolver.

Three kinds of value are always kept apart:

- **Use inherited setting** (the reset beside a field) removes the property from this layer.
- **None** (for a fill, a border, or an accent) and **Theme color** (for a text color) are `null`: values of their own.
- **A concrete value.**

A treatment no layer sets is drawn by the preset's CSS and shows as **Preset design**. No computed browser style is read.

**Resets:**

- **Property:** "Use inherited setting" on any customized field.
- **Selected:** "Reset this component" clears that node's appearance.
- **Components:** "Reset the ‹type› style" clears `styles.components[kind]`.
- **Outline:** two resets.
  - "Reset this text style" clears one named style, or the defaults.
  - "Restore outline to ‹preset›" does exactly what `resetOutlineToPreset` does: it keeps `preset` and every single component's own appearance, and clears the defaults, named styles, component styles, and `runningHeader`. A test proves the two give the same JSON.

### Properties offered (`sermon-editor/appearance/fields.ts`)

Less common ones are under **More options** in their group. A coverage test holds the list to the schema: for every kind, what is offered plus `notDrawn` equals `componentFields(kind)`.

| Layer                    | Typography                                                       | Spacing                                                         | Colors and fills   | Borders                            | Accents                   | Label                           | Box spacing                                              |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ | ---------------------------------- | ------------------------- | ------------------------------- | -------------------------------------------------------- |
| Defaults, named styles   | font, size, bold, italic, underline*, color                      | line spacing, before, after, left indent, first line, alignment |                    |                                    |                           |                                 |                                                          |
| Introduction, Conclusion | font, size, bold, italic, underline*, text color, heading color* | line spacing, before, after, indents*                           | section background | closing line color, width, style   | opening rule color, width |                                 |                                                          |
| Main points, Subpoints   | the same, plus number color                                      | the same                                                        |                    |                                    |                           |                                 |                                                          |
| Scripture passages       | font, size, bold, italic, underline*, color, line spacing        |                                                                 | background         | color, width, style, corner radius | color, width, side        | reference color, reference font | inside (top and bottom, sides), space above, space below |
| Preacher notes           | the same                                                         | paragraph spacing before and after, indents*                    | background         | the same                           | the same                  | label color, label font         | the same                                                 |
| Scripts                  | the same                                                         | the same                                                        | background         | the same                           | the same                  | label font                      | the same                                                 |

\* Under More options.

**Not offered, because they draw nothing:**

- a section's `notationColor`, since a section is never numbered;
- a passage's paragraph spacing and indents, since its place is its box's.

Resetting the whole style or component still clears them.

### Model and command extensions

All new fields are bounded and from closed lists. They widen schema v3/v4 `version: 1` as the 2B.1 fields did: every earlier document keeps its meaning, and no migration is needed. A reader older than this checkpoint refuses the new fields; the lab persists nothing, so none holds one.

**Containers only** (scripture, preacherNote, script). Points and sections are not made into boxes.

| Field                            | Values                                                                                       | Drawn as                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `accentPosition`                 | `left` (the presets' design), `top`, `right`; no bottom, which would meet a closing hairline | `data-accent` on the container, from the appearance decoration, added only where the resolved side is not left; the studio CSS swaps two sides |
| `paddingBlock` / `paddingInline` | 0–24pt / 0–36pt                                                                              | `--ps-<c>-pad-block` / `-pad-inline`                                                                                                           |
| `outsideBefore` / `outsideAfter` | 0–48pt each                                                                                  | `--ps-<c>-out-before` / `-out-after` (the container's margin)                                                                                  |
| `labelFont`                      | font registry keys                                                                           | `--ps-<c>-label-font: <stack>` (the hook the CSS already read, now written)                                                                    |

**Commands** (`styles/plugin.ts`):

- **`applyAppearanceDraft(draft)`:** described above. It is the only new way appearance is written; the four earlier commands are unchanged.
- **`setAppearanceTarget(id | null)`:** view state only.
- **`setStylesPreview`** now also takes `{ draft }`. The v3 lab's `{ styles }` is unchanged.

**New modules:**

- **`styles/draft.ts`:** the draft, its merge, conflicts, orphans, resets, and the apply plan. It is pure.
- **`styles/component-node.ts`:** `componentOfNode` (moved here, still exported from the plugin) and `findComponent(doc, id)`.
- **`editor-lab/components/style-fields.tsx`:** `NumberField` and `ColorField`, shared by Document Styles and Appearance. `ColorPicker` gains an optional `noneLabel`.
- **`sermon-editor/appearance/`:** the panel, its fields, the target hook, and the phone sheet.

### CSS: one mechanism each

**A container's edges** (`lab-v4.css`). Each container's border is four side properties (`--x-top-w`/`--x-top` … `--x-left-w`/`--x-left`), set from its border and its accent. The accent is on the left unless `data-accent` swaps a side.

- One `border-width`, one `border-color`, and one `border-style` draw all four sides.
- Padding and margin read `--x-pad-*` and `--x-out-*`. The preset's own values became `--k-pad-*` tokens (the cue, Minimal's notes, and the phone width), so the outline's values come first everywhere.
- Balanced's computed padding, margins, and borders are unchanged when nothing is set.

**The closing hairline after a container** (assigned here by 2B.1). It was a solid `box-shadow`, a few pixels short at each end, which no section `borderStyle` could reach. It is now a real `border-top` on the container's `::after`, which no container uses:

- absolutely placed one `--k-section-end-gap` below the box;
- spanning the whole box, accent included;
- drawn in the section's closing-line width, style, and color, as a text block's hairline is.

A page gap is positioned and comes after every block in the tree, so it still paints over the line, as it did over the shadow. Checked in Chrome: the benchmark Conclusion ends in a passage, and set to 2pt dashed, it drew a 2pt dashed line across the full box.

**Not touched:** the page-fragment and keep-together behaviour stays with UI.4.

### Layout

- **Wide screens (`lg` and up):** the panel was docked in the side column, filling its height. **Superseded by the finalization** (below): it now floats over the writing area. The body scrolls; the footer (status, Apply, Cancel) stays put. The writing area and its scroll position are untouched.
- **Below `lg`:** the same panel is a fixed, non-modal sheet at the foot of the window (`role="dialog"`, `aria-modal="false"`). It is at most 60% of the _visual_ viewport and is lifted above the on-screen keyboard (`useSheetViewport`, `visualViewport`), so Apply and Cancel stay in reach while a value is typed. The outline above stays scrollable and selectable, so tapping another component retargets, and it gains bottom padding so its end can scroll clear of the sheet.
- **Controls:** at least 44px tall on touch screens (`pointer-coarse`). Numbers use `inputMode="decimal"`.
- **Checked in a 412px frame:** sheet at 60% height, Apply visible, no sideways scroll.

### Tests

- **New: `v4/appearance-draft.test.ts`** (28 tests):
  - the preview across all scopes changes no JSON or history;
  - the preview follows an Undo;
  - the preview is a stable object while typing;
  - Cancel;
  - Apply is one transaction of attribute steps only, with ids, text, and ownership kept, and exact Undo and Redo;
  - Apply is its own history step after typing, and ends the preview;
  - all-or-nothing on an invalid part;
  - unset, null, and a value kept apart;
  - restoring the outline equals `resetOutlineToPreset`;
  - type and instance resets;
  - a reset that respects later and concurrent changes;
  - overrides kept across a preset change;
  - conflict refusal and Keep mine;
  - a concurrent change to another property kept;
  - a moved target still found, and deleted or retyped targets refused;
  - selection targeting (point, section, prose, note, passage, a span across two);
  - the target mark by ID, outside history;
  - the new fields' bounds and closed lists;
  - type-level and instance drawing;
  - the CSS contract;
  - field coverage against the schema, for components and text styles.
- **New: `sermon-editor/appearance/appearance-panel.test.tsx`** (9 tests, React Testing Library):
  - the scopes in English and Spanish;
  - preview, Cancel, and Apply;
  - the draft kept across scopes and presets;
  - "Use inherited setting" resets one field;
  - the target held while a control has focus, and not taken by prose;
  - retargeting with an earlier component's edit kept;
  - a deleted target with Apply disabled and its changes discarded;
  - Escape returns to the outline with the panel and draft kept;
  - an Escape a popup already handled is left alone;
  - Close discards.
- **Changed:** the 2B.1 CSS contract for the closing line now asserts the `::after` border and no shadow.
- **Run:**
  - `vitest run src/features/editor-lab src/features/sermon-editor src/i18n "src/app/(app)/lab"`: **673 passed** (22 files);
  - `tsc --noEmit`, ESLint, and Prettier: clean on every changed file.
- **Browser (Chrome, `/lab/editor/v4`, owner's dev server):**
  - the docked panel;
  - Components → Scripture passages, accent side Top, previewed (`data-accent="top"`, the accent drawn on top, corners following);
  - Conclusion closing line set to 2pt dashed under its final passage;
  - Apply ("Applied…"), then one toolbar Undo restored both;
  - clicking a passage targeted it ("Scripture passage · 1 Samuel 5:1–5", marked in the outline);
  - Escape closed the color picker first, then returned focus to the outline with the panel, target, and mark kept;
  - the phone sheet in a 412px frame.
- **Not run:**
  - the whole unit suite;
  - a production build;
  - the Playwright lab specs (no Clerk E2E user);
  - print preview, PDF, or paper;
  - a real phone with an on-screen keyboard: `useSheetViewport` is untested on a device, and the window could not be resized, so a frame was used;
  - Minimal and Expressive with the new container properties;
  - the dark theme with the panel open;
  - a screen reader.

### Limitations and provisional choices

- **Three properties are named but not drawn as a value.** A treatment set by no layer (for example the preset's Scripture radius) shows as "Preset design" rather than a number or swatch, because its value lives in the preset's CSS tokens and reading computed styles would make a second source of truth. Its accent side shows Left, the known default.
- **A point's or section's "Text color" and "Heading color" overlap.** A heading is drawn in its heading color when set, else its text color. Both are offered, the heading color under More options, labelled as overriding.
- **Expressive's note corners** (`0 6px 6px 0`) assume a left accent. With the accent on top they keep that shape until the outline sets a radius.
- **A passage left out of print** dashes its accent on whichever side it is.
- **The section's opening rule is always solid.** Only its color and width are offered; the closing line has a style.
- **The running header's style fields** (`styles.runningHeader`) are not offered: nothing draws them yet, as the header is UI.2C. Restoring the outline still clears them, as the command always did.
- **The phone sheet** is non-modal by design. While a field in it is focused on a phone, the keyboard and the sheet together leave little of the outline in view.

### Explicitly not built (unchanged assignments)

Nothing below was started; every documented requirement for it stands:

- **UI.2B.3:**
  - per-depth typography;
  - per-level marker and numbering presentation;
  - saved personal styles (storage with A2);
  - the final preset review, including Minimal's reminder and script.
- **UI.2C:**
  - the semantic sermon header, title storage, and the header placement the owner asked for;
  - the optional footer.
- **UI.2D:** the dark-paper control, print color and grayscale modes, and final preset refinement.
- **UI.3:** the Insert workflow and better mobile editing.
- **UI.4:** keep-with-next and keep-together, and the empty-sliver finding.
- **A2 / A3:** persistence and signed-in integration.
- No database change.

### Files changed

- **Styles** (`src/features/editor-lab/styles/`):
  - `model.ts`, `resolve.ts`, `render.ts`, `plugin.ts`;
  - new: `draft.ts`, `component-node.ts`.
- **v4** (`src/features/editor-lab/v4/`):
  - `plugins.ts` (`roleFrames` reads the previewed appearance);
  - `lab-v4.css`;
  - `appearance.test.ts`;
  - new: `appearance-draft.test.ts`.
- **Components** (`src/features/editor-lab/components/`):
  - `document-styles.tsx` (shared fields);
  - `formatting/color-control.tsx` (`noneLabel`);
  - new: `style-fields.tsx`;
  - deleted: `preset-select.tsx`.
- **Sermon editor** (`src/features/sermon-editor/`):
  - `sermon-workspace.tsx`;
  - `structure-tools.tsx`;
  - new: `appearance/` (`appearance-panel.tsx`, `fields.ts`, `target.ts`, `sheet.ts`, `appearance-panel.test.tsx`).
- **Words:** `src/i18n/dictionaries/{en,es}/editorLab.ts`. `appearance` is expanded; the unused `appearance.label` and `toolbar.closeStyles` were removed.
- **Docs:** this file, `AGENTS.md`, `docs/ROADMAP.md`.
- **Not touched:**
  - the v3 lab's look;
  - pagination;
  - the numbering engine;
  - the guard;
  - `CaretSync`;
  - migrations and the database.

## A1-UI.2B.2 finalization (22 October 2026)

**Starting point:** branch `dev`, HEAD `2daabf5`, clean working tree. UI.2B.2 was already committed there (the brief expected it uncommitted on `fd0911e`); this pass is uncommitted on top of it. Nothing was committed or deployed, and there is no migration or database change.

**Status:** finalized and checked. **Its presentation (the floating panel, side button, and phone sheet) is superseded by the [final UX](#a1-ui2b2-final-ux-outline-settings-and-component-appearance-22-october-2026) below**; its toolbar color bars, Expressive corners, and Workspace Panel decision stand.

### Owner decision: Appearance is not part of the Workspace Panel

**Appearance is an outline-editor-specific formatting tool, completely independent of the global Workspace Panel.**

- The Workspace Panel (B1) holds Bible and Scripture resources, the Dictionary, and approved research and AI tools. Appearance is never registered there, never one of its tabs, and keeps its own entry point, session, preview, Apply, and Cancel.
- The two coexist on the outline editor's screen. The Workspace Panel is the one docked region beside the writing area (`HANDOFF-PS-1B.1.md` §I). Appearance floats over the writing area that remains, so there is never a second docked column.
- The Workspace Panel itself is not built here; it stays B1.

### The presentation: a floating, modeless panel

**Evidence (Chrome, `/lab/editor/v4`, a dev server started for this pass on port 3100 and stopped after):**

- The docked panel took a 23rem column (about 368px) from the writing area whenever it opened. Where the writing area was narrower than the page, Print Layout scaled the page down; Regular Layout reflowed.
- In the lab the column was shared with the diagnostics and squeezed them.

**Chosen:**

- **From `lg` up,** the panel floats over the writing area's top right (22rem, clear of the scroll bar). Opening it changed neither the page's scale nor its position (checked: page width and left edge identical before and after, at 1536px and in a 1100px frame). It is modeless: the outline stays visible, scrollable, and editable, and clicking a component retargets Selected as before.
- **A side button** in its header ("Move Appearance to the left side", and back) moves it to the other side of the writing area. It is view state only (React state in `SermonWorkspace`, not stored), shown only where the panel floats. It was built because the inspection showed real overlap:
  - with the lab's column at 1536px, the panel covered about 190px of the page's right side, text included;
  - in a 1100px frame, about half of the scaled page;
  - without a side column, about 16px of margin at 1536px and about 140px at 1280px (worked out from the same geometry).
- There is no dragging and no resizing.
- **Below `lg`:** the same sheet as before (60% of the visual viewport, above the keyboard). Checked in a 412px frame:
  - the sheet is 382 of 637px;
  - Apply is in reach;
  - the side button is hidden;
  - there is no sideways scroll.
- **The lab's side column** (`aside`) now holds only the lab's diagnostics.

**A defect found and fixed while floating it:**

- **What happened:** the panel's absolutely placed parts (the screen-reader-only inputs of its segmented controls) took the floating frame as their containing block. They escaped the body's scroll and made the writing area's container taller than the screen; a scroll into view then moved the whole workspace up.
- **The fix:** the panel's scrolling body is `relative`, and the floating frame clips (`lg:overflow-hidden`). The wrapper then measured 494 of 494px with the panel open, against 843 before.

**Focus and keyboard (unchanged behaviour, re-checked):**

- Focus goes to the panel's heading on open.
- Escape in the panel returns to the outline and keeps the panel and draft; an open picker closes first.
- Clicking the outline keeps the panel open.
- × and Cancel discard.
- **Gap assigned to UI.4:** there is no keyboard way from the outline back into an open panel. The editor takes Tab, and the toolbar has the same gap. It is application-wide keyboard access, not Appearance's alone (owner's decision: no shortcut now).

### The toolbar's color bars

**Investigation (Chrome, then code):**

1. **Unreadable bars (predates 2B.2).** A text color of `null` (the theme's, which is most text) and no highlight both drew a transparent bar with a 9% border, nearly invisible, and a mixed selection drew the same. This dates from PS-1B.2B.2B (`ColorControl`).
2. **The Selected preview never reached the toolbar (came with 2B.2).** `resolveAt` read a component's committed `appearance`, never its previewed one. Outline and Components previews already showed, through `stylesInForce`.
3. **Wrong variant on light paper (predates 2B.2).** In the dark theme, Print Layout on light paper, the bar showed the dark variant of a color while the text is drawn in the light one (subtitle gray: `#7a8190` shown, `#6b7280` drawn).

Explicit colors and the subtitle's inherited gray were already shown correctly.

**Fix:**

- **`resolveAt` takes the component's appearance as drawn.** It has an optional `appearanceOf`, defaulting to the committed attribute. `resolveInForce(state, $pos)` (`styles/plugin.ts`) passes `appearanceInForce`, and the toolbar (`textState`, `blockState`) and the highlight pairs use it. There is still one resolver and no new rerender: `useEditorState` compares deeply, so a control redraws only when what it shows changes.
- **Four states for the bar** (`barStateOf`, `data-state`):
  - **color:** the swatch;
  - **theme:** the theme's text color, drawn (`lab-swatch-theme`);
  - **none:** a hollow outline, for no highlight;
  - **mixed:** a striped bar, never one of its colors (`lab-swatch-mixed`).
- **Edges and light paper:** a color and the theme bar carry a faint edge so a dark color shows on a dark toolbar. On light paper (`data-surface="paper"`, read from `paperKey` and Print Layout) the bar shows the light variant and the paper's ink, edged in the paper's white.
- **Words:** the trigger keeps its name ("Text color", "Highlight color") and says its state as its description and tooltip ("Theme color", "Mixed", "No highlight", a preset's name, or "Custom color"), from existing strings.

**Checked in Chrome, dark theme, light paper:**

- **plain prose:** theme, then no highlight;
- **a note with Selected → Text color Red previewed:** the bar shows Red, as drawn on the paper; Cancel returns it to theme;
- **select all:** Mixed;
- **light theme:** a black theme bar and a hollow highlight bar.

### Known limitations reviewed

- **Expressive note corners (fixed).** The note's `0 6px 6px 0` corners assumed a left accent. With the accent on top or right they now square on the accent's side (`0 0 6px 6px`, `6px 0 0 6px`); the reminder, cue, and task keep their even corners. A CSS contract test holds it.
- **"Preset design" (kept).** A value only the preset's CSS draws (for example the passage's radius) shows as "Preset design" with "From the preset". Checked in Chrome: it reads sensibly, and typing a value customizes it. Moving those values into code, so they can be shown as numbers, is preset work for **UI.2B.3**.
- **Text color and heading color (kept).** The label already says "Heading color (overrides text color)", in both languages.
- **The section's opening rule is solid only (kept),** for UI.2B.3.
- **Running-header styles (kept)** for UI.2C.

### Contract re-checked in Chrome on the floating panel

- **Selected:**
  - a preacher note targeted from a caret in its writing ("Preacher note · Pause here…");
  - a text color previewed on that note alone, then Cancel restored it exactly.
- **Components:** Main points' text color set to blue, Apply ("Applied. Undo reverses it in one step."), then one toolbar Undo restored the theme color.
- **Other checks:**
  - Escape and outline clicks, as above;
  - the scope control, both themes.

### Files changed

- `src/features/sermon-editor/sermon-workspace.tsx`: the floating frame, the side state, and the side column for `aside` only.
- `src/features/sermon-editor/appearance/appearance-panel.tsx`: the side button and the body's `relative`.
- `src/features/editor-lab/styles/context.ts`, `styles/plugin.ts`, `formatting-state.ts`: `resolveInForce`.
- `src/features/editor-lab/components/formatting/color-control.tsx`, `components/toolbar.tsx`, `lab.css`: the bar's states, edges, and light paper.
- `src/features/editor-lab/v4/lab-v4.css`: Expressive note corners.
- `src/i18n/dictionaries/{en,es}/editorLab.ts`: `appearance.moveLeft` and `moveRight`.
- **Tests:**
  - new `src/features/editor-lab/v4/toolbar-color.test.ts` (7);
  - `appearance-panel.test.tsx` (2 new);
  - `appearance-draft.test.ts` (corner contract).
- **Docs:** this file, `AGENTS.md`, `docs/ROADMAP.md`.
- **Not touched:**
  - schema, migrations, the database;
  - pagination;
  - `CaretSync`;
  - the numbering engine;
  - the v3 lab's look (its toolbar gains only the clearer bars);
  - the Workspace Panel.

### Verification

- `vitest run src/features/editor-lab src/features/sermon-editor src/i18n "src/app/(app)/lab"`: **682 passed** (673 before, plus 9).
- `tsc --noEmit`: clean. ESLint and Prettier: clean on every changed file.
- **Not run:**
  - the whole unit suite;
  - a production build;
  - the Playwright lab specs (no Clerk E2E user);
  - a real phone and on-screen keyboard;
  - a screen reader;
  - print and PDF;
  - the window itself at 1280px (it could not be resized; same-origin frames at 1100px and 412px were used, and the 1280px overlap is computed).

### Assigned onward (nothing dropped, nothing started)

- **UI.2B.3:**
  - advanced appearance and the final Minimal and Expressive preset review;
  - per-depth typography;
  - per-level markers;
  - saved personal styles;
  - preset values shown as numbers;
  - the opening rule's style.
- **UI.2C:**
  - the canonical Sermon Title and optional Subtitle in the dedicated header;
  - the header placement the owner asked for;
  - first-page and later-page presentation;
  - the optional footer;
  - running-header styles.
- **UI.2D:** dark editing paper and print color modes.
- **UI.3:** the complete Insert workflow.
- **UI.4:**
  - final structural, pagination, print, browser, and device acceptance;
  - keyboard access from the outline to the toolbar and an open Appearance panel;
  - keep-with-next and keep-together.
- **A2:** persistence and revision handling.
- **A3:** full signed-in integration.
- **B1–C3:**
  - the Workspace Panel (B1) and the rest of the application;
  - public release.

## A1-UI.2B.2 final UX: Outline Settings and Component Appearance (22 October 2026)

**Starting point:** branch `dev`, HEAD `2daabf5` (UI.2B.2 committed), with the finalization pass above still uncommitted on top (16 modified files and `v4/toolbar-color.test.ts`). This pass is uncommitted on top of both. Nothing was committed or deployed; no migration, no schema change, no database change, no new package.

**Status:** implemented and checked; ready for owner approval. Not owner-approved. It **supersedes the floating, modeless panel** described in the finalization section: that panel, its side button, and the phone sheet are gone.

### Owner decisions recorded

Three independent systems:

1. **Outline Settings**: the home of everything configured for the open outline (never the account). Appearance is its first and, today, only category. Page Setup, Numbering, Header & Footer, and Printing will join it in their checkpoints.
2. **Component Appearance**: a focused window for one component, opened from that component. It shows nothing else of the outline's settings.
3. **The Workspace Panel** (B1): Bible, dictionaries, AI, and research tools. Neither window is part of it, registered in it, or docked beside it. Not built here.

### How it works

**Opening** (`sermon-editor/appearance/dialogs.tsx`). `SermonWorkspace` owns `AppearanceDialogsProvider`. Anything inside the workspace opens the windows through `useAppearanceDialogs()`:

- `openOutlineSettings({ tab?, textStyle?, kind? })`: from the header's **Outline Settings** button (gear), and from the toolbar's "Edit styles" (Appearance → Outline, on the text style the caret is in).
- `openComponentAppearance(id?)`: by ID, or the component the selection is in (`componentAtSelection`, same rules as before: a caret in a point's heading is that point, a caret in a note is the note, a click on a passage is the passage; ordinary writing opens nothing and never means its point). It returns `false` and opens nothing for no or an unknown component. Today it is called from the structure tools' More menu ("Customize Appearance…"). **UI.3's right-click "Customize Appearance…" and the mobile component action menu call this same function.**

Only one window is open at a time; each is its own editing session.

**The window** (`modal.tsx`, the Base UI dialog's new `settings` placement in `components/ui/dialog.tsx`):

- a modal dialog: focus is trapped inside, the page behind is inert, and on close focus goes back to the outline (`finalFocus`, checked in a test and in Chrome);
- from `md`, a centered window up to 72rem × 52rem (Component Appearance up to 60rem); below `md`, the whole visual viewport (as the `full` placement, so it stays above an on-screen keyboard);
- pointer dismissal is off. **Closing never applies.** With nothing pending, × and Escape close at once; with a draft they ask "Discard appearance changes?" (Keep editing / Discard). Cancel discards the draft and keeps the window open.
- An open picker or menu inside still takes Escape first (Base UI's nested layers).

**Outline Settings** (`outline-settings.tsx`):

- a category rail from `md` (a row on a phone) listing `outlineSettingsCategories` (`["appearance"]`): only working categories, no placeholders;
- Appearance → **Outline** tab: the preset cards, the text style (shared defaults or a named style), its fields, "Reset this text style";
- Appearance → **Components** tab: the component type, its fields, "Reset the ‹type› style";
- the preview beside the settings from `md`; above them on a phone, where "Hide preview" folds it;
- the footer: the **Reset…** menu (whole outline), the pending summary or status, Cancel, Apply.

Page Setup and Numbering keep their current toolbar and header controls, which still work. When they move into Outline Settings they reuse the same commands and state (`usePageView`, `NumberingSelect`), never a second system.

**Component Appearance** (`component-appearance.tsx`):

- title "Customize Appearance"; a card naming the kind and its first words (or a passage's reference), and "Only this component changes";
- only that kind's fields (`componentGroups[kind]`) over its type's style, inherited dynamically; no tabs, no categories;
- a prominent **Reset this component**;
- the preview of the component itself; the footer as above, with the outline-wide Reset… menu.
- The target is fixed by ID and kind when it opens (`useComponentTarget`). If it is removed or becomes another kind, the window says so, hides the fields, blocks Apply, and offers "Discard those changes". It is marked in the outline while open (`setAppearanceTarget`, view state).

### Shared infrastructure (one of each)

- **`session.ts`, `useAppearanceSession(editor)`**: the draft, what is committed, conflicts, orphans, set, reset, apply, discard. It was lifted unchanged out of the old panel and is used by both windows. The outline behind still previews the draft (so the toolbar's color bars stay right), and the session leaves no preview behind when it ends.
- **`controls.tsx`**: `FieldList`/`FieldRow`/`Control`, `PresetChooser`, `ConflictLine`, `SessionFooter`, moved unchanged.
- **Unchanged:** `fields.ts` (with its schema coverage test), `styles/draft.ts`'s merge, conflicts, orphans, and plan, `applyAppearanceDraft`, `setStylesPreview`, the one resolver (`componentLayers`/`namedLayers`), and the CSS.

### The previews (`preview.tsx`): drawn by the editor's own rules

**Owner's decision: a read-only mini editor.** The editor's look is the generated sheet plus plugin output: numbering labels, section frames, note and script labels, root attributes, and the passage node view with its verses. A static copy would have duplicated all of it. So the preview is one Tiptap editor with the same `labV4Extensions`:

- `editable: false`; the picture is `inert` and `aria-hidden`, inside a scrollable, focusable box with a visible caption;
- created when the window opens and destroyed when it closes, never remounted per change;
- given the live editor's paper (`data-paper`) and the outline's own document attributes (numbering style, translation, committed styles);
- shown the session's draft through `setStylesPreview({ draft })`, the same view-state command as the outline, so the sheet, decorations, and single-component styles are computed by the same code;
- an Undo underneath is followed (the committed styles are copied in, outside history).

What it shows:

- **Outline tab:** a short sample sermon (`sampleOutline`, words from the `appearance.sample` dictionary in both languages): title, subtitle, Introduction, a main point with Psalm 119:105 expanded, a subpoint, a preacher note, a script, and the Conclusion.
- **Components tab:** the same sample, the chosen kind marked and scrolled into view.
- **Component Appearance:** a copy of the component with the headings that own it (`componentExcerpt`), so a subpoint keeps its depth and a note in the Introduction keeps the section's frame.

The person's document is never touched by the preview; its history stays empty. CSS: one `.lab-appearance-preview` rule in `lab-v4.css` sizes the editor for a window and gives it the page's ground (`--surface`, which light paper makes white); nothing else differs.

Tests prove the preview's generated sheet equals the outline's for the same draft (before and after a change), that it follows an Undo, that it marks the chosen kind, and that a single component's inline style equals the live node's decoration. They also prove the sample and every kind's excerpt load as valid v4 documents.

### Resets: exact semantics

Every reset is a set of draft edits with bases (`styles/draft.ts`). So it is previewed first, Cancel takes it back, a change made underneath is a conflict and is never overwritten, and Apply writes it in one transaction undone in one step. None touches the words, inline marks, component identities, depth, roles, or ownership (tested by comparing the document's JSON without `styles`/`appearance`).

| Reset                                     | Function                                                                     | Removes                                                                                                                         | Keeps                                                                     | Where                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Reset this component                      | `resetLayer({ layer: "instance" })` (existing)                               | that node's `appearance`                                                                                                        | everything else; the component then inherits its type's style dynamically | Component Appearance (prominent button) |
| Reset all components to outline defaults  | `resetAllComponents` (new)                                                   | every node's `appearance`, and drafted instance edits                                                                           | preset, defaults, named styles, component-type styles                     | both windows' Reset… menu               |
| Restore current preset (‹name›)           | `restorePreset` = `restoreOutline` + `resetAllComponents` (new)              | defaults, named styles, component-type styles, `runningHeader`, every node's `appearance`                                       | the chosen preset                                                         | Outline Settings' Reset… menu           |
| Restore original Preacher Studio defaults | `restoreOriginal` = `restorePreset` + preset `"balanced"` (`originalPreset`) | all of the above, and the preset becomes Balanced, **written explicitly** (never left to an editor or a future account default) | content and structure                                                     | both windows' Reset… menu               |

- The three outline-wide resets sit in a **Reset…** menu kept apart from the contextual ones. Each asks first, with what it removes and what it keeps, and then appears as a draft to review.
- **Unchanged semantics:** `restoreOutline` and the `resetOutlineToPreset` command still keep single components' appearance (their equality test is unchanged). They are simply no longer offered as a button: "Restore current preset" now also clears single components, as the owner asked.

### Personal presets: approved, not built (UI.2B.3 with A2)

Approved future contract, recorded so the Appearance category can take it without a redesign:

- **What a person can do:** save the outline's appearance as a named preset; apply it to any outline; rename, duplicate, delete, and update it; choose any built-in or saved preset as the default for new outlines; explicitly reapply an updated preset to an existing outline.
- **Built-in presets** (Minimal, Balanced, Expressive) are immutable code.
- **What a saved preset holds:** reusable appearance only: the outline-wide layers (preset base, defaults, named styles, component-type styles, later per-depth and numbering presentation). It never holds sermon content or component identities, so never a node's own `appearance`.
- **Applying a preset makes an independent snapshot** in `doc.attrs.styles`. Updating the saved preset never changes outlines made with it; reapplying is explicit. Applying to an outline and updating the stored preset are separate actions.
- **Where it goes in the UI:** a "My presets" group beside the built-in cards, with save and manage actions in the same Appearance category; apply goes through the same draft (previewed, one Apply, one Undo).
- **Storage:** account persistence with A2. A new account default is written into a new outline explicitly (see Boundary for A2).
- **Not built now:** no Save Preset button, no management screen, no persistence, no migration.

### Files changed

- **New** (`src/features/sermon-editor/appearance/`):
  - `session.ts`, `controls.tsx`, `modal.tsx`;
  - `outline-settings.tsx`, `component-appearance.tsx`, `dialogs.tsx`;
  - `preview.tsx`, `resets-menu.tsx`;
  - `appearance-dialogs.test.tsx`.
- **Deleted:** `appearance-panel.tsx`, `sheet.ts`, `appearance-panel.test.tsx` (its 11 cases are carried into the new test file, adapted to the modal).
- **Changed:**
  - `target.ts` (`useComponentTarget` for a fixed target; long excerpts end in "…");
  - `fields.ts` (comment);
  - `sermon-workspace.tsx` (provider, Outline Settings button, Edit styles, structure tools; the floating frame and side state removed);
  - `styles/draft.ts` (`resetAllComponents`, `restorePreset`, `restoreOriginal`, `originalPreset`);
  - `v4/lab-v4.css` (preview rule);
  - `components/ui/dialog.tsx` (`settings` placement);
  - `v4/appearance-draft.test.ts` (6 tests);
  - `i18n/dictionaries/{en,es}/editorLab.ts`: `appearance` gains the settings, tabs, component window, preview, discard, resets, and sample words; it loses `moveLeft`/`moveRight`, `title`, `hint`, `scope`, `scopes`, `scopeHints`, `noTarget`, `keptTarget`, `customizing`, `showTarget`, `restoreOutline`, `restoreHint`. `open` is now "Outline Settings", and `structureAction` is "Customize Appearance…".
- **Docs:** this file, `AGENTS.md`, `docs/ROADMAP.md`.
- **Not touched:** schema, commands and their semantics, structural guards, pagination, the numbering engine, `CaretSync`, the v3 lab, the Workspace Panel, the database.

### Verification

- `vitest run src/features/editor-lab src/features/sermon-editor src/i18n "src/app/(app)/lab"`: **698 passed** (23 files). The earlier 682 were reduced by the 11 cases of the deleted panel test, plus 6 new reset tests and 21 in `appearance-dialogs.test.tsx`.
  - The new component tests cover: modal and categories, Outline and Components tabs, type customization, Apply/Cancel, one Undo step, discard confirmation on Escape and ×, focus trapped and returned, targeting by ID and never the parent, nothing opened for prose, gone target, reset this component, the reset menus with confirmation, preview accuracy, and English and Spanish.
- `tsc --noEmit`: clean. ESLint and Prettier: clean on every changed file.
- **Browser** (Chrome, `/lab/editor/v4`, a dev server started on port 3100 for this pass and stopped after):
  - **Outline Settings at 1536px:** the preview showed numbering, the Introduction frame, and Psalm 119:105's verse.
  - **Expressive and Main points at 22pt:** previewed in the window. After Apply the outline drew 29.3px (22pt) and focus was back in the outline; one Ctrl+Z restored Balanced and the old size.
  - **Component Appearance on a preacher note** (from the More menu): it opened on the note, not its subpoint. A 3pt border showed in its preview; Escape asked first, and Discard left the note unchanged.
  - **A 412px frame:** the window filled the screen with nothing past the right edge, and Apply was in reach.
  - **Fixed during the pass:** on light paper, the preview's text sat on the dark window (now the page's ground).
  - **Fixed after owner review:** the preview could not be scrolled. Its scroll box itself was `inert`, and an inert element takes no wheel or touch scrolling. Now only the picture inside is `inert` and `aria-hidden`; the box is a labelled, focusable region that scrolls by wheel, touch, or arrow keys. Checked in Chrome on the owner's dev server: a wheel scroll moved it 330px, to the Conclusion. A test holds that the box is not inert.
- **Not run:**
  - the whole unit suite;
  - a production build;
  - the Playwright lab specs (no Clerk E2E user);
  - a real phone and on-screen keyboard;
  - a screen reader;
  - print and PDF;
  - the light theme in this pass;
  - Component Appearance in the 412px frame (same shell as Outline Settings);
  - a resized real window (the window could not be resized; a same-origin 412px frame was used, as before).
- One console error was seen: a Next.js dev notice about `readAppSettings` outside `<Suspense>` on this route. It is unrelated to this pass.

### Remaining risks and limitations

- **The preview is a second, read-only editor while a window is open.** It is small, created once, and destroyed on close, but it holds its own style sheet and loads one chapter for its passage (through the cached `loadChapter`).
- **A main point's number in Component Appearance** is its number in the excerpt (often "I."), not in the outline.
- **"Preset design" values** are still shown as words, not numbers (UI.2B.3).
- **There is still no keyboard path from the outline into the toolbar** (UI.4). The windows themselves are fully keyboard-operable once open.

### Assigned onward (nothing dropped, nothing started)

- **UI.2B.3:** advanced typography; per-depth formatting; numbering presentation; personal presets (model and UX, contract above); Minimal and Expressive refinement; preset values shown as numbers; the opening rule's style.
- **UI.2C:** the dedicated sermon header with the canonical Sermon Title and optional Subtitle; first-page and later-page presentation; the optional footer; header and footer pagination geometry; running-header styles. Header & Footer will be an Outline Settings category.
- **UI.2D:** optional dark editing paper; grayscale and black-and-white print modes (Printing category).
- **UI.3:**
  - the complete Insert workflow;
  - creating and converting semantic components;
  - right-click and touch component action menus, calling `openComponentAppearance(id)`;
  - mobile editor controls.
- **UI.4:** final A1 acceptance: long outlines, printing and pagination, browsers and devices, accessibility (including keyboard access to the toolbar), structural integrity.
- **A2:** outline persistence, revisions, conflicts, account-level preset persistence. **A3:** full signed-in integration.
- **B1–C3:** the Workspace Panel, Bible and dictionaries, navigation, outline management, export, offline/PWA, production migration, and public release.

## Boundary for A2

A2 puts persistence around `SermonWorkspace`; it does not change the editor.

- **Appearance (A1-UI.2B.1, 2B.2):** the outline's preset and styles are inside the document (`doc.attrs.styles`, with `preset`), and each component's own appearance is on its node; both are saved with it. An Appearance session's draft (Outline Settings, Component Appearance) is never persisted: Apply makes it a document change. There is nothing extra to persist. When an outline is created from an account's default preset (built-in or personal, UI.2B.3), write it explicitly.

- **Open:** pass the stored document as `document` with a stable `documentKey`. One sermon is one mount; another sermon is a new `key`.
- **Save:** `onReady` hands over the editor. A2 reads `editor.getJSON()` on its own schedule (coalesced, never per keystroke) and owns revisioning, offline storage, and conflicts.
- **Refusal:** a refused document is already read-only and says why. A2 decides what the person can do about it.
- **A2 also:**
  - mounts the workspace on a real sermon route behind the access helpers;
  - moves the shared `editor-lab` modules it needs next to `sermon-editor`;
  - gives the editor its own dictionary.
