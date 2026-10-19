# Handoff — PS-1A: Rich-Text Editor Feasibility Prototype

**Status: Complete as a prototype** (19 October 2026, on `dev`, uncommitted). One owner action is outstanding: a check on a real phone (section 15). Nothing here is production-ready, and nothing was staged, committed, pushed, merged, or deployed.

PS-1A built a development-only editor lab at `/lab/editor`. It tests whether Tiptap/ProseMirror can hold one sermon document that is both a structured outline and a manuscript, without losing what the outline system guarantees today.

The lab works from fixtures only. It has no schema, migration, database read or write, persistence, sync, or queue, and the legacy outline editor is untouched.

Everything this phase decided about the document schema and node identity is a prototype choice for PS-1B to judge. None of it is an approved architecture (migration document §§3.3, 6.3).

## 1. Implementation summary

- **Unified document.** A Tiptap editor holds one document:
  - an introduction (optional, first) and a conclusion (optional, last);
  - outline points nested to any depth;
  - ordinary manuscript blocks (paragraphs, headings, lists, quotations, bold/italic/underline) at the top level and inside points.
  - Points are real nested nodes (`outlinePoint`), not styled paragraphs or list items.
- **Numbering.** Labels come from the outline's own engine: `orderEntries` and `numberOutline`, unchanged.
  - They are drawn as a decoration attribute shown by CSS. They are never in the document, its JSON, or a copy.
- **Identity.** Every point, section, and passage has a node ID. One `appendTransaction` step keeps the IDs unique after every change.
  - Provenance travels with the node: `legacyEntryId`, `legacyRevision`, `sourcePointId`, `derivedFrom`, and `legacyParentId`.
- **Scripture.** One inline atom node holds the five numbers of `ScriptureReference`.
  - It is validated with `scriptureReferenceSchema` and labelled with `formatReference`.
  - It is used both in prose and in an entry's passages block.
- **Legacy conversion.** A pure adapter converts a legacy outline into a document and back, and reports anything it cannot carry.
  - Outline → document goes through `orderEntries`; the result is in `issues`.
  - Document → outline lists what a legacy entry cannot hold in `losses`.
- **Isolation.**
  - The proxy answers every `/lab` address with 404 outside development, before Clerk or the database.
  - The page refuses again with `notFound()`, then calls `requireActiveUser()`.
  - The route is absent from navigation, routes, the sitemap, and the tour, and is marked noindex.

## 2. Files

### Created

