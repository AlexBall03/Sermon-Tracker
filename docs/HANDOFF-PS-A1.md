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

## Boundary for A2

A2 puts persistence around `SermonWorkspace`; it does not change the editor.

- **Open:** pass the stored document as `document` with a stable `documentKey`. One sermon is one mount; another sermon is a new `key`.
- **Save:** `onReady` hands over the editor. A2 reads `editor.getJSON()` on its own schedule (coalesced, never per keystroke) and owns revisioning, offline storage, and conflicts.
- **Refusal:** a refused document is already read-only and says why. A2 decides what the person can do about it.
- **A2 also:**
  - mounts the workspace on a real sermon route behind the access helpers;
  - moves the shared `editor-lab` modules it needs next to `sermon-editor`;
  - gives the editor its own dictionary.
