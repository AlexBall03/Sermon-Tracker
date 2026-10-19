# Handoff: PS-1B.2A, Canonical Document Architecture Validation

**Status: complete and closed out; ready for the owner's commit** (19 October 2026, on `dev`, uncommitted). The final review (§17) changed two behaviours: point moves (up and down now exchange the point with its neighbour) and Delete before a point (now guarded). Both are tested. No blocker remains.

- **What it is.** The owner split PS-1B.2. This half implements and tests the canonical sermon document, **schema v2**, from `docs/HANDOFF-PS-1B.1.md` §B and §E, in the development-only editor lab (`/lab/editor`, `src/features/editor-lab/`). It covers:
  - the schema;
  - strict validation;
  - the v1 → v2 migration;
  - legacy conversion;
  - node identity;
  - rich point titles;
  - structural editing.
- **Still the lab.** Everything here runs on fixtures only. It has no persistence, no sync, and no database, and it does not touch the production outline editor.
- **Status of the techniques.** The techniques are still **Proposed** in the migration document's sense. This phase gives them evidence and settles nothing for production; PS-2 decides storage.

## Start here

| Need                                        | Where  |
| ------------------------------------------- | ------ |
| What was built                              | §1, §2 |
| Choices made within PS-1B.1's latitude, why | §3     |
| The schema as built and its validator       | §4, §5 |
| Migration and legacy conversion             | §6, §7 |
| Identity and structural behaviour           | §8, §9 |
| Measurements                                | §10    |
| Commands and results                        | §11    |
| Verified versus assumed                     | §12    |
| Open before PS-2                            | §13    |
| What did not change                         | §14    |
| Handoff to PS-1B.2B                         | §15    |
| Owner actions                               | §16    |
| Final review and closeout                   | §17    |
| PS-1B.2B keyboard requirements              | §18    |

## 1. Summary

- **Schema v2** replaces PS-1A's schema in the lab:
  - prose, points, and sections in any order;
  - an optional introduction and conclusion anywhere at the top level, at most one of each;
  - rich point and section titles;
  - `scripturePassage` blocks and inline `scriptureReference`s with translation overrides;
  - `preacherNote`s and `pageBreak`s;
  - color, highlight, and alignment;
  - `doc.attrs.layout` (Outline Layout v1) wrapping the numbering verbatim.
- **One validator, `restoreDocument`**, the single way a document is read. It runs in this order:
  1. version check;
  2. migration;
  3. a walk of the raw JSON, which catches what ProseMirror would silently drop;
  4. the schema;
  5. the invariants.

  It refuses with named codes and JSON-pointer paths, repairs nothing, and never changes its input.

- **An explicit, pure migration from v1 to v2.** Every PS-1A document still loads, including nine documents captured from PS-1A's own converter before any code changed.
- **Legacy conversion updated to v2.** All of PS-1A's guarantees still hold. The projection back to legacy reports every new kind of loss.
- **Identity per §B.6, including copy and paste across documents.** Copied HTML is stamped with the source document's key. A paste from another document, or from nowhere known, is re-keyed throughout.
- **Structural commands** follow §B.5 ownership:
  - move, indent, outdent, top;
  - duplicate;
  - split and merge with rich titles;
  - leaving a point with Enter;
  - a safe Backspace after a point, and a safe Delete before one;
  - turn into section and back;
  - passage blocks and inline references;
  - a guard that refuses a second introduction or conclusion;
  - a paste conversion that turns one into a heading and its content.
- **Per-keystroke work cut.** A change that only touches text no longer walks the document for identity, numbering, or the section guard.

## 2. Files

**Created** (all in `src/features/editor-lab/`):

| File                   | What                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `schema/model.ts`      | Closed lists (version, roles, print values, note kinds, displays, color presets), `pointPresentationSchema` |
| `schema/formatting.ts` | The three approved extensions, extended: `normalizeColor`, preset or `#rrggbb` storage                      |
| `layout.ts`            | `OutlineLayout` v1 data contract (Zod), `layoutFromNumbering`, `layoutNumbering`, `sameJson`                |
| `migrate.ts`           | `migrateDocument`, `migrateV1`                                                                              |
| `clipboard.ts`         | Copy stamp, cross-document re-key, conversion of a second introduction or conclusion, `onNotice`            |
| `changes.ts`           | `isTextOnly`, the shared per-keystroke fast path                                                            |
| `documents.ts`         | v2 fixtures (4 valid, 44 invalid, 1 with an unreadable layout) and their builders                           |
| `fixtures-v1.ts`       | Nine documents exactly as PS-1A's converter wrote them, captured before any change                          |
| `document.test.ts`     | Compatibility, canonical reload, invalid set, versions, colors, keystroke cost (87 tests)                   |
| `structure.test.ts`    | Ownership, moves, the §B.6 identity table, clipboard, sections, boundary keys (31 tests)                    |

**Modified:**

- **Schema and validation:** `schema/nodes.ts` (rewritten for v2), `schema/scripture.ts` (the passage block; translation and display), `schema/extensions.ts`, `validate.ts`.
- **Behaviour:** `identity.ts`, `numbering.ts`, `outline-commands.ts`, `legacy.ts`, `load.ts`.
- **Tests:** `testing.ts`, `editor.test.ts`, `legacy.test.ts`.
- **Lab UI:** `components/editor-lab.tsx`, `components/toolbar.tsx`, `components/side-panel.tsx`, `lab.css`.
- **Outside the lab folder:** `src/i18n/dictionaries/{en,es}/editorLab.ts`, `tests/lab/editor.spec.ts`, `package.json`, and `package-lock.json`.