| File                                                                               | Purpose                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/editor-lab/availability.ts`                                          | `labAvailable`, `isLabPath`, and `labGuard` (the proxy's 404).                                                                                                                                           |
| `src/features/editor-lab/schema/nodes.ts`                                          | The document schema: `doc` (with attributes `numbering`, `schemaVersion`, `legacyOutlineId`, `legacyRevision`), `sermonIntroduction`, `sermonConclusion`, `outlinePoint`, `entryTitle`, `entryPassages`. |
| `src/features/editor-lab/schema/scripture.ts`                                      | The `scriptureReference` node and `referenceFrom` (validation and normal form).                                                                                                                          |
| `src/features/editor-lab/schema/extensions.ts`                                     | `labExtensions` (StarterKit with code, code block, rule, link, strike, and trailing node off) and `labSchema`.                                                                                           |
| `src/features/editor-lab/numbering.ts`                                             | `documentRows` (the document's points read back as `TreeRow`s), `documentLabels`, and the numbering plugin.                                                                                              |
| `src/features/editor-lab/identity.ts`                                              | The identity plugin, `assignIds` (the same rules on JSON), and `duplicateIds`.                                                                                                                           |
| `src/features/editor-lab/outline-commands.ts`                                      | Move, indent, outdent, add, split, merge, and insert passage, built on `moveTarget` (`outlines/editor/moves.ts`) and `planMove` (`tree.ts`). Also the keymap.                                            |
| `src/features/editor-lab/legacy.ts`                                                | `legacyToDocument`, `documentToLegacy`, and `shownOutline`.                                                                                                                                              |
| `src/features/editor-lab/validate.ts`                                              | `restoreDocument`: schema, passages, limits, unique IDs, and numbering.                                                                                                                                  |
| `src/features/editor-lab/fixtures.ts`                                              | Legacy fixtures (empty, minimal, sections, nested, custom, reused points, passages, whitespace, malformed, 500-entry stress), the mixed sermon, and frozen saved points.                                 |
| `src/features/editor-lab/load.ts`, `measure.ts`, `testing.ts`, `lab.css`           | Loading JSON into a fresh state, local instrumentation (simulated 900 ms coalesced save), test helpers, and styles (semantic tokens).                                                                    |
| `src/features/editor-lab/components/{editor-lab,toolbar,side-panel}.tsx`           | The lab interface.                                                                                                                                                                                       |
| `src/features/editor-lab/{legacy,editor,availability}.test.ts`                     | Unit tests (section 12).                                                                                                                                                                                 |
| `src/app/(app)/lab/editor/page.tsx`, `page.test.tsx`                               | The page and its guard test.                                                                                                                                                                             |
| `src/i18n/dictionaries/{en,es}/editorLab.ts`                                       | Interface words in both languages.                                                                                                                                                                       |
| `playwright.lab.config.ts`, `playwright.lab-prod.config.ts`, `tests/lab/config.ts` | The lab's separate Playwright configurations: a development server, and the production gate.                                                                                                             |
| `tests/lab/editor.spec.ts`, `tests/lab/production.spec.ts`                         | Browser journeys, and the production 404 gate.                                                                                                                                                           |
| `docs/HANDOFF-PS-1A.md`                                                            | This file.                                                                                                                                                                                               |

### Modified

| File                                     | Change                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/proxy.ts`                           | Three lines at the top of `proxy`: `labGuard(pathname)`. Nothing else changed.                                                |
| `src/i18n/dictionaries/{en,es}/index.ts` | Export `editorLab`.                                                                                                           |
| `package.json`, `package-lock.json`      | Four exact Tiptap dependencies, plus scripts `test:e2e:lab` and `test:e2e:lab:prod`. The lockfile is for the owner to commit. |
| `docs/PREACHER-STUDIO-MIGRATION.md`      | PS-1A status and the verified notes in §§6.3, 13, and 15.                                                                     |
| `docs/ROADMAP.md`, `AGENTS.md`           | PS-1A status, and the handoff listed.                                                                                         |

Untouched: the legacy outline editor, its store, `tree.ts`, `numbering.ts`, `moves.ts`, every schema and migration, the sync and offline code, and the main `playwright.config.ts`.

## 3. Dependencies and licensing

**Direct dependencies.** All are pinned exactly:

- `@tiptap/core` 3.31.4
- `@tiptap/pm` 3.31.4
- `@tiptap/react` 3.31.4
- `@tiptap/starter-kit` 3.31.4

**Choice of version.** 3.31.4 (30 September 2026) is the newest release that is at least two weeks old. 3.32.0 was six days old on the day of installation.

**Compatibility.**

- `@tiptap/react` declares `react`/`react-dom` `^17 || ^18 || ^19` and is used with React 19.3.0 and Next 16.4.0.
- It installed with no peer warning. No `--force` or `--legacy-peer-deps` was used, and no framework package changed.

**License.** The install added 47 packages, and every one is MIT. They are:

- the Tiptap core and its extensions;
- the ProseMirror packages, `orderedmap`, `rope-sequence`, and `w3c-keyname`;
- `fast-equals`, `use-sync-external-store` types, and `linkifyjs`.

**ProseMirror duplicates.** `npm ls` shows one version each: `prosemirror-model` 1.25.12, `-view` 1.42.6, `-state` 1.4.4, and `-transform` 1.12.2.

