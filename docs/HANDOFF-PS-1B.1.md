# Handoff — PS-1B.1: Product Experience & Flexible Document Architecture

**Status: Closed** (19 October 2026, on `dev`, uncommitted). This was an architecture and product-design milestone, and the owner approved its product architecture and design direction.

- **Documentation only.** No code, schema, migration, package, configuration, or database changed, and no server was started.
- **Nothing here is tested implementation.** Every statement about behavior is a specification: PS-1B.2 validates it and later phases build it. The only implemented and verified work in the program is PS-0C.1's notification change and PS-1A's development-only lab (`docs/HANDOFF-PS-1A.md`).

**Status labels** follow the migration document:

- **Approved:** decided by the owner. Binding. The sources are:
  - the PS-1B.1 brief;
  - its follow-up, "Final Product Decisions: Scripture Display, Editor Layouts & Passage Interaction";
  - the "Consolidated Product Decisions & Architecture Follow-Up". That follow-up adds the application-wide Workspace Panel, the Dictionary, AI extensibility, and the state boundaries, and it prevails where the three conflict.
  - the closing approval (19 October 2026): Tiptap/ProseMirror; one unified document for outline, manuscript, and hybrid writing; flexible structure with the introduction and conclusion anywhere; structured points and subpoints; rich text with colors and highlighting; customizable Outline Layout; stable node identities and source-point provenance; structured KJV/RVG Scripture; Scripture expansion independent of print presentation; the per-passage chevron; expansion preferences; full passages without preview caps; Regular and Print editing layouts; the application-wide, extensible Workspace Panel with resizing, tool tabs, and contextual opening; a future English/Spanish Dictionary; a possible AI tool, approved separately; local-first autosaving; backward compatibility and data protection; efficient use of Vercel and Neon; and the use of the three Tiptap extensions in PS-1B.2 (G).
- **Proposed:** this handoff's implementation techniques (schemas, attribute names, thresholds, algorithms). The direction they serve is Approved. Each technique still needs the validation named beside it, in PS-1B.2 or in the phase that builds it, and none is proven by being written here.
- **Deferred** and **Open Decision** as in [PREACHER-STUDIO-MIGRATION.md](PREACHER-STUDIO-MIGRATION.md).

## Start here (for the next session)

A fresh session can continue from this file, the migration document, and `AGENTS.md`, without this conversation.

| Need                                      | Where                                        |
| ----------------------------------------- | -------------------------------------------- |
| 1. Approved product decisions             | Status labels above; B.1 (Status column)     |
| 2. Proposed techniques                    | B.2–B.11, C, D, E, I.2–I.4 (marked Proposed) |
| 3. Known prototype limitations            | `docs/HANDOFF-PS-1A.md` §§5, 13, 14; F       |
| 4. Canonical document model               | B.2–B.11                                     |
| 5. Compatibility invariants               | E.7                                          |
| 6. Risk classifications                   | F                                            |
| 7. Infrastructure efficiency requirements | M                                            |
| 8. PS-1B.2 objectives                     | G                                            |
| 9. Phase boundaries                       | L; G ("Not in PS-1B.2")                      |
| 10. Prerequisites and approvals           | G (prerequisites)                            |
| 11. Acceptance criteria for PS-2          | H                                            |
| 12. Owner verification outstanding        | N                                            |

---

## A. Executive summary

**Investigated** (building on PS-0B and PS-1A, not repeating them):

- the PS-1A lab schema (`src/features/editor-lab/schema/`), commands, identity, and legacy converter;
- the numbering engine (`src/features/outlines/numbering.ts`, `model.ts`) and move rules (`src/features/outlines/editor/moves.ts`);
- the Scripture stack: `reference.ts`, `use-chapter.ts` (`loadChapter`), `passage-text.tsx` (`passageLimits`), the Scripture Panel (`scripture-provider.tsx`, `ScriptureHost`), the chapter route, and translations;
- the installed Tiptap packages (no TextStyle, Color, Highlight, or TextAlign extension is installed);
- the settings categories and the existing rules in `AGENTS.md` that the new requirements touch;
- the authenticated shell, for the Workspace Panel:
  - `src/app/(app)/layout.tsx`, its providers, and `AppHeader`;
  - the shell-wide `ScriptureProvider` picker and its callers;
  - the Bible reader's device preference, `reader-sidebar.ts`, which is applied before paint;
  - `useMediaQuery`/`wideEnough`.

**Decided:**