`fixtures.ts` is unchanged. Its `powerOfGodsWord` stays a v1 document and is migrated when it loads.

## 3. Choices made within PS-1B.1's latitude

Each choice is Proposed and reversible. None of them reopens an approved decision.

1. **All three approved extensions were installed now.**
   - Schema v2 declares `textStyle{color}`, `highlight{color}`, and `textAlign`, and the validator must check them.
   - The color and alignment controls are still PS-1B.2B (§15).
2. **Colors are normalized on parse** (§B.7). Without this, pasted HTML would put values into the document that the validator then refuses.
   - Stored: a preset key, or lowercase `#rrggbb`.
   - Mapped: `#rgb` and opaque `rgb()` become `#rrggbb`.
   - Anything else (`var()`, named colors, `hsl()`, a translucent value) gives no mark. The text is kept.
   - A plain `<mark>` is a highlight in the preset `yellow`, and Mod+Shift+H gives the same.
3. **`OutlineLayout` is a data contract only.**
   - Only `layout.numbering` changes what is shown. The other fields are validated and kept.
   - An unreadable layout loads with an `invalid_layout` warning and is kept verbatim (§D.1). The lab replaces it only when a person chooses a numbering.
4. **Lists and quotations hold only ordinary blocks.** No point, section, passage block, note, or page break goes inside one.
   - §B.2's `flow` would have let a passage or note inside a list item or quotation; invariant 4 names only points.
   - Narrow now and widen later is the cheap direction (§B.11: widening needs no migration).
5. **A section has no default role.** A section that names no role is refused rather than silently read as an introduction.
6. **Boundary keys.** §B.4 says these are "to be checked with writers".
   - **Enter at the very start of a non-empty title** opens an empty point _before_ it. A literal split would have moved the title's words to a new ID while the body kept the old one.
   - **Backspace at the start of a block straight after a point or section** moves the cursor to the end of the point's last text, removing the line if it was empty. ProseMirror's default selects the whole point, so a second Backspace would delete it with all its subpoints.
   - **Delete at the end of a block straight before a point or section** moves the cursor to the start of its title, removing the line if it was empty. This is the mirror of Backspace, added in the closeout (§17.3), because the same default would select the point and a second Delete would remove it.
   - **Shift+Enter in a title does nothing.** Found in testing: Tiptap's hard-break command otherwise splits the title and pushes the rest into a body paragraph.
7. **The cross-document key (`documentKey`) is editor state, never document content.** It is set by `loadDocument`. In the lab it is the fixture plus a counter. In PS-2 it would be the stored document's ID.
8. **`isTextOnly`** is true when every step is a mark step or a replace inside one textblock that neither inserts nor removes an identified node. On such a change:
   - identity and the section guard skip;
   - numbering maps its decorations instead of rebuilding them.

## 4. Schema v2 as built (`schema/nodes.ts`, `scripture.ts`, `formatting.ts`)

```
doc               (block | scripturePassage | preacherNote | outlinePoint | sermonSection | pageBreak)+
                  attrs schemaVersion (2), layout, translation (null | kjv | rvg), legacyOutlineId, legacyRevision
sermonSection     sectionTitle (block | scripturePassage | preacherNote)*
                  attrs id, role (no default), legacyEntryId, legacyRevision, derivedFrom
outlinePoint      pointTitle (block | scripturePassage | preacherNote | outlinePoint)*
                  attrs id, sourcePointId, derivedFrom, legacyEntryId, legacyRevision, legacyParentId, presentation
pointTitle, sectionTitle   (text | scriptureReference)*   marks: bold italic underline textStyle highlight
scripturePassage  atom block   id, book, chapterStart, verseStart, chapterEnd, verseEnd, translation, print (full | reference | hidden)
scriptureReference inline atom id, the five numbers, translation, display (reference | text)
preacherNote      (paragraph | bulletList | orderedList)+   id, kind (7), print (show | hide | null)
pageBreak         atom block, top level only
block             StarterKit: paragraph, heading 2–4, bulletList, orderedList, blockquote; textAlign on paragraph and heading
```

- **No link, code, or strike mark**, and no line break in a title.
- **No verse text anywhere.** A translation is only ever an ID.
- **A sermon point and a numbered manuscript list are different node types.** The numbering engine counts only points (tested: two points numbered, three list items not).
- **Passage blocks, notes, and page breaks render simply for now.** A passage shows its reference, a note has a neutral rail, and a page break is a dashed line. The node view and the expansion are 2B.

## 5. Validation (`validate.ts`)

`restoreDocument(json, schema)` returns `{ ok: true, doc, warnings, migratedFrom }` or `{ ok: false, problems }`. Each problem is `{ code, path?, detail? }`, where `path` is a JSON pointer into the document. The codes:

