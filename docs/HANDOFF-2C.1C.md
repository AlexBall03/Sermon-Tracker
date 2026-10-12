# Phase 2C.1C Handoff — From the Bible to an Idea

Written 12 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Scripture on an idea", "Bible reader", and "Quick capture"); [DATABASE.md](DATABASE.md) has the one table involved; this is the summary.

## A. Implementation summary

Phases 2C.1A and 2C.1B built a Bible that could be read, copied from, highlighted, and saved from. This phase joins it to what the application is for: a selection can be put on a sermon or point idea, an idea can be begun from one, and an idea's reference leads to its passage and back. It completes the King James Bible. Nothing of the bilingual milestone was built.

**Status.** Everything in the brief is implemented and covered by tests. Lint, type checking, the unit, component, and database tests, the production build, and the guest end-to-end suite pass (section E). **None of it was seen signed in**, and the signed-in end-to-end test is written but **has never run**: like the three before it, it needs the development test account. The visual check was done on a temporary preview with sample data (section E).

**The workflows**

- **Bible → existing idea.** Select a verse, a passage, verses that are apart, or a chapter. **Idea** in the selection toolbar opens "Add to an idea": the passage named at the top, a search box, All ideas / Sermons / Points, and the ideas changed most recently until something is typed. Choosing one adds the passage, closes the dialog, and confirms with a toast that links to the idea. The reader does not move and the selection stays.
- **Bible → new idea.** "New sermon idea" and "New point idea" in the same dialog open quick capture with the kind chosen and every passage of the selection already in it. Nothing is saved until Save. Closing it untouched asks nothing and writes nothing; anything written beyond the passage is guarded as quick capture always is.
- **Saved Scripture → idea.** Each saved passage in the library has "Add to idea", which opens the same dialog with that passage, whole. Both paths above work from it.
- **Idea → Bible.** On an idea's page each reference is a row. Opening it shows its text in place; the arrow opens it in the Bible, at its chapter, with the whole passage lit for a moment and "Back to _the idea_" above the text. The reference previews elsewhere (library cards, quick capture) gained "Open in Bible" too.
- **Sermon and point ideas are one kind of record**, so all of this is the same for both, and for undecided ideas. A point needs no sermon to hold Scripture.

## B. Architecture and database

**No schema change and no migration.** `idea_scripture_references` (Phase 2A) already was what the brief asks for: a reference is five numbers (`book`, `chapter_start`, `verse_start`, `chapter_end`, `verse_end`), with no translation and no verse text. `npm run db:generate` was not needed; `db:status` reports 6 applied, 0 pending, as before.

- **Adding** is `attachReferences` (`src/features/ideas/ideas.ts`) behind the `attachScripture` server action: `authorize("active")`, Zod (`attachInputSchema`), the owner from the session, fixed messages, one answer for "missing" and "someone else's".
- **Concurrency.** One transaction reads the idea `WHERE id AND owner_id FOR UPDATE`, reads its references, inserts the new ones after the last position, and sets `updated_at`. Two requests for one idea run in turn; the editor's Save takes the same lock through its `UPDATE`. `UNIQUE (idea_id, position)` is the backstop.
- **Duplicates.** A passage the idea already has, exactly (`referenceKey`), is not added again: a repeat is answered as done. A passage that only overlaps another is a different passage and is kept. The same passage twice in one request counts once.
- **Verses apart stay apart.** The selection arrives as one reference per unbroken run, and each is its own row: John 3:3, 5–6, 8 is three references, never "3–8".
- **All or nothing.** More than the idea has room for (25) adds none and says how many would fit.
- **Favorites are copied, not linked.** A saved passage reaches an idea as references (`versesToRuns`). No table joins them. Removing the favorite leaves the idea's references; removing the references, or the idea, leaves the favorite. Both directions are tested on the database.
- **Finding an idea** is `GET /api/ideas/search?q=&kind=`: the library's own `searchIdeas`, owner in the WHERE clause, only the words and the kind taken from the address through `parseLibraryQuery`, eight results, `no-store`. It returns title, kind, status, a sermon's subject, and references; no notes, owner, or dates.
- **The reader's address** gained two optional parts, both through `reader-location.ts`: `through` (the last verse of a passage pointed out) and `idea` (the idea it was opened from). `idea` is only an ID: the Bible page looks it up among the signed-in account's ideas, and an ID that is malformed, unknown, or someone else's offers no way back and says nothing.
- **Compatibility decisions.** A unique constraint over the passage was considered and left out: the code live before this phase replaces references by delete and insert, every writer now takes the row lock, and a migration that could fail on unknown existing rows would have bought nothing. Attaching bumps `updated_at` (it is a change to the idea); tagging still does not.
- **No new dependency.**

