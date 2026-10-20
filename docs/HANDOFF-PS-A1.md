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
  - Regular and editable Print Layout use the existing pagination.
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
- **Component appearance** (fills, borders, and accents per component, B.2C) and **print color modes** are still not built. The introduction's and conclusion's frame uses the theme's border color.
- **The toolbar wraps to two rows** at about 1280 px, as v3's does. On a phone it scrolls sideways.
- **Docs-like simplification** is a direction, not yet done: menus for less-used controls, a compact alignment control. It is a design pass of its own.
- **Production-intended code still imports lab modules.** `src/features/sermon-editor` imports the shared modules in `src/features/editor-lab`: extensions, commands, styles, pagination, and toolbar parts. Moving them is a relocation, not a rewrite.
- **Interface words** stay in the `editorLab` dictionary.
- **Still open from §15.10:** typed markers, numbering under the introduction and conclusion, and production storage.

## Boundary for A2

A2 puts persistence around `SermonWorkspace`; it does not change the editor.

- **Open:** pass the stored document as `document` with a stable `documentKey`. One sermon is one mount; another sermon is a new `key`.
- **Save:** `onReady` hands over the editor. A2 reads `editor.getJSON()` on its own schedule (coalesced, never per keystroke) and owns revisioning, offline storage, and conflicts.
- **Refusal:** a refused document is already read-only and says why. A2 decides what the person can do about it.
- **A2 also:**
  - mounts the workspace on a real sermon route behind the access helpers;
  - moves the shared `editor-lab` modules it needs next to `sermon-editor`;
  - gives the editor its own dictionary.
