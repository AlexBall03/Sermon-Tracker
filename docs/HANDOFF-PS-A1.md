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

## Boundary for A2

A2 puts persistence around `SermonWorkspace`; it does not change the editor.

- **Open:** pass the stored document as `document` with a stable `documentKey`. One sermon is one mount; another sermon is a new `key`.
- **Save:** `onReady` hands over the editor. A2 reads `editor.getJSON()` on its own schedule (coalesced, never per keystroke) and owns revisioning, offline storage, and conflicts.
- **Refusal:** a refused document is already read-only and says why. A2 decides what the person can do about it.
- **A2 also:**
  - mounts the workspace on a real sermon route behind the access helpers;
  - moves the shared `editor-lab` modules it needs next to `sermon-editor`;
  - gives the editor its own dictionary.
