# Handoff: Phase 3A — Outline foundation

13 October 2026. One migration (`0013_outline_foundation`), three new tables, one new feature folder (`src/features/outlines`), no new package, no interface. **Status: implemented; its own tests, type checking, lint, formatting, a one-off concurrency run against development, and a production build pass; the whole unit suite and the end-to-end suite were not run (section 9).** Migration applied to development only. Not deployed.

## 1. What was implemented

The data and persistence for sermon outlines, and nothing a person can see yet:

- An outline for a sermon: one to a sermon, made only for a sermon that exists.
- Entries: points nested to any depth, and an optional introduction and conclusion.
- Ordering that is always whole, and moving a point together with everything under it.
- A numbering engine: seven built-in styles and custom ones, worked out when shown.
- An entry made from a saved point idea, as a copy that remembers its source.
- Passages on an entry, as numbers.
- Stale-change detection, validated server actions, and English and Spanish messages.

Nothing of Phases 3B to 3D was built: no editor, page, navigation item, overview, picker, drag and drop, autosave controller, preview, or print view.

## 2. What the inspection found

- **There is no `sermons` table.** A sermon is an `ideas` row with `kind = 'sermon'`, and a saved point is `kind = 'point'`. The brief's `sermon_id` and `user_id` are `sermon_id` → `ideas` and `owner_id`, as everywhere else here.
- **`sermon_points` is a plain relation** (Phase 2F.2: a sermon, a point, an owner, no order). It was left exactly as it is. An outline entry names its point directly and needs no row there.
- The conventions reused: the owner repeated on child tables and carried in composite foreign keys; services that take the owner and put it in every WHERE clause and answer with an outcome; actions that authorize themselves and map outcomes to dictionary messages; `FOR UPDATE` on a row for what a key cannot say; PGlite database tests with the committed migrations.
- Migrations stood at `0000`–`0012`, all applied to development. The next was `0013`.

## 3. Data model

Three tables; the columns, keys, and indexes are in [DATABASE.md](DATABASE.md) under "Outlines".

- **`sermon_outlines`**: `id`, `owner_id`, `sermon_id`, `numbering_config` (jsonb), `revision`, timestamps. `UNIQUE (sermon_id)`. Its key to the idea carries the owner and is `ON DELETE CASCADE`.
- **`outline_entries`**: `id`, `outline_id`, `owner_id`, `parent_id`, `entry_type`, `position`, `title`, `notes`, `source_point_id`, `revision`, timestamps.
- **`outline_entry_scripture_references`**: the five numbers of a passage and a position, as on an idea.

What the tables themselves refuse, whatever the code does: a second outline for a sermon; an outline of another account's sermon; an entry in another account's outline; a parent in another outline; an entry that is its own parent; an introduction or conclusion under anything; a second of either; two points at one place; an entry made from another account's idea; a title or notes too long; a passage that is not one.

What they cannot say, and the service checks under a lock: that an idea is a sermon; that a parent is a point and not a section; that no point is under one of its own descendants.

**Decisions that were mine to make:**

| Decision                                                       | Why                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Deleting a sermon deletes its outline (CASCADE)                | An outline is the sermon's content, as its references and tags are. Preaching history still refuses the deletion first       |
| The owner is stored on the outline and on each entry           | The project's rule: the keys carry it, so the database refuses a row across accounts                                         |
| An entry's title may be empty                                  | The editor can make a row and then type in it. A point with no heading yet is not an error                                   |
| The introduction and the conclusion use the same columns       | A title and notes are enough for both; their heading is the interface's to say                                               |
| Outline work does not move `last_developed_at` or `updated_at` | `AGENTS.md` says only the idea's own content sets it. Whether an outline is "development" is a question for the owner        |
| A cap of 500 entries, and no cap on depth                      | Something has to bound a request; depth is then bounded by the same number                                                   |
| Entry notes of at most 2,000 characters                        | "Brief notes". An idea's notes may be 20,000; copied from a point, longer notes are cut to 2,000 and the point keeps its own |
| A table for an entry's passages now                            | It is one small table mirroring the existing one, and saves a second migration in 3C                                         |

## 4. Hierarchy and ordering

