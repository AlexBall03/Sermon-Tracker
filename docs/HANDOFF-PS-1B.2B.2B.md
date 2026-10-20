# Handoff: PS-1B.2B.2B, Rich Text, Fonts, Typography & Named Styles

Lab only (`/lab/editor`, `src/features/editor-lab`). Nothing is saved, synced, or sent; no production table, sync handler, outline editor, or migration was touched. Builds on B.2A (commit `b9088ee`), which put the style contracts into schema v3 without drawing them.

## Start here

- The formatting commands every control calls: `formatting-commands.ts`. What the controls show: `formatting-state.ts`.
- Colors: `styles/colors.ts` (pure, deterministic). Drawing: `schema/formatting.ts` (marks), `styles/attributes.ts` + `styles/paragraph-css.ts` (a paragraph's own format), `styles/render.ts` + `styles/plugin.ts` (named and component styles as one sheet per editor, the preview, text on highlights).
- Fonts: `fonts.ts` (the 14 `next/font` families), `styles/font-stack.ts` (stacks and paste mapping).
- Interface: `components/toolbar.tsx`, `components/formatting/*`, `components/document-styles.tsx` (the inspector's Styles tab).
- Tests: `colors.test.ts`, `typography.test.ts`, `tests/lab/typography.spec.ts`.

## 1. Investigation findings

1. **Schema v3 already held everything** this phase needed except color modes: the 14-family registry, sizes 4–144 pt in half points, `textStyle` (color, family, size), `highlight`, `textAlign`, `styleName`, headings 1–4, `format`, `appearance`, `doc.attrs.styles`, and a property-level resolver. No v4; no document-model change.
2. **Adaptive colors needed one widening of v3 (approved by the owner for the lab).** A color is now a union:
   - a preset key or lowercase `#rrggbb`: **Adaptive**, the default, and every earlier value's meaning;
   - `{ mode: "exact", color }`: **Exact**;
   - `{ mode: "themed", light, dark }`: **Per theme**.

   `colorValueSchema` (`styles/model.ts`) is the one contract, used for marks and styles now and for every component color in B.2C. No migration is needed: earlier v3 documents are a subset. **Any reader older than this phase refuses the objects**, so widening it again means changing the validator, the marks' HTML (`data-color`, `data-color-mode`, `data-color-dark`), and the paste rules together. No production migration was written; production adoption needs its own approved phase.

3. **Reused:** the resolver and built-ins, `normalizeColor`, the Tiptap mark extensions (extended, not replaced), the checked-JSON node attributes, `Command`/`run`, `useEditorState` selectors, the meta-only no-history command pattern from Print Layout, `setDocAttribute` for one undoable change, the paginator's ResizeObserver, and `Select`, `Popover`, `Segmented`, `Input`, `Button`.
4. **No blockers.** There are four deviations:
   - the color union above;
   - Regular Layout's base text is now the document's 12 pt (16 px) rather than 17 px, so the screen matches print;
   - the Print Layout sheet on screen still follows the theme (B.2B.1's design), while printing draws paper colors;
   - one additive prop on the shared `Select` (`finalFocus`).

## 2. What was built

### Toolbar (desktop)

The groups, in order:

- Undo and Redo.
- Paragraph style (Normal Text, Title, Subtitle, Heading 1–4), Font (the registry by category), and Size (typed 4–144, rounded to half points, comma or point decimals, plus a list of the usual sizes and −/+ steps).
- B, I, U, Text color, and Highlight.
- The four alignments, Line and paragraph spacing (line spacing 1 / 1.15 / 1.5 / 2; space before and after; left and first-line indent in pt; "Use the style's spacing"), and Clear formatting.
- Lists, then the outline actions, unchanged.

The old Paragraph and Heading-2 buttons are gone; the style menu replaces them. Each group has its own narrow subscription.

### Commands (`formatting-commands.ts`)

| Kind            | Commands                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| Inline          | `setTextStyle` (`setFontFamily`, `setFontSize`, `setTextColor`), `setHighlight` |
| Paragraph       | `setNamedStyle`, `setAlignment`, `setParagraphFormat`                           |
| Clearing        | `clearFormatting`                                                               |
| Document styles | `applyDocumentStyles`, `setStylesPreview` (in `styles/plugin.ts`)               |

- Each command is a ProseMirror command that returns false where it cannot apply, makes one transaction, and is shared by the toolbar and the tests. Future menus and phone controls can call the same ones.
- Inline formatting merges into each run's own `textStyle`, so a size change keeps a run's color. At a collapsed cursor it becomes stored marks.
- Structural rules:
  - No command changes a point, a section, a note, a script, a passage, an ID, numbering, or `doc.attrs`. Only `applyDocumentStyles` writes `doc.attrs.styles`.
  - Title is a paragraph look and renames nothing.
  - Named styles and paragraph format are refused in point and section titles. Headings are refused in notes and scripts (the schema forbids them). Inline formatting works everywhere.
  - Clear formatting removes marks, `format`, and `textAlign`, and keeps every node type, named style, and heading level.

### Document Styles (inspector → Styles)

- Edits the document defaults and the seven named styles.
- Each property is marked **Customized** (with a reset) or **Inherited from** the defaults or the built-in style.
- Edits form a draft shown as a **preview**: view state that never touches the document or history.
  - **Apply** writes the change in one transaction, undone in one step.
  - **Cancel**, leaving the tab, or opening another document ends the preview.
  - **Restore** clears one style or all of them, still subject to Apply.
- Explicit marks and formats keep winning over the style.

### Drawing

- Named and component styles become one generated `<style>` per editor, scoped to it. It is rebuilt only when the styles object (or the preview) changes.
- Component typography uses the B.2A resolver. Built-ins are tuned to the lab's earlier look: Playfair section titles, Figtree point titles, and Figtree 11 pt notes.
- Component colors, fills, borders, and the appearance editor stay B.2C.

## 3. Adaptive colors

**Persistence.** What is stored is the intent (section 1.2). The theme never rewrites the document, and switching themes adds no transaction or undo step (checked in the browser).

**Rendering.** Each color is drawn inline as its **light** variant. That is also what printing and pasting into another application receive. The **dark** variant sits in a CSS variable (`--ink-d`, `--fill-d`) that `.dark` reads under `@media screen` only.

**Resolution** (`colors.ts`; pure, deterministic, OKLCH with a gamut clamp, WCAG contrast):

- **Adaptive ink.** A color that already reaches 4.5 against the theme surface is drawn as chosen. Otherwise only its lightness moves, the least that reads, and its hue is kept.
- **Adaptive fill.** Kept in a lightness band per theme (pale on white, deep on the dark surface), with its chroma capped.
- **Text and highlight are judged together.** An inline decoration on every highlighted run (`styles/plugin.ts`) gives its text the color that reads on that specific fill in each theme, custom fills included. Only the blocks a change touched are recomputed.
- **Exact and per-theme colors are never changed.** Where one reads poorly, the color picker says so (`contrastWarnings`).
- **Paper.** Paper equals light today. B.2F's Grayscale and Black & White modes derive from `renderColor(…, "paper")`. No alternative patterns or invented distinctions were added.

**Verified.** Every ink preset (and theme text) on every highlight preset reaches 4.5:1 in both themes (unit test).

## 4. Fonts

- **Families.** 14 `next/font/google` families, self-hosted at build time, each with `preload: false`, `display: "swap"`, the `latin` subset (covers á é í ó ú ü ñ ¿ ¡), roman and italic, and variable weights. Tinos and Cousine are static 400/700.
- **On-demand downloads.** The `@font-face` rules ship only with the lab's CSS, and a file downloads only when text uses it. The browser test watched Cormorant Garamond download on first use.
- **Licenses.** Apache 2.0 for Tinos, Arimo, and Cousine; SIL OFL 1.1 for the rest.
- **Fallback stacks.** Each stack is the family's variable, then a fallback. Metric-compatible system fonts come first for Tinos, Arimo, and Cousine. Offline before first use, text falls back.
- **Caching.** Files are under `/_next/static/media`, which the service worker already caches after use.
- **Remeasurement.** The paginator now also listens to `document.fonts` `loadingdone`. Style changes resize the editor and remeasure through the existing ResizeObserver.

## 5. Selection and editing

- **Buttons** never take focus.
- **Menus, fields, and popovers** remember the editor's selection when they take focus, and put it back before applying (only if the document is unchanged). They then return focus to the editor, and the remembered selection is used once.
  - The menus pass `finalFocus` back to the editor, not the trigger.
  - Spacing changes keep their popover open.
  - Menus apply only a value different from the one shown. Base UI reports its own value when its options change, which once re-applied a stale selection (found and fixed in the browser).
- **Copy and paste** inside the application carry fonts, sizes, color modes, styles, and format.
- **Foreign HTML** is mapped only where safe:
  - a registry or metric-compatible family name to its key (Arial → Arimo);
  - pt or px sizes to half points, within 4–144;
  - colors to adaptive `#rrggbb`;
  - anything else gives no mark.
- **Spacing** is padding, which adds space after and space before as a word processor does, at any nesting depth. In the browser, no line of mixed fonts and sizes sat in a page gap.

## 6. Verification (20 October 2026)

| Check                                                | Result                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                   | clean                                                                                                                                                                                                                                                                                                                                   |
| `npx eslint` on the changed areas                    | clean                                                                                                                                                                                                                                                                                                                                   |
| `npx vitest run src/features/editor-lab`             | all pass (unit tests below included)                                                                                                                                                                                                                                                                                                    |
| `colors.test.ts`                                     | 9 pass: presets per theme and print, hue kept, minimal moves, fill bands, the full text × highlight matrix, exact and per-theme untouched and warned, determinism, schema                                                                                                                                                               |
| `typography.test.ts`                                 | 16 pass: commands, stored marks, sizes, title formatting keeps structure, named styles, sparse format, refusals, clear formatting, mixed and inherited state, HTML round trip, foreign paste, sheet, preview / cancel / apply / undo, explicit wins                                                                                     |
| `tests/lab/typography.spec.ts` (desktop)             | 6 pass: selection kept through the font menu, the size field, and the color popover; collapsed-cursor typing; named styles and the title rest; theme switch with no document change and print colors from dark mode; Document Styles preview, cancel, apply, and undo; Print Layout remeasured after a late font, with no line in a gap |
| Existing lab specs `editor` + `pagination` (desktop) | first run: 16 pass, 4 fail; after the fixes below, each failing test re-run and passing                                                                                                                                                                                                                                                 |

No production build was run: nothing outside the lab changed apart from one optional prop on `Select`.

What the existing specs found:

- **A bug of this phase, fixed.** `editor.spec` "rich titles" and `pagination.spec` P3 failed. Moving the cursor into a title changes the style and font menus, and Base UI then reports a value by itself. The toolbar treated that as a choice. Menus now act only while the person has opened or focused them (`useKeptSelection().choose`).
- **A test matcher, adjusted.** P1/P2 and P11 failed on page 4 only. Screen and print both begin that page with the subpoint title "C. Subpoint 3". The comparison needs 12 characters of the line, and the title is shorter once its number is set aside; the number is drawn by CSS on screen and is in the PDF text. The new typography moved that short title to the top of a page. `compare` in `pagination.spec.ts` now also matches the printed line without its outline number. The page breaks themselves agree.

The mobile project and the production-only spec were not run: the phase changed no phone control and no route.

## 7. Known limitations

- No component appearance editor, component colors, or print color-mode interface (B.2C, B.2F).
- The phone's formatting controls and new keyboard shortcuts are later work. Only the existing shortcuts (B/I/U, undo and redo, Mod-Shift-L/E/R/J) apply. No AltGr-conflicting chords were added for Spanish keyboards.
- The font menu lists names in the interface font: previewing each family would download all 14.
- The picker's contrast warning judges an exact or per-theme text color against the theme surface. It does not judge it against a highlight the text may sit on; such text is drawn as chosen.
- Paste mapping covers family, size, and color only, not paragraph spacing or foreign styles.
- Inherited values in the Styles panel are shown muted; the menus show the value in force, not an "inherit" choice (reset returns to inherited).
