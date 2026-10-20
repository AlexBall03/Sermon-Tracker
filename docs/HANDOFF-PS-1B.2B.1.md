# Handoff: PS-1B.2B.1, Editable Pagination Feasibility

**Status: complete.** Committed by the owner as `0c26fc5` (19 October 2026, on `dev`). A final verification pass followed (§12); it changed one test (P8, a test defect) and this handoff, both uncommitted.

- **The question.** Can Print Layout give real, editable pages over the one canonical document without changing it? PS-1B.1 §F risk 6 calls this the largest open risk.
- **The answer is yes, in Chrome.** Every criterion P1–P11 of PS-1B.1 §G.2 has a recorded result (§4):
  - the pages break where Chrome's own print breaks;
  - long paragraphs flow over pages;
  - the caret, selection, copy, undo, and point moves work across page gaps;
  - printing matches the screen line for line on Letter and A4;
  - paginating never changes the document.
- **What remains is checks only the owner can make:** a real phone (P9), a screen reader (P10), and printing from Safari and Firefox (P11).
- **The verdict** (§9): Print Layout is built with PS-4/PS-5, not a dedicated PS-5a, unless those checks fail.
- **Where it was built.** Everything is in the development-only lab (`/lab/editor`, `src/features/editor-lab/`), on fixtures. Nothing is persisted, synced, or sent, and no production page, database, or package changed.
- **The owner's review in the lab** gave many decisions and requests. Some were built in the lab, in this phase; the rest are recorded for the next phases (§8).

## Start here

| Need                                      | Where |
| ----------------------------------------- | ----- |
| Research and alternatives                 | §1    |
| The technique chosen, and why             | §2    |
| What was built, and the files             | §3    |
| P1–P11 with evidence                      | §4    |
| Performance and limits                    | §5    |
| Dependencies and licensing                | §6    |
| Checks still owed by the owner            | §7    |
| The owner's decisions and the next phases | §8    |
| Verdict                                   | §9    |
| Commands and results                      | §10   |
| Known issues left open                    | §11   |

## 1. Research findings

| Option                                             | Finding                                                                                                                                                                                                                                                                                                                                  | Decision                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Tiptap Pages** (official)                        | A Pro package from a private registry under a subscription licence, in beta/alpha, pinned versions advised. Its docs say it has no browser-print integration (print goes through their conversion service), and that a non-splittable block taller than a page "can loop indefinitely and freeze the editor".                            | Excluded: paid, unapproved, no print parity                 |
| **tiptap-pagination-plus** 3.1.0 (MIT, Tiptap 3)   | Its `dist/PaginationPlus.js` was read. One widget at document position 0 holds full-width `float:left; clear:both` page breaks. Lines flow round them, so a paragraph continues on the next page with no change to the document. It rebuilds its decorations through meta transactions and has no print parity or custom-node awareness. | Not installed. **Its core technique was adopted** (below)   |
| **tiptap-extension-pagination** (hugs7, MIT)       | Adds page, body, and header/footer nodes to the schema: the pages live in the document.                                                                                                                                                                                                                                                  | Rejected: breaks P8 and the canonical schema                |
| ProseMirror inline widgets at measured line breaks | What PS-1B.1 §F anticipated: DOM inserted inside paragraphs, which risks the caret, IME, and selection.                                                                                                                                                                                                                                  | Rejected in favour of floats, which put nothing inside text |
| CSS multicolumn; paged.js                          | Multicolumn fragments natively but lays pages side by side. paged.js rewrites the DOM and cannot sit under contenteditable.                                                                                                                                                                                                              | Rejected                                                    |

## 2. The technique: our own float-gap pagination

About 450 lines in the lab, with no new dependency.

- **How a page is made.** In Print Layout the editor is one sheet wide, and its padding is the paper's margins. One widget at the start of the document holds a column of floats:
  - for each page, a **spacer** with no width, as tall as the page's text area;
  - then a full-width **gap**: the bottom margin, the desk, and the next top margin, with the page number.

  A line of text cannot sit beside a float as wide as the column, so the browser moves every line that would cross a gap below it. A paragraph continues on the next page, line by line, with nothing inserted and nothing split.
  - The first version put the text area into a float's top margin. That failed: lines avoid a float's whole margin box, so every line was pushed past every gap and the page count grew without end. The zero-width spacer is the fix.

