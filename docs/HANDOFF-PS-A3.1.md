# Handoff: PS-A3.1, Legacy Editor Compatibility Restoration

**Status:** built and verified; ready for the owner's review. Not committed, not deployed, and no migration was run anywhere. Conversion stays off in production; nothing here turns it on.

**Git:** began on `dev` at `4a68720` ("Phase A3 is done!") with a clean tree. Ends there, with the files below changed or new and nothing staged.

A3.1 restores the three cutover regressions the A3 handoff left open: **Add from Saved Point**, **Expand/Collapse All** of points (apart from Scripture expansion), and a **passage's way to the Bible reader**. (A3's own handoff also uses "A3.1" for its first subsection, "mounting and authorization"; this phase is the separate follow-up.)

## Owner decisions (binding)

1. **Saved point:** copy the idea's title and its ID (`sourcePointId`) only: no notes, passages, relations, or legacy metadata. The idea is never changed. The same idea may be placed any number of times.
2. **Folding and Scripture expansion are independent controls.** Neither silently drives the other. Folding is remembered per outline on the device, never in the document.
3. **Folding works in Print Layout too** (asked during planning, option 3):
   - the desktop stays Print-only, with no Regular switch, and the phone keeps Regular by default with its Print option (`layout.ts` unchanged);
   - Scripture expansion is available in both layouts, and the `print` display settings are kept;
   - a print is always the complete document;
   - folding never changes the document, history, revisions, or saves;
   - pagination is never corrupted.
4. **Bible:** the same tab, through `readerHref(referenceLocation(ref, { outline }))`. The leave guard is never bypassed, and nothing calls `allowLeaving()` for it.
5. **Plan review corrections:**
   - printing verified in Chromium's own PDF output, without dispatching `beforeprint` by hand;
   - the guard proven to intercept the link, keep the page on Stay, and navigate exactly once on Leave;
   - selection moves only when it would otherwise be hidden;
   - a smaller folded page count is asserted only where the fixture spans enough pages.

## What was built

### A: Add from Saved Point

- **`insertSavedPoint(point, { anchorId, place })`** (`editor-lab/v4/commands.ts`) creates `point.create({ depth, sourcePointId }, title)`, with no ID; the identity step gives one.
  - **Placement:**
    - `below`: after the anchor's whole group, at its depth;
    - `under`: the anchor's last subpoint;
    - no anchor: a main point before the conclusion, or at the end when there is none.
  - **Anchor:** found by **node ID**, never by position, so several copies from one opening of the picker go where they were asked.
  - **Refused when:** the anchor is gone, the depth would pass `maxDepth`, or any existing block would change owner.
  - **Undo:** one transaction, marked `closeHistory` so every copy is its own undo step.
  - `pointAtCaret(state)` names the point the caret is in or under, for the picker's anchor.
- **The picker is the legacy `AddSavedPoint`**, with the same search pipeline (`useIdeaSearch(q, "point")`: owner-scoped, archived ideas left out).
  - Two optional props, unused by the legacy editor:
    - `words`: the canonical copy says the title is copied, and its notes and passages stay with the idea;
    - `refused`: shown in its status line when `onAdd` is false.
  - Like the legacy dialog, it stays open after each add and closes with Done.
- **Insert menu:** "Saved point…" sits after Subpoint and is enabled only while the editor is editable.
  - `placeSavedPoint` dispatches through the editor, so it passes the write guard and the session's autosave like any edit.
  - It reports "added" only when the document really changed. A lost lock, a read-only tab, or the guard refusing is never reported as added.
  - On close, the focus goes back to the editor at the end of the last copy.

### B: Folding points, and Scripture apart from it

- **`PointFolding`** (`editor-lab/v4/folding.ts`) is view state, a plugin that is never in the document.
  - **What is hidden:** a folded point hides exactly what it owns by `analyze()`, never by ProseMirror nesting: its writing, passages, notes, scripts, and subpoints, down to `groupEnd`. A sibling, depth-0 writing, or the parent's later writing stays.
  - **Nested folds:** a child's fold is kept when its parent unfolds.
  - **Only points that own something can fold.** A fold whose point no longer owns anything is forgotten.
  - **Drawing:**
    - hidden blocks get `data-folded`, hidden on screen only (`@media screen`, `lab-v4.css`);
    - foldable headings get `data-fold` and a chevron widget: `contenteditable=false`, `tabIndex=-1`, `aria-expanded`, worded from the `sermonEditor` dictionary;
    - the chevron is in the margin, visible on hover, always visible on touch with a 2 × 2.75 rem target, and never printed;
    - a folded heading shows " …" on screen.
  - **Commands:** `setPointFolded(id, folded)` and `setAllPointsFolded(folded)`. Each is one metadata transaction with no steps (`viewOnly`: `addToHistory: false`, plus `relayoutMeta`).
  - **Selection:**
    - folding a point around the caret puts it at the end of the outermost folded heading, in the same metadata transaction;
    - a selection moved into hidden content by keys or a node selection goes past it, the way it was going, or to the heading;
    - an edit that leaves the caret in hidden content (Enter at the end of a folded heading, an undo) unfolds only the points hiding it;
    - any other selection, and every other point, is untouched. None of this is a document change.
  - **Remembering:** `folding-storage.ts`, key `sermon-document-folded:<owner>:<outlineId>` in `localStorage`.
    - It is a new key, not the legacy `outline-collapsed:<id>`, which holds entry IDs.
    - Unknown IDs are ignored.
    - If storage fails, folds are kept in memory for the page's life, and nothing ever throws into the editor.
    - Never PostgreSQL, never the account.