**Not used.** No paid or Pro extension, cloud or collaboration service, editor template, or `@tiptap/extension-unique-id` (identity is the lab's own small plugin, so its rules can be tested exactly).

**Disabled but still installed.** `@tiptap/extension-link` and `linkifyjs` are installed through StarterKit even though the link extension is turned off.

## 4. What the prototype demonstrates

| Requirement (§15.5)                                                                                          | Result                                                                                                                                               | Evidence                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Manuscript: paragraphs, headings, emphasis, lists, quotations; undo/redo                                  | Works                                                                                                                                                | `editor.spec.ts` (bold, italic, underline, undo, redo); unit undo/redo of a move |
| 2. Outline: introduction, conclusion, nesting, keyboard indent and outdent without Tab, moving with children | Works. Alt+Shift+arrows move, indent, and outdent. Tab leaves the editor and changes nothing.                                                        | unit "moving points"; e2e "renumbers…" (Tab check included)                      |
| 3. Mixed document                                                                                            | Works: prose inside points, between points, and around sections                                                                                      | "The Power of God's Word" fixture; schema tests                                  |
| 4. Scripture node                                                                                            | Works: valid inserted, invalid refused, survives nearby edits, deleted whole, serializes, pastes; an impossible passage from HTML becomes plain text | unit "Scripture references"; e2e insert and paste                                |
| 5. Numbering by the engine                                                                                   | Matches `numberOutline(orderEntries(…))` exactly for all seven presets plus a custom style, on every fixture; renumbers on move                      | unit "numbering"; e2e                                                            |
| 6. Identity under paste, duplicate, split, merge                                                             | Holds, as section 8 describes                                                                                                                        | unit "identity"; e2e paste                                                       |
| 7. Round trip                                                                                                | Exact for every well-formed fixture, including notes whitespace; `getJSON` → load → `getJSON` is stable                                              | `legacy.test.ts`; unit "JSON round trip"                                         |
| 8. Copy and paste                                                                                            | Nested points within the document (re-keyed), plain text, and rich HTML from outside, through ProseMirror's own clipboard handlers                   | e2e "copies and pastes…"                                                         |
| 9. Usability                                                                                                 | Desktop and Pixel 7 emulation pass. **A real phone was not tested** (owner action).                                                                  | e2e mobile                                                                       |
| 10. Efficiency                                                                                               | Measured (section 11)                                                                                                                                | e2e measurements; bundle script                                                  |

## 5. Canonical document model findings (Proposed; for PS-1B)

**Schema.**

```
doc               sermonIntroduction? (outlinePoint | block)* sermonConclusion?
section           entryTitle entryPassages? block*
outlinePoint      entryTitle entryPassages? (block | outlinePoint)*
entryTitle        text*                (no marks)
entryPassages     scriptureReference*
```

**What held.**

- ProseMirror's content expressions enforce the section rules on every edit and on load: at most one introduction (first), at most one conclusion (last), and no point inside a section.
- A title-less point or a point inside a list is refused (tested).
- Points are true tree nodes, so the tree semantics of `tree.ts` (parent, position among sibling points) read back directly from the document.

**Structural restrictions this prototype imposes.** Each could limit manuscript writing; PS-1B should decide on each.

- **Point titles are plain text.** They have no bold, italic, or inline passage, as a legacy title has none.
- **Nothing before the introduction and nothing after the conclusion.** There is no epigraph, title block, or postscript outside them.
- **Sections hold no points.** An introduction cannot have numbered sub-structure.
- **Points cannot sit inside a list, quotation, or heading.** A point ends a list.
- **Prose may follow a point's subpoints, and prose may sit between main points.** The document allows both, but neither fits a legacy entry, so `documentToLegacy` reports them (`interleaved_prose`, `top_level_block`).
- **Moving a point jumps over prose between sibling points.** The prose stays where it was.
- **Key behaviour in a title:**
  - Enter at its end opens a notes paragraph.
  - Enter inside it splits the point.
  - Backspace at its start merges the point into an immediately preceding sibling point.
  - These choices may surprise writers and are untested with real users.
- **An empty document needs one empty paragraph** for the cursor. An empty top-level paragraph holds nothing and is not reported as a loss.
- **No drag and drop for points** (`draggable: false`). Every move goes through commands.

## 6. Legacy outline conversion results

- **Well-formed fixtures.** Nine fixtures were tested: empty, minimal, sections, nested (six levels), custom numbering, reused source points, ten passages, notes whitespace, and 500-entry stress. For each:
  - Conversion has no issues, and is deterministic (byte-identical JSON on repeat) and idempotent (`toDoc(toLegacy(toDoc(x))) ≡ toDoc(x)`).
  - The way back has **no losses**, and its entries are **deep-equal** to the originals: IDs, parents, types, positions, titles, notes, passages and their order, revisions, and `sourcePointId`.
  - The order, depth, path, and labels of the converted document equal `orderEntries`/`numberOutline` on the original rows.
- **Notes.** Each line is one paragraph, and an empty line is an empty paragraph. `null` notes give no paragraph; `""` gives one empty paragraph, so the two stay distinct.
- **Whitespace: exact round trip demonstrated, not assumed.** Fourteen cases are character-for-character equal, both through JSON and through a live editor (load → `getJSON`):
  - null, `""`, and one line;
  - blank lines, several consecutive blank lines, and only newlines;
  - leading and trailing spaces, a leading newline, a trailing newline, and only spaces;
  - tabs and spaces at line ends;
  - `\r\n`, U+2028, and a no-break space.
  - The whitespace fixture (including a padded title) also returns deep-equal through the editor.
- **Whitespace limitations:**
  - The guarantee is for document state (JSON and editor state). Text that passes through HTML is normalized by the browser and ProseMirror's parser, so spaces collapse and `\r` is lost. That covers clipboard copy and paste, and any future HTML export.
  - A `\r` from a `\r\n` note survives as a character at the end of a paragraph's text. It is invisible but kept.
  - Ordinary editing changes notes by its nature: Enter inside a paragraph adds a `\n` in legacy terms.
- **Malformed rows.** A point under the introduction, an orphan parent, a two-point loop, and a shared position are each shown exactly as `orderEntries` shows them:
  - The point is placed as a main point, and the parent its row named is kept on the node as `legacyParentId`.
  - Each case is reported (`section_parent`, `orphan_parent`, `cycle`, `duplicate_position`).
  - On the way back, those points become main points and the shared position is written apart. That is **not** what was stored, but it is exactly what was shown. The test asserts the difference.
- **Duplicate sections.** Two introductions are **refused** (`duplicate_section`) rather than dropped.
- **Invalid numbering.** A numbering configuration the engine refuses is reported and kept verbatim, not replaced.
- **Losses.** Everything in a document that a legacy entry cannot hold is listed in `losses`, with its words where it has any:
  - marks, lists, headings, and quotations;
  - prose outside a point;
  - an inline passage in prose;
  - a hard break;
  - prose after subpoints;
  - anything over a limit.
  - Nothing is dropped silently. The mixed sermon fixture shows each kind of loss.

## 7. Numbering compatibility

- **The engine is reused unchanged.** The document's points are read back as `TreeRow`s (parent = enclosing point, position = index among sibling points), then passed to `orderEntries` and `numberOutline` with the document's `numbering` attribute.
- **No ordinary-list workaround.** Ordered lists number only manuscript lists.
- **Tested against the engine:**
  - all seven presets, plus a custom style with a `POINT ` prefix, a `:` suffix, a composite level (`I.a.1.`), and `repeat` overflow from level 2;
  - deep nesting (six levels, with `(1)` at level 6 under traditional);
  - overflow;
  - every fixture, including the malformed and 500-entry ones;
  - renumbering after move, indent, and outdent.
- **Changing the configuration** is one undoable transaction (`setDocAttribute`). It changes labels only. The document is otherwise deep-equal, and switching back restores it exactly.
- **Labels are never in the document.** They are not in the JSON, `getText()`, or copied text. The label is the title's `data-label`, shown by CSS `::before` as text only, so a prefix or suffix can never become markup.
- **Cost.** The labels are worked out again on every change to the document. That took 1–2 ms on the 500-entry outline in a development build (section 11).

## 8. Node identity and source attribution

**Three identities stay separate:**

- `id` is the document-node ID.
- `legacyEntryId`, with `legacyRevision`, records provenance from `outline_entries`.
- `sourcePointId` names the saved point.
- A converted node's `id` equals its `legacyEntryId` (§6.3).

**Behaviour shown in tests:**

- IDs are unique after every transaction, and stable through JSON save and reload.
- A move, indent, or outdent keeps the node's ID and the IDs of everything under it. So does undo or redo.
- **Paste or duplicate:** the node that was there before keeps its ID, found by mapping its old position through the change. The copy gets a new ID, `derivedFrom` set to the original, and `legacyEntryId`/`legacyRevision` cleared, but keeps `sourcePointId`. This holds whether the copy lands before or after the original, for a whole pasted subtree, and for HTML that carries the IDs.
- **Split:** the first part keeps its ID and legacy provenance. The second part gets a new ID and `derivedFrom`.
- **Merge:** the first point's node and ID survive. The second ID is retired, and its title, passages, notes, and subpoints are appended.
- **Inserting the same saved point twice:** two nodes with distinct IDs and the same `sourcePointId`. Editing one leaves the other alone. The frozen fixture is unchanged (checked by deep comparison).
- **`assignIds`:** applies the same rules to JSON before a load. The first occurrence of an ID keeps it.

**The trade-off of clearing `legacyEntryId` on a copy.** This was the prototype's choice; the question is Open (§6.3).

- **For:** a legacy entry ID then stands for exactly one node. Conversion back to entries is unambiguous, and a future migration or sync can never write two nodes to one `outline_entries` row.
- **Against:**
  - A copy loses direct lineage to its entry. It is recoverable only through `derivedFrom`, and only while the original node exists, or because a converted node's ID equals its entry's.
  - "Copy, then delete the original" looks like a move to a person, but it changes identity. A cut and paste keeps the ID only because it never has two copies at once.
  - When the original's position cannot be mapped (a paste that replaces a range around it), the first occurrence in document order keeps the ID. That is a heuristic.
- **Alternatives for PS-1B/PS-2:**
  - Keep `legacyEntryId` on copies and choose a canonical holder at conversion.
  - Move provenance out of node attributes into a side table keyed by node ID.

**Relational integrity is not solved by this prototype.**

- `sourcePointId` is a JSON attribute here. **It is not a replacement for `outline_entries.source_point_id`'s foreign key (`ON DELETE SET NULL`).** Nothing in JSON stops it naming a deleted or foreign idea.
- The guarantee could be kept with the side table the migration document proposes: node ID → point ID, owner, and an FK with `SET NULL` semantics, written in the same transaction as the document save.
- Choosing that is deferred to PS-2.

**Still unresolved:**

- node-ID scope (per document or global);
- copy between sermons (keep IDs or re-key);
- whether a passage node needs a stable ID at all, or only its position;
- how a split or merge should move `sourcePointId` (this prototype gives a split's second part none);
- how revisions map to nodes.

## 9. Scripture node behaviour

- **Shape.** One node type, `scriptureReference`: an inline atom with `id` plus `book`, `chapterStart`, `verseStart`, `chapterEnd`, and `verseEnd`.
  - Only the normal form (`normaliseReference`) of a passage that exists (`scriptureReferenceSchema`) is accepted.
  - No verse text or translation is stored.
  - The label ("John 3:16", "Psalm 23", "Genesis 1:1–2:3", "Jude 3") is drawn from the numbers in the interface's language.
- **Inline and block coexist cleanly** because they are the same node:
  - in prose it is inline;
  - in an entry's `entryPassages` block it is an entry's ordered passage list, limited to ten and round-tripping exactly to legacy `references`.
  - Inserting from a title adds to the passages block; inserting in prose places it inline.
  - **Preferable:** the passages block for anything that must map to a legacy entry, and inline nodes only for manuscript prose. Inline passages are reported as a loss on the way back to legacy.
- **Shown in tests:**
  - insertion and refusal of an invalid passage, both as a typed reference (`parseReference`) and as attributes;
  - the label in the DOM, but not in the JSON;
  - serialization and reload;
  - survival when the text around it is edited;
  - selection and deletion as one unit;
  - rich paste of a valid chip;
  - an impossible chip ("John 99:1") pasted as plain words;
  - plain-text copy as its label.
- **No database Bible lookup.** Validation uses the static versification tables.

## 10. Desktop and mobile usability

- **Desktop:**
  - a sticky toolbar of 15 controls with `aria-pressed`, which never takes focus from the text on a press;
  - a fixture selector;
  - a numbering selector built on the app's `Select`;
  - a side panel for JSON, Checks (reload and legacy round trip), Legacy (issues and losses), Insert (saved points, passages), and Measure.
  - The writing area is a 72-character column in the serif face.
- **Mobile (Pixel 7 emulation):**
  - no horizontal page overflow at load, with each panel open, or on the six-level fixture;
  - toolbar controls are 44 px or more;
  - tap to focus, typing, keyboard selection, and the Bold control all work;
  - indentation shrinks on narrow screens and stops growing after eight levels (CSS only).
- **Not tested:** a real phone's virtual keyboard, IME and autocorrect, touch selection handles, or the installed application (section 15).

## 11. Performance and bundle observations

**Measured.** Each figure below was measured once or a few times on this machine against a **development** server (unminified React and Tiptap), with Chrome headless through Playwright. Production builds should be faster; that was not measured, because the lab is a 404 there by design.

| Measure                                                                               | Result                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation to editor ready (signed in, dev)                                           | 2.4–2.9 s wall; the editor is created about 1.0–1.2 s after navigation start (`performance.now`)                                                                                                                                                                 |
| 500-entry outline: JSON size                                                          | 167,975 bytes                                                                                                                                                                                                                                                    |
| 500-entry: `getJSON`                                                                  | 0.14–0.28 ms (mean of 5; Chrome coarsens timers to about 0.1 ms, so treat as below 0.3 ms)                                                                                                                                                                       |
| 500-entry: build a state from JSON (`nodeFromJSON` + `EditorState.create`)            | 1.4–2.4 ms                                                                                                                                                                                                                                                       |
| 500-entry: one numbering pass                                                         | 1.0–2.0 ms; one pass per document change (29 passes for 28 characters and one move)                                                                                                                                                                              |
| 500-entry: typing 28 characters with a 20 ms key delay                                | 0.94–1.01 s wall. The slowest input event (Event Timing, input to next paint) was 40–64 ms. About 165–174 entries were at least 16 ms, the API's minimum threshold, which most frame-bound events reach                                                          |
| React renders of the lab's own tree while typing                                      | **0** (4 before, 4 after). The toolbar rendered 3 times across typing and a move, only when its displayed state changed                                                                                                                                          |
| Network while typing                                                                  | **No request from the editor.** In one of four runs, the shell's offline agent fetched `/api/bible/package/kjv/1` (§15.2 trade-off), reported separately                                                                                                         |
| Two-minute writing session (123 s, 21 sentences, 1,680 characters, pauses of 1.2–4 s) | 21 simulated 900 ms coalesced saves (one per pause), 92,568 bytes in total, ending at a 5.2 KB document                                                                                                                                                          |
| Fifteen-minute writing session                                                        | 906 s, 156 sentences, 12,480 characters: **156 simulated coalesced saves** (one per pause, about 10.3 a minute), **1,530,048 bytes** in total (mean 9.8 KB a save), the document growing to 16,008 bytes; the lab rendered 3 times in all and never while typing |
| Bundle (production build, `next build`)                                               | The lab adds 2 client chunks found on no other route: **428.1 KB raw / 134.7 KB gzip**. Of that, Tiptap/ProseMirror is one chunk of 420.4 KB / 131.7 KB, and the lab's code 7.7 KB / 3.0 KB                                                                      |
| Bundle isolation                                                                      | The editor chunk is referenced by **1 of 55** route client manifests (`/lab/editor`). `/dashboard`, `/library`, and `/outlines/[id]` contain no ProseMirror code                                                                                                 |

**Qualitative observations:**

- `shouldRerenderOnTransaction: false`, with `useEditorState` selectors, kept React out of the typing path. The panels read the document only when asked.
- The numbering pass and the toolbar's `can()` checks each walk the outline's points on every change or selection. That is linear in points, and cheap at 500, but a candidate for skipping when a change stays inside one text block.
- Each simulated save serializes the whole document. At 5–170 KB per save, a snapshot-per-pause cadence would send about 4.4 KB per pause for a short sermon, and 168 KB for a 500-entry one.

**Implications, not implemented:**

- **Local-first drafts.** A durable local draft should be written on the same coalesced cadence, separately from cloud saves (§4.2).
- **Debounced cloud saves.** Snapshot saves are simple but scale with document size, while ProseMirror steps are small. Snapshot versus patches remains Open (PS-1B/PS-3); patches need a server that can rebase steps.
- **Version history and conflicts.** Node IDs make field-level merges by node possible (like today's per-entry merge). Structure changes need a document-level revision, as `sermon_outlines.revision` has today.

## 12. Tests executed and exact results

| Command                                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/features/editor-lab "src/app/(app)/lab" src/i18n`                                                                 | 6 files, **192 passed**: `legacy.test.ts` 73, `editor.test.ts` 54, `availability.test.ts` 13, `page.test.tsx` 2, `i18n.test.ts` 47, `locales.test.ts` 3                                                                                                                                                                                                                     |
| `npm run test -- --maxWorkers=4` (whole suite, because the proxy is shared)                                                           | 146 files: **145 passed, 1 failed to load**; **2,292 tests passed, 0 failed**. The failure is `src/features/preferences/preferences.test.ts`, which is pre-existing and unrelated (section 13)                                                                                                                                                                              |
| `npm run typecheck` (`next typegen` + `tsc --noEmit`)                                                                                 | Passed                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run lint`                                                                                                                        | Passed (0 problems)                                                                                                                                                                                                                                                                                                                                                         |
| `npx prettier --check` on every created or changed file                                                                               | Passed                                                                                                                                                                                                                                                                                                                                                                      |
| `LAB_BASE_URL=http://localhost:3000 npx playwright test -c playwright.lab.config.ts`                                                  | Desktop: all **7** desktop tests passed across runs, including the 2-minute session and copy and paste. Mobile: **5 passed**. Phone-only and desktop-only tests are skipped by design in the other project. Final re-run of the finished spec without the session: **11 passed, 3 skipped**                                                                                 |
| Same, `LAB_SESSION_SECONDS=900 --grep "sustained writing"`                                                                            | **1 passed** (15.2 min); results in section 11                                                                                                                                                                                                                                                                                                                              |
| `npx playwright test -c playwright.lab-prod.config.ts` (**acceptance gate**: `npx next build` then `npx next start --port 3300`)      | **4 passed.** Guest: HTTP **404** for `/lab`, `/lab/`, `/lab/editor`, `/lab/editor/`, `/lab/editor?fixture=stress`, and `/lab/anything/else`, with no editor in the page. **Signed in as the active development account: 404 for every one**, while `/dashboard` answered 200. `/`, `/library`, and `/labs` were unchanged. The build was fresh (`.next/BUILD_ID` 10:49:28) |
| `npx playwright test tests/e2e/public.spec.ts tests/e2e/auth.spec.ts --workers=3` (main config, unchanged, because the proxy changed) | **75 passed, 1 skipped**                                                                                                                                                                                                                                                                                                                                                    |
| Bundle script (scratchpad, read-only, over the build's client reference manifests)                                                    | Section 11                                                                                                                                                                                                                                                                                                                                                                  |

**Notes on how the browser tests ran.**

- The owner's own `next dev` was already running on port 3000 and holds Next's one-per-folder dev lock (`.next/dev/lock`). So the lab journeys ran against it through `LAB_BASE_URL`, sending page requests only. It was neither started nor stopped here.
- Without `LAB_BASE_URL`, `npm run test:e2e:lab` starts its own `npm run dev` on port 3200.
- Every server started for this phase (3100 and 3300) was stopped by Playwright, and nothing listens on 3100, 3200, or 3300.
- **Accounts.** `E2E_CLERK_USER_EMAIL` **is set** in `.env.local`, so PS-0C's note that it was empty is out of date. The signed-in tests used that existing admitted development account through `@clerk/testing`. The lab created, changed, and deleted nothing on the server.
- **Database.** No migration ran. The gate's build was `npx next build`, with no migration step. The main suite's own `npm run build` includes `migrate deploy`, which by its code (`scripts/db/cli.mjs`) does nothing unless `VERCEL_ENV=production`; it was unset. No production system was contacted.

## 13. Tests blocked or not executed

- **A real phone** (virtual keyboard, IME and autocorrect, touch selection handles, the installed app): not available here. It is the owner action in section 15.
- **Copy and paste with a real system clipboard** from Word or Google Docs: simulated with real `ClipboardEvent`s carrying HTML and plain text through ProseMirror's handlers. Real applications' HTML varies.
- **A 30-minute session:** a 15-minute session was run (section 11). 30 minutes was not.
- **Performance in a production build:** not measured, because the lab is a 404 there by design.
- **The whole main end-to-end suite:** not run. The proxy change was checked with its guest specs and the production gate. The signed-in main specs do not reach `/lab`.
- **`npm run format:check` (whole repository):** reports 662 files. This is **pre-existing and unrelated**: `core.autocrlf=true` checks files out with CRLF, and Prettier expects LF. For example, `vercel.json` passes with `--end-of-line crlf`. Every file this phase created or changed passes.
- **`src/features/preferences/preferences.test.ts`:** fails to load, which is **pre-existing**. Its mock of `@/features/admin/clerk` lacks `deleteIdentity`, which `src/features/account/live.ts` (account deletion, an earlier commit) imports. None of its files were touched here, and it was not fixed (outside PS-1A).

## 14. Architectural risks and limitations

- **Production readiness.** The prototype is not production-ready. It has no persistence, sync, offline, conflict handling, accessibility audit, or IME testing.
- **Section 5 restrictions.** These are real constraints on manuscript writing that PS-1B must accept or relax. Relaxing one, such as prose after subpoints, makes the legacy mapping lossy.
- **Identity rules are heuristics.** They hold for the transactions tested; a rare transaction shape could pick the "wrong" holder of an ID, which is still unique and safe. The provenance semantics of copies are Open.
- **`sourcePointId` in JSON has no referential integrity.** Section 8 covers this.
- **Malformed legacy rows normalize on the way back.** Their stored parent is kept only as a node attribute. A production migration must decide to repair or refuse them.
- **Work on every change.** Numbering and toolbar checks walk all points per change or selection. That is fine at 500 entries in this measurement, but not profiled on a low-end phone.
- **Bundle cost.** 131.7 KB gzip for the editor, loaded only on the editor route.
- **Inherited shell activity.** The lab lives in the `(app)` shell, so its agents (the offline Bible download, the notification bell) run there, as §15.2 accepts.

## 15. Outstanding owner actions

1. **Real-phone check.** With `npm run dev` running, open `/lab/editor` on a phone on the same network (or through the installed app in development), and check:
   - typing with the virtual keyboard and autocorrect;
   - selection handles across a point title and its notes;
   - the toolbar's Bold, Add point, Indent, and Undo;
   - pasting from another app;
   - that the page never scrolls sideways.
2. **Review and commit** `package.json`, `package-lock.json`, and the new files, if the prototype is accepted.
3. **Decide in PS-1B:** the section 5 restrictions, the copy-provenance rule (section 8), node-ID scope, and snapshot versus patches.
4. **Optional:** run the 30-minute session (`LAB_SESSION_SECONDS=1800`).

PS-0C.1's own manual notification check is still outstanding and was not touched here.

## 16. Recommendation

**Adopt Tiptap/ProseMirror as the editor foundation, and revise the candidate document schema in PS-1B before PS-2 builds on it.**

**Shown by evidence:**

- The outline's guarantees were kept with the existing engines unchanged. That covers ordering through `orderEntries` and numbering through `numberOutline`, for presets and custom styles, with no ordinary-list workaround.
- Unique, stable node IDs held under move, paste, split, merge, undo, and reload.
- Legacy outlines converted and returned exactly, whitespace included, with every loss and normalization reported.
- Scripture nodes were validated by the existing utilities.
- The lab's React tree did not render while typing, and the editor made no request.
- The editor's cost is 131.7 KB gzip, confined to its own route.
- Production exclusion was proven against a real build, for a guest and a signed-in account.

**Not yet shown:**

- real-phone touch and IME behaviour;
- production-build performance on low-end devices;
- the persistence, sync, and conflict design;
- referential integrity for source points;
- whether writers accept the structural restrictions.

These are the conditions on the recommendation, and the reason it is not "production-ready".

**Revisions for PS-1B to consider:**

- allow marks in point titles (and decide how they map to legacy);
- decide whether prose after subpoints and between main points is a first-class part of the model, accepting that the legacy mapping becomes one-way;
- settle copy provenance;
- move `sourcePointId` integrity to a side table (PS-2);
- limit per-change work to structural changes.

No PS-1B, PS-2, migration, sync, or rebranding work was started.