- **Measured, never dispatched.** A plugin view measures after each change, in a microtask, so before the browser paints, and after a resize, a font load, or a passage's text loading, in the next frame.
  - It reads the bottom of the last block and the top of each explicit page break, then fits the number of gaps and each break's height.
  - It writes only into DOM that ProseMirror ignores: the widget's children (`WidgetViewDesc.ignoreMutation`, prosemirror-view 1.42.6) and a leaf node's style.
  - It dispatches no transaction, so pagination makes no `docChanged` and no history entry (P8).
- **Layout, paper, and margins** are plugin state, changed by commands that carry only a meta and `addToHistory: false`. The editor is never remounted.
- **Scaling** (§C.9). The sheet is always laid out at the paper's width. A narrower window shrinks it with a CSS transform (`PageScaler`), never CSS `zoom`, which can change where lines wrap. Pages never depend on the window. One case was found and fixed: the lab's narrower indent for small screens applied in Print Layout on a phone. It no longer does.
- **Printing** (P11).
  - `@page` takes the chosen paper size, with no margin.
  - The sheet alone is printed, with no desk between pages.
  - Orphans and widows are left to the screen.

  Every physical page boundary then falls inside a blank gap, so the printer's breaks are the screen's.
  - In dark mode the page prints in ink on paper, never the screen's light-on-dark (found by the owner, fixed).

- **Lines with no width.** An empty line has no width, and Chrome lays it beside a gap instead of below it. That put the caret at the far right of a page, a bug the owner found. It is fixed two ways:
  - an empty paragraph gets a one-pixel mark in CSS;
  - the empty last line after Shift+Enter gets a one-pixel widget decoration, recomputed only for the blocks a change touched.

  Neither is in the document.

**Why our own instead of installing pagination-plus:**

- it paginates without transactions (P8);
- it knows our explicit page breaks and Scripture print rules;
- print parity is built in;
- its gaps are hidden from assistive technology and let clicks through;
- a dependency we would have to fork anyway is avoided.

## 3. What was built

All lab-only, all fixtures.