| Code                                                                 | When                                                                                                                                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_a_document`                                                     | Not an object with `type: "doc"`                                                                                                                                                              |
| `invalid_version`                                                    | `schemaVersion` missing, not an integer, or below 1. Nothing is guessed                                                                                                                       |
| `unsupported_version`                                                | Newer than 2. Never read as older                                                                                                                                                             |
| `unknown_node`, `unknown_mark`, `unknown_attribute`, `unknown_field` | Found in the raw JSON before ProseMirror would drop or refuse them (a v1 `numbering` on a v2 document is `unknown_attribute`)                                                                 |
| `schema`                                                             | `nodeFromJSON` or `check()` fails: a point in a list, quotation, note, or section; a section in a point; a page break in a point; a line break in a title; a missing title; an empty document |
| `missing_id`, `duplicate_id`                                         | An identified node without an ID, or one ID twice                                                                                                                                             |
| `duplicate_section`                                                  | A second introduction or conclusion, wherever it is                                                                                                                                           |
| `invalid_attribute`                                                  | A closed list (role, print, kind, display, translation, heading level, alignment), `presentation` (§D.3 schema), or a provenance field of the wrong type                                      |
| `invalid_color`                                                      | Not a preset or lowercase `#rrggbb`, or a `textStyle` with no color                                                                                                                           |
| `invalid_reference`                                                  | A passage that does not exist, or one not in normal form (`referenceFrom`)                                                                                                                    |
| `too_many_entries`                                                   | More than `outlineLimits.entries` points and sections. An interim lab bound; PS-2 sets the real limits                                                                                        |
| `invalid_layout` (warning)                                           | The layout does not parse. It is loaded and kept verbatim                                                                                                                                     |

- **Dropped from PS-1A:** the per-entry limit of ten passages. In v2 that limit applies only to a legacy entry, so the projection reports it as `over_limit`.
- **`loadDocument` changes nothing when it refuses.** It leaves the editor exactly as it was (tested against every invalid fixture).
- **The lab loads through the validator too.** Its first document is loaded with `loadDocument`, not passed to `useEditor` directly.

## 6. Migration (`migrate.ts`)

The v1 → v2 step is pure, never lowers a version, and returns the same object when the document is already current. It does the following:

- `numbering` becomes `layout = layoutFromNumbering(numbering)`, verbatim, and `translation: null` is added.
- `sermonIntroduction` and `sermonConclusion` become `sermonSection` with a role. `entryTitle` becomes `sectionTitle` or `pointTitle`.
- A point gains `presentation: null`.
- `entryPassages` becomes `scripturePassage` blocks straight after the title, each keeping its ID, with `print: "reference"` and `translation: null`.
- An inline reference gains `translation: null` and `display: "reference"`.
- An empty document gets one empty paragraph. v2 needs at least one block, and an empty top-level paragraph holds nothing.

**Proven:**

- each of the nine captured PS-1A documents migrates to exactly what the v2 converter writes for the same outline, and both project to the same legacy entries;
- PS-1A's mixed sermon keeps every word, mark, and ID.

## 7. Legacy conversion (`legacy.ts`)

- **`legacyToDocument` writes v2.** Everything else is unchanged from PS-1A:
  - order by `orderEntries`;
  - exact IDs and revisions;
  - notes one paragraph per line;
  - `sourcePointId` and `legacyParentId`;
  - its issues and refusals.

  The new parts:

  - sections become `sermonSection` nodes, where `orderEntries` shows them;
  - passages become `scripturePassage` blocks, printed as references;
  - the numbering becomes `layout.numbering` verbatim, even when it does not parse (it is still reported);
  - an empty outline becomes one empty paragraph.