- A point's `position` is its place among the points with the same parent: 0, 1, 2, … with none missing. A section's is 0 and means nothing.
- `tree.ts` is pure and has no server code. `orderEntries` gives the display order (introduction; each point, then what is under it; conclusion) with each entry's `depth` and `path`. `planInsert`, `planMove`, and `planRemove` say which rows must be written; `isWithin` and `subtreeIds` walk the tree. None of them calls itself.
- A change of shape is one transaction: lock the outline's row, read every entry, plan in memory, write, count the change. It is all or nothing.
- **A subtree moves by one row**: the moved point's `parent_id` and `position`, plus the positions of the points it leaves and the ones it joins.
- Rows are first set aside at negative positions and then given their places (`place`), because PostgreSQL checks a unique index row by row.
- Removing an entry removes what is under it (the parent key cascades) and closes the gap.
- A move to where the point already is writes nothing and is not counted.

## 5. Numbering

`numbering.ts`, pure, usable in the browser.

**Stored** in `numbering_config`: `{version: 1, preset: "<name>"}`, or `{version: 1, preset: "custom", levels, overflow, repeatFrom}`.

| Style         | Levels                                                              |
| ------------- | ------------------------------------------------------------------- |
| `traditional` | I. · A. · 1. · a. · i. · (1) · (a) · (i), then the last three again |
| `decimal`     | 1. · 1.1. · 1.1.1. · …                                              |
| `numeric`     | 1. at every level                                                   |
| `alphabetic`  | A. · a. · A. · a. · …                                               |
| `roman`       | I. · i. · I. · i. · …                                               |
| `bullets`     | • · ◦ · ▪, then again                                               |
| `none`        | No number at any level                                              |

A custom level has: `counter` (`decimal`, `alpha`, `roman`, `bullet`, `none`), `case`, `bullet` (one of • ◦ ▪ –), `prefix` and `suffix` (16 characters each), `composite` (the levels above are written first, each in its own style), and `separator` (4 characters). Up to 12 levels. The brief's example (`POINT I`, `SECTION A`, `(1)`, `(a)`, `(i)`) is one of the tests.

**Rules that are fixed and tested:**

- Letters go on past Z as a spreadsheet's columns do: Z, AA, AB, … ZZ, AAA.
- Roman numerals are written to 3,999. Beyond it the number is given in digits.
- A level deeper than the last one written follows `overflow`: `repeat` (the levels again from `repeatFrom`), `last` (the last level for ever), or `none` (no number).
- A label is never longer than 64 characters. A longer one keeps its end, after "…".
- The introduction and the conclusion have no label and are not counted.
- A prefix, suffix, or separator with a control character, a line break, or `<` `>` is refused. A stored configuration is at most 4,000 characters.
- A stored configuration that cannot be read is read as `traditional`, and is not rewritten.

Changing the numbering writes `numbering_config` and nothing else; a test compares every entry row before and after.

## 6. Saved points and Scripture

- `createEntry` with `sourcePointId`: the idea must be the owner's and filed as a point (`unknown_source` otherwise, for someone else's point exactly as for none). The title and notes are copied where the request gives none. Nothing is written to the point, then or later.
- One point may be the source of many entries, in many outlines.
- Deleting the point keeps every entry made from it and clears `source_point_id`. Refiling the point keeps the link.
- `setEntryReferences` replaces an entry's passages. They are validated with `referenceShape`, `refineReference`, `normaliseReference`, and `referenceKey` from `features/scripture/reference.ts`; nothing of the Bible was duplicated. Up to 10 to an entry. The point's own passages are not copied to an entry: 3C decides that.

## 7. Services and actions

`outlines.ts`: `createOutline`, `getOutline`, `getOutlineForSermon`, `listOutlines`, `setNumbering`, `deleteOutline`.
`entries.ts`: `createEntry`, `updateEntry`, `moveEntry`, `deleteEntry`, `setEntryReferences`, `listEntries`, `getEntry`.
`actions.ts`: `createOutline`, `setOutlineNumbering`, `deleteOutline`, `addEntry`, `updateEntry`, `setEntryReferences`, `moveEntry`, `removeEntry`.

**Authorization.** Every action calls `authorize("active")` and takes the owner from the session; no input can name one. Every service puts the owner in the WHERE clause of each statement. What is missing and what is someone else's are the same answer. Tested: a signed-out and a disabled caller are refused before the database is touched; every action called by another account answers `missing` and every row is identical afterwards; an input naming another owner, an outline, a position, or a revision changes none of them.