- **Print Layout**: pages, page gaps, page numbers (bottom right, the owner's choice), explicit page breaks, printing.
- **The owner's page controls** (§8.1):
  - five paper sizes (Letter, Legal, A4, A5, Half Letter);
  - a ruler at the paper's own scale (96 CSS pixels to the inch, counted from the left margin);
  - side margins dragged at the ruler or set with the arrow keys, clamped, with a value tip and a guide line;
  - Reset margins;
  - the last paper and margins remembered in this browser under `ps-lab:` keys.
- **Default layout** (Automatic / Regular / Print, under a `ps-lab:` key) and this tab's layout (`sessionStorage`). The owner has since superseded this (§8.1).
- **A stand-in passage view** for P7. A passage shows its reference and, when it may be shown, its verses (read with `loadChapter`). Regular Layout shows the verses only when expanded; Print Layout shows them by `print` (full, reference, or hidden). One lab button expands or collapses all passages, as view state. It is a stand-in for §G.3, not that work.
- **The editor workspace.** The lab became a full-window editor over the app shell (a portal on the page body; no shell file changed). It has:
  - a header with a way back, the document, and the lab's settings;
  - one toolbar row, editing first and the view controls at its end, scrolling sideways on a phone;
  - the page on a desk, with the ruler held at the top;
  - the inspector beside it on wide screens and below it otherwise.

  The emerald caret and the absence of a border around the page in use are the owner's.

- **Keys** (the owner's decisions, §8.2):
  - **Backspace** removes an empty point, turns a point back into writing at the start of its title, and then joins it to the line before.
  - **→ and ←** stop at a section's edge.
- **The test sermon** fixture "Print Layout test": numbered sentences, so lines can be told apart; a paragraph longer than a page; points nested over a page; an explicit page break; Romans 8 printed in full; a reference passage and a hidden one.

**Files.**

- **New:**
  - `src/features/editor-lab/pagination/geometry.ts`, `plugin.ts`, `expansion.ts`, `preferences.ts`;
  - `src/features/editor-lab/components/page-scaler.tsx`, `margin-ruler.tsx`;
  - `src/features/editor-lab/pagination.test.ts`;
  - `tests/lab/pagination.spec.ts`;
  - `tests/lab/pdf-text.ts`: a dependency-free reader of the lines on each page of a Chrome PDF, for P1 and P11.
- **Changed:**
  - `schema/scripture.ts` (the passage view);
  - `schema/extensions.ts`;
  - `outline-commands.ts` (Backspace, section edges);
  - `documents.ts`;
  - `components/editor-lab.tsx`, `toolbar.tsx`, `side-panel.tsx` (pagination read-outs);
  - `lab.css`;
  - `structure.test.ts` (the Backspace and section-edge tests; two PS-1B.2A tests rewritten for the owner's new Backspace);
  - `availability.test.ts`: browser storage is now allowed in `pagination/preferences.ts` only, and only under `ps-lab:` keys, as §G permits;
  - `src/i18n/dictionaries/{en,es}/editorLab.ts`;
  - `tests/lab/config.ts`, `tests/lab/editor.spec.ts` (its panel helper; see §10).
- **Not touched:** the database, migrations, server actions, sync and offline code, the production outline editor, shell and layout files, and `package.json`.

## 4. P1–P11 results

The evidence is from Playwright against the owner's development server (Chrome headless). Desktop is 1280 × 720, and "phone" is Pixel 7 emulation. Each figure below was printed by the run as a `LAB-MEASURE` line.

| #   | Criterion (§G.2)                                    | Result                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Breaks within one line of a reference print         | **Passed**                                                       | The reference is Chrome's own print of the same content in Regular flow, on Letter with one-inch margins. Both have 8 pages. Pages 1, 2, 3, 6, 7, and 8 begin on the same line. Pages 4 and 5 begin one line apart, because Chrome keeps at least two lines of a paragraph together at a break and we do not (§5). Lines per page: reference 26, 29, 28, 26, 21, 30, 31, 12; ours 26, 29, 29, 26, 20, 30, 31, 12                                |
| P2  | A paragraph longer than a page splits               | **Passed**                                                       | The 48-sentence paragraph takes 64 lines over 3 pages. Every line lies inside a page's text area. The paragraph's text on screen equals the document's, and its 48 numbered sentences are in order, none missing or repeated                                                                                                                                                                                                                    |
| P3  | Caret, typing, and arrows across a gap              | **Passed** (desktop and phone)                                   | From the last line of page 1, ↓ lands on page 2's first line and ↑ returns, never in a gap. The browser's caret and ProseMirror agree. Typed text lands at the caret and the caret follows it over the gap. A click in a gap never sends the caret to the top of the document. Typing Enter at a page's foot sends the new line straight to the next page's top, never into the margin first (found by the owner, fixed: measured before paint) |
| P4  | Selection and copy across pages                     | **Passed** (desktop)                                             | A mouse drag from page 1 to page 2 copies 386 characters. The copied text equals the document's text for the selection, and the browser's selected text                                                                                                                                                                                                                                                                                         |
| P5  | Undo and redo across a change of pagination         | **Passed** (desktop)                                             | An edit that moves every later break. Undo restores the JSON exactly, and every page's first line with it; redo restores the edited JSON and its breaks                                                                                                                                                                                                                                                                                         |
| P6  | Moving points across pages; nested edits by a break | **Passed** (desktop)                                             | Subpoints 3 and 4, on either side of a break, exchanged with Alt+Shift+↑. The JSON equals the original with the two exchanged, and the moved point carries label "C.". A nested title edited next to the break keeps its words, and the caret is inside page 4's text area                                                                                                                                                                      |
| P7  | A collapsed passage prints at full height           | **Passed** (desktop)                                             | Romans 8 (39 verses), collapsed and then expanded in Regular Layout. In Print Layout, its top (5576), height (2136), and every page's first line are identical. In Regular Layout, collapsed, its verses are not shown                                                                                                                                                                                                                          |
| P8  | No document change from paginating                  | **Passed** (desktop; unit tests too)                             | Switching layout twice, two paper changes, four margin steps, Reset, three window widths, and expanding and collapsing: 15 transactions, **0** with `docChanged`. The JSON is identical, history depth is unchanged (0 → 0), and the breaks are restored. Unit test: six switches, none changing the document, undo still undoing the typing                                                                                                    |
| P9  | Typing cost on the 500-entry outline                | **Measured; real phone not verified**                            | §5. Print Layout is not slower than Regular, on desktop or with phone emulation at 4× CPU slowdown. A pass needs the owner's real-phone confirmation (§7)                                                                                                                                                                                                                                                                                       |
| P10 | Assistive technology and reading order              | **Passed for what can be automated; screen reader not verified** | The page gaps are `aria-hidden` and not editable. The editor's accessibility snapshot is identical in Regular and Print. Tab leaves the editor for the same place in both. No screen reader was used (§7)                                                                                                                                                                                                                                       |
| P11 | The browser's print breaks where the screen does    | **Passed** (Chrome; Letter and A4)                               | `page.pdf` of Print Layout has 8 pages on Letter and 8 on A4, as the screen does. Every page's first printed line is the screen's, exactly (16 of 16). In dark mode the page prints dark ink with no dark band                                                                                                                                                                                                                                  |

**Also verified:**

- **Width.** At window widths 1280, 1024, 700, and 412 (scale 1 to 0.48), every page begins on the same line, with no sideways scroll.
- **The ruler.** Letter is 816 pixels wide, "1" stands at 192 and "6" at 672, half an inch dragged gives 1.5 in, arrow keys step ⅛ in, and both margins survive a reload.
- **The gap cursor** takes no space (the page stays 1,056 pixels tall), and typing there starts a line after the conclusion.
- **Default layout.** Desktop opens in Print and the phone in Regular; a chosen default holds on reload; switching in a tab does not change it.

## 5. Performance and limits

**P9: typing 28 characters at 20 ms into the 500-entry outline.**

| Run                     | Layout  | Typing wall time | Events ≥ 16 ms | Slowest event | Pagination                     |
| ----------------------- | ------- | ---------------- | -------------- | ------------- | ------------------------------ |
| Desktop                 | Regular | 1,061 ms         | 159            | 56 ms         | –                              |
| Desktop                 | Print   | 914 ms           | 161            | 48 ms         | 49 pages; slowest pass 50.3 ms |
| Phone emulation, 4× CPU | Regular | 2,630 ms         | 163            | 216 ms        | –                              |
| Phone emulation, 4× CPU | Print   | 1,997 ms         | 172            | 104 ms        | slowest pass 122.8 ms          |

- **Where the cost is.** While typing, a pass is usually under 1 ms: one layout read, which the browser does before painting anyway.
  - The slowest passes are the first layout of a 49-page document and layout switches.
  - With floats, a line that changes height makes the browser lay out what follows it again. On the 500-entry outline this did not make Print slower than Regular.
  - PS-1B.2A's baseline for the same test was a slowest event of 64 ms.
- **React** renders nothing while typing (6 and 7 renders before and after, unchanged by typing).
- **Bundle** (production build): the editor's code is two chunks, **478.9 KB raw / 150.2 KB gzip**, referenced only by `/lab/editor` (1 of 55 routes). That is 17.6 KB raw (6.8 KB gzip) more than PS-1B.2A.
- **Requests.** Pagination makes none. The stand-in passage view reads chapters through `loadChapter` (deduplicated and cached per tab), only for a passage printed in full or expanded. In production it should read only what is on screen (§G.3).

**Limits of the technique, recorded, not fixed here:**

- No keep-with-next for headings and no widow or orphan control. That is the one-line difference on two pages in P1, and the next printing phase's to add.
- Two explicit page breaks in a row do not make a blank page.
- A single unbreakable block taller than a page would overflow. Schema v2 has none: lists, notes, and passages are lines.

## 6. Dependencies and licensing

- **None added.** Tiptap Pages was excluded (Pro, paid, unapproved).
- **tiptap-pagination-plus is MIT.** Only its technique was used, reimplemented with no copied code.
- **The PDF reader in `tests/lab/pdf-text.ts`** uses `node:zlib` only.

## 7. Checks still owed by the owner

1. **A real phone** (P9 pass, P3 on touch): typing in a long document in Print Layout, the caret across a page gap, IME and autocorrect, and the ruler's handles by touch.
2. **A screen reader** (P10): reading order across a page gap. NVDA on Windows or VoiceOver.
3. **Printing from Safari and Firefox** (P11), and with a real printer. Chrome's print was proven by PDF only.
4. PS-1A's and PS-1B.2A's real-phone checks are still outstanding too.

## 8. The owner's decisions, and requests for the next phases

These are the owner's, from reviewing the lab on 19 October 2026. Each is recorded as said. Each needs a phase; none is built in production.

### 8.1 Layout, pages, and printing

- **Default layout (supersedes this phase's lab setting and amends PS-1B.1 §C.9).**
  - On a **desktop there is only Print Layout**: no Regular Layout and no layout toggle.
  - On a **phone or small screen** the default is Regular Layout, with a toggle to Print Layout.
  - The default lives in **Settings**, not in the editor. The editor shows only the toggle, where there is one.
  - The lab's "Default layout" dropdown, and its Automatic choice, go away when this is built.
- **Paper and margins.**
  - A standard paper size can be chosen, and a default set.
  - Side margins are adjusted at a ruler, as in a word processor, with a good default.
  - The last choice is remembered so that it need not be set again (built in the lab).
  - In production a sermon keeps its own paper and margins (`printDefaults`, §B.9), and the account's default for new sermons follows the last choice. That amends §J's "written only in Settings" for this one value.
- **Page numbers** at the bottom right by default (built).
- **A title and subtitle built into every page.** The owner uses the subtitle for the sermon's text reference ("Book chapter").
  - When there is no title or subtitle, its space collapses and the page has no empty space at the top. With them, the writing moves down to make room.
  - On later pages the title and subtitle show again, noticeably smaller and fainter.
  - This needs a schema change (a document title and subtitle) and Print Layout's running header. It goes with the text-styles work (§8.2).
- **Colour and black-and-white printing.** Many preachers print in colour, but some printers print only black and white. Printing must suit both.
  - PS-1B.1 §B.9's approved **Print without colors** option is the starting point.
  - The print phase should make highlights and colours read well in black and white.

### 8.2 Writing, keys, and styles

- **A text-styles menu** like a word processor's: Normal text (always the default), Title, Subtitle, and Headings. It replaces today's paragraph and heading buttons; Enter never needs a "paragraph mode".
- **Keyboard shortcuts** as in Google Docs, for the most part. The shortcut sentence under the editor is replaced by a help menu, as PS-1B.2A §18 item 9 already plans.
- **Typing starts lists and points:**
  - `1.` then space makes a numbered point;
  - `I.`, `II.`, `i.`, or `ii.` then space makes a point in Roman numerals;
  - `*` then space makes a bullet;
  - Tab then indents to a subpoint.

  Today `1.` and `*` start plain manuscript lists (StarterKit's default), not sermon points. With the Tab decision (PS-1B.2B.4), the keyboard part.

- **Backspace removes points** as in any word processor (built; the owner's decision; supersedes PS-1B.2A §3.6 and §9):
  - in an empty point it removes the point and goes to the end of the line before;
  - at the start of a title it turns the point back into writing, its body staying and its subpoints moving up one level;
  - Backspace again joins that line to the line before;
  - a line break is never joined into a title;
  - each step is one undo.

  `mergeWithPrevious` stays a command; Backspace no longer calls it.

- **The caret at a section's start and end.** It can be put just before or just after any section, as before the introduction.
  - Enter there opens a line.
  - Backspace on that empty line removes it and returns to the end of the section.
  - → and ← now stop there too (built).
  - **Still open:** the owner sees space below the conclusion by default and wants none (§11).

### 8.3 Scripture

- **A selected passage** shows a green outline and offers no action. Its actions come with §G.3:
  - expand and collapse;
  - a print menu (Full / Reference only / Hidden);
  - translation.
- **The expand and collapse button** belongs to Regular Layout. In Print Layout a passage shows as it prints, so the button rests there with a tooltip saying why. Its icon shows what a press does, and it is not coloured as "on" (built).

### 8.4 The application around the editor

- **Outlines home**, after Google Docs' document home but our own:
  - "Start a new outline": blank, or the account's own templates. There are no built-in templates, and accounts can create their own.
  - Recent outlines in a **card view** (the desktop default) or a **list view** (the phone default).

  This changes the production `/outlines` page and needs a templates table, so it needs its own approved phase.

- **The editor page** puts the editor first: its own header (a way back to the application, the document, and its menus) in place of the main navigation. The lab's workspace (§3) is the prototype. In production it needs the shell and route work of PS-4.
- **The editor on a phone** (the owner's Google Docs references):
  - **Reading:** the document opens to be read, with a pencil button to start editing.
  - **Editing:** the top bar has a **check mark** that ends editing (the keyboard goes away and the caret disappears), undo, redo, insert, and more.
  - **Formatting:** a bar above the keyboard holds bold, italic, underline, colours, highlight, alignment, lists, and indent. Its "A" opens a format sheet with **Text** (style, size, colours, clear formatting) and **Paragraph** (alignment, indent, lists, line spacing) tabs.

  With §G.7 and §C.7.

### 8.5 Suggested order

1. The toolbar, text styles, title and subtitle, keyboard shortcuts, typing rules, and the phone editor (§G.7 and PS-1B.2B.4).
2. The passage view (§G.3).
3. The Outlines home and the editor page (their own phase, after PS-2's storage).

## 9. Verdict under PS-1B.1 §G.2

- **The deciding criteria pass in Chrome:** P1, P3, P5, P7, and P8. So do P2, P4, P6, and P11.
- **P9 and P10 pass as far as can be automated.** Their final parts are the owner's (§7).
- **Verdict: the technique is accepted, and Print Layout is built with PS-4/PS-5**, not a dedicated PS-5a.
  - If the owner's checks fail, what fails becomes the scope of a PS-5a.
  - Print Layout stays a product requirement and is never shipped as a decorative approximation.
- **Custom pagination is justified.** It is small; it paginates without transactions, which no library offered; it knows our nodes; and it prints exactly.

## 10. Commands and results

| Command                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/features/editor-lab "src/app/(app)/lab" src/i18n` (final)                                     | 9 files, **325 passed**                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run typecheck` (final)                                                                                       | Passed                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npm run lint` (final)                                                                                            | Passed (exit 0). Two React rules it raised in the new components were fixed first: the portal's target is read with `useSyncExternalStore`, and the ruler keeps a dragged margin in state                                                                                                                                                                                                                                    |
| `npx prettier --check` on the lab, its dictionaries, and `tests/lab` (final)                                      | Passed                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LAB_BASE_URL=http://localhost:3000 npx playwright test -c playwright.lab.config.ts tests/lab/pagination.spec.ts` | **Desktop: 13 of 13 passed** across the final runs of each test. **Phone: 3 of 3 passed** (the rest are desktop-only by design). A later test, "the caret between blocks takes no space", passed when added. Not rerun as a whole after the final section-edge and toolbar changes                                                                                                                                           |
| Same, `tests/lab/editor.spec.ts --grep-invert "sustained writing"` (PS-1A and PS-1B.2A journeys)                  | **Desktop: 5 of 6 passed.** The sixth ("rich titles…") failed once (5 Shift+← selected 3 characters) and **passed 3 of 3 on repeat**; the cause is in §11. **Phone: 1 passed, 1 failed, the rest skipped by the serial suite.** The failure was the test's forced click on a radio button now inside the workspace's scrolling inspector; its helper was changed to click as a person does, and **has not been rerun since** |
| `npm run test:e2e:lab:prod` (`next build`, then `next start` on 3300)                                             | **4 passed**: every `/lab` address is a 404 for a guest and a signed-in account. Fresh build (`.next/BUILD_ID` 19:01:57). Its server stopped (nothing listens on 3300)                                                                                                                                                                                                                                                       |
| Bundle script (scratchpad, read-only, over the build's client manifests)                                          | §5                                                                                                                                                                                                                                                                                                                                                                                                                           |

- **Servers.** The browser tests ran against the owner's own `next dev` on port 3000, which was neither started nor stopped here. The production gate's server was the test's own, and it stopped.
- **Not run:** no migration, no database command, and no Git write.
- **The whole unit suite was not run:** no shared code changed, and `package.json` is unchanged.
- **The 2- and 15-minute writing sessions** were not rerun.

## 11. Known issues left open

1. **Space below the conclusion.** The owner sees space under the conclusion by default, with the caret drawn below its rule when it is there, and wants none. This phase fixed two causes:
   - the caret between blocks took a line of space;
   - the final section kept a bottom margin.

   The owner reports it is still there, so it is **not fixed**. The next phase should settle how a section's edges look (its rules and padding) with the owner, and check it in the owner's browser.

2. **A command right after rapid selection keys can act on a stale selection** (the passage-loading follow-up; corrected by the final verification, §12).
   - **What happens.** Five Shift+← presses sent back to back, then Ctrl+B at once, bold three letters instead of five. The browser's selection is right, but ProseMirror's record of it has not caught up when Ctrl+B arrives, and the command acts on its record. With a pause after each key the selection is always right.
   - **What makes it more likely.** The stand-in passage view inserting verses at the same time.
     - First runs: Regular Layout 2 of 6 wrong; 0 of 8 with the Bible requests held back.
     - Final runs of the PS-1B.2A test "rich titles…": 5 of 5 failed. With verse loading turned off, 1 of 4. With Regular Layout as the default instead of Print, 2 of 4. With the new arrow-key bindings removed, 2 of 3.
   - **What it is not.** It is not caused by Print Layout or by this phase's arrow keys. Whether PS-1B.2A's code fails the same way on this machine today was not checked: that needs the old commit checked out, a Git operation outside this phase.
   - **For §G.3:** the real passage view must not change the DOM under an active selection (insert while idle, or reserve the space first). The editor phase should then check rapid selection followed by a command on a real keyboard.
3. **The editor suite's phone run** passed in the final verification (§12).
4. **Clicking a page gap** leaves the caret where it was (it never jumps to the top). Moving it to the nearest line is a polish for the editor phase.
5. **The lab's settings** (Numbering, Default layout) sit in the editor's header for convenience. They are lab controls, not the product's design (§8.1 removes Default layout).

## 12. Final verification (19 October 2026, after commit `0c26fc5`)

A tightly scoped pass, at the owner's request. No feature, dependency, or unrelated fix was added. The experiments in item 3 were made in place, one at a time, and each was reverted at once: after the pass, the only code difference from `0c26fc5` is the P8 test fix.

1. **The pagination suite** (`tests/lab/pagination.spec.ts`, the owner's development server on port 3000).
   - First full run: desktop 13 of 14, phone 3 of 3 (the rest are desktop-only by design).
   - The failure was **P8, a test defect**. The test pressed "Expand passages in Regular" while in Print Layout, where the owner's change made that button rest under another name. P8 now expands and collapses in Regular Layout, then returns to Print.
   - Rerun: **P8 passed** with 17 transactions, **0 with `docChanged`**, history depth 0 → 0, the JSON identical, and the breaks restored.
   - **Final: desktop 14 of 14, phone 3 of 3.**
2. **The editor-lab regression suite** (`tests/lab/editor.spec.ts`, without the timed writing sessions).
   - **Phone: 5 of 5 passed**, including "inserts a passage…" and "fits a phone…", whose click helper was corrected.
   - **Desktop: 6 of 7 passed** ("stays responsive on a 500-entry outline…" was run separately after the serial suite stopped).
   - **"schema v2: rich titles…" failed**: 5 Shift+← selected 3 letters before Ctrl+B. It also failed 5 of 5 on repeat.
3. **That failure, investigated only far enough to classify it** (§11 item 2).
   - It reproduces in Regular Layout (2 of 4), without the new arrow keys (2 of 3), and less often without verse loading (1 of 4).
   - A trace with a pause after each key selects correctly every time.
   - **Classification:** a timing-dependent lag of ProseMirror's selection behind back-to-back synthetic key presses, made worse by this phase's stand-in passage view loading verses. It is not caused by Print Layout. It is kept as the follow-up the owner asked for, and not fixed here, because the fix belongs to the real passage view (§G.3).
   - It was not proven whether PS-1B.2A's code also fails today on this machine: that needs a Git checkout, outside this phase.
4. **No pagination interaction changes the document or the undo history.** P8 (above). P5: undo and redo restore the JSON exactly. The unit tests: layout, paper, margin, and expansion switches make no `docChanged` and no history entry, and the line-break marks restore exactly on undo.
5. **Development-only isolation:** `npm run test:e2e:lab:prod` on a fresh `next build` (`.next/BUILD_ID` 19:23:55): **4 passed**. Every `/lab` address is a 404 for a guest and a signed-in account; nothing listens on 3300 afterwards. `npx vitest run src/features/editor-lab "src/app/(app)/lab" src/i18n`: **325 passed**.

**Fully passing in Chrome:** P1, P2, P3, P4, P5, P6, P7, P8, and P11.

**Measured, or passing only where automation can reach:**

- P9: typing cost was measured with desktop and phone emulation, but **a real phone is not verified**.
- P10: the gaps are hidden from assistive technology and the reading order and Tab order are unchanged, but **no screen reader was used**.
- P11 outside Chrome: **printing from Safari and Firefox, and with a real printer, is not verified**.

These are the owner's checks (§7).

**Follow-ups kept explicit:**

- the space below the conclusion (§11 item 1);
- the stale selection made worse by verse loading (§11 item 2).

**Ready for commit:** the test fix and this handoff update are ready, and nothing in the pass is a regression the phase must fix. The rich-titles failure is the documented follow-up above.