- **Scripture** (`pagination/expansion.ts`): `PassageExpansion` now holds two independent view states.
  - **`ids`:** Regular Layout's expansion, unchanged; `setPassagesExpanded` and its callers are untouched.
  - **`collapsed`:** new, Print Layout on screen only (`setPassagesCollapsedInPrint`). A collapsed passage shows its reference; otherwise a passage shows as its `print` setting says, as before. The CSS is screen-only, and the decoration is not drawn while printing.
  - The node view reads verses only for an _expansion_ decoration (`spec.expanded`), so fold and collapse decorations never fetch.
- **Printing** (`pagination/printing.ts`, `pagination/plugin.ts`):
  - **`PrintPreparation`** holds `{ printing, version }`.
  - **On `beforeprint`, the Paginator:**
    1. dispatches `printing: true` (metadata only);
    2. **measures the pages synchronously in that same handler**.

    While `printing`, folding and Scripture collapse draw nothing, so a print is the whole document on correctly fitted pages. On `afterprint` the screen's view state is drawn again and measured.

  - **Evidence for the handler** (Chromium's PDF pipeline, probed during A3.1): `beforeprint` runs with screen media still in force, `matchMedia("print")` false, and layout measurable.
  - **Measuring again at once:** the Paginator also measures when folding, collapse, or printing state changes, through `version`, rather than a frame late.
  - **Hidden elements:** `contentBottom` and `fitBreaks` skip elements with no boxes, so a folded last block or a hidden page break never measures as 0.
- **Controls:**
  - **The View menu** (`sermon-editor/view-menu.tsx`) is at the toolbar's end on desktop and phone, in every layout. It offers Expand/Collapse all points and Expand/Collapse all Scripture, each resting when it would do nothing.
    - **In Regular Layout,** Scripture acts on the expansion.
    - **In Print Layout,** it acts on the screen-only collapse.
  - **Structure tools' "This point":** Collapse/Expand point acts on the nearest point that owns something (`foldTargetAtCaret`), for the keyboard.
  - `ViewControls` gets `passages={false}` in the workspace, so there is no second Scripture button. The v3 lab is unchanged.

### C: Open in the Bible

- **`PassageLink`** (`editor-lab/schema/scripture.ts`) is a type-only option on the passage node, so the schema is unchanged and server-safe.
  - `labV4Extensions({ openInBible })` passes it as `ScripturePassageNodeView.configure(...)`. Tiptap merges options, so the schema's own `configure({ locale })` keeps it.
  - With no option there is no link: the lab, the read-only previews, and Outline Settings' preview.
- **The node view** draws a real `<a href>` (`.lab-passage-open`) in the passage's label: `contenteditable=false`, with an `aria-label` from `scripture.field.openNamed`.
  - `stopEvent` keeps ProseMirror from selecting the passage or moving the caret for it.
  - Its bubble-phase click handler acts only on an unmodified left click not already `defaultPrevented`. It calls `navigate(href)`, the host's `router.push`.
  - A modified click is the browser's.
  - Its margin box is shorter than the label's line, so it never changes a passage's height or the pages. It is not printed.
- **The host** (`outline-document-host.tsx`) builds the link: `href = readerHref(referenceLocation(ref, { outline: session.outlineId }))`, plus the `scripture` dictionary's words. It also gives `foldKey(session.owner, session.outlineId)`.
  - Nothing of the reader's parsing, validation, translation, or authorization is duplicated. `/bible` resolves `outline` owner-scoped, and its "Back to the outline of …" returns to `/outlines/<id>`, which mounts a new host and session.
- **Keyboard:** "Open in the Bible" in the structure tools' menu while a passage is selected, as `DropdownMenuItem render={<Link>}` (the account menu's convention).
- **The leave guard** (`leave-guard.tsx`, unchanged) listens for clicks on `document` in the capture phase and catches any `a[href]`.
  - While words are not yet on the device, it stops the click before the passage's handler and asks: Stay keeps the page; Leave pushes once.
  - Otherwise the handler navigates.
  - No new guard, and `allowLeaving()` is never called.