## C. UI and UX

- **Selection toolbar.** A third kept action, **Idea**, beside Highlight and Favorite. It is one word because six words only just fit one line of the reading column; its accessible name and tooltip are "Add to an idea". The width at which words give way to icons moved from 39rem to 41.5rem to suit.
- **Add to an idea dialog.** Floats where the window is wide and tall enough; takes the whole screen below 48rem wide or 34rem tall, so a phone on its side keeps the list and the footer in view. Focus starts in the search box and returns to the button that opened it. Results dim while a search is on its way. An idea that already has the passage reads "Added" and cannot be chosen. Rows are at least 56px on touch.
- **Idea page.** References are rows, closed by default so twenty-five stay scannable; a row opens its text in place with a height transition (still under reduced motion), up to twelve verses, with "Read or change" for the panel. Each row has Open in the Bible, the main-text star on a sermon, and Remove, all 44px tall.
- **Arriving at a passage.** The whole passage is tinted by the same passing light one verse had, together, and lets go together. It is never a selection and never a highlight; a highlighted verse inside it keeps its color.
- **Back to the idea** sits quietly above the text for as long as the reading goes on from there, 44px tall on touch.
- **The reader's page title** is now the chapter ("John 3 · Sermon Tracker"), a gap noted in the last two handoffs.
- **The editor follows the saved idea.** Found while building: Next keeps a page it has left, so an editor kept from before a passage was added from the Bible would have saved without it and removed it. The editor now takes up the idea when the server sends it again, keeping unsaved edits and bringing in passages added elsewhere.

**Found and fixed from the visual check**

- At 1280px with the sidebar open, the new button wrapped alone onto a third line of the toolbar. It became one word, with the breakpoint moved.
- The dialog's footer wrapped to two uneven lines. The two buttons now share one line equally at every width.
- On a phone on its side (844 by 390) the dialog's footer was clipped off the screen. It now takes the whole screen there.

## D. Files changed

**New**

| File                                                              | Purpose                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/features/ideas/components/attach-scripture.tsx`              | The one dialog: find an idea, add the passage, or begin one |
| `src/features/ideas/idea-search.ts`                               | The picker's request and answer, with no server code        |
| `src/app/api/ideas/search/route.ts`                               | The account's ideas by name                                 |
| `tests/e2e/scripture-ideas.spec.ts`                               | The signed-in scenario (skipped without a test account)     |
| `…/attach-scripture.test.tsx`, `…/api/ideas/search/route.test.ts` | Their tests                                                 |

**Changed**

| File                                                                  | Change                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/features/ideas/ideas.ts`, `actions.ts`, `schemas.ts`             | `attachReferences`, `attachScripture`, `attachInputSchema`   |
| `src/features/ideas/components/quick-capture.tsx`                     | `openWith({ kind, references })`; "dirty" is beyond the seed |
| `src/features/ideas/components/idea-editor.tsx`, `idea-fields.tsx`    | Rows on the idea's page; the editor follows the saved idea   |
| `src/features/scripture/reader-location.ts`                           | `through`, `idea`, `referenceLocation`                       |
| `src/features/scripture/components/bible-reader.tsx`                  | The dialog, the lit passage, the way back, the page title    |
| `src/features/scripture/components/saved/selection-actions.tsx`       | The Idea action                                              |
| `src/features/scripture/components/selection-toolbar.tsx`             | The label breakpoint                                         |
| `src/features/scripture/components/scripture-field.tsx`               | `layout="rows"` and `origin`                                 |
| `src/features/scripture/components/reference-chip.tsx`                | "Open in Bible"                                              |
| `src/features/scripture/components/saved/saved-results.tsx`           | "Add to idea" on a saved passage                             |
| `src/app/(app)/bible/page.tsx`                                        | Looks up the origin idea, owner-scoped                       |
| `ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/ROADMAP.md`, `AGENTS.md` | This phase, and the bilingual milestone's place in the order |

Existing test files gained cases; none was removed and none was weakened. One assertion changed on purpose: the idea page test expected reference chips and now expects rows.

## E. Validation results