**For autosave** (the controller itself is 3B's):

- A field at a time: `updateEntry(id, {title})` leaves the notes alone; `{notes: null}` clears them.
- Each change of shape is its own action.
- `expectedRevision` is optional on all of them. The shape's revision is the outline's; the words' is the entry's. A stale change writes nothing and answers `stale` (with the outline's revision) or `stale_entry` (with the entry as it stands).
- Every answer carries a `code` when refused, the outline's `revision` after a change of shape, and the entry after a change to one.
- An entry's ID may come from the browser; the same ID twice returns the first row and adds nothing.
- A database failure is logged without a connection string and answered as `failed` with a fixed message.

## 8. Concurrency

Every write locks the outline's row (`FOR UPDATE`) before it touches an entry, so two writes to one outline never run at once. An entry made from a point takes the point's row (`FOR KEY SHARE`) before the outline's.

PGlite is one connection and cannot race. The committed test checks, from the statements sent, that the lock comes before the first write in every operation. The races themselves were run once against the development database on separate connections, from a temporary test file that made a throwaway account, removed it and everything under it, asserted that nothing of it was left, and was then deleted:

| Race                                                             | Result                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 8 simultaneous `createOutline` for one sermon                    | 1 `created`, 7 `exists`, one row                                          |
| 10 simultaneous moves, insertions, and a removal on one outline  | All made; every sibling list whole; no loop; revision counted each change |
| Two moves that together would make a loop (A under B, B under A) | 1 `moved`, 1 `cycle`                                                      |
| 4 moves naming the same revision                                 | 1 `moved`, 3 `stale`                                                      |
| 8 edits and 4 moves of the same four entries at once             | All made, none lost, no deadlock                                          |
| A point deleted while three entries were being made from it      | All made, the point deleted, every link cleared                           |

**The last one failed twice before it passed, and the fixes are in the code.** First a foreign-key error (`23503`) escaped when the point vanished between being read and being named; `createEntry` now answers `unknown_source`. Then a deadlock (`40P01`): the insertion held the outline and reached for the point while the deletion held the point and reached for the entries. The point is now taken first. It passed five runs after that. Each time, before the fix as after, nothing was half-written.

## 9. Verification

| Check                                                             | Result                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run typecheck`                                               | **Pass**                                                          |
| ESLint on the changed source files                                | **Pass**                                                          |
| `prettier --check --end-of-line auto` on the changed source files | **Pass**                                                          |
| Focused Vitest run (files below), on the final code               | **Pass**: 10 files, 224 tests (143 of them new)                   |
| The concurrency run against development (section 8)               | **Pass**, after two fixes                                         |
| `npm run build`                                                   | **Pass**, once; "not a production deployment, migrations skipped" |
| `npm run db:status` before                                        | Declared and stamped development; 13 applied, 1 pending (`0013`)  |
| `npm run db:migrate:dev`                                          | "applied 1 migration(s) to development"                           |
| `npm run db:status` after                                         | 14 applied, 0 pending                                             |
| The whole unit suite                                              | **Not run**                                                       |
| `npx playwright test`                                             | **Not run**                                                       |
| A signed-in browser                                               | **Not applicable**: there is nothing to see                       |

Test files run: everything in `src/features/outlines` (`numbering.test.ts`, `tree.test.ts`, `outlines.test.ts`, `entries.test.ts`, `actions.test.ts`), `src/db/outline-migration.test.ts`, `src/i18n`, and the existing `src/features/ideas/ideas.test.ts` and `relations.test.ts`.

The build ran before the documentation was written and after the last change to code.

**Why not the whole unit suite.** `ARCHITECTURE.md` names a migration and the dictionaries as reasons for one. This migration adds tables nothing else reads, and the dictionary change adds a feature's file; the tests of what could be touched were run (the i18n tests, which check every feature's two files against each other, and the idea tests, since deleting an idea now cascades further), and type checking covers every caller. It is the right check before release, with the ones still outstanding from Phase 2E.2 onward.

**No separate `schemas.test.ts`.** The plan named one. The schemas are exercised where they are used, in `entries.test.ts`, `numbering.test.ts`, and `actions.test.ts` (lengths, malformed input, both languages), and a third file would have repeated them.

### Database and deployment

| Fact                                              | State                                     |
| ------------------------------------------------- | ----------------------------------------- |
| Migration `0013` applied to development           | Yes                                       |
| Migration `0013` applied to production or preview | **No** (previews share development)       |
| Migrations `0009` to `0012` in production         | **No**, as far as this repository records |
| Phase 3A deployed                                 | **No**                                    |

A release from here applies `0009` through `0013` together, in order, during the production build. `0013` only adds tables and is safe under the code live while it runs.

## 10. Known limitations

- **One clause of the migration was written by hand** (`ON DELETE set null ("source_point_id")`), before it was applied anywhere, because Drizzle cannot express it. `schema.ts` and the snapshot say plain `set null`. A later migration that drops and re-adds that key must carry the clause, and a test fails if the file loses it. It needs PostgreSQL 15 or later; development took it, and production's version was not looked at.
- **Deleting a sermon deletes its outline without saying so.** `deleteIdea` answers `deleted` as before. When 3C puts outlines on a sermon's page, the delete confirmation should mention the outline.
- **Nothing is revalidated**, because no page reads an outline yet. The first page that does must add `revalidatePath` to the actions.
- **`orderEntries` returns a `path` for every entry**, as long as the entry is deep, so its result grows with the square of the depth. At 500 entries that is small; raising `outlineLimits.entries` a great deal would be the moment to change it.
- **A positions unique index is a backstop, not the mechanism.** The lock is what keeps order. If the lock were ever dropped, the index would turn silent corruption into a failed request.
- **The Spanish wording is the agent's** and was not reviewed by a Spanish reader. "Bosquejo" is used for "outline".
- **No test covers the race in the committed suite**, for the reason in section 8. The lock-order test would catch the lock being removed, not a new path taking locks in another order.
- Carried and unchanged: the whole unit suite, the end-to-end suite, and the signed-in browser passes for Phase 2E.2 onward.

## 11. For Phase 3B

**What the editor can use as it is:**

- `getOutlineForSermon(db, owner, sermonId)` / `getOutline(db, owner, id)`: the outline, its sermon, and every entry in display order, each with `depth`, `path`, `revision`, and `references`. Two queries plus one for the outline.
- `numberOutline(entries, outline.numbering)` → a label for each entry ID. It and `orderEntries`, `planMove`, `planInsert`, and `planRemove` run in the browser, so a move can be shown, renumbered, before the server answers, with the same code the server will use.
- The eight actions, each answering with a `code`, the `revision`, and the entry.
- `outlineSchemas(locale)` to check a title or notes in the browser first, in the account's language, and `numberingConfigSchema` for a numbering form. `numberingPresets` holds each built-in style in full, to show a sample or start a custom one from.
- `outlineLimits` and `numberingLimits` for the form's limits.

**What 3B must keep:**

- Send `expectedRevision` with each change, and take the next one from the answer. On `stale`, read the outline again; do not retry blind. On `stale_entry`, the answer holds the entry as it stands.
- Generate an entry's ID in the browser and send it with `addEntry`, so a retry after a lost answer adds nothing.
- Change `position` and `parent_id` only through `moveEntry`. Never send a list of positions.
- Never put a number in a title, and never store a label.
- Cap indentation on screen if it must; do not cap depth in the data.
- The introduction and the conclusion cannot be dragged; `moveEntry` answers `section`.
- A point's heading may be empty while it is being written; show a placeholder, do not refuse the row.
- Add its own strings to the `outlines` dictionary in both languages: the editor's labels, the section names, and the preset names are not there yet.
- Add `revalidatePath` to the actions when a page first shows an outline.

**What 3B and 3C still have to decide, and nothing here assumes:**

- Whether working on an outline counts as developing the sermon (`last_developed_at`). Today it does not.
- Where an outline lives in the address (`routes` in `src/lib/site.ts` has no entry for it) and when it joins the main navigation.
- What is copied when a saved point is placed: today its title and notes; its passages are not.
- Whether a point idea can be made from an entry. Nothing here does it.

## Process

No Git command that changes anything was run (`git status` was used to read). No server was started; the build and the test runs ended by themselves. No package was installed. The development database was changed by `npm run db:migrate:dev` applying `0013`, and by the concurrency run, which removed everything it made. Production and preview were not touched. `drizzle/0013_outline_foundation.sql` was generated twice: the first, never applied, was discarded to give one foreign key a name short enough for PostgreSQL.