## Data-integrity invariants

| Invariant                                | How it holds                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document row authoritative; one pipeline | A saved point is an ordinary editor transaction; nothing else writes                                                                                  |
| No edit without the right to edit        | `placeSavedPoint` goes through the write guard and reports only a real change (tests with the guard refusing)                                         |
| View state is never a change             | Fold, collapse, and printing are metadata transactions: unchanged JSON, undo depth, autosave source (`onChange` not called), coordinator (no request) |
| Print is complete                        | Folding and collapse not drawn while printing; screen-only CSS as a fallback; PDF equality in Chromium                                                |
| No new polling or timers                 | None added; the Paginator's existing measurement only                                                                                                 |
| No migration, no dependency              | None                                                                                                                                                  |
| Leave protection unchanged               | The existing guard sees the link as any link; never released                                                                                          |

## Verification (actually run)

- **Unit and component (Vitest), new:**
  - `v4/saved-point.test.ts` (12): title and source only; below, under, deeper, the parent's writing kept, no anchor before the conclusion or at the end; repeats with unique IDs; missing anchor and `maxDepth`; one undo step each and redo; the caret; the write guard refusing.
  - `v4/folding.test.ts` (23):
    - hiding by ownership; depth-0 writing; points that own nothing; nested folds; collapse and expand all; irregular shapes;
    - view-only invariants (JSON, undo, autosave source, the guard);
    - undo; copy and serialization; printing; independence from Scripture;
    - every selection rule, including a hidden top-level passage selected, a defect the test found and that was fixed;
    - remembered folds, stale IDs, failing storage, and a fold forgotten.
  - `v4/passage-view.test.ts` (7): Print Layout collapse as its own view state; never drawn while printing; no link without the option; the link's address with the outline and range (multi-chapter: first chapter's span); one navigation on a plain click; none after the guard stopped it or with a modifier; ProseMirror kept from it.
  - `sermon-editor/folding-storage.test.ts` (4), `sermon-editor/insert-menu.test.ts` (3), `sermon-editor/view-menu.test.tsx` (4, English and Spanish).
- **Unit and component (Vitest), extended:**
  - `editor-adapter.test.ts`, `coordinator.test.ts`, `write-guard.test.ts`: the new view-state commands change nothing, send nothing, and pass the guard;
  - `host/outline-document-host.test.tsx` (14, one new): the host's link carries this outline, `navigate` is the router's, the fold key is owner and outline, and folding sends nothing.
