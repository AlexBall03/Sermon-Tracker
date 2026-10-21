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

| Issue                                                                                                                                                                        | Status  | Belongs to                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- |
| Points deeper than a subpoint share the subpoint's type and are told apart by indentation and number only.                                                                   | Pending | UI.2B (typography by depth needs a style level) |
| A custom label's column is estimated, so a few pixels of extra space can show after a long label.                                                                            | Pending | UI.2B (per-level marker settings)               |
| A heading can be left alone at the foot of a page (no keep-with-next), and a passage can split after one line.                                                               | Pending | UI.2C / UI.4 (pagination)                       |
| Space before a block that starts a new page stays at the foot of the previous page. It is harmless, but the gap at a page's foot varies.                                     | Pending | UI.2C (pagination)                              |
| White page gaps in print are reasoned, not yet seen on paper.                                                                                                                | Pending | UI.4 (print verification)                       |
| The Title and Subtitle in the benchmark are styled paragraphs.                                                                                                               | Pending | UI.2C (sermon header)                           |
| A quotation is told from Scripture only by its rule's color and the passage's reference line. This holds in grayscale, but a quotation could be more distinct in Expressive. | Pending | UI.2B / UI.2D                                   |

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
    - **UI.3:** the editing interactions (header click-to-edit, the footer options menu).
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
- **UI.3:** unchanged and required for A1. Also adds the header and footer editing interactions, context menus, shortcuts, and discoverability.
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

## Boundary for A2

A2 puts persistence around `SermonWorkspace`; it does not change the editor.

- **Open:** pass the stored document as `document` with a stable `documentKey`. One sermon is one mount; another sermon is a new `key`.
- **Save:** `onReady` hands over the editor. A2 reads `editor.getJSON()` on its own schedule (coalesced, never per keystroke) and owns revisioning, offline storage, and conflicts.
- **Refusal:** a refused document is already read-only and says why. A2 decides what the person can do about it.
- **A2 also:**
  - mounts the workspace on a real sermon route behind the access helpers;
  - moves the shared `editor-lab` modules it needs next to `sermon-editor`;
  - gives the editor its own dictionary.