- **`documentToLegacy`** is a reporting projection. It writes nothing and takes a `locale` (default `en`) for a reference's label in a title. It keeps PS-1A's losses and adds:
  - `title_marks`;
  - `title_reference` (the label is added to the title text);
  - `passage_print`, `passage_translation`, and `passage_position` (a passage after the body began; it still maps);
  - `section_position`;
  - `note` and `page_break` (with their words);
  - `layout` (anything beyond the numbering);
  - `color`, `alignment`, `translation` (the document's), and `presentation`.

  Nothing is dropped unreported, and a document with losses is not forced into legacy shape.

- **Every PS-1A legacy test still passes**, adapted only for the new names (73 tests):
  - deep-equal entries;
  - zero losses;
  - deterministic and idempotent;
  - fourteen notes-whitespace cases, through JSON and through the editor;
  - malformed rows;
  - a duplicate section refused;
  - labels equal to `numberOutline(orderEntries(…))` for all seven presets and the custom style.

## 8. Identity (`identity.ts`, `clipboard.ts`)

The §B.6 table, with what tests it. Unit tests are in `structure.test.ts` and `editor.test.ts`.

| Event                                     | Node ID                             | Legacy provenance | `derivedFrom` | `sourcePointId` | Test                                                                                                                                 |
| ----------------------------------------- | ----------------------------------- | ----------------- | ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Move, indent, outdent, top, undo, reload  | Kept with descendants               | Kept              | Kept          | Kept            | ownership tests; "keeps IDs through a save and a reload"                                                                             |
| Duplicate, or copy and paste in-document  | Original keeps; copy new throughout | Cleared on copy   | The original  | Kept            | "duplicates a point…", "a copy of a converted point…", "a copy pasted in the same document…"                                         |
| Cut and paste in-document                 | Kept                                | Kept              | Kept          | Kept            | "…a cut and paste keeps its IDs"                                                                                                     |
| Paste from another document, or from none | New throughout                      | Cleared           | Cleared       | Kept            | "inserts a converted point into another document…", "re-keys rich content…", "treats pasted HTML that names no document as foreign…" |
| Split                                     | First keeps; second new             | Second cleared    | Second: first | Second none     | "splits a rich title…"                                                                                                               |
| Merge                                     | First survives; second retired      | Survivor's        | Survivor's    | Survivor's      | "merges a point into the one before…"                                                                                                |
| Insert a saved point                      | New                                 | None              | None          | The point's ID  | "inserts the same saved point twice…"                                                                                                |
| Turn into section and back                | Kept                                | Kept              | Kept          | Cleared         | "turns a point into a section and back…"                                                                                             |

- **A copy also clears `legacyParentId`**, so legacy provenance stands on one node only. The projection of a duplicated converted outline has no duplicate legacy ID.
- **Inline references and passages keep their IDs** when a split moves them.
- **A pasted introduction or conclusion the document already has** becomes a level-2 heading followed by the section's content, and the editor is told. In the lab, a notice line shows this from the dictionaries. Where the document has none, the pasted one stays a section with new IDs.
- **A section pasted inside a point** is placed by ProseMirror at the top level, after the point is closed around it. Every word is kept (tested).

## 9. Structure (`outline-commands.ts`)

- **Ownership.** A point carries its title, body, passages, notes, and subpoints through every move, indent, outdent, move to the top, duplicate, and delete-then-undo. This was checked by comparing each subtree's JSON. Prose and sections between points stay where they were.
- **Up and down exchange the point with its neighbour** (changed in the closeout, §17.2). The point trades places with the adjacent sibling point, and whatever lies between them (prose, a section, a page break) keeps its place and its order. So down undoes up, a point never leaves its parent this way, and each move is one undo step. Indent, outdent, and the move to the main points are unchanged.
- **Enter.** In a title:
  - at its end, Enter opens the body after the passages under the title;
  - inside it, Enter splits the point;
  - at its start, Enter opens a point before it.

  Enter on an empty last line of a point or a section moves that line out, after it. This is how a person writes after a subpoint or after the conclusion.

- **Backspace and Delete.** At a title's start, Backspace merges with the previous sibling point only when that point is directly before it. Otherwise nothing changes (tested with prose before the title). Backspace after a container and Delete before one behave as in §3.6.
- **The section guard** (`filterTransaction`) refuses any change that would make a second introduction or conclusion. Turning a point into a section is refused for:
  - a subpoint;
  - a point with subpoints;
  - a point with its own numbering;
  - a role the document already has.
- **Lab controls added:**
  - **Duplicate point** in the toolbar;
  - **Insert passage** (a block after the current line, printed in full) and **Insert inline reference** in the Insert panel.

  Turning into a section or a point exists as a command only; menus are 2B (G.7).

## 10. Measurements

These are from a development server (Chrome headless through Playwright, this machine), the owner's own `next dev` on port 3000, and one run each. They are not production timings.

| Measure                                               | PS-1B.2A                                                   | PS-1A (for comparison)         |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| Requests while typing (desktop)                       | 0 from the editor; 0 from the shell in this run            | 0 from the editor              |
| Navigation to editor ready                            | 2.48 s wall                                                | 2.4–2.9 s                      |
| 500-entry outline: JSON size                          | 195,898 bytes                                              | 167,975 bytes                  |
| 500-entry: `getJSON`                                  | 0.22–0.32 ms                                               | 0.14–0.28 ms                   |
| 500-entry: state from JSON                            | 1.8–3.8 ms                                                 | 1.4–2.4 ms                     |
| 500-entry: numbering passes, 28 characters and 1 move | **1** (one pass, 2.9 ms, for the move)                     | 29                             |
| 500-entry: typing 28 characters at 20 ms              | 0.95 s wall; slowest input event 64 ms; 167 events ≥ 16 ms | 0.94–1.01 s; 40–64 ms; 165–174 |
| React renders of the lab while typing                 | 0 (5 before, 5 after)                                      | 0                              |
| Editor client bundle (production build)               | One chunk, **461.3 KB raw / 143.4 KB gzip**                | 428.1 / 134.7 KB in two chunks |
| Routes whose client manifest references it            | **1 of 55** (`/lab/editor`)                                | 1 of 55                        |

- **The JSON grew about 17%** on the 500-entry outline. Every paragraph carries `textAlign: null`, every passage and point carries its new attributes, and the layout is stored in full. PS-2 should weigh this when it sets limits. Snapshots are still far below the 4.5 MB body limit.
- **The bundle grew by 33 KB raw / 8.7 KB gzip**, for the three extensions and the new code. It is still confined to the lab route.
- **The input delay was not measured on a phone**, a production build, or a low-end device.

## 11. Commands and results

| Command                                                                                                                | Result                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm view @tiptap/extension-{text-style,highlight,text-align}@3.31.4 version license peerDependencies` and `time`      | 3.31.4; MIT; peer `@tiptap/core` 3.31.4; published 2026-09-30 (19 days before install)                                                                                                                                                                       |
| `npm install --save-exact` the three                                                                                   | Installed with no peer warning and no `--force`. `npm ls` shows each at 3.31.4                                                                                                                                                                               |
| `npx vitest run src/features/editor-lab "src/app/(app)/lab" src/i18n` (final, after the closeout)                      | 8 files, **300 passed**: document 87, legacy 73, editor 44, structure 31, availability 13, page 2, i18n 47, locales 3                                                                                                                                        |
| `npm run test -- --maxWorkers=4` (the whole suite, because `package.json` changed; run before the closeout)            | 148 files: 147 passed, 1 failed to load; **2,395 tests passed, 0 failed**. The failure is `src/features/preferences/preferences.test.ts`, which is pre-existing and unrelated (§17.5). Not rerun after the closeout, whose changes are lab-only              |
| `npm run typecheck`                                                                                                    | Passed (0 errors)                                                                                                                                                                                                                                            |
| `npm run lint`                                                                                                         | Passed (0 problems)                                                                                                                                                                                                                                          |
| `npx prettier --check` on every changed and created file (final)                                                       | Passed. `ARCHITECTURE.md` is the exception: it was already unformatted at HEAD, and this phase adds one table row to it without reformatting the file                                                                                                        |
| `LAB_BASE_URL=http://localhost:3000 npx playwright test -c playwright.lab.config.ts --grep-invert "sustained writing"` | **12 passed, 4 skipped** by design (desktop-only and phone-only tests), both before and after the closeout. This includes "schema v2: rich titles, leaving a point with Enter, and a paste between documents" and the keyboard moves of "renumbers on move…" |
| `npm run test:e2e:lab:prod` (`next build`, then `next start --port 3300`)                                              | **4 passed**, before and after the closeout. Every `/lab` address is a 404 for a guest and for a signed-in account. Each build was fresh (`.next/BUILD_ID` 14:16:53, then 14:50:04)                                                                          |
| Bundle script (scratchpad, read-only, over the build's chunks and client manifests)                                    | §10                                                                                                                                                                                                                                                          |

**How the browser tests ran:**

- **The dev server was the owner's.** Their `next dev` was already running on port 3000 and holds Next's one-per-folder development lock. So the lab journeys ran against it through `LAB_BASE_URL`, sending page requests only. It was neither started nor stopped here.
- **The production gate's server was the test's own.** Playwright started the server on port 3300 and stopped it; nothing listens on 3200 or 3300 afterwards.
- **No migration ran.** The gate runs `next build`, not `npm run build`.
- **The 2-minute and 15-minute writing sessions were not rerun.** They measure save cadence, which 2A did not change.

## 12. Verified, and not verified

**Verified by the tests above:**

- **The PS-1A documents still load.** Every one migrates to valid v2 without loss, and the legacy round trip keeps all its PS-1A guarantees.
- **Every v2 fixture reloads exactly.** For each one, `restoreDocument(f).doc.toJSON()` equals `f`; `getJSON → load → getJSON` is stable; and its own HTML parses back to the same document, which is the path of copy and paste inside the application.
- **The invalid set is refused cleanly.** Each of the 44 invalid documents is refused with its code (and a path where one applies), the input is deep-frozen and unchanged, and the editor is left as it was.
- **The rest of the behaviour holds:**
  - the §B.6 identity table, cross-document paste included;
  - the boundary keys;
  - the section guard;
  - mark and color preservation through split, merge, duplicate, and paste;
  - the normalization of foreign colors;
  - that the editor always writes version 2;
  - that a v3 document is refused.
- **In a real browser** (desktop Chrome; Pixel 7 emulation for the phone tests):
  - bold in a title;
  - Enter leaving a subpoint;
  - a passage block inserted and printed in full;
  - a cross-document paste of a passage re-keyed and stamped;
  - the reload check after it;
  - no editor request while typing;
  - no sideways scroll on a phone;
  - the 404 gate.

**Not verified, or assumed:**

- **A real phone, IME, autocorrect, or touch selection.** These are still the owner's checks, from PS-1A and again here.
- **Copy and paste with a real system clipboard and real applications' HTML.** Pastes were simulated with `ClipboardEvent`s carrying HTML, and in unit tests with `view.serializeForClipboard` and `view.pasteHTML`.
- **The cross-document paste of a whole point in the browser.** It was proven in unit tests through ProseMirror's own clipboard path. In the browser only a passage block was pasted across documents.
- **The stamp's survival through a real clipboard.** It is assumed that browsers and the system clipboard keep `data-ps-document` on HTML copied within one page. Chrome does in the simulated path. If a platform strips it, the paste is treated as foreign and re-keyed, which is the safe side.
- **Undo of a paste conversion as one step.** It is assumed from ProseMirror's history, not tested on its own.
- **How presets look.** They have no theme tokens yet (2B), so a preset color is stored and validated but drawn in the default color.

## 13. Open before PS-2

1. **Moving past prose: resolved in the closeout** (§17.2). Up and down exchange the point with its neighbour.
2. **Boundary keys.** Enter at a title's start, Backspace after a point, Delete before one, and Shift+Enter in a title (§3.6, §17.3) are retained. They need checking with writers, ideally on a real phone (§18).
3. **Size and limits.** The canonical JSON is about 17% larger than v1 (§10). PS-2 sets the limits (invariant 9) and could decide whether default-valued attributes are stored.
4. **Containers.** Lists and quotations hold no passage block or note (§3.4). Confirm, or widen in a later version.
5. **`documentKey` is the storage ID.** PS-2 should make the stored document's ID the editor's `documentKey`, and decide whether another tab or device holding the same document counts as "the same document" for paste. Today it does when the key matches.
6. **The source-point side table (§E.3).** It is unchanged: `sourcePointId` is still only a hint in JSON, and the side table is PS-2's. Copies keep the hint across documents, as §B.6 says, to be verified on save.
7. **The Outline Layout's defaults** (`defaultLevel`) are placeholders until the 2B engine and presets give them meaning. Changing them before PS-2 stores anything costs nothing, but after PS-2 it changes what `layout` loss reports.

## 14. What did not change

- No production data, database, migration, schema file (`src/db`), server action, API route, or sync or offline code was touched or run.
- No shell, layout, or proxy file changed.
- `src/features/outlines` and the production outline editor were only imported, as before (`numbering.ts`, `tree.ts`, `editor/moves.ts`, `model.ts`).
- The lab's access rules are unchanged (proxy 404 outside development, `labAvailable`, `requireActiveUser`), and the gate was proven again on a fresh production build.
- The only new dependencies are the three approved Tiptap extensions.
- Nothing is staged or committed, and no earlier handoff was edited.

## 15. Handoff to PS-1B.2B

PS-1B.2B builds on this schema and must not change it without a reason recorded here. Its scope is PS-1B.1 §G items 2, 3, 4 (the UI), 5, 7, and 8, and the real-phone check (item 9). In order:

**First: G.2, the bounded editable-pagination feasibility investigation.** It is the largest open risk (PS-1B.1 §F risk 6), and its verdict decides between PS-4/PS-5 and a dedicated PS-5a.

- Time-boxed as PS-1B.1 §G.2 says: it ends when P1–P11 each have a recorded result, or one fails in a way the spike cannot fix. It is not built to production quality.
- Use one editor instance, switched to Print Layout by a meta transaction.
- Its fixtures can use `sectionsAnywhere` (explicit page breaks) and the 500-entry document, plus a paragraph longer than a page and a whole-chapter passage.
- P8 ("no `docChanged`") can follow the pattern of `isTextOnly` and `numberingStats`.

**Then the editor-experience validation:**

- **G.3, the `scripturePassage` node view.** Build the chevron, the expansion plugin state, and Expand/Collapse All, with no `docChanged` and no history. Rendering by `print` is already stored on the node, as is the effective translation (`passage.translation ?? doc.translation ?? the account's`). Then measure Psalm 119 and a whole book. `ScripturePassageNode` currently renders only its label.
- **G.4, the color controls.**
  - Build the split buttons, Custom…, and Reset.
  - Add preset theme tokens (`--ink-*`, `--mark-*`) in `globals.css`, rendered from `data-color`.
  - Run the light and dark checks.
  - Validation and paste mapping already exist (`formatting.ts`).
- **G.5, the Outline Layout engine.** Build `layoutLabels`, section markers, restarts from `presentation.restartAt`, the presets (Classic Sermon), and the minimal panel. The contract and its validation are in `layout.ts`. Numbering already reads `layout.numbering`.
- **G.7, the responsive toolbar and menus.** Point menus need to expose the existing commands: turn into section or point, duplicate, and move to top. The toolbar's enabled-state checks should stop walking the point rows on every change (§17.6). Keyboard standardization, the requirements in §18, belongs here.
- **G.8, the stand-in docked panel.**
- **G.9, the owner's real-phone check**, including the boundary keys and the moves (§3.6, §9).

## 16. Owner actions

1. **Review and commit** this phase's files (§2) and the updated documents (`ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `AGENTS.md`).
2. **Real-phone check**, as in PS-1A §15. Use the "The Lamp and the Path" fixture: typing in a rich title, Enter at the end of a subpoint's last line, and selection across a passage block.
3. **Decide §13 items 2 and 4**, or leave them to PS-1B.2B's writer checks.
4. **Decide the Tab question in §18** before PS-1B.2B builds keyboard behaviour. It touches an approved rule.
5. **Authorize PS-1B.2B.**

PS-0C.1's manual notification check is still outstanding and was not touched.

## 17. Final review and closeout (19 October 2026)

### 17.1 Review against the acceptance criteria

| Criterion                                                     | Evidence                                                                                                                                 | Result |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Schema v2 supports the approved unified structure             | §4; the four v2 fixtures (mixed, sections anywhere, manuscript only, outline only) load, and every node type in them is exercised        | Met    |
| Valid documents round-trip without loss                       | `document.test.ts`: `toJSON` equals the input, `getJSON → load → getJSON` is stable, and the editor's own HTML parses back exactly       | Met    |
| Invalid documents are refused without repair                  | 44 invalid fixtures, each refused with its code; inputs deep-frozen and unchanged; the editor untouched on refusal                       | Met    |
| Legacy compatibility guarantees kept                          | `legacy.test.ts` (73) unchanged in substance; the nine captured PS-1A documents migrate to exactly the v2 converter's output             | Met    |
| Node identity and source-point provenance                     | The §8 table, row by row                                                                                                                 | Met    |
| Structured editing keeps owned content                        | Subtree-JSON comparisons through every move, indent, outdent, duplicate, split, merge, and delete-then-undo                              | Met    |
| Unsupported versions are refused                              | v3 refused (`unsupported_version`); a missing or malformed version refused; migration never lowers a version; the editor always writes 2 | Met    |
| The lab stays isolated from production                        | The production 404 gate, run twice on fresh builds; the editor chunk is referenced only by `/lab/editor` (1 of 55 routes)                | Met    |
| No unnecessary database, infrastructure, or production change | §14; `git status` shows only lab files, the lab's dictionaries and spec, the package files, and documentation                            | Met    |

### 17.2 Point movement: changed to an exchange

**Before the closeout** (PS-1A's rule), on the smallest case `A, prose P, B`:

| Step        | Document  |
| ----------- | --------- |
| Start       | `A  P  B` |
| Move B up   | `B  A  P` |
| Move B down | `A  B  P` |

The second move did not undo the first. The prose ended up after both points, so a move changed unrelated content (principles 3 and 4). Undo restored everything, so nothing was ever lost.

**Now**, up and down exchange the point with the adjacent sibling point. What lies between them keeps its place and its order:

| Step        | Document  |
| ----------- | --------- |
| Start       | `A  P  B` |
| Move B up   | `B  P  A` |
| Move B down | `A  P  B` |

**Why this reading, and not something more elaborate.** The prose belongs to the parent (PS-1B.1 §B.5), so it stays in its slot between the two points rather than travelling with either one. This is the owner's preferred direction and needs no new semantics.

- **The trade-off.** Prose written as a transition into B ("Now, secondly…") still sits between the two points after the exchange, so it now introduces A. That is visible and editable, and it is never silent absorption into a point. Writers can confirm it in PS-1B.2B (§18).
- **The implementation** is two replacements in one transaction, inside `movePoint`. `moveTarget` and `planMove` still decide whether the move is allowed. Indent, outdent, and the move to the main points are unchanged.

**Tests** (`structure.test.ts`):

- the smallest case, with undo and redo;
- a section in the middle of the document;
- subpoints inside their parent, past the parent's own prose (and the last one never leaves its parent);
- five up-and-down rounds that keep hierarchy, IDs, numbering, content, and the cursor exactly;
- the existing ownership tests.

The browser test of keyboard moves ("renumbers on move…") passes unchanged.

### 17.3 The keyboard behaviours: all three retained, one mirror added

**A. Enter at the start of a non-empty title opens a point before it: retained.**

- It is what a word processor does at the start of a list item (Word, Google Docs): a new empty item appears above, and the text and cursor stay where they were.
- The point keeps its ID, its words, and everything it owns.
- Tested: "Enter at the start of a title opens an empty point before it…".

**B. Backspace straight after a point moves into the point: retained.**

- It protects nested content. ProseMirror's default selects the whole point, so a second Backspace deletes it with all its subpoints.
- The cursor lands at the end of the point's last text, where Backspace then edits normally, as in a word processor at the boundary of a block.
- Tested, including two presses.

**Mirror added: Delete before a point.** The review found the same hazard on the other side, and confirmed it: Delete at the end of prose straight before a point selected the point, and a second Delete removed it with its subpoint. `deleteBeforeContainer` now moves the cursor to the start of the point's title, removing the line if it was empty. It is narrow (the end of a textblock, followed by a point or section), and it is tested with two presses.

**C. Shift+Enter in a title does nothing: retained.**

- A title is one semantic line (§B.4), with no line break.
- Splitting the title instead (Tiptap's default) would push the rest into a body paragraph without being asked.
- Tested.
- Whether a quiet no-op should also give a hint is a PS-1B.2B discoverability question (§18).

No other keyboard behaviour changed.

### 17.4 Remaining architectural risks relevant to PS-2

These carry over from §13 and PS-1B.1 §F, unchanged by the closeout:

- **`sourcePointId` is only a hint in JSON.** Referential integrity needs the side table (§E.3).
- **The document's size grew about 17%.** PS-2 sets the limits and may choose not to store default-valued attributes.
- **`documentKey` must become the stored document's ID.**
- **Newer documents must be read-only to older code, and sync must refuse them** (§B.11, §E.7 item 5). The validator refuses them in the lab; PS-2 and PS-3a must enforce it on the server and in the queue.

### 17.5 The failing test file: pre-existing and unrelated

- **The file:** `src/features/preferences/preferences.test.ts`. It fails to load, so none of its tests run.
- **The error:** `[vitest] No "deleteIdentity" export is defined on the "@/features/admin/clerk" mock`.
  - The path is `preferences.test.ts` → `src/features/admin/actions.ts` → `src/features/account/live.ts`.
  - `live.ts` imports `deleteIdentity` from the clerk module, which the test replaces with a mock that lacks it.
- **Reproducible:** yes. `npx vitest run src/features/preferences/preferences.test.ts` gives the same error every time.
- **It predates this phase.**
  - The test file was last changed in `116cdea` (12 October 2026).
  - `deleteIdentity` came with account deletion in `1bdb340` (16 October 2026), and the test's mock was not updated.
  - PS-1A recorded the same error on 19 October (`docs/HANDOFF-PS-1A.md` §13).
- **This phase does not contribute to it.** `git diff HEAD` shows no change in `src/features/preferences`, `src/features/admin`, `src/features/account`, or `src/features/auth`, and nothing in the import chain reaches the editor lab.
- **Left outside this phase.** The fix is one line in the test's mock and belongs to whoever next works on that area.

### 17.6 Efficiency review

| Area                             | Finding                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-keystroke traversal          | Identity and the section guard skip text-only changes (`isTextOnly`). The 29 → 1 numbering result is preserved; the keystroke test still asserts no rebuild and no identity pass                                                                                          |
| Numbering                        | Rebuilt only on a structural change, and its decorations are mapped while typing                                                                                                                                                                                          |
| Validator                        | Runs only when a document is loaded (opening a fixture, the Checks button), never per transaction                                                                                                                                                                         |
| Serialization                    | `getJSON` only in the lab's simulated save meter (900 ms coalesced, unchanged from PS-1A) and its inspection buttons                                                                                                                                                      |
| React renders                    | 0 while typing (measured)                                                                                                                                                                                                                                                 |
| **Toolbar enabled-state checks** | **The one cost left.** The toolbar's `useEditorState` selector asks seven commands whether they can run on every change, and each walks the point rows. PS-1A had six; Duplicate adds one. Typing latency matched PS-1A (§10). Left for G.7's toolbar, not optimized here |
| Imports and bundle               | The three extensions only; one chunk, confined to `/lab/editor`                                                                                                                                                                                                           |
| JSON size (+17%)                 | Not a defect: a 500-point outline is 196 KB, far below the 4.5 MB request limit, and a typical sermon is a few KB. PS-2 decides whether default-valued attributes are stored                                                                                              |

### 17.7 Changes made in the closeout

- `outline-commands.ts`:
  - up and down moves exchange the point with its neighbour;
  - `deleteBeforeContainer` is new, bound to Delete;
  - the module comment is updated.
- `structure.test.ts`: the move tests are rewritten for the exchange, and three move tests and two Delete tests are added (31 in total).
- This handoff's status line, §1, §3.6, §9, §11, §13, §15, §16, and §17–18.

Final verification is §11 (rows marked "final" or "after the closeout").

## 18. PS-1B.2B keyboard requirements

Recorded now and built in PS-1B.2B, with the toolbar and menus (§G.7). The lab's shortcuts today work but are unconventional and not discoverable. The aim is the conventions of established word processors and rich-text editors.

1. **Conventional editing.**
   - Selection, cut, copy, paste, undo (Ctrl/Cmd+Z), redo (Ctrl/Cmd+Shift+Z, and Ctrl+Y on Windows), and formatting (Ctrl/Cmd+B, I, U) behave as in Word and Google Docs.
   - Word-wise movement and selection (Ctrl/Alt+arrows) is left to the platform.
2. **Platform-aware modifiers.** "Mod" is Cmd on macOS and iPadOS and Ctrl elsewhere, and every label shows the right one for the platform.
3. **Predictable keys at boundaries:**
   - Enter, Shift+Enter, Backspace, and Delete behave as §3.6 and §9 describe, consistently in points, sections, lists, notes, and prose.
   - A key that does nothing in a place (Shift+Enter in a title) is predictable and, where it helps, explained.
4. **Tab and Shift+Tab: an Open Decision for the owner first.**
   - Conventional editors indent and outdent list items and outline points with Tab and Shift+Tab.
   - Two approved rules say Tab is never taken: `AGENTS.md` for the outline editor, and PS-1B.1 §C.5 "for accessibility", where Tab leaves the editor.
   - Recommendation: Tab and Shift+Tab indent and outdent _only_ in a point title or a list item, with a documented way out of the editor (Escape then Tab, as in VS Code and Google Docs' accessibility mode), and Tab left to the browser everywhere else. That changes an approved rule, so the owner decides before it is built.
5. **Context-sensitive indentation.** The same indent and outdent commands act on a list item inside a list and on a point otherwise (today's `indent` and `outdent` already do), from the keyboard, the toolbar, and the menus.
6. **Keyboard point movement.**
   - Alt+Shift+↑/↓ moves a point (as Word moves paragraphs), using the exchange of §17.2.
   - Check Alt+Shift+→/← for indent against the Tab decision.
   - Ctrl+Enter for "add point" conflicts with nothing in browsers but is unconventional. Reconsider it against §C.5's Mod+Shift+Enter.
7. **Lists and points alike.** A numbered manuscript list and a sermon point respond to the same keys in the same way where the action means the same thing (indent, outdent, move, Enter on an empty line to leave).
8. **No reserved shortcuts.**
   - Never take a browser or OS shortcut: Ctrl/Cmd+T, W, N, L, R, D, P, F, H, J, K, Shift+Tab outside the cases in item 4, F-keys, Alt+F4, Cmd+Q, Cmd+H, Cmd+M.
   - Never use Ctrl+Alt+letter (AltGr on Spanish and other layouts, §C.5).
   - Check the extensions' defaults: Highlight's Mod+Shift+H, and TextAlign's Mod+Shift+L, E, R, and J. Ctrl+Shift+J opens DevTools in Chrome.
9. **Discoverability.**
   - Every toolbar button and menu item shows its shortcut in its tooltip and menu, from one table.
   - **One shortcut reference.** A single list in code drives the keymap, the tooltips, the menus, and a help dialog opened from the toolbar and with Mod+/, in both languages.
   - The permanent shortcut sentence under the lab's editor (`editorLab.shortcuts`) is replaced by that help mechanism.
10. **Focus outside the editor.** Tab and Shift+Tab move between the page's controls in the normal order, the toolbar is one Tab stop with arrow-key movement inside it (the ARIA toolbar pattern), and Escape returns from a menu or popover to the editor.
11. **Mobile and external keyboards.**
    - The same shortcuts work with a hardware keyboard on a tablet or phone.
    - Without one, every action is reachable from the accessory bar, the selection bubble, or a point's action sheet (§C.7). Nothing is keyboard-only.
12. **Accessibility.**
    - Everything is usable by keyboard alone.
    - Shortcuts are exposed to assistive technology (`aria-keyshortcuts` where they apply).
    - Moves and structural changes are announced politely ("Point moved up").
    - Checked with a screen reader in the real-phone and desktop checks.

Nothing in this list was built in PS-1B.2A.