| Command             | Result                            | Notes                                                                                      |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run lint`      | Pass                              |                                                                                            |
| `npm run typecheck` | Pass                              |                                                                                            |
| `npm run test`      | **889 of 889 pass** (55 files)    | Was 804 in 53 files                                                                        |
| `npm run build`     | Pass                              | Run by the end-to-end suite                                                                |
| `npm run test:e2e`  | **57 pass, 11 skipped, 0 failed** | Skipped: the signed-in specs (2 new, 2 saved Scripture, 4 Bible, 2 library) and 1 existing |
| `npm run db:status` | 6 applied, 0 pending; check ok    | Development database, read only. No migration was generated or applied                     |
| Prettier            | Changed and new files pass        | `npm run format:check` as a whole was not run, as in earlier phases (untouched CRLF files) |

The first end-to-end run failed at the build's type check, on a generated file (`.next/dev/types/validator.ts`) left by the dev server used for the visual check, which still named the deleted preview route. The generated directory was removed, `next typegen` regenerated it, and the second run is the one reported. It was not a fault in the application.

**New automated coverage**

- **Service** (PGlite, real migrations): one verse, a passage, verses apart; a point with no sermon; order and main text untouched; exact duplicates; mixed new and held; overlapping ranges kept; the limit, all or nothing; `updated_at` only when something was added; two requests at once; another account's ID and an unknown one; cascade on delete; a single favorite and a grouped one; independence in both directions.
- **Action**: signed out and denied; owner from the session whatever the input claims; missing and foreign IDs identical; empty selection, malformed ID, a verse that does not exist; the limit's two messages; a repeat; a database failure without detail.
- **Route**: refused without an account; owner scoping; recent ideas; kind; subject only on a sermon; eight results and the full count; nothing taken from the address but words and kind, with `%` literal; never cached; failure without detail.
- **Dialog** (22): the passage named; debounce; kind switching; a replaced search dropped; adding to a sermon and to a point; already added; partly held; one request however often pressed, and not closable meanwhile; refusal and no connection; cancel and Escape change nothing and return focus; empty states; try again; too many passages; new sermon and new point ideas seeded; abandoning one leaves nothing; edits beyond the seed are guarded.
- **Reader**: the action and its neighbors; one verse, a passage, verses apart, a whole chapter; the reader and selection left as they were; highlights untouched; the lit passage, unselected and unhighlighted, let go together; a bad `through` rewritten; the way back, kept while reading on and out of a copied link; none for an idea the server did not find; the page title.
- **Editor**: rows on a sermon and a point; open and close in place; the Bible links with `through` and `idea`; removal only with Save and nothing else changed; a passage added elsewhere shown, kept beside unsaved edits, and saved with them; a removed one not brought back.
- **Saved Scripture page**: a saved passage as one reference; a grouped one as three; a new idea from one; the favorite neither changed nor removed.
- **Address**: `through` and `idea` read leniently and written canonically; every shape of reference to a location; no translation in it.

**Visual check.** A temporary, unauthenticated preview route rendered the real reader, editor, and saved Scripture components with sample ideas and the real King James text, on a dev server started for the purpose on port 3200, and was driven by a headless browser at 360, 390, 844 by 390 (landscape), 820, 1280, and 1920 pixels in both themes. Measured, not judged by eye: no horizontal overflow at any size; the toolbar and dialog wholly inside the window; toolbar targets 40 by 44 on touch; editor row targets 44 by 44; the passage lit as verses 16, 17, 18; focus in the search box on opening, on the capture title after handing on, and back on the toolbar button after Escape; focus held inside the dialog through a full Tab cycle; a visible focus outline; nothing animating at rest under reduced motion. Console output was read: only Next's and Clerk's own development notices, none from this work, and no hydration warning.

**Limits.** Not seen signed in. The preview's ideas and chapters were supplied by the test browser, so the real search endpoint and the real attach were exercised by the unit and database tests and not in a browser. Not checked on a real phone or with a screen reader.

## F. Process cleanup

- **Started by this work:** one dev server on port 3200 for the visual check, stopped by process ID (and its child); Playwright's production server on port 3100, twice, stopped by Playwright; Vitest runs; short-lived headless Chromium instances, each closed by its script.
- **Confirmed afterwards:** nothing is listening on 3100 or 3200.
- **Not touched:** no dev server of the owner's was running on port 3000, and no other process was stopped.
- The temporary preview route (`src/app/preview-2c1c/`) was created and deleted and is not in the working tree. Patch scripts and screenshots are in the session's temporary directory, outside the repository.
- No production database command, no migration, no deployment, and no Git command that changes anything.

## G. Outstanding issues

- **Signed-in end-to-end coverage has never run**, for this phase or the three before it. To run it: put an admitted development Clerk user's address in `.env.local` as `E2E_CLERK_USER_EMAIL=...`, then `npm run test:e2e`. `scripture-ideas.spec.ts` creates one point idea with a unique title and deletes it. Because it has never executed, expect that a selector may need adjusting on the first run.
- **Not verified signed in in a browser.** The most useful first checks: add a selection to an idea and open the idea; start a point idea from a selection; open a reference in the Bible from an idea and come back.
- **Row locking is not proved under true concurrency.** PGlite is one connection, so the simultaneous-request test proves the logic and not two real transactions. The design is ordinary PostgreSQL row locking over the WebSocket pool, which already carries the last-administrator transaction.
- **The spec speaks of an existing sermon-to-point relationship. There is none yet** (roadmap 2C.2), so nothing here builds on or disturbs one.
- **Returning from the Bible goes to the idea, not to the library search the idea was opened from.** "Back to …" links to `/library/<id>`; the browser's Back keeps the full trail.
- **The toolbar's new button says "Idea"**, which is terser than "Add to idea". It is the price of one line; say if you would rather have two lines and the longer word.
- **A passage across chapters is lit only to the end of its first chapter.**
- **A favorite with more than 25 separate runs of verses cannot be added to one idea**; the dialog says so. An idea's limit is 25 references.
- **The picker shows eight ideas** and narrows by typing; it does not page.
- **A reference removed from an idea elsewhere while that idea's editor holds unsaved edits** stays in the draft and is saved back. Additions are merged; removals are not.
- **Saved Scripture is not offered inside the idea editor.** Reuse runs from the favorite to the idea, not the other way.
- Carried over, unchanged: highlights are not shown in the Scripture Panel or quick preview; marks made on another device appear on the next visit to a chapter; selection is within one chapter; `npm run format:check` reports the untouched CRLF files.

## H. Readiness for the bilingual milestone

**The code is ready for it. One prerequisite outside the code is not met.**

- **References are translation-independent.** A reference on an idea is five numbers. The reader's address, `through` and `idea` included, names no translation. Nothing added in this phase stores King James text or a King James string as identity; the only strings are for display, formatted from the numbers when shown.
- **Relationships are not per translation.** An idea has one row per passage. A second translation adds no rows to it.
- **Where a translation will have to be named**, all known and all small:
  - `bible_verses` and `bible_psalm_titles` hold one text with no translation column. This is the schema change the milestone makes.
  - `getChapter`, `/api/bible/<book>/<chapter>`, the search, and `use-chapter.ts` fetch "the" text. Each needs a translation in its key.
  - The reader's address needs one more parameter beside `book`. `reader-location.ts` is the only place it is read or written.
  - The saved Scripture preview reads `bible_verses` (noted in 2C.1B).
  - `translation` in `books.ts` is one constant; "King James Version" also appears as a literal in the Scripture Panel's header, the reference preview, and the new row. Those literals should read from it.
  - Favorites and highlights already carry a translation on every row.
- **Versification.** References are validated against the King James verse counts (`versification.ts`). If the RVG numbers any chapter differently, a reference valid in one could point at a different verse, or none, in the other. This needs checking against the actual RVG 2023 text before the data model for a second translation is settled; it is the one place "translation-independent" depends on the two texts agreeing.
- **User-written text is not translated** and nothing here assumes it will be.
- **RVG 2023 licensing is unresolved, and is the blocker.** No permission to store, serve, or display the text has been assumed, and no RVG text or file has been added. Written permission from the rights holder, covering storage in the database and display to signed-in users, is needed before the text is loaded. `data/bible/README.md` records where the King James data came from and is the pattern for recording that.
- **Interface localization has no groundwork.** Every string is an English literal in its component. That is expected at this stage and is the bulk of the milestone's work.

## I. Git status

Nothing was committed, staged, or pushed; the branch is `dev`, as it was. The working tree holds 27 modified files and 6 new ones, all part of this phase, plus this document. `.next/` and the session's temporary files are outside Git. `AGENTS.md` carries three new project notes and the link to this handoff. The changes are ready to review and commit.