- Tiptap/ProseMirror is the canonical editor foundation (Approved).
- A revised canonical document, **schema v2**, with free block ordering, optional introduction and conclusion anywhere, rich point titles, a block Scripture passage, preacher notes, and explicit page breaks (Proposed, section B.2).
- Scripture has three separate concerns: canonical content, editor expansion, and print presentation (Approved), with the storage of each fixed (Proposed).
- Two editable layouts, Regular (pageless) and Print (paginated), on one document (Approved); one editor instance and a pagination plugin (Proposed).
- Full sermon Scripture blocks are exempt from the 6/12 preview caps and are never truncated (Approved).
- Translation can be set per document and per passage (Approved by the owner's answer); references elsewhere stay translation-free.
- Text color and highlight through maintained Tiptap extensions, stored as preset keys or hex values (Proposed).
- Outline Layout as a versioned configuration that wraps today's `NumberingConfig` unchanged (Proposed).
- Snapshot persistence with revision checks, and a relational side table for source points (Proposed, for PS-2 and PS-3b).
- **Workspace Panel** (section I).
  - Approved: one application-wide, extensible panel owned by the authenticated shell, with tabbed tools, docked on the right, resizable, and a sheet on small screens. It replaces the editor-only Bible sidebar.
  - Proposed: an internal typed tool registry and one contextual-opening API.
  - Built in PS-4.
- **State boundaries** (section J). Five kinds of state, each with one owner and one place it is kept: document, editor view, panel, account preferences, and print/export (Approved).
- **Dictionary** (section K). English and Spanish, reached from a page and from the panel, sharing one lookup domain (Approved direction). It is built in its own later phase. No source is chosen.
- **AI** (section K). The panel can take an AI tool later without a rebuild. Nothing about AI is approved for building.

**Unverified:**

- Editable pagination: whether a block taller than the remaining page (a long paragraph) can be split across pages reliably. This is the largest feasibility risk (F, risk 6).
- The color extensions' behavior with custom values through paste and HTML.
- The cost of long passages (one request per chapter).
- Real-phone touch and IME behavior (still the owner's action from PS-1A).

---

## B. Architecture decision record

### B.1 The decisions

"Approved / Proposed" in a row means the direction is approved (closing approval) and the technique in the Recommendation column is proposed. **Before PS-2** marks what must be settled (by PS-1B.2 evidence or the owner) before PS-2 writes a schema.

| #   | Decision                                 | Recommendation                                                                                                                                                                                             | Status                            | Before PS-2                                     |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| 1   | Canonical editor foundation              | Tiptap 3 on ProseMirror, pinned exactly, no paid or Pro extension without owner approval                                                                                                                   | Approved                          | Settled                                         |
| 2   | Canonical document structure             | Schema v2 (B.2): `doc` holds any sequence of blocks                                                                                                                                                        | Approved / Proposed               | Validate (G.1)                                  |
| 3   | Node and mark types                      | B.2 table                                                                                                                                                                                                  | Proposed                          | Validate (G.1)                                  |
| 4   | Ordinary versus semantic blocks          | Semantic nodes (`outlinePoint`, `sermonSection`, `scripturePassage`, `preacherNote`, `pageBreak`) are distinct types; ordinary blocks are StarterKit's. A numbered manuscript list is never a sermon point | Approved / Proposed               | Validate (G.1)                                  |
| 5   | Rich-text point titles                   | Inline marks and inline Scripture allowed; links and line breaks not (B.4)                                                                                                                                 | Approved / Proposed               | Validate (G.1, G.4)                             |
| 6   | Point movement across prose              | A point owns exactly what is nested in it; moving jumps intervening prose, which stays put (B.5)                                                                                                           | Proposed                          | Validate (G.6)                                  |
| 7   | Introduction and conclusion              | Optional, at most one each, anywhere at the top level, never numbered (B.3)                                                                                                                                | Approved / Proposed               | Validate (G.1)                                  |
| 8   | Node-ID scope                            | Random UUIDs, unique within a document by enforcement and across documents by generation; cross-document paste always re-keys (B.6)                                                                        | Approved / Proposed               | Validate (G.6)                                  |
| 9   | Duplicate, split, merge, cross-document  | B.6 table                                                                                                                                                                                                  | Proposed                          | Validate (G.6)                                  |
| 10  | Source-point provenance                  | `sourcePointId` on the node as a hint; a relational side table as the authority (E.3)                                                                                                                      | Approved / Proposed               | Decided in PS-2                                 |
| 11  | Legacy conversion                        | Legacy to v2 exact; v2 to legacy a reporting projection for the compatibility window only (E.2)                                                                                                            | Approved / Proposed               | Validate (G.1)                                  |
| 12  | Outline Layout configuration             | `OutlineLayout` version 1, wrapping `NumberingConfig` verbatim, stored on the document (D)                                                                                                                 | Approved / Proposed               | Validate (G.5)                                  |
| 13  | Per-element overrides                    | A small closed `presentation` attribute on a point (D.3)                                                                                                                                                   | Proposed                          | Validate (G.5)                                  |
| 14  | Color and highlight serialization        | `textStyle.color` and `highlight.color` as a preset key or `#rrggbb` (B.7)                                                                                                                                 | Approved / Proposed               | Validate (G.4)                                  |
| 15  | Semantic defaults versus explicit colors | No mark means theme default; presets adapt to theme; custom colors are never rewritten (B.7)                                                                                                               | Approved / Proposed               | Validate (G.4)                                  |
| 16  | Scripture display                        | Block `scripturePassage` with editor expansion and print presentation kept apart; inline `scriptureReference` for prose (B.8)                                                                              | Approved / Proposed               | Validate (G.3)                                  |
| 17  | Bible translation                        | `passage.translation ?? doc.translation ?? account translation`; never verse text in the document (B.8.4)                                                                                                  | Approved / Proposed               | Validate (G.3)                                  |
| 18  | Print-visible versus editor-only         | Content carries a persistent `print` attribute; print options are temporary overrides; editor-only aids never enter the document (B.9, B.10)                                                               | Approved / Proposed               | Validate (G.3)                                  |
| 19  | Canonical storage                        | Validated ProseMirror JSON (`jsonb`) plus derived relational side tables; never HTML (E.4)                                                                                                                 | Proposed                          | Decided in PS-2                                 |
| 20  | Snapshot or incremental                  | Whole-document snapshots with a revision check, coalesced; patches not adopted (E.5)                                                                                                                       | Approved (local-first) / Proposed | Decided in PS-3b on measurement                 |
| 21  | Schema-version compatibility             | An older client never saves a newer document; every bump has a pure lossless migration; nothing is repaired destructively (B.11)                                                                           | Approved / Proposed               | Settled as a rule; enforced from PS-2 and PS-3a |
| 22  | Extensibility for preacher tools         | New semantic node types or a closed `kind` list, each addition a schema version (B.10, B.11)                                                                                                               | Proposed                          | Settled as a rule                               |

**Added by the consolidated follow-up:**

| #   | Decision              | Recommendation                                                                                                                       | Status                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 23  | Where side tools live | One Workspace Panel owned by the `(app)` shell; pages and the editor ask it through one API and never build their own side panel (I) | Approved (ownership), Proposed (technique) |
| 24  | How tools are added   | An internal typed registry of tools; no plugin system (I.3)                                                                          | Proposed                                   |
| 25  | State boundaries      | Five kinds of state kept apart (J)                                                                                                   | Approved                                   |
| 26  | Dictionary and AI     | Dictionary: a later phase sharing one domain between page and panel. AI: an extension point only (K)                                 | Approved (direction), Deferred (building)  |

**Alternatives considered where consequential:**

- **A Bible sidebar owned by the editor** (this handoff's first draft). Replaced by the owner's decision: it would compete with every other page's side tools, and it would lose its state on leaving the editor.

- **Keep PS-1A's pinned sections** (introduction first, conclusion last). Rejected: the owner requires writing before the introduction and after the conclusion.
- **Points as styled paragraphs with a level attribute** (flat list, as many editors do). Rejected: the tree semantics of `tree.ts`, moving with children, and numbering by path read directly from nested nodes, as PS-1A showed.
- **Layout overrides keyed by node ID in the layout configuration.** Rejected for D.3: they go stale when a node is deleted and do not travel with a copy.
- **Expansion state as a node attribute.** Rejected: every toggle would be a document change, a save, and a revision, which the owner forbade.
- **Print Layout as a separate read-only render.** Rejected by the owner: Print Layout must be editable.
- **Incremental step sync (ProseMirror steps)** for persistence. Not adopted: it needs a server that can rebase steps, and PS-1A measured snapshots of 5–170 KB, well inside a function's 4.5 MB body limit. It stays possible later because node IDs and the revision model do not preclude it.

### B.2 Canonical document schema v2 (Proposed)

Names are working names. `flow` is every block except `sermonSection` and `pageBreak`.

```
doc               block+
                  attrs: schemaVersion (2), layout (OutlineLayout), translation (null | "kjv" | "rvg"),
                         legacyOutlineId, legacyRevision

block (group)     paragraph | heading (levels 2–4) | bulletList | orderedList | blockquote
                | outlinePoint | sermonSection | scripturePassage | preacherNote | pageBreak

sermonSection     sectionTitle flow*
                  attrs: id, role ("introduction" | "conclusion"), legacyEntryId, legacyRevision, derivedFrom

outlinePoint      pointTitle (flow | outlinePoint)*
                  attrs: id, sourcePointId, derivedFrom, legacyEntryId, legacyRevision, legacyParentId,
                         presentation (null | PointPresentation)

pointTitle        inline*        marks: bold, italic, underline, textStyle, highlight
sectionTitle      inline*        inline nodes: text, scriptureReference (no hardBreak)

scripturePassage  atom block, no editable content
                  attrs: id, book, chapterStart, verseStart, chapterEnd, verseEnd,
                         translation (null | id), print ("full" | "reference" | "hidden")

scriptureReference inline atom
                  attrs: id, book, chapterStart, verseStart, chapterEnd, verseEnd,
                         translation (null | id), display ("reference" | "text")

preacherNote      (paragraph | bulletList | orderedList)+
                  attrs: id, kind (closed list, B.10), print ("show" | "hide" | null = the kind's default)

pageBreak         atom block, no content; ignored in Regular Layout except as a thin marker

Marks (everywhere text may carry marks, titles included)
                  bold, italic, underline, textStyle { color }, highlight { color }
                  link: not enabled in v2 (Deferred to PS-5, prose only)

Block attributes  textAlign ("left" | "center" | "right" | "justify" | null) on paragraph and heading
```

**Structural invariants** (checked by the validator on load and on save, and kept on every edit):

1. At most one `sermonSection` with role `introduction` and at most one with role `conclusion`, anywhere at the top level. A content expression cannot say "at most one anywhere", so a transaction filter refuses a change that would make a second one, and paste of a second converts it to an ordinary heading plus its content (reported, not silent; B.6).
2. A section holds no point. An introduction that needs structure uses lists. Allowing points in sections later is a widening (B.11) and needs no migration.
3. A point has exactly one title, first.
4. No point inside a list, quotation, note, or heading. A point ends a list.
5. Every identified node (`sermonSection`, `outlinePoint`, `scripturePassage`, `scriptureReference`, `preacherNote`) has an ID unique in the document.
6. Every passage is a passage that exists, in normal form (`referenceFrom`, `src/features/editor-lab/schema/scripture.ts`).
7. Every color is a preset key or `#rrggbb` (B.7). Every closed-list attribute holds a listed value.
8. `layout` parses with its schema (D.1). An unparsable one is reported and kept verbatim, as PS-1A did for numbering.
9. Limits (sizes, counts) are set in PS-2 from measurement (migration document §6.4).

**What changed from PS-1A, and why:**

| PS-1A                               | v2                                                 | Why                                                  |
| ----------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Introduction first, conclusion last | Anywhere at the top level, at most one each        | Writing before and after them (owner)                |
| `entryTitle` plain text             | `pointTitle` with marks and inline Scripture       | Rich titles (owner)                                  |
| `entryPassages` row of chips        | `scripturePassage` blocks                          | Full passage text, expansion, and print presentation |
| Inline reference only               | Inline reference with `display` and `translation`  | Inline quotation in prose                            |
| No colors, highlight, alignment     | `textStyle`, `highlight`, `textAlign`              | Required formatting (owner)                          |
| No notes, page breaks               | `preacherNote`, `pageBreak`                        | Preacher content and Print Layout                    |
| `numbering` on `doc`                | `layout` on `doc`, wrapping the numbering verbatim | Outline Layout (D)                                   |

### B.3 Introduction and conclusion

- Optional semantic sections, not document boundaries. A document may begin with an epigraph, a title block, or prose and continue after the conclusion with a benediction or a postscript.
- Never numbered by the outline's counters. The layout gives each a marker of its own (D.1), such as a bullet.
- `sectionTitle` is optional text with marks; an empty one shows the section's name ("Introduction") as a placeholder only, never as stored text.
- **Converting a section.** "Turn into point" and "Turn into section" are commands, keeping the ID. Turning a point that has subpoints into a section is refused with a message (invariant 2), not silently flattened.

### B.4 Rich-text point titles

- **Allowed:** bold, italic, underline, text color, highlight, and an inline Scripture reference ("I. The Love of God (John 3:16)" is common in sermon outlines and prints well).
- **Not allowed:**
  - **Links.** A title is a heading that is clicked to edit; a link there competes with the caret on touch and in selection, and a printed heading cannot use it. Links belong in prose (Deferred to PS-5).
  - **Hard breaks and blocks.** A title is one line of heading; explanation belongs in the point's body.
- **Keyboard** (PS-1A behavior kept, to be checked with writers in PS-1B.2):
  - Enter at the end of a title opens the point's first body paragraph.
  - Enter inside a title splits the point (B.6).
  - Backspace at the start of a title merges into the previous sibling point (B.6).
  - Mod+B, Mod+I, Mod+U work in titles as in prose.
- **Legacy:** a titled point maps to a legacy entry's plain `title` (its text). Marks are reported as the loss `title_marks`; an inline reference in a title becomes its label text and is reported as `title_reference`. Nothing is dropped silently.

### B.5 Point structure, ownership, and movement

**Ownership rule.** A point's content is exactly what is nested inside the point node: its title, its body blocks (paragraphs, lists, quotations, passages, notes), and its subpoints. Prose at the same level between two sibling points belongs to their parent (the document or the enclosing point), not to either point.

- So a person's prose between main points stays where it was written when a point moves, and a point always moves with everything it owns.
- The editor shows a point's extent with a subtle rail in the gutter on hover and when the caret is inside it, so ownership is visible before a move.
- **Leaving a point:** Enter on an empty last body paragraph of a point lifts the caret out to an independent paragraph after the point (as leaving a list does). A menu item "Add text after point" does the same.
- **Pulling prose in or out:** "Move into point above" and "Move out of point" on a selected block, for when a person wants to change ownership deliberately.

**Operations:**

| Operation         | Rule                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Add point         | A new sibling after the current point (or at the caret's top level outside a point), empty title, caret in it                                  |
| Add subpoint      | A new last child of the current point                                                                                                          |
| Indent            | Becomes the last child of the previous sibling _point_ (`moveTarget` "indent"); refused for the first point among its siblings                 |
| Outdent           | Becomes the sibling just after its parent (`moveTarget` "outdent"); its own later siblings stay with the parent                                |
| Move up / down    | Swaps with the adjacent sibling _point_, jumping intervening prose, which stays anchored; never crosses into another parent                    |
| Move to top level | `moveTarget` "top": just after the main point it is under                                                                                      |
| Reorder (drag)    | Optional later; every drag ends in the same move command; never the only way (existing rule)                                                   |
| Duplicate         | Deep copy after the original; identity per B.6                                                                                                 |
| Split             | At the caret in a title: the text after the caret becomes a new sibling point after it; body and subpoints stay with the first                 |
| Merge             | Backspace at a title's start, previous sibling is a point: titles join (marks kept), the second's body and subpoints are appended to the first |
| Delete            | Removes the point and everything it owns; undo restores it with the same IDs                                                                   |
| Undo / redo       | ProseMirror history; a move, split, merge, or delete is one undo step; layout switches and expansion are never history (B.8.2, C.9)            |

Every operation goes through a command that checks the invariants; the toolbar, keyboard, context menu, slash command, and mobile action sheet all call the same command.

### B.6 Node identity

Three identities stay apart (migration document §6.2): the **node ID** (`id`), **legacy provenance** (`legacyEntryId`, `legacyRevision`), and the **source point** (`sourcePointId`).

- **Scope.** Node IDs are random UUIDs (`crypto.randomUUID`), as legacy entry IDs are today. They are unique within a document by enforcement (the PS-1A identity plugin, one `appendTransaction` step) and unique across documents in practice by generation. Nothing relies on cross-document uniqueness; a side table keys by `(document_id, node_id)`.
- **Converted nodes** keep the PS-1A rule: the node ID equals the legacy entry ID, which is also recorded as `legacyEntryId`.

| Event                                     | Node ID                                      | `legacyEntryId` / `legacyRevision` | `derivedFrom` | `sourcePointId`                     |
| ----------------------------------------- | -------------------------------------------- | ---------------------------------- | ------------- | ----------------------------------- |
| Move, indent, outdent, undo, redo, reload | Kept (with all descendants)                  | Kept                               | Kept          | Kept                                |
| Duplicate, or paste within the document   | Original keeps; copy gets new IDs throughout | Cleared on the copy                | The original  | Kept on the copy                    |
| Cut and paste within the document         | Kept (never two copies at once)              | Kept                               | Kept          | Kept                                |
| Paste from another document               | Always new IDs throughout                    | Cleared                            | Cleared       | Kept (verified on save, E.3)        |
| Split                                     | First part keeps; second part new            | First part keeps; second cleared   | Second: first | First keeps; second none            |
| Merge                                     | Survivor (first) keeps; second retired       | Survivor's kept                    | Survivor's    | Survivor's kept; second's link ends |
| Insert a saved point                      | New                                          | None                               | None          | The point's ID                      |
| Turn point into section, or back          | Kept                                         | Kept                               | Kept          | Cleared on a section                |

- **Copy provenance (PS-1A's Open question).** The PS-1A rule is adopted: a copy clears `legacyEntryId`. A legacy entry ID then stands for exactly one node, so a conversion back or a translated old-client change (E.2) is never ambiguous. Lineage of a copy is `derivedFrom`.
- **Cross-document paste** is recognized by the clipboard: the editor writes the source document's ID on the copied HTML's wrapper (`transformCopied` / clipboard serializer), and a paste whose source differs re-keys everything. A paste with no source ID (from another application) is treated as foreign.
- **A second introduction or conclusion pasted** becomes a heading with the section's content, reported in the editor's notice; nothing is dropped.
- **Passages and notes** have IDs because expansion memory, print settings, comments, and future features find them by ID.

### B.7 Text color and highlighting

**Approved:** colors and highlighting are standard capabilities; default text uses the neutral theme; the formatting is kept separate from Outline Layout.

**Implementation (Proposed):**

- **Extensions:** `@tiptap/extension-text-style` (its `TextStyle` mark and `Color`) and `@tiptap/extension-highlight` with `multicolor: true`, plus `@tiptap/extension-text-align`. None is installed today (checked in `node_modules/@tiptap`); PS-1B.2 needs the owner's approval to add them at the same exact version as the other Tiptap packages (3.31.4). They are MIT and part of the open-source set.
- **Stored value.** Each extension is extended (`.extend`) so its `color` attribute is validated and rendered by our rules, not stored as an arbitrary CSS string:
  - a **preset key** from a closed list, for example `gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `purple`, `pink` (text) and `yellow`, `green`, `blue`, `pink`, `orange`, `purple`, `gray` (highlight); or
  - a **custom color**, lowercase `#rrggbb`.
  - Anything else (a `var()`, `rgb()`, a named CSS color from pasted HTML) is mapped to `#rrggbb` when it parses and dropped with the mark kept off when it does not; paste is the only path that sees foreign values.
- **JSON**, for example: `{"type":"text","text":"grace","marks":[{"type":"textStyle","attrs":{"color":"red"}},{"type":"highlight","attrs":{"color":"#fde68a"}}]}`. Never HTML strings.
- **Rendering.**
  - No mark: the semantic text token, so default text follows light and dark mode.
  - A preset: a design token with a light and a dark value (`--ink-red`, `--mark-yellow` in `globals.css`, added with the feature). The person chose "red", and red is shown readably in either theme.
  - A custom color: rendered exactly as chosen in both themes. The picker shows the contrast against the current page and warns below WCAG AA; the application never rewrites it.
  - Highlight presets have dark-theme values dark enough that default light text stays readable on them. A custom highlight with a custom text color is rendered as chosen.
- **Print and export** use the presets' light values and custom colors as chosen. A future **Print without colors** option (B.9) suppresses text color and highlight at render time and deletes nothing.
- **Controls** (C.3): a split button for each, applying the last-used color in one press, with a palette, **Custom…**, and **Reset to default** (removes the mark, never writes "black"). Clear formatting removes marks, alignment, and colors, not structure.
- **Not to be confused with:** text selection, Bible-reader highlights (`src/features/scripture/saved`, per verse, per translation, stored apart), and favorites. Verse text inside a `scripturePassage` is not document text and cannot carry a document highlight in v2.

### B.8 Scripture in the document

#### B.8.1 Three separate concerns (Approved)

| Concern                | Where it lives                                                                    | Changes the document?   |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| **Canonical content**  | The node: the five numbers, `translation` (null or an override), `print`          | Yes                     |
| **Editor expansion**   | Plugin state in the editor, optionally remembered on the device (B.8.3)           | Never                   |
| **Print presentation** | The node's `print` (persistent), plus temporary document-wide print options (B.9) | `print` yes; options no |

Expanding or collapsing never changes canonical content, never makes a revision, never triggers a cloud save, and never makes a request when the text is already loaded. Print presentation never depends on expansion, and expansion never depends on print presentation; all four combinations in the owner's table hold.

#### B.8.2 Expansion interaction (Approved; technique Proposed)

- Each `scripturePassage` shows its reference with a chevron: right when collapsed, down when expanded. The chevron toggles; clicking the reference label toggles too, unless a modifier or the context menu is used.
- The chevron is a real `button` with `aria-expanded` and `aria-controls`, at least 44 px on touch, and does not take the editor's selection; the passage itself is selectable as one unit like any atom block.
- Expanded: the full passage, verse numbers included, in the effective translation (B.8.4), with the translation's short name beside the reference ("John 3:16–17 · KJV").
- Secondary actions are in the passage's context menu (C.4) and its touch action sheet: change reference, translation, print presentation, open in Bible, copy text, remove. No permanent toolbar on each block.
- **Expand All Scripture / Collapse All Scripture** are in the **View** menu and affect expansion only.
- Inline `scriptureReference` nodes have no chevron: in prose they read as a reference ("John 3:16") or, with `display: "text"`, as the verse text in quotation marks followed by the reference.
- **Technique:** a ProseMirror plugin holds `Map<nodeId, boolean>`; a toggle is a transaction with only a plugin meta and `addToHistory: false`, so `tr.docChanged` is false. The future save layer saves only on `docChanged` (E.5), which is what guarantees "no save" rather than a convention.

#### B.8.3 Expansion defaults and memory (Approved; storage Proposed)

Four things, each with one source of truth:

| Thing                                | Source of truth                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Default for a passage with no state  | Account preference, **Settings → Editor → Scripture**: Expanded (initial default) or Collapsed    |
| Whether states are remembered        | Account preference, same page: "Remember which passages I expand or collapse in each sermon" (on) |
| Current state in this editor session | The plugin state                                                                                  |
| Remembered state                     | Device-local `localStorage`, key `ps-editor-expansion:v1`, only while remembering is on           |

- **Order of resolution on opening a document:** remembered state (if remembering is on and one exists for that node) → the default preference. A newly inserted passage takes the default.
- **Remembered shape:** `{ [documentId]: { at: <ms>, nodes: { [nodeId]: boolean } } }`. Written on toggle, coalesced, never per keystroke; it is view state and never leaves the device, is not synchronized, and is not the account's.
- **Cleanup:** on opening a document, node IDs absent from it are removed; at most 200 documents are kept, least recently opened removed first; a document that is deleted is pruned when its entry is next found unreadable or by the LRU. Turning remembering off clears the key on this device.
- **Settings → Editor** is a new settings category (`settingsCategories`), with its page and words, built in the phase that builds the workspace (PS-4). The preferences are account columns or a validated preference object on `users`, decided in PS-2 with the other document schema. **Deferred.**
- A `localStorage` failure (private window, quota) falls back to the default silently; expansion still works for the session.

#### B.8.4 Translation (Approved: document and passage overrides; resolution Proposed)

- **Effective translation** of a passage: `passage.translation ?? doc.translation ?? the account's translation`. The account's translation comes from `getPreferences()` (`src/features/preferences/current.ts`) on the server and its client equivalent, which apply the administrator's Spanish switch; nothing reads `users.bible_translation` around it.
- **An override names an ID** (`kjv`, `rvg`), never verse text. A reference in an idea, an outline entry, or a favorite stays five numbers and no translation; the override exists only on a document node.
- **Unavailable translation** (the switch is off, or a later translation is removed): the passage is shown in the account's translation with a quiet notice ("Shown in KJV; this passage is set to RVG"), and the stored override is never rewritten.
- **Setting overrides:** the document's translation in the document's menu ("Bible translation for this sermon: Follow my setting / KJV / RVG"); a passage's in its context menu. The account's translation is still chosen in Settings and nowhere else.
- **Inserting from the Bible panel** (C.8): when the panel's translation (a view, per the existing rule) differs from the document's effective translation, the inserted passage gets that translation as its override, so it shows what the person saw. Validated in PS-1B.2 (G.3); the alternative is to insert without an override.
- **Changing the account's translation** changes every passage that follows it, in the editor and in print; overridden passages do not change.

#### B.8.5 Passage text retrieval and the length exception (Approved; technique Proposed)

- **No cap.** A full sermon Scripture block may hold a verse, several, a chapter, several chapters, or more than 50 verses, and is never truncated when its presentation needs full text (editor expanded, Print Layout, print, export). The 6/12 caps of `passageLimits` keep governing the previews and rows they protect; `AGENTS.md` records this narrow exception.
- **No text in the document.** Text is resolved at render from the existing KJV/RVG data.
- **Reuse:** `loadChapter` (`src/features/scripture/use-chapter.ts`), which fetches `/api/bible/<book>/<chapter>?t=` once per chapter and translation for the tab's life, deduplicates requests in flight, and falls back to a translation kept whole on the device (`readLocalChapter`). Expanding a passage whose chapters are loaded makes no request.
- **Resource protections:**
  - Regular Layout: chapters of an expanded passage are requested as they near the viewport, at most 3 at a time; long blocks use `content-visibility: auto` so off-screen verses cost no layout.
  - Print Layout, print, and export need all text before pagination is final: chapters are requested with the same concurrency bound, with a visible "Loading Scripture for print" state, and pagination is computed once they arrive.
  - A failure shows the passage's reference and a retry, never partial text presented as whole.
  - A reference cannot span books (the schema), so the largest possible passage is a whole book (Psalms: 150 chapters, 2,461 verses).
- **What one chapter costs today.** This is read from the code (`src/app/api/bible/[book]/[chapter]/route.ts`, `passages.ts`, `use-chapter.ts`) and **not measured**:

  | Layer              | Per chapter not yet loaded in the tab                                                                                                                                                                                                                                                                                            |
  | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Browser requests   | 1 (`loadChapter` deduplicates in flight and keeps the chapter for the tab's life). A KJV answer is `private, max-age=86400`, so a later page in the same browser may be served from its HTTP cache. An RVG answer is `no-store` and is always requested again in a new tab                                                       |
  | Vercel invocations | 1 per browser request that reaches the network                                                                                                                                                                                                                                                                                   |
  | Neon queries       | The verse text and psalm titles come from Next's `"use cache"` with `cacheLife("max")` (`getChapter`, `getChapterTitle`), so text queries usually do not reach Neon after the cache is filled. Each invocation still runs `authorize("active")` and `getPreferences()`, which read the account (the exact count is not measured) |

  So the "about 150" for a whole-book passage (Psalms) is an **estimate**: about 150 browser requests and 150 function invocations, each reading the account, but not 150 Bible-text queries. Psalm 119 is one chapter and one request. Typical sermon passages are one to three chapters.

- **Future approach** (Open Decision for PS-4, taken on PS-1B.2's measurements; no new cache service or infrastructure):
  - Read a translation kept whole on the device first when it is downloaded, instead of only as a fallback.
  - Optionally add a **chapter-range endpoint** for one book: a bounded run of chapters per response (for example up to 10), so a whole book is about 15 requests instead of 150, each answer of moderate size. The text stays complete; the bound is per response, never per passage.
  - Keep `loadChapter`'s deduplication and per-tab cache, the immutable `"use cache"` server cache, and lazy loading of chapters that are not near the viewport.
  - Never truncate a passage to save requests; a passage that cannot be completed shows its reference and a retry.

### B.9 Print presentation and print options (Approved; model Proposed)

- **Per passage, persistent:** `print` is `full` (the suggested default, later an account preference), `reference`, or `hidden`. Changing it is a document edit: one undo step and a save.
- **Per note:** `print` on a `preacherNote` (B.10).
- **Document-wide, temporary** (the future Print Options dialog, PS-5):
  - Scripture: **As configured** (default) / **References only** / **Full passages**. An override changes how nodes print, never what they store.
  - **Include hidden passages** (off): a hidden passage stays hidden under every Scripture override unless this is turned on deliberately.
  - Notes: per kind, **As configured / Show / Hide**.
  - **Print without colors** (off): suppresses text color and highlight.
  - These options reset when the dialog closes. **Save as this sermon's print defaults** writes them as one document attribute (`printDefaults`, added in the schema version that builds printing); it rewrites no node.
- **Precedence**, for how a passage prints:
  1. A passage set to `hidden` is left out, unless **Include hidden passages** is on.
  2. With that switch on, a hidden passage prints as **References only** or **Full passages** says. Under **As configured**, it prints in full.
  3. Otherwise **References only** or **Full passages** applies to every passage that is not hidden.
  4. Under **As configured**, each passage prints by its own `print`.
- **Saved print configuration.** Paper size, margins, header, footer, and page numbers are the sermon's own saved print settings (`printDefaults`). Print Layout paginates with them while editing, so they cannot be temporary. A new sermon takes them from an account default (Deferred, with Settings → Editor). The dialog's overrides are temporary unless saved.
- The same options drive PDF and Word export (PS-5), through one function that turns a document, options, and Bible text into a print model.

### B.10 Preacher-specific content (Proposed; built later)

- `preacherNote` with a closed `kind`: `question` (research question), `reminder`, `cue` (preaching cue), `illustration`, `task` (preparation task), `note` (personal note), `application`.
- Default print by kind: `cue`, `illustration`, `application` shown; `question`, `reminder`, `task` hidden; `note` hidden. `print` on a node overrides its kind's default; the print dialog overrides both, temporarily.
- Each kind has a quiet visual treatment (a small label and a rail in a neutral token; no colored surfaces) and a slash command.
- **Editor-only assistance** (spelling, placeholders, focus effects, expansion, outline folding, comments when they come, any suggestion) is never in the document. Content a person writes is always document content, even when it prints hidden.
- New kinds are a schema change (B.11), not free text.

### B.11 Schema versioning and compatibility (Proposed)

- `doc.attrs.schemaVersion` is an integer; v2 is the first version that will be stored.
- **An older client never saves a newer document.** ProseMirror's `Node.fromJSON` builds only the attributes a schema declares and fails on unknown node types, so an older editor would silently drop new attributes and refuse new nodes. A client that reads a `schemaVersion` above its own opens the document read-only with "Update the app to edit this sermon" and never writes it back. This must also hold for queued offline work (PS-3a).
- **Every bump ships a pure, lossless migration** `migrate(n → n+1)`, run on load (client and server) and tested on fixtures; the server stores and validates only the current version.
- **Widening** (a new optional attribute with a default, a new node type, a content rule that admits more) needs a version bump but never rewrites existing content. **Narrowing** (refusing what was allowed) requires a migration that rewrites affected content explicitly and reports it, and the owner's approval.
- **Validation without destructive repair.** The validator (the lab's `restoreDocument`, extended) checks the schema with `node.check()` plus the B.2 invariants. An invalid document is refused with a report and its JSON is kept untouched for recovery; it is never "fixed" by normalization.
- **Extension points:** new node types join the `block` group; new marks join the list; new closed-list values (note kinds, colors) are versioned; per-node `presentation` and document `layout` carry their own `version` (D.1).

---

## C. Product-experience specification

### C.1 Document workspace

- **Top bar**, holding:
  - back to the sermon;
  - the sermon's title (still `ideas.title`, edited where it is today; PS-4 decides whether it is edited in place);
  - the save status (E.6);
  - the **layout switch** (Regular / Print);
  - a **View** menu (Expand All / Collapse All Scripture, show point rails, focus mode);
  - **Open Bible**, which opens the Workspace Panel's Bible tool (section I).
- **Toolbar** (C.2) below the bar, sticky.
- **Document:** centered, about 72 characters of the serif reading face in Regular Layout; generous vertical rhythm from the layout (D); hierarchy by size, weight, and indentation rather than color; a hairline border and a soft shadow at most; focus shown by the caret and an extremely restrained left rail on the current point, never an emerald frame around the document. Emerald stays for actions, selection, and focus rings on controls (`AGENTS.md`).
- **The Workspace Panel** (section I) is the one docked region on the right. The editor builds no side panel of its own.
  - The editor's own tools (Saved Ideas, Outline Layout, Preacher Notes overview) are registered as **page tools**. They are shown in the panel's tabs only while the sermon editor is open, beside the shell-wide tools (Bible, and later Dictionary).
- **Themes:** all surfaces from semantic tokens; the document page uses the light paper token in Print Layout on either theme only if PS-1B.2 shows it reads better (Open, minor).

### C.2 Responsive toolbar

**Order of importance** (left to right; what survives longest first):

1. Undo, Redo
2. Text style (Paragraph / Heading 2–4) as a `Select` (`src/components/ui/select.tsx`)
3. Bold, Italic, Underline
4. Text color, Highlight (split buttons)
5. **Add Point**, **Add Subpoint**
6. **Insert Passage**
7. Bulleted list, Numbered list, Quote
8. Alignment (one menu)
9. Clear formatting
10. **Saved Ideas**, **Outline Layout**, **Preacher Notes**, **Open Bible**. Each opens its tool in the Workspace Panel.

**Compression** is driven by a `ResizeObserver` on the toolbar's own width, not the viewport, so an open Workspace Panel compresses it too:

1. Wide: icons with full labels for the named actions ("Add Point", "Insert Passage", "Outline Layout").
2. Narrower: short labels ("Point", "Passage", "Layout").
3. Narrower: icons only, each with an accessible name and a tooltip that also shows its shortcut.
4. Narrowest: groups 7–10 move into a **More** menu, in the same order; a control that moved is never shown twice.

Controls never take focus from the text on press (PS-1A behavior), show their state with `aria-pressed`, and are at least 44 px on touch.

### C.3 Formatting controls, colors, and highlight

- Text color and highlight split buttons: the main part applies the last-used color; the arrow opens a popover with the preset swatches (labelled for screen readers by name), **Custom…** (a native color input plus a hex field, with the contrast notice), and **Reset to default** / **No highlight**.
- The last-used colors are a browser preference (`localStorage`), not the account's.
- Formatting survives JSON, reload, copy and paste within the application, and editing; pasting from elsewhere maps colors per B.7.

### C.4 Context menus

The menu depends on what is under the pointer:

| Target                   | Menu                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-empty text selection | Cut, Copy, Paste; Bold, Italic, Underline; Text color ▸; Highlight ▸; Clear formatting; Insert passage from selection (when it parses); Look Up in Dictionary (once the Dictionary exists, K) |
| Point gutter or marker   | Add subpoint; Insert point above / below; Indent; Outdent; Move up / down / to top level; Duplicate; Turn into section; Save as point idea; Delete                                            |
| Scripture passage        | Expand / Collapse; Print: Full / Reference only / Hidden ▸; Translation ▸; Open in Bible; Replace reference; Copy text; Remove                                                                |
| Preacher note            | Kind ▸; Print: Show / Hide / Kind's default ▸; Turn into paragraph; Delete                                                                                                                    |

- **Browser behavior kept:** a right-click with a collapsed caret in ordinary text opens the **browser's own menu**, so spelling suggestions, dictionary, and accessibility tools work. **Shift+right-click** always opens the browser's menu.
- Menus are keyboard-operable (the Menu key and Shift+F10 open the menu for the selection or the current point).
- **Touch:** the same actions come from a long-press on a point's handle (an action sheet), the selection bubble (C.7), and a tap on a passage's reference area.

### C.5 Keyboard shortcuts (Proposed; conflicts checked in PS-1B.2)

| Action                    | Shortcut                                       |
| ------------------------- | ---------------------------------------------- |
| Bold / Italic / Underline | Mod+B / Mod+I / Mod+U                          |
| Undo / Redo               | Mod+Z / Mod+Shift+Z (and Mod+Y on Windows)     |
| Add point after current   | Mod+Shift+Enter                                |
| Move point up / down      | Alt+Shift+↑ / ↓ (existing)                     |
| Indent / outdent point    | Alt+Shift+→ / ← (existing)                     |
| Insert passage            | Mod+Shift+, (candidate; checked for conflicts) |
| Open slash menu           | `/` at the start of an empty block             |
| Context menu              | Menu key, Shift+F10                            |

- **Tab is never taken** (existing rule for the outline editor, and an accessibility requirement): it leaves the editor.
- **No Ctrl+Alt+letter** shortcuts: on Windows that is AltGr on Spanish and other layouts and types characters.
- Every shortcut has a visible alternative.

### C.6 Slash commands

Typed `/` at the start of an empty block opens a filtered list; each command does one thing:

| Command                                                                             | Inserts                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| `/point`                                                                            | A point at the caret's level                    |
| `/subpoint`                                                                         | A subpoint of the current point                 |
| `/passage`                                                                          | A Scripture passage (opens the reference field) |
| `/introduction`, `/conclusion`                                                      | The section, when the document has none         |
| `/note`, `/question`, `/reminder`, `/cue`, `/illustration`, `/task`, `/application` | A preacher note of that kind                    |
| `/quote`, `/list`, `/heading`                                                       | The ordinary block                              |
| `/pagebreak`                                                                        | A page break                                    |

Slash commands supplement the toolbar; nothing is reachable only by a slash command. Their names are in the dictionaries, so Spanish users get Spanish command names with the English ones accepted too.

### C.7 Mobile

- **Formatting:** a selection bubble (Tiptap's BubbleMenu, already installed as a dependency of `@tiptap/react`) with Bold, Italic, Underline, Color, Highlight, and More.
- **Accessory bar** pinned above the virtual keyboard, positioned with `visualViewport`: Add Point, Indent, Outdent, Passage, Undo. It hides when the keyboard closes.
- **Point actions:** long-press a point's handle for the action sheet (C.4).
- **Bible and other tools:** the Workspace Panel's small-screen sheet (I.4). The document scrolls above it.
- **No hover-only or right-click-only actions.** No horizontal page overflow at any width (PS-1A's checks kept); indentation capped in CSS (existing rule).
- **Print Layout on a phone** shows pages scaled to the width; editing there works but is not the recommended way to write (validated in PS-1B.2).

### C.8 The Bible beside the sermon (through the Workspace Panel)

The editor uses the application's Workspace Panel (section I) and owns no Bible sidebar.

- **Opening:**
  - **Open Bible** opens the Bible tool where it was last left.
  - **Open in Bible** on a passage, or on a selected reference, opens the Bible tool at that passage.
  - Both go through the panel's contextual-opening API.
- **Desktop:** the panel docks and the document reflows to the remaining width. Closing it restores the width.
  - Regular Layout reflows its text.
  - Print Layout keeps its pages at paper size and scales them to fit (C.9). Neither changes the document.
  - Resizing the panel never makes a document change or a save.
- **Insertion:**
  - The editor registers an insertion target with the panel while it is open (I.3).
  - The Bible tool then offers **Insert into sermon** for its selected verses. It uses the browser's own selection rule.
  - Insert places a `scripturePassage` after the caret's block, at the default expansion, with print Full; the translation follows B.8.4.
  - The caret returns to the document.
  - On a page with no insertion target, the action is not shown.
- **Small screens:** the panel's sheet (I.4). **Insert** closes the sheet back to the caret.

### C.9 Layouts: Regular and Print (Approved)

Both layouts edit the same document, with no conversion, no extra revision, and no separate version.

- **Regular (pageless):** the default for new users; continuous, responsive, no page decoration.
- **Print (paginated):** pages of the configured paper size and margins, page gaps, headers and footers and page numbers where configured, print typography. **Fully editable:** typing, selection, formatting, passages, and point moves all work in it.
- **Pages do not depend on the window.** Print Layout paginates by the sermon's saved paper size and margins (B.9), never by the viewport. A narrower window, or a wider Workspace Panel, scales the pages down (CSS `zoom` or a transform, chosen in PS-1B.2) and does not paginate again. Only Regular Layout reflows text to the available width.
- **Switching** (Proposed technique): the same editor instance, never remounted. A pagination plugin is switched on or off by a transaction carrying only a meta (`addToHistory: false`), and the workspace's CSS changes. Undo history, selection, and the document are kept; nothing is saved.
- **Default layout:** an account preference, **Settings → Editor → Layout**: Regular (initial) or Print. Opening a sermon uses it. Switching in the editor applies to that document in that tab (kept in `sessionStorage` per document so a reload keeps it) and never writes the account default. There is one persistent source (the account) and one temporary one (the tab); no per-document memory.
- **Print Layout shows what prints:**
  - Passages render by their print presentation (and the document's saved print defaults), not by editor expansion: a Full passage shows in full even if collapsed in Regular; a Reference-only passage shows its reference even if expanded there. The expansion state is kept for returning to Regular.
  - In Print Layout the chevron is replaced by a small print indicator ("Prints in full") that opens the print menu.
  - Hidden passages and hidden notes appear as slim, non-printing markers that take no page space, so they can still be found and edited.
  - Rationale: this is the only way pagination stays truthful without making expansion change print settings (owner §6). An alternative that keeps collapse in Print Layout while reserving the passage's printed height was considered and rejected: it shows empty space that edits cannot reach.

### C.10 Saved point ideas in the editor

- **Saved Ideas** (a page tool of the Workspace Panel, shown only in the editor): searches the account's point ideas through `/api/ideas/search` (points only, archived left out, as `AddSavedPoint` does today); each result previews its title, notes, and passages.
- **Insert** places a copy as a new point after the current one: the title as text, the notes as paragraphs (one per line, as PS-1A's converter does), and, with **Include passages** checked (the default), its passages as `scripturePassage` blocks. `sourcePointId` names the point.
- The copy is the document's own: editing it never writes the point, and a later change to the point never updates it. The same point may be inserted in any number of sermons, or twice in one.
- **Save as point idea** (point context menu) creates a new point idea through the existing idea creation path from the point's title (as text), body (as notes text), and passages, then sets the node's `sourcePointId` to it.
- A point whose source was deleted keeps its content and loses only the attribution (E.3).

---

## D. Outline Layout specification

### D.1 Configuration model (Proposed)

```ts
type OutlineLayout = {
  version: 1;
  /** Today's configuration, carried verbatim: a preset name or a custom one. */
  numbering: NumberingConfig;
  /** Markers for the introduction and the conclusion, which are never counted. */
  sections: {
    introduction: SectionMarker; // { kind: "none" | "bullet" | "text", bullet?, text? }
    conclusion: SectionMarker;
  };
  /** Presentation by level, level 1 first; deeper levels repeat the last. */
  levels: LevelPresentation[];
  typography: { face: "serif" | "sans"; scale: "small" | "normal" | "large" };
  basedOn: string | null; // a built-in or saved preset's ID, for "Reset to preset"
};

type LevelPresentation = {
  indent: number; // em, bounded
  hanging: boolean; // marker hangs, wrapped title lines align with the text
  markerAlign: "left" | "right"; // right-aligned markers line up "IV." and "V."
  markerGap: number; // em between marker and title
  spaceBefore: number; // em
  spaceAfter: number; // em
  lineHeight: number | null; // null: the document's
  titleWeight: "normal" | "bold";
  titleStyle: "normal" | "italic";
  markerColor: string | null; // a preset key only (B.7); null: the text color
};
```

- **Separation:** `numbering` says what the marker _is_; `levels` say how it is _laid out_; inline marks (B.7) are content and never part of the layout. No CSS-like cascade: one level list, one document-wide typography, and per-node overrides (D.3), resolved in that order.
- **Stored** on `doc.attrs.layout` as a snapshot, so a sermon looks and prints the same even if a preset changes; `basedOn` lets the person reset to or update from the preset.
- **Validated** by a Zod schema that reuses `numberingConfigSchema` for `numbering`, with every number bounded. A stored layout that does not parse is reported and kept verbatim; the editor shows the default, and does not rewrite it until the person applies a layout.
- **Legacy:** a legacy outline's `numbering_config` becomes `{ version: 1, numbering: <verbatim>, sections: none, levels: defaults, … }`. Going back, a layout that differs from those defaults reports the loss `layout`; `numbering` returns verbatim.

### D.2 Engine extensions (Proposed)

`entryLabel` and `numberOutline` stay unchanged and keep their tests. New pure functions beside them, in the same no-server style:

- `layoutLabels(rows, layout)`: labels for points (through `entryLabel` with `layout.numbering`) and markers for sections (from `sections`), plus each point's marker metadata (level, alignment, color) **apart from** the label text.
- **Restart and continuation:** continuation is the default: sibling points number on across intervening prose, as today. A point's `presentation.restartAt` starts its level's count again from that number for it and the siblings after it.
- **Parity requirement:** for every built-in preset and every custom configuration in the tests, `layoutLabels` with a layout made from a numbering configuration gives exactly the labels of `numberOutline(orderEntries(…))`.
- Labels are never stored and never in title text (existing rule); they are drawn as a decoration attribute and CSS, as PS-1A does.

### D.3 Per-element overrides (Proposed)

`outlinePoint.attrs.presentation`, null by default, a closed object:

```ts
type PointPresentation = {
  version: 1;
  restartAt?: number; // whole number ≥ 1
  hideMarker?: boolean;
  marker?: { kind: "bullet"; bullet: Bullet } | { kind: "text"; text: string }; // text via the safe-text rule
};
```

It travels with the node when it is moved or copied, disappears with it when deleted, and is shown in the point's context menu as "Numbering for this point". Nothing else is overridable per element in v1.

### D.4 Presets

Built-in presets in code, each an ordinary `OutlineLayout` (no special cases), named in the dictionaries:

- **Classic Sermon** (the owner's required example): introduction bullet •; main points `I.`; subpoints `A.`; deeper `1.`, `a.`; conclusion bullet •; hanging markers aligned right.
- **Traditional**, **Decimal**, **Numeric**, **Alphabetic**, **Roman**, **Bullets**, **None**: today's seven numbering presets with default presentation, so every current outline has its own preset.
- **Manuscript**: no markers, generous spacing, larger type.
- **Preaching notes**: compact spacing, bold main points, bullets below.

**User presets:** "Save as preset" stores a named `OutlineLayout` for the account (a future owner table with the owner rules of migration document §10; **Deferred to PS-5**). A small library: list, rename, delete, and set one as the default for new sermons.

### D.5 Customization behavior and live preview

The Outline Layout tool (a page tool of the Workspace Panel, so the document stays in view beside it) follows the owner's workflow:

1. **Choose a preset** from cards that each show a miniature of a small outline.
2. **Preview immediately** on the real document behind the panel; nothing is saved while previewing.
3. **Basic:** for Introduction, Main points, Subpoints, Deeper points, and Conclusion, one `Select` each for the marker (I., i., 1., A., a., •, ◦, none, Custom…), plus spacing (Compact / Normal / Spacious).
4. **Advanced** (expandable): per level prefix, suffix, composite numbering and separator, indentation, hanging, alignment, gap, spacing, line height, weight, style, marker color; typography.
5. **Apply:** one undoable document change of `doc.layout` (a single transaction). **Cancel** restores the previous layout exactly.
6. **Save as preset** (optional).

The Classic Sermon example needs only steps 1 and 5, or four `Select`s in step 3; no configuration text is ever shown.

---

## E. Compatibility and persistence contracts

### E.1 Identity and provenance

- B.6 is the contract. A node ID never changes in place; legacy provenance appears on at most one node; `sourcePointId` is never written back to a point.
- The `outline` way back in the Bible reader and `/outlines/<id>` addresses keep working while `sermon_outlines.id` exists (migration document §8.4).

### E.2 Legacy conversion

- **Legacy to v2** (for PS-2's converter and PS-7a's production run) keeps every PS-1A guarantee: order by `orderEntries`, exact IDs, titles, notes (whitespace exact), passages and their order, revisions, `sourcePointId`, idempotence, determinism, and every issue reported. Changes for v2:
  - sections become `sermonSection` nodes in the places `orderEntries` gives them (first and last), which v2 allows but no longer requires;
  - an entry's references become `scripturePassage` blocks right after the title, in order, with `print: "reference"` (so a converted outline prints as it reads today) and no translation override;
  - `numbering_config` becomes `layout.numbering` verbatim (D.1).
- **v2 to legacy** is a reporting projection for the compatibility window only (old clients, verification). It writes nothing by itself. Losses are listed: everything PS-1A listed, plus `title_marks`, `title_reference`, `passage_print`, `passage_translation`, `section_position` (a section not first or last), `note`, `page_break`, `layout`, colors, and alignment. A document that reports a loss is not forced into legacy shape to keep a two-way mapping.
- **Switch-over** (PS-7a, per sermon, reversible while legacy rows are intact, migration document §9.3): from then on the document is canonical and the legacy rows are frozen, not updated. A queued `outline.*` change from an old client that arrives afterwards is translated into a document edit when the translation is lossless (for example a title or notes update of an entry whose `legacyEntryId` is on exactly one node), and otherwise held as a conflict that keeps the person's work. It is never answered in a way that makes the old client discard it (migration document §7.3 items 4–5). Designed in PS-3a, built with PS-7a.
- Malformed legacy rows are converted as `orderEntries` shows them and reported, as PS-1A did; the production run repairs or refuses them by the decision PS-2 makes on production evidence (§8.5).

### E.3 Source-point relational integrity (Proposed for PS-2)

- **Side table** `document_point_sources`: `owner_id`, `document_id`, `node_id`, `source_point_id`; primary key `(document_id, node_id)`; composite foreign keys with the owner, `(document_id, owner_id) → sermon_documents` `ON DELETE CASCADE` and `(source_point_id, owner_id) → ideas` `ON DELETE CASCADE` (deleting the point removes the row, which is what "clear the link" means here; the document keeps its content).
- **Written** by the server in the same transaction as each document save: it parses the snapshot, collects `sourcePointId`s, keeps those that name the owner's own ideas, and replaces the document's rows. An ID that names nothing of the owner's is not written and is reported to the client, which clears the attribute on its next edit.
- **Authority:** attribution shown in the editor comes from the side table (joined to the point's current title), and the JSON attribute is a hint for offline display. This keeps today's guarantee that a deleted point leaves the content and drops the link (`ON DELETE SET NULL` in `outline_entries`, migration `0013`).
- **Account deletion** clears the table in `processDeletion` in foreign-key order, with a test (existing rule).
- **Also derived the same way, if PS-4 needs it:** an index of the document's passages for search. Not part of v2.

### E.4 Canonical storage and serialization (Proposed)

- Canonical form: the validated v2 ProseMirror JSON in a future `sermon_documents` table (one per sermon, `UNIQUE (sermon_id)`, owner rules of §10), with `schema_version` and `revision` columns. Not HTML, not Markdown, not a normalized relational copy of the tree.
- HTML is for the clipboard and export only. JSON → HTML → JSON is not a storage path (PS-1A showed HTML normalizes whitespace).
- Size and count limits are measured and set in PS-2.

### E.5 Saving, offline, and synchronization prerequisites

**Approved direction:** local-first autosave for sermon writing only, with the §4.2 editor requirements. **Not implemented in PS-1B.1.**

**Proposed for PS-3b:**

- **Change detection:** only transactions with `docChanged` mark the document dirty. Expansion, layout switches, selection, and panel changes never do.
- **Local draft:** written to IndexedDB (a new step in `migrations`, `db.ts`, names kept) about 1 s after typing pauses, before any cloud save. A draft is the latest snapshot with its base revision.
- **Cloud save:** a whole-document snapshot sent after a longer idle (for example 5–10 s), at most every 30–60 s during continuous writing, and when the page is hidden; never when the content equals what the server acknowledged. Cadence is set from PS-3b's measurement (PS-1A: about 10 pauses a minute; 9.8 KB a save on average for a 16 KB document).
- **Revision check:** each save names the revision it was based on. A stale save is a conflict: the client merges by node ID against the kept base (non-overlapping node changes combine; the same node changed on both sides asks), else keeps both versions for the person to choose. Nothing defaults to discarding.
- **Idempotency:** each save carries an operation ID recorded with the write (`sync_operations`), so a retry is a duplicate, not a second write.
- **Cross-tab:** one tab saves a document at a time (a Web Lock per document); other tabs see the newer revision by BroadcastChannel and do not overwrite it.
- **Revision history:** periodic snapshots kept server-side, a later feature; the snapshot model makes it straightforward.
- **Order:** PS-3a (protocol compatibility, §7.3 items 1–9) before PS-3b. A `document.*` mutation type with a strict schema and its own `schemaVersion`.
- **No** CRDT, OT, collaboration, Redis, queues, or background workers.

### E.6 Save status (Proposed for PS-3b)

| State                        | Meaning                                                | Leave warning                             |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| Saved                        | The server acknowledged this content                   | No                                        |
| Saving…                      | A save is in flight                                    | No (draft is durable)                     |
| Saved on this device         | The local draft holds it; waiting to reach the account | No                                        |
| Couldn't save on this device | The local draft write failed                           | **Yes**                                   |
| Needs attention              | A conflict or a refused save                           | **Yes** until resolved or kept as a draft |

"Saved" is never shown while anything differs from what was acknowledged (existing rule). Work held only in memory registers with `hasUnsavedWork()` (`src/lib/unsaved-work.ts`) so an update never reloads over it.

### E.7 Compatibility invariants (Approved as requirements; built in PS-2, PS-3a, PS-3b, PS-7a)

These invariants hold whatever technique implements them. They extend migration document §7.3 and §8. **PS-3a stays a separate milestone and must be complete before PS-3b sends any document change.**

1. **Nothing queued is dropped without the person's choice or the server's acknowledgement.** That covers an old PWA's legacy `idea.*` or `outline.*` operation, a draft on a device, and a queued `document.*` change. No answer to an old client may lead it to discard work (existing queue rule).
2. **Legacy handlers stay.** `idea.*` and `outline.*` keep working against the server for as long as old clients may hold such work (existing rule). Retiring them is a contract step in PS-7c, after the drain.
3. **A legacy outline edit that arrives after its sermon was converted** (PS-7a):
   - is translated into a document edit when that is lossless (E.2);
   - otherwise it is kept as a conflict the person resolves;
   - it is never applied to the frozen legacy rows as if they were current, and never answered `applied` while anything was dropped.
4. **Rich content never reaches a legacy writer.** An old client that cannot represent a document (rich titles, notes, layout) is never given a projection it could save back. It may be shown one read-only, with its losses.
5. **Newer documents are read-only to older code** (B.11), in the editor and in the sync engine. A `document.*` change with a higher `schemaVersion` than the server knows is refused as retryable, and the work is kept.
6. **Every change is idempotent.** An operation ID is recorded with the write in the same transaction (`sync_operations`), so duplicate delivery answers `duplicate`.
7. **Every save names its base revision.** A mismatch is a conflict, never a silent overwrite (E.5). Cross-device conflicts follow the same path as cross-tab ones.
8. **An interrupted or failed sync leaves the record retryable** (existing queue transitions). A partial document write cannot happen: the snapshot, its revision, the side tables (E.3), and the operation record are one transaction.
9. **Rollback.** A deployment can roll back but a schema cannot, so every migration works with the code already live, as `docs/DATABASE.md` already requires.
   - Conversion is non-destructive and per sermon, and its read-path switch is reversible while the legacy rows are intact (migration document §9.3).
   - Data damage is recovered by point-in-time restore to a branch, never by guesswork.
10. **Everything that exists is preserved:** ownership (the owner in every WHERE clause and foreign key), sermon identities, classifications, preaching history, related ideas, passages, and source-point links.

---

## F. Risk register

**Severity:**

- **Critical:** plausible data loss, corruption, or unrecoverable sync failure.
- **High:** major functionality, correctness, feasibility, or infrastructure risk.
- **Medium:** contained UX or technical risk.
- **Low:** an implementation detail.

The **critical** rows are not evidence of a fault today. Each becomes one only if the invariant beside it is not built; each is resolved by building that invariant and testing it.

| #   | Risk                                                                                                                                                         | Severity | Guarded by                                              | Resolved in                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------- | ------------------------------------------ |
| 1   | An old PWA's queued `outline.*` edit arrives after its sermon was converted, and is applied to frozen rows, dropped, or answered `applied` with content lost | Critical | E.7 items 1–3                                           | PS-3a (protocol), PS-7a (translation)      |
| 2   | An older client loads a newer document and saves it back, silently dropping attributes or nodes it does not know (ProseMirror drops undeclared attributes)   | Critical | B.11; E.7 item 5                                        | PS-2 (version check), PS-3a (sync refusal) |
| 3   | A stale or duplicated save overwrites newer work from another tab or device                                                                                  | Critical | E.5; E.7 items 6–7                                      | PS-3b, after PS-3a                         |
| 4   | Conversion of a legacy outline loses content (malformed rows, unusual whitespace, invalid numbering) without reporting it                                    | Critical | E.2; PS-1A's reported conversion; migration document §8 | PS-2 (converter), PS-7a (verified run)     |
| 5   | Source-point links lose referential integrity if kept only in JSON                                                                                           | High     | E.3 side table                                          | PS-2                                       |
| 6   | **Editable pagination** cannot split long blocks reliably (caret, selection, IME, undo at a break; incremental speed)                                        | High     | G.2 pass/fail; no decorative approximation              | PS-1B.2 verdict; PS-5 or PS-5a             |
| 7   | A queued change from an old client meets an unknown answer or conflict reason and offers only "discard" (migration document §7.2)                            | High     | E.7 item 1; §7.3                                        | PS-3a                                      |
| 8   | Long passages cost many invocations (about 150 for a whole book, an estimate; B.8.5)                                                                         | Medium   | Lazy loading; device text; range endpoint               | Measured PS-1B.2; decided PS-4             |
| 9   | Pages that size themselves by the window (`useMediaQuery`, `wideEnough`, the Bible reader's comparison) mis-fit beside a docked panel                        | Medium   | I.5; container widths                                   | PS-4                                       |
| 10  | Rich titles and other rich content shown as plain text to old clients during the compatibility window                                                        | Medium   | E.7 item 4 (read-only, losses reported)                 | PS-3a, PS-7a                               |
| 11  | The panel's Bible tool and the existing `ScriptureProvider` picker dialog on screen at once                                                                  | Medium   | I.5 rule                                                | PS-4                                       |
| 12  | Real-phone editing (IME, autocorrect, selection handles, the accessory bar over the virtual keyboard) behaves unlike emulation                               | Medium   | Owner check (N)                                         | PS-1B.2                                    |
| 13  | The extended Color and Highlight extensions lose preset keys through paste, or accept unsafe foreign values                                                  | Low      | B.7 validation                                          | PS-1B.2                                    |
| 14  | Per-change work (numbering, toolbar checks, pagination) slows typing on large documents or phones                                                            | Low      | Measured in PS-1B.2 (G)                                 | PS-1B.2, PS-4                              |
| 15  | The editor's bundle grows with the new extensions                                                                                                            | Low      | Measured; confined to the editor route                  | PS-1B.2                                    |

**Editable pagination in detail (risk 6).**

- ProseMirror renders one continuous DOM, so pages are simulated with measured page-gap decorations. Blocks shorter than a page are straightforward.
- A block taller than the remaining space needs splitting:
  - a passage can split between verses inside its own node view;
  - a long paragraph needs line-box measurement (`Range.getClientRects`) and an inline widget at the break, which interacts with selection, the caret, IME composition, and undo.
- Pagination must be recomputed incrementally.
- The browser's print output must break where the screen does.
- No working pagination engine exists. PS-1A did not test one.
- Paid or Pro Tiptap pagination is excluded unless the owner approves it.

---

## G. PS-1B.2 specification: targeted lab validation

**Boundaries:** everything in the lab (`/lab/editor`, `src/features/editor-lab/`), under the PS-1A guards (404 outside development, proven again against a production build), fixtures only, no database, no server action, no sync or offline import, the legacy outline editor untouched. Imports widen only to read-only reuse of `src/features/scripture` client code (`loadChapter`, `ScriptureBrowser` through `ScriptureHost`, `Passage` building blocks) and `src/features/outlines/editor/moves.ts`. Device-local view state (expansion memory, layout per tab) may use browser storage under lab-only keys.

**Prerequisites and approvals:**

- **Approved by the owner** (19 October 2026): `@tiptap/extension-text-style`, `@tiptap/extension-highlight`, and `@tiptap/extension-text-align`, for use in PS-1B.2.
  - At install time, verify the version (the installed Tiptap version, pinned exactly, and at least two weeks old), the peer dependencies (React 19, Next 16; no `--force`), and the licence (MIT).
  - Record all three in the PS-1B.2 handoff. Nothing was installed in PS-1B.1.
- Any other package, a paid or Pro Tiptap extension, or a change outside the lab needs the owner's approval first.
- **Subdivision.** PS-1B.2 may be split if its scope proves too large. A possible split is shown for convenience and is **Proposed, not authorized**:
  - PS-1B.2a: items 1, 3–6;
  - PS-1B.2b: items 2, 7–8.
  - Only the owner authorizes a split.

**Ordered by importance** (cited elsewhere as G.1–G.8 by item number):

1. **Schema v2 and its validator.** Implement B.2 in the lab; extend `restoreDocument` with the invariants; update the legacy converter (E.2). Keep all PS-1A round-trip tests green with the new mapping; add v2 fixtures (prose before the introduction and after the conclusion, sections in the middle, rich titles, notes, page breaks) and an invalid-fixture set the validator refuses without changing.
2. **Editable pagination feasibility (bounded).** A pagination plugin with page-gap decorations in Print Layout, on one editor instance switched by a meta transaction.
   - **Fixtures:**
     - the mixed sermon;
     - a 500-point outline;
     - a paragraph longer than a page;
     - nested points crossing a page;
     - a whole-chapter passage collapsed in Regular and set to print Full;
     - an explicit page break.
   - **Time box:** the spike ends when every criterion below has a result, or when one fails in a way the spike cannot fix. It is not built to production quality.
   - **Pass/fail criteria**, each recorded with evidence:

     | #   | Criterion                                                                                       | Pass                                                                                                                                        |
     | --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
     | P1  | Breaks fall where content stops fitting the configured paper size and margins                   | Within one line of a reference print of the same content                                                                                    |
     | P2  | A paragraph longer than a page splits across pages                                              | Text flows on; no line is hidden or duplicated                                                                                              |
     | P3  | Caret and typing across a page gap; arrow keys across it                                        | Caret never lands in a gap; typed text goes where the caret shows                                                                           |
     | P4  | Selection and copy across pages                                                                 | The copied text equals the selected text                                                                                                    |
     | P5  | Undo and redo across an edit that changes pagination                                            | The document returns exactly; the gaps follow                                                                                               |
     | P6  | Moving a point across pages; editing nested points near a break                                 | The document is unchanged apart from the move; the labels are correct                                                                       |
     | P7  | A passage collapsed in Regular and set to Full occupies its full printed height in Print Layout | Pagination is identical whatever the expansion state                                                                                        |
     | P8  | No document change comes from paginating                                                        | No `docChanged` from the plugin; the JSON is identical before and after                                                                     |
     | P9  | Cost per keystroke on the 500-point fixture, desktop and phone emulation                        | Measured and recorded. A pass needs typing that stays responsive (no input delay a person would notice); the owner confirms on a real phone |
     | P10 | Screen-reader reading order and keyboard navigation unaffected by gaps                          | Gaps are hidden from assistive technology; order is the document's                                                                          |
     | P11 | The browser's print of Print Layout breaks where the screen does                                | Same page count and breaks, within one line                                                                                                 |

   - **Verdict:**
     - All pass: Print Layout is built with PS-4/PS-5.
     - P1, P3, P5, P7, and P8 pass but others fail: record what needs a dedicated milestone, **PS-5a: Print Layout** (Proposed).
     - P3, P5, or P8 fails: the technique is rejected, and PS-5a starts from a different design.
     - In every case Print Layout stays a product requirement and is never shipped as a decorative approximation.
3. **`scripturePassage` node view.** Chevron expansion with no document change (asserted: `docChanged` false, no history entry); Expand All / Collapse All; the default and remembered states with cleanup; `print` attribute and Print Layout rendering by it; translation overrides and their resolution; Psalm 119 and a whole-book fixture rendering completely.
   - Record, separately, browser requests (Playwright network log), function invocations (development server log), and render time.
   - Record the same for an expand of an already-loaded passage, which must make no request.
   - Note which counts a development server cannot show (Neon queries behind `"use cache"`), rather than estimating them.
4. **Colors and highlight.** Presets and custom values; JSON, reload, internal copy and paste, paste from external HTML; light and dark rendering; Reset to default; clear formatting; colors in titles.
5. **Outline Layout.** `OutlineLayout` schema, `layoutLabels` with section markers and restarts, the parity tests against `numberOutline` for every preset and the custom fixtures, the Classic Sermon preset, and a minimal panel (preset, four markers, Apply, Cancel) applying one undoable change.
6. **Point operations over prose.** The B.5 table as unit tests: moves jumping prose, Enter lifting out of a point, duplicate, split, merge, cross-document paste re-keying (two editors in the lab), a second introduction pasted.
7. **Responsive toolbar and menus.** Width-driven compression stages, the More menu, context menus with the native-menu rules, the mobile selection bubble and accessory bar, at desktop, narrow desktop with the panel open, and phone emulation.
8. **The editor beside a docked panel.** This is not the real Workspace Panel, which belongs to the shell and comes in PS-4. It is a lab-local stand-in for it: a resizable region beside the editor holding `ScriptureBrowser` through `ScriptureHost`, with an insertion target. It checks only the risks the panel poses to the editor:
   - reflow in Regular Layout;
   - Print Layout scaling without paginating again;
   - toolbar compression;
   - no document change or save on resize, open, or close (asserted);
   - focus returning to the caret after Insert;
   - the narrow-screen sheet in phone emulation.
9. **Owner real-phone check** of the above (and PS-1A's outstanding check).

Not in PS-1B.2:

- persistence or sync;
- a production route;
- user presets;
- the Print Options dialog;
- PDF or Word export;
- Settings → Editor;
- the saved-point picker beyond fixtures;
- the shell's Workspace Panel, its registry, or any change to `src/app/(app)/layout.tsx` or `AppHeader`;
- the Dictionary;
- anything AI.

---

## H. Completion criteria: when PS-1B.2 has validated enough for PS-2

PS-2 may start when the PS-1B.2 handoff shows each of these, with the command and result:

1. **Schema v2 round trip:** every legacy fixture converts to v2 and back with no loss and deep-equal entries; `getJSON` → load → `getJSON` is stable for every v2 fixture.
2. **Validator:** every invalid fixture is refused with a named reason and its JSON is unchanged.
3. **View state is not content:** tests assert that expansion toggles, Expand/Collapse All, and layout switches produce no `docChanged` transaction and no history entry.
4. **Layout parity:** `layoutLabels` equals `numberOutline(orderEntries(…))` for all presets and custom fixtures; Classic Sermon produces the owner's example.
5. **Identity:** the B.6 table holds in unit tests, including cross-document paste.
6. **Colors:** preset and custom values survive JSON, reload, and internal paste; foreign colors map or drop as specified.
7. **Long passages:** Psalm 119 and a whole-book passage render completely in Regular and Print Layout. Browser requests, invocations, and times are recorded separately (G.3), and a recommendation is made on the range endpoint and on reading device text first.
8. **Pagination verdict:** every criterion P1–P11 (G.2) has a recorded result, and the verdict names the phase (PS-4/PS-5 or PS-5a).
9. **Real phone:** the owner's check is done, or its outstanding status is recorded as a known gap accepted by the owner.
10. **Isolation and cost:** the production 404 gate passes again; the lab's bundle is measured with the new extensions and stays confined to the lab route.
11. **Regression:** lab unit and end-to-end suites pass; typecheck and lint pass.
12. **Beside a panel:** with the lab's stand-in region open, resized, and closed:
    - the document is unchanged and nothing is marked dirty;
    - Print Layout's page breaks are identical at every width;
    - no page scrolls sideways at desktop, narrow-desktop, and phone sizes.

---

## I. Workspace Panel (application-wide)

**Approved** (consolidated follow-up):

- one panel that belongs to the authenticated shell, not the editor;
- docked on the right, resizable, closable, and a sheet on small screens;
- tabs of tools;
- state kept across navigation;
- no tool shown before it works;
- no IDE-style docking.

Everything below headed "technique" is **Proposed**. It is built in PS-4, or in a narrowly scoped prerequisite phase if PS-4 needs one first.

### I.1 Ownership and where it lives

- **The shell owns it.** It is a `WorkspaceProvider` in `src/app/(app)/layout.tsx`, beside the existing providers. The App Router keeps a layout mounted across navigation, so the panel and its tools are not remounted when the page changes, and the Bible stays at John 3 while a person moves from the editor to the library and back.
- **The shell owns:** whether the panel is open, the active tool, the width, docked versus sheet presentation, and the contextual-opening API.
- **Each tool owns** its own functionality and state (the Bible's place and translation, a future dictionary's query).
- **Pages own nothing of it.** They open tools and offer targets through the API (I.3), and never build a side panel of their own.
- **Where it is offered:** every page of the `(app)` shell where at least one tool is available. Not offered in the `(setup)` onboarding shell, the auth pages, the offline page, the landing page, or the lab. The installed application gets it like any `(app)` page.
- **The control** is one button in `AppHeader`, shown only when a tool is available on the page. The main navigation (`app-links.ts`) and its five tab-bar places do not change, and the panel is never a second navigation.
- **Tour:** the button gets a stable `data-tour` attribute. Adding a tour stop is a separate decision.

### I.2 Presentation (technique)

- **Docked** where the main region can keep a usable width beside it. Proposed thresholds, to be confirmed against real pages in PS-4:
  - the panel is between 320 px and the smaller of 560 px and 45% of the window;
  - it docks only while the main region keeps at least 640 px;
  - otherwise it opens as an overlay sheet from the right on medium screens.
  - The main region reflows; nothing is covered while docked.
- **Resizing.** A divider with `role="separator"`, `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`.
  - Pointer dragging updates a CSS variable, so React does not re-render on every movement.
  - The keyboard moves it with the arrow keys, Home, and End.
  - A double-click resets the default width.
- **Device preferences.** Open or closed, the width, and the last tool are kept in `localStorage`. They are applied before the first paint by an attribute on `<html>`, as `reader-sidebar.ts` does for the Bible reader, so a docked panel never makes the page jump at load.
  - These are browser preferences, never the account's, and nothing about the panel is written to the server.
- **Tabs** at the panel's top, one per available tool:
  - icon and label where there is room, icon with an accessible name and tooltip where there is not;
  - the active tool first in reading order;
  - keyboard tabs that follow the ARIA tabs pattern.
- **Closing** keeps the page, the tool, and the tool's state. Reopening restores them. Escape closes the sheet form; the docked form closes from its button.
- **Focus.** Opening from an action moves focus into the tool. Closing returns it to the control or the caret that opened it.

### I.3 Tool registry and contextual opening (technique)

**A typed list in code**, `src/features/workspace/tools.ts`. There are no plugins, marketplace, or dynamic loading of third-party code. Each entry gives:

| Field           | Meaning                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Stable identifier (`bible`, later `dictionary`, `ai`)                                                                                                                                                                                                                |
| `label`, `icon` | Words from the dictionaries; an icon from the existing set                                                                                                                                                                                                           |
| `available`     | A function of what the client already knows: the route, the account's preferences (the administrator's Spanish switch through `ReadingProvider`), the role. It only decides whether the tab is shown; every request the tool makes is authorized again on the server |
| `Component`     | Loaded with `next/dynamic` only when first opened, so a closed panel adds no tool code to a page                                                                                                                                                                     |
| `target`        | A Zod schema for what the tool can be opened to                                                                                                                                                                                                                      |
| `page`          | An optional full-page address (`/bible`, later `/dictionary`)                                                                                                                                                                                                        |

**Page tools.** A page may register tools that exist only while it is shown (the editor's Saved Ideas, Outline Layout, Preacher Notes). They are registered with a hook that unregisters on unmount, so there is still one panel and one tab strip.

**Contextual opening.** One call: `workspace.open({ tool, target? })`.

- It opens the panel, selects the tool, and hands it the target.
- The target is validated with the tool's schema first. A Bible target must be a passage that exists (`scriptureReferenceSchema` / `normaliseReference`). A dictionary target is a word of bounded length and a language pair from a closed list.
- A target that fails validation opens the tool where it was and does nothing else.
- Nothing in a target grants access. A tool reads only through the existing authorized routes (`/api/bible/...` for the Bible), which call `authorize("active")`.
- Targets never come from the address bar. The panel's state is not part of the URL.

**Insertion targets.** A page may offer an action to tools while it is shown, for example `insertPassage(reference)` from the sermon editor or "attach to this idea" from the idea page. A tool shows the matching action only when one is offered. The tool never reaches into the page.

**Future split view.** The panel's state is shaped as a list of sections, each holding one tool and its own state key, limited to one section now. A tool must not assume it is the only one on screen or that it fills the panel's height. Showing two tools at once later is then a layout change, not a rewrite. No split view is built.

### I.4 Small screens (technique)

- Below the docking threshold, and always below `md`, the panel is a **sheet**:
  - from the bottom on phones (about 60% of the height, draggable to full);
  - full-height on small tablets.
- It sits above the tab bar's area, and its height follows `visualViewport`, so the virtual keyboard does not cover a tool's search field.
- Tool state is the same object in either form. Turning a tablet, or closing the sheet and opening it again, keeps it.
- The page underneath keeps its scroll and its caret. **Insert** and **Open in Bible** close or open the sheet as they need to.

### I.5 Relation to what exists

- **The Bible tool is `ScriptureBrowser`** (`src/features/scripture/components/scripture-browser.tsx`), in reading mode, with the panel's insertion targets. Its translation choice is a view (`saveSessionTranslation`), as everywhere. It is not a second reader.
  - It is unavailable on the Bible reader's own pages, where it would duplicate the page. Until the Dictionary exists, that leaves no tool there, so no button.
- **The existing `ScriptureProvider` picker** stays the way forms choose a passage (quick capture, `ScriptureField`, reference chips, saved Scripture, the Preaching Record):
  - Its `openPanel` without `attach` (reading only) is sent to the Workspace Panel's Bible tool where the panel can dock.
  - With `attach`, it keeps its dialog, which belongs to the form that asked.
  - While that dialog is open, the docked panel's Bible tool is not shown at the same time; it waits on its last state.
- **The Bible reader's own navigation sidebar** (`reader-sidebar.ts`) is the reader's and is unchanged. With a docked panel, the reader's two-column comparison is offered only if the reader's own region fits two columns (F, risk 9).

### I.6 Cost and efficiency

- No new request, polling, or server write for the panel itself.
- Tools load their code only when opened.
- The Bible tool reuses `loadChapter`'s cache, so moving between pages refetches nothing.
- Width and open state stay on the device.

---

## J. State and persistence boundaries (Approved)

Five kinds of state, each with one owner and one place it is kept. Nothing on this list may be written to a place reserved for another kind, and no view change makes a document revision or a server write.

| Kind                     | What                                                                                                                                            | Kept in                                                                                                                          | Changes the document / makes a save |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Canonical document**   | Content, points, references, marks, and persistent presentation (`layout`, each passage's `print`, translation overrides, saved print settings) | The document (PS-2 storage); the device draft (PS-3b)                                                                            | Yes                                 |
| **Editor view**          | Regular or Print Layout, Scripture expansion, selection, caret, scroll, folding                                                                 | Editor memory. The layout per tab and document is in `sessionStorage`. Remembered expansion is in `localStorage` (B.8.3)         | Never                               |
| **Workspace Panel**      | Open or closed, the active tool, width, presentation, each tool's browsing state                                                                | Shell memory (it survives navigation). Open, width, and last tool are in `localStorage`; a tool's place may use `sessionStorage` | Never                               |
| **Account preferences**  | Default layout, default Scripture expansion, whether expansion is remembered, default print settings for new sermons                            | The account (`users`, decided in PS-2), read through `getPreferences()`                                                          | Never (written only in Settings)    |
| **Print/export options** | The dialog's temporary overrides (Scripture, hidden content, colors, notes)                                                                     | The dialog's memory. **Save as this sermon's print defaults** writes them into the document's saved print settings, deliberately | Only on that explicit save          |

- **A change belongs to the document when the person meant to change the sermon** (content or how it prints). Everything else is view or preference.
- **The account holds only what must be the same on every device.** The rest stays on the device and may be lost with its storage, at no cost to the sermon.

---

## K. Dictionary and AI (direction only; nothing built)

### K.1 Dictionary (Approved direction; Deferred to its own phase)

- **Where:** a dedicated page (`/dictionary`, not in the main navigation unless the owner decides otherwise) and a Workspace Panel tool. Both call one domain, `src/features/dictionary`. There is never a second lookup implementation.
- **Capabilities planned:**
  - English and Spanish definitions;
  - English → Spanish and Spanish → English lookup;
  - search by word;
  - part of speech and common grammatical information;
  - pronunciation and examples where the source provides them.
  - Saved words and history are later and undecided.
- **Language is the tool's own setting.** A pair of languages chosen in the tool, defaulting from the interface language but independent of it. It is a device preference, and an account preference only if a later decision needs one. It never changes the interface language or the Bible translation.
- **Contextual lookup:**
  1. Look Up in Dictionary on a selection: in the sermon editor, the Bible reader, and other text surfaces.
  2. The panel opens with the Dictionary tool on the word, through `workspace.open({ tool: "dictionary", target: { word, from, to } })`.
  3. On a phone, the same action is in the selection bubble.
- **Data: Open Decision for that phase, investigated there, not now:**
  - sources for English, Spanish, and bilingual entries;
  - licences and attribution, since no dataset is assumed to be redistributable, and a share-alike licence has consequences for how entries are shown and kept;
  - storage, whether loaded into Neon like the Bible text or held as a downloadable package;
  - caching and offline use, possibly through the existing offline package pattern;
  - infrastructure cost.
- **Not now:** no route, tool, data, dependency, or tab. The tab appears only when the Dictionary works.

### K.2 AI (extension point only; not approved for building)

- The registry and the contextual-opening API are what an AI tool would use. A future `ai` tool would be one entry, and actions like "Ask about this selection" would be `workspace.open({ tool: "ai", target: { text } })`.
- **Boundaries, to be decided and approved in its own phase:**
  - Content is sent only on an explicit action by the person, never automatically or in the background.
  - What is sent is shown first.
  - Authorization runs on the server through `authorize("active")`.
  - Sermon content is never logged (an existing rule).
  - Cost limits are set before any release.
  - Provider, model, prompts, storage, and billing are all undecided.
- **Not now:** no tab, placeholder, model integration, prompt, table, or setting.

---

## L. Phase allocation

| Phase                           | What it does with these decisions                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PS-1B.1** (this)              | Documents everything here                                                                                                                                                                                                                                 |
| **PS-1B.2**                     | Validates in the lab: schema v2, Scripture blocks and expansion, identity, colors, Outline Layout, the editable-layout and pagination spike, toolbar and touch, and the editor beside a stand-in panel (G). It does not build the Workspace Panel         |
| **PS-2**                        | The schema (documents, side tables, editor preferences on the account) and the legacy converter                                                                                                                                                           |
| **PS-3a → PS-3b**               | Protocol compatibility, then persistence, local drafts, autosave, and sync (order unchanged)                                                                                                                                                              |
| **PS-4**                        | The production sermon workspace; the Workspace Panel in the shell with its registry and the Bible tool; pages moved off viewport media queries where the panel docks; Settings → Editor; the chapter-range endpoint if PS-1B.2's measurements call for it |
| **PS-5** (and PS-5a if needed)  | Printing, the Print Options dialog, PDF and Word export, user layout presets; Print Layout as PS-5a if the spike says so                                                                                                                                  |
| **Dictionary** (to be numbered) | The page, the panel tool, data, attribution, caching, offline, and contextual lookup. After PS-4, which builds the panel it plugs into                                                                                                                    |
| **AI** (to be numbered)         | Only after its capabilities, authorization, privacy, and cost are approved                                                                                                                                                                                |
| **Later**                       | Split panel view; more workspace customization; more tools                                                                                                                                                                                                |
| **PS-6, PS-7a/b/c**             | Unchanged, with the same dependencies                                                                                                                                                                                                                     |

---

## M. Infrastructure efficiency requirements

**Approved principle** (migration document §4): use only the Vercel and Neon resources a feature reasonably needs, and never trade data, reliability, or accessibility for it. No architecture here guarantees staying within a free allowance: real cost depends on configuration, pricing, and traffic.

**Rules for every phase that builds these features:**

| Interaction                                       | Server activity allowed                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Typing, formatting, structural edits              | None per keystroke. Coalesced snapshot saves only (E.5, PS-3b); nothing when nothing changed                  |
| Expanding or collapsing loaded Scripture          | None                                                                                                          |
| Expanding a passage whose chapters are not loaded | One request per missing chapter (or per range, B.8.5), once per tab; none if the translation is on the device |
| Switching Regular and Print Layout                | None; no save                                                                                                 |
| Opening, closing, or resizing the Workspace Panel | None; width and state stay on the device                                                                      |
| Opening a panel tool already loaded               | No refetch of unchanged data                                                                                  |
| Moving between pages with the panel open          | The panel and its tools stay mounted; nothing reinitialized                                                   |
| Pages without the panel open                      | No tool code loaded (`next/dynamic` on first open)                                                            |

**Also:**

- No polling, cron, queue, Redis, worker, or new cache service for any of this.
- Immutable Bible text uses the existing `"use cache"` server cache, the browser's HTTP cache where already allowed, and the device package.
- Reads are bounded and paginated. A list never loads document bodies.

**Measuring.** Each phase that adds such work records, before calling it efficient:

- browser requests;
- function invocations and duration;
- database queries where observable;
- payload sizes;
- client rendering cost;
- cache behavior;
- what an ordinary interaction causes.

A figure that is estimated, or that a development server cannot show, is labelled as such. There is no separate optimization phase unless evidence calls for one.

---

## N. Outstanding owner actions

1. **Real-phone check of the PS-1A lab** (`docs/HANDOFF-PS-1A.md` §15), still outstanding. Repeat it for PS-1B.2's lab.
2. **PS-0C.1's manual notification check** (`docs/HANDOFF-PS-0C.1.md`), still outstanding and unrelated to the editor.
3. **Review and commit** this phase's four documents, and PS-1A's files if not yet committed.
4. **Authorize the start of PS-1B.2**, and any subdivision of it (G).

---

## Owner's §11 checklist (where each is documented)

| Item                                                                                | Section              |
| ----------------------------------------------------------------------------------- | -------------------- |
| Scripture content vs editor expansion vs print                                      | B.8.1                |
| Per-passage chevron                                                                 | B.8.2                |
| Expand All / Collapse All                                                           | B.8.2                |
| Configurable expansion defaults                                                     | B.8.3                |
| Remembered expansion states                                                         | B.8.3                |
| Two editable layouts                                                                | C.9                  |
| Default editing-layout preference                                                   | C.9                  |
| Print Layout fidelity                                                               | C.9, F (risk 6), G.2 |
| Per-passage print settings                                                          | B.9                  |
| Document-wide print overrides                                                       | B.9                  |
| Scripture-length exception                                                          | B.8.5, `AGENTS.md`   |
| Translation and data retrieval                                                      | B.8.4, B.8.5         |
| Versioning and compatibility                                                        | B.11, E.2            |
| Questions for PS-1B.2                                                               | F, G                 |
| Workspace Panel: ownership, tabs, resizing, mobile, navigation (consolidated §8–10) | I.1–I.4              |
| Extensible tools and contextual opening (§13)                                       | I.3                  |
| The editor using the panel (§14)                                                    | C.8, I.3             |
| State boundaries (§15)                                                              | J                    |
| Dictionary and AI (§11–12)                                                          | K                    |
| Phase allocation (§16)                                                              | L                    |

## Files changed in PS-1B.1

| File                                | Change                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/HANDOFF-PS-1B.1.md`           | New: this file, including the Workspace Panel, state boundaries, Dictionary and AI direction, phase allocation, compatibility invariants, risk register, efficiency rules, and owner actions (E.7, F, I–N) |
| `docs/PREACHER-STUDIO-MIGRATION.md` | Editor and unified document Approved; schema v2 referenced; open decisions updated; PS-1B split into PS-1B.1 and PS-1B.2                                                                                   |
| `docs/ROADMAP.md`                   | PS-1B.1 complete; PS-1B.2 next                                                                                                                                                                             |
| `AGENTS.md`                         | Handoff listed; narrow Scripture-cap exception; document translation overrides; view state kept out of the document                                                                                        |

No code, test, schema, migration, package, or configuration file changed. No historical handoff was edited.