- **Real browser** (production build, `next start`, conversion on, the development Clerk test account and database; Chromium, desktop and Pixel 7; `tests/e2e/sermon-compatibility.spec.ts`; 10 passed, 4 skipped by design in the combined run; the phone journeys passed again after the chevron fix below):
  1. **The combined journey,** desktop and phone:
     - a point idea is placed twice as subpoints from the Insert menu;
     - the heading is edited, with undo and redo;
     - a passage is added and saved;
     - points fold by the chevron and the View menu, and Scripture expands;
     - Open in the Bible goes to `…&verse=28&outline=<id>`; Back and Forward work; "Back to the outline of …" returns;
     - everything is found again after a reload, and the idea's title is unchanged;
     - no POST is made for any view action.
  2. **The guard,** desktop and phone: words not yet kept, then the link, gives the dialog. Stay keeps the page with no navigation; Leave gives exactly one navigation to the passage.
  3. **Kept on the device but not saved,** desktop: the link is not held (A3's rule). Back to the outline shows the recovery page with the words present (the save was left to the next session). The guard journey, after Leave, also returns to recovery with the words kept.
  4. **Printing,** desktop Print Layout:
     - a sermon of 5 pages folds to 1 on screen;
     - `page.pdf()` (Chromium's print, its own `beforeprint`/`afterprint`) while folded equals the unfolded print line for line and page for page (5 pages, the folded text present);
     - the screen is folded again afterwards, on its own page count;
     - unfolding gives back exactly 5 pages;
     - with Scripture collapsed on screen, the print is again identical (`print: full` prints in full);
     - nothing is saved.
  5. **On a phone:** the chevron by tap in Regular Layout; Print Layout chosen; collapse all and expand all, with the page count back; nothing scrolls sideways.
  - A3's own `sermon-document.spec.ts` was run in the same pass: 15 of 16 passed. One failed once: "an outline that is not the account's is not found" on desktop, whose GET answered 401, not 404, while Clerk's testing helper logged failed session requests. It passed when run again alone, and A3.1 does not touch that route.
  - Screenshots were reviewed: light and dark, desktop and phone (the View menu, a folded point, the saved-point dialog, folded Print Layout).
- **The rest:**
  - The changed areas in Vitest (`npx vitest run --maxWorkers=2 src/features/editor-lab src/features/sermon-editor src/features/outlines src/features/scripture src/components/layout src/i18n`): 84 files, 2079 tests passed. One unhandled jsdom error (`target.getClientRects is not a function`, from `appearance/appearance-dialogs.test.tsx`) was reproduced on an untouched export of `4a68720`, so it predates A3.1.
  - The lab's print tests (`playwright.lab.config.ts`: P1/P2, P11, P7; desktop): 3 passed; the phone copies skip by design.
  - `npm run typecheck`, ESLint, and `prettier --check` on every changed file: clean. `ARCHITECTURE.md` was not Prettier-clean at `HEAD`; only the five A3.1 lines were added to it, and the rest was not reformatted.
  - `npm run build`: passing, four times (each Playwright run builds).
  - **The whole Vitest suite was not completed:** Claude Code stopped the run because the machine was low on memory. Run it again before committing (`npx vitest run`).
- **Not run:** Safari, Firefox, a real phone, a screen reader, a physical printer (only Chromium's PDF pipeline), Spanish in a real browser (Spanish is checked in the component test), and the whole e2e suite.

## Defects found and fixed during A3.1

1. **A hidden passage could stay selected.** A node selection of a top-level passage resolves at depth 0, so the folding check missed it. `selectionBlocks` now reads the selected node. Found by `folding.test.ts`.
2. **The phone chevron was off screen.** In Regular Layout on a phone, a main point's chevron sat at -2rem, outside the 1rem gutter: half off the screen and not tappable. It now stays in the gutter (`max(..., -1rem)`). Found in a screenshot; the phone journey now asserts it is on screen and at least 44 px tall.
3. **The print fixture's first ordering stalled,** because A3's Main point rests while a passage is selected (see below). The test was corrected; the editor was not changed.
4. **`contenteditable` was set as a property,** which jsdom does not reflect. It is now an attribute in both widgets.

## Known limitations (nonblocking)

- **Leaving while "Kept on this device":** the guard holds only words not yet on the device (A3's rule). Following any link in the second or so before the server save leaves the save to the next session, and returning to the outline shows recovery with the words intact (observed in the browser). That is A3's lifecycle, unchanged; a pre-navigation save would be a new decision.
- **"Main point" after inserting a passage:** after Insert → Scripture, the passage is selected, and A3's Main point and Subpoint rest until the caret is back in text. This is A3's `addPoint`, unchanged here.
- **The chevron** is not a Tab stop (it sits inside the editable text). The keyboard path is the structure tools' "Collapse point" / "Expand point", and the View menu.
- **Scripture's Regular expansion** is a snapshot of the passages at the time, as before: a passage added afterwards starts collapsed.
- **Folds are per device and per browser profile,** like the legacy editor's. They are not cleared on account deletion: a view preference, like the theme.

## Rollout (unchanged; not A3.1's)

1. A2.3D: devices told an outline is converted; queued legacy changes; the offline page.
2. The owner's Vercel checks (A2.2 "Rollout" step 3).
3. `SERMON_DOCUMENT_CONVERSION=on` in production, by the owner.

The cutover regressions are no longer among the prerequisites. A3.1 alone does not make conversion ready for production.

## Files

- **New:**
  - `src/features/editor-lab/v4/folding.ts`, `folding.test.ts`, `saved-point.test.ts`, `passage-view.test.ts`;
  - `src/features/editor-lab/pagination/printing.ts`;
  - `src/features/sermon-editor/view-menu.tsx`, `view-menu.test.tsx`, `folding-storage.ts`, `folding-storage.test.ts`, `insert-menu.test.ts`;
  - `tests/e2e/sermon-compatibility.spec.ts`;
  - this file.
- **Changed:**
  - `editor-lab`: `v4/commands.ts` (`insertSavedPoint`, `pointAtCaret`), `v4/extensions.ts` (folding, printing, the link option), `v4/lab-v4.css`, `pagination/expansion.ts`, `pagination/plugin.ts`, `schema/scripture.ts` (option type), `schema/scripture-view.ts` (the link, narrower loading), `components/page-view.tsx` (`passages`);
  - `sermon-editor`: `insert-menu.tsx`, `sermon-workspace.tsx` (`foldKey`, `openInBible`, View menu), `structure-tools.tsx`, `host/outline-document-host.tsx`, and the tests named above;
  - `outlines/components/add-saved-point.tsx` (`words`, `refused`);
  - `src/i18n/dictionaries/{en,es}/sermonEditor.ts`;
  - `AGENTS.md`, `ARCHITECTURE.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `docs/ROADMAP.md`.
