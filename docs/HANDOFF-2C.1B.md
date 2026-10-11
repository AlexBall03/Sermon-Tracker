# Phase 2C.1B Handoff — Bible Favorites & Highlights

Written 10 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Saved Scripture", "Bible reader", and "Library"); [DATABASE.md](DATABASE.md) has the three tables; this is the summary.

## 1. Phase summary

Phase 2C.1A built the Bible reader with a temporary selection and a toolbar that could copy. This phase adds what is kept from reading: **favorites** (a verse, a passage, or verses that are apart, saved as one, with an optional label and notes) and **highlights** (yellow, green, blue, or red, one color to a verse), both stored per account, and a **Saved Scripture** section inside the existing library. Nothing was added to the main navigation.

**Status.** Everything in the brief is implemented and covered by tests. Lint, type checking, the unit, component, and database tests, the production build, and the guest end-to-end suite pass (section 10). **I did not see any of it signed in**, and the signed-in end-to-end test is written but **has never run**: like the two before it, it needs the development test account. The visual check was done on a temporary preview with sample data (section 9).

Not built, by design: attaching a selection to an idea (2C.1C), translations, Spanish, side-by-side reading, sharing, and outlines.

One small change outside the phase, asked for with it: the reader's search box now reads "Words or a reference" where it read "Words, or Romans 8:28".

## 2. Implemented functionality

**In the Bible reader**

- **Highlight** in the selection toolbar: four named swatches, applied to every selected verse in one action. A color replaces the one before; a verse never has two. "Remove highlight" appears when a selected verse has one. A selection of mixed colors says so in words.
- **Favorite** in the selection toolbar: one click saves the selection, with a confirmation that links to the library. If exactly that selection is already saved, the button reads "Saved" and opens it. Nothing is saved twice.
- A line in the toolbar names any favorites the selected verses already belong to, each opening to be changed or removed.
- Highlighted verses are drawn with a highlighter's stroke behind the words; verses in a favorite carry a small gold star under the number. Both are also said to screen readers.
- **Shift and a click** selects every verse from the last one clicked to this one.
- Highlights and stars arrive with the chapter, survive a reload and a change of device, and are there as a neighbouring chapter slides in.
- The toolbar now has two lines (the passage, then its actions), because five actions and a reference do not fit one line beside an open sidebar. Buttons show words where the toolbar has room for all of them and icons where it has not.

**In the library**

- Two sections under the Library heading: **Ideas** (as before) and **Saved Scripture** (`/library/scripture`).
- Saved Scripture: search over reference, label, and notes; a Book filter; highlight-color toggles; three orders (recently saved, recently updated, biblical order); pages; three empty states.
- Each passage shows its label, its reference as a link into the Bible at its first verse, its first three verses, its notes, the colors its verses carry, and when it was saved, with Edit and Remove.

**Editing a favorite** (one dialog, from the reader and from the library): the passage itself, typed ("Romans 3:10, 23; 6:23"); a label; notes up to 2,000 characters with a count; Save; Remove, confirmed first.

## 3. Technical architecture

- **Everything is in `src/features/scripture/saved/`**, beside the existing Scripture code and using it: `model.ts` (colors, limits, orders, shared types), `verse-set.ts` (the pure verse-set functions), `schemas.ts` (Zod), `favorites.ts` and `highlights.ts` (services), `actions.ts` (server actions), `saved-query.ts` (the URL contract), `highlight-style.ts` (color to utility class).
- **A favorite is a set of verses**, `{ book, chapter, verse }[]`, normalised to canonical order. `formatVerseSet` and `parseVerseSet` write and read "Romans 3:10, 23; 6:23". It converts to and from `ScriptureReference[]`, which is what 2C.1C will attach to ideas.
- **Reads for the reader**: `GET /api/bible/<book>/<chapter>/marks`, uncached, self-authorising, two queries. The Bible page sends the same with the chapter it sends.
- **`use-chapter-marks.ts`** is the browser's one store of marks, per chapter: shown from memory, refreshed when the chapter is shown, neighbours fetched ahead. Highlights are optimistic through an ordered queue; a refused change is undone by itself and reported; a stale or overtaken answer cannot land on the wrong chapter.
- **`PassageText`** gained `highlights`, `favorites`, and `onSelectThrough`. The Scripture Panel passes none of them and is unchanged; `scripture.test.tsx` passes untouched.
- **`SelectionToolbar`** gained a `footer` slot and a two-line layout; its `children` slot is used as intended.
- **Library**: the generic part of `LibraryProvider` moved into `useQueryNavigation`, and the search box into `SearchBox`, so both sections share them. `LibraryProvider`, `LibrarySearch`, and `useLibrary` keep their APIs. `Pagination` accepts an `hrefAt` for a section with its own query.
- **No new dependency.**

## 4. Database changes

Three tables, all personal data keyed by owner. Details and the SQL of the filters are in [DATABASE.md](DATABASE.md).

| Table                   | What                          | Key constraints                                                                                                       |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `bible_favorites`       | One row per saved passage     | `UNIQUE (owner_id, translation, selection_key)`; `UNIQUE (id, owner_id)`; CHECKs on translation, label, notes         |
| `bible_favorite_verses` | One row per verse of it       | PK `(favorite_id, book, chapter, verse)`; `UNIQUE (favorite_id, position)`; FK `(favorite_id, owner_id)` with CASCADE |
| `bible_highlights`      | One row per highlighted verse | PK `(owner_id, translation, book, chapter, verse)`; CHECKs on translation, color, place                               |

- **No duplicates under concurrency**: the unique constraint on the digest of the verses decides, and the insert is `ON CONFLICT DO NOTHING` followed by a read.
- **One color per verse** is the primary key itself.
- **Isolation is in the database too**: a verse row cannot exist for another account's favorite.
- **Translation is stored on every row** and is part of both identities. Only `kjv` is admitted today.
- Indexes: three on `bible_favorites` (one per library order) and one on `bible_favorite_verses (owner_id, book, chapter)`.

## 5. Migration information

- **One migration: `drizzle/0005_bible_favorites_and_highlights.sql`**, generated by `npm run db:generate` and not edited. It creates three tables and their indexes and changes nothing that exists, so it is safe under the code already in production. Its statement order was read: the unique constraint the composite foreign key points at is created with its table, before the key.
- **Applied to development** with `npm run db:migrate:dev`: "applied 1 migration(s)", then `db:status` reported 6 applied, 0 pending.
- **Production** is migrated by its own next build, as always. No production command, `db:stamp`, or `drizzle-kit push` was run.
- Between the code being written and the migration being applied, the owner's signed-in dev session read chapters whose marks query failed (the table did not exist yet). The log shows the failures and the pages were served: the text does not depend on the marks. In production the migration runs before the deployment goes live, so this window should not be seen.

## 6. Navigation decisions

- **No main-navigation item was added.** `app-links.ts` is untouched. Saved Scripture is `/library/scripture`, chosen with the `LibrarySections` tabs under the Library heading, which both sections render.
- `/library` behaves exactly as before; its URL parameters are unchanged. Each section keeps its own query in its own address, so Back and Forward retrace both, and switching section starts that section fresh.
- `/library/scripture` is a static segment and takes precedence over `/library/<id>`, which already refuses anything that is not a UUID.
- The route is listed in `privateRoutes` and `appRoutes` (`src/lib/site.ts`): guests are sent to sign-in and `robots.txt` disallows it. The page calls `requireActiveUser()` itself.
- A favorite links into the reader with `readerHref` at its first verse. The reader still moves with `pushState` and its address contract is unchanged.

## 7. Favorites behaviour

- **What can be saved**: one verse; a passage; verses that are apart; a whole chapter (as its verses). In the reader a selection is within one chapter. The editor's typed passage, the table, and the formatter all take verses across chapters and books ("Romans 3:10, 23; 6:23"), so such a favorite can be made by editing one.
- **Identity** is the verses and the translation. Label and notes are not part of it.
- **Duplicates**: saving the same verses again returns the favorite there was, unchanged. Changing a favorite's verses to another's is refused, names the conflict, and changes neither.
- **Display name**: the label if there is one, otherwise the reference.
- **Limits**: 200 verses, label 120 characters, notes 2,000 (the last two also CHECK constraints).
- **Deleting** removes the favorite and its verse rows only. Highlights, other favorites, and ideas are untouched, and the confirmation says so.
- **Validation** is on the server in every action: a verse that does not exist is refused, not dropped. A psalm's title has no verse number and cannot be saved.

## 8. Highlight behaviour

- **Colors**: yellow `#FDE68A`, green `#86EFAC`, blue `#93C5FD`, red `#FCA5A5`, as tokens (`--highlight-*` in `globals.css`), thinned separately for light and dark so the text stays readable. No hex in components.
- **One per verse**, by the table's primary key. Applying a color to a selection is one statement for all of it; a mixed selection becomes one color.
- **Independent of favorites** in both directions, in the schema and in the tests.
- **Selection and highlight are drawn differently** (row tint and emerald number; stroke behind the words), so a verse that is both shows both.
- **Never color alone**: swatches are named, the color in force is ticked, mixed state is said in words, and a highlighted verse says its color to assistive technology.
- **Optimistic, and honest about failure**: shown at once, taken back if the server refuses or cannot be reached, with the reason in the toolbar.
- **Only in the reader.** The Scripture Panel and the quick preview do not show highlights.

## 9. Testing performed

**Automated (new):**

- `saved/verse-set.test.ts`: normalising one verse, a passage, and verses apart; canonical order; duplicates; verses that do not exist; psalm titles; empty sets; keys; formatting every shape; parsing and round trips; refusals.
- `saved/favorites.test.ts` (PGlite, real migrations): creating; passages and verses apart; labels and notes; duplicates, including three simultaneous saves; the database's own refusals (cross-account verse rows, orphans, repeated verses, long notes and labels, unknown translation and color); editing label, notes, and verses; conflicts; other accounts' and forged IDs; deletion leaving highlights, other favorites, and ideas; each color; replacing; removing; many verses; mixed selections; isolation between accounts; chapter marks; and the library query: owner scoping, three orders, search across fields with literal `%`, `_`, `\`, book and color filters, all conditions together, paging and clamping, previews.
- `saved/actions.test.ts`: every action and the marks endpoint refused when signed out or denied; owner taken from the session whatever the input claims; twelve kinds of invalid input; the verse limit; conflicts; another account's real ID, a missing ID, and a malformed one; failures reported without detail.
- `saved/saved-query.test.ts`: lenient parsing, canonical addresses, round trips, prototype keys, filters.
- `components/bible-reader.test.tsx` (+37): Shift selection; each color; many verses in one request; persistence across a reload; marks sent with the page; replacing; mixed and partial selections; removing; rollback on refusal and on a failed request; order of quick changes; a later change surviving an earlier refusal; an answer for a chapter that was left; marks that cannot be read; saving one verse, a passage, and verses apart; no duplicate; double clicks; failure; managing from the toolbar; the editor's every path.
- `app/(app)/library/scripture/page.test.tsx`: access; the query passed through; a nonsense address; the section tabs; result content; counts and pages; the three empty states; controls; editing; removal confirmed, cancelled, and failed.
- `selection.test.ts`: `selectRange`.
- `tests/e2e/auth.spec.ts`: a guest is sent from `/library/scripture` to sign-in.
- `tests/e2e/saved-scripture.spec.ts`: the signed-in scenario on desktop and mobile (**skipped**; section 11).

**Regression:** the existing suites pass. `scripture.test.tsx` (the Scripture Panel, quick capture, the editor) and the library control and page tests were not modified. One existing test caught something real: `site.test.ts` requires every route but home to be private, and the new route had not been listed; it is now.

**Visual check.** A temporary, unauthenticated preview route rendered the real reader and the real Saved Scripture components with sample marks, on the owner's running dev server, and was screenshotted by a headless browser at 375, 820, and 1280 pixels in both themes: highlights at rest, a selection over highlighted and bare verses, the picker, the toolbar, the editor and its confirmation, the library section, and its book menu. The route was deleted afterwards. Found and fixed from it:

- The toolbar overflowed the page by 122px at 820px with the sidebar open, and truncated the reference to "John …" at 1280px. It became two lines with labels decided by its own width.
- Light-theme highlights were a little heavy; they were thinned.
- A single-verse preview in the library began with a stray space.

Measured, not judged by eye: no horizontal overflow at any size after the fix; toolbar targets are 40 by 44 pixels on a touch screen; the picker's entrance animation runs; a verse's background does change on applying a color, over a 0.2 second transition.

**Limits.** Not seen signed in. In the preview the actions answered "Your session has ended", so applying a color showed and then took itself back, which exercised the failure path and not the success path in a real browser. Not checked on a real phone or with a screen reader.

## 10. Validation results

| Command                  | Result                                      | Notes                                                                                                     |
| ------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run lint`           | Pass                                        |                                                                                                           |
| `npm run typecheck`      | Pass                                        |                                                                                                           |
| `npm run test`           | **804 of 804 pass** (53 files)              | Was 591 at the last recorded full run (2C.1A)                                                             |
| `npm run build`          | Pass                                        | Run by the end-to-end suite; a local build does not migrate                                               |
| `npm run test:e2e`       | **53 pass, 9 skipped, 0 failed**            | Skipped: the signed-in specs (2 saved Scripture, 4 Bible, 2 library; no test account) and 1 existing      |
| `npm run db:generate`    | Wrote `0005_bible_favorites_and_highlights` |                                                                                                           |
| `npm run db:migrate:dev` | Applied; `db:status` 6 applied, 0 pending   | Development database only                                                                                 |
| Prettier                 | Changed and new source files pass           | `npm run format:check` as a whole was not run: it reports the untouched CRLF files noted in every handoff |

## 11. Known issues

- **Signed-in end-to-end coverage has never run**, for this phase, the reader, or the library. To run it: put an admitted development Clerk user's address in `.env.local` as `E2E_CLERK_USER_EMAIL=...`, then `npm run test:e2e`. It refuses a production key. `saved-scripture.spec.ts` writes to that account (highlights on 1 Chronicles 26:1–2 and one favorite), removes them, and skips itself if the account already has marks there. Because it has never executed, expect that a selector may need adjusting on the first run.
- **Not verified signed in in a browser** (section 9). The most useful first checks: highlight a verse and reload; favorite a passage and find it in the library; edit its passage there.
- **A favorite across chapters cannot be made by selecting**, only by editing a favorite's typed passage. The reader's selection is still within one chapter.
- **Highlights are not shown in the Scripture Panel or the quick preview.**
- **Marks changed on another device** appear when a chapter is next shown or the page is reloaded, not while a chapter stays open.
- **The library's verse preview** is read from `bible_verses`, which holds one translation. It is correct today and is one of the reads the translation phase must revisit.
- **Each chapter shown now makes three small extra requests** (its marks and its two neighbours'), beside the three for text that 2C.1A already made.
- **The selection toolbar is two lines at every width**, a visible change to a 2C.1A design.
- `npm run format:check` still reports the untouched CRLF files, as in earlier phases.
- The document title of the reader is still "Bible" whatever chapter is open (unchanged from 2C.1A).

## 12. Manual setup requirements

None. The development database is migrated. Production migrates itself on its next build.

## 13. Deferred functionality

By the brief: attaching Scripture to sermon ideas, point ideas, or outline points (2C.1C and later); outlines; RVG and Spanish; preferred language; side-by-side reading; the Spanish shutoff; offline; sharing or public collections; study tools.

By judgement, and small:

- Selecting across chapters in the reader.
- Highlights in the Scripture Panel and the quick preview.
- A favorites view in the reader's own sidebar (2C.1A's handoff suggested one; the brief put saved content in the library).
- Live refresh of marks made on another device.

## 14. Readiness for Phase 2C.1C

2C.1C attaches a reader selection to an existing idea, or starts an idea from one.

- **The slot is ready.** `SelectionToolbar`'s `children` now holds two actions and takes a third the same way, with `toolbarAction` and `toolbarLabel` for its sizing. The toolbar already has room: its labels collapse to icons by its own width.
- **The shapes line up.** The selection is `ScriptureReference[]` (`selectionReferences`), which is exactly what `idea_scripture_references` and `ideaInputSchema` take. `referencesToVerses` and `versesToRuns` convert to and from a favorite's verses, should a favorite ever be attached to an idea.
- **A favorite and an idea are not linked**, and nothing here assumes they will be. If 2C.1C wants "attach this favorite to an idea", it is a new association; neither table needs to change shape.
- **The patterns to follow** are in place twice over: owner in every WHERE clause, a server action per mutation with `authorize("active")` and Zod, and, for anything the reader shows about the account, a read per chapter through `use-chapter-marks.ts`.
- **Quick capture already accepts references**, so "start an idea from this selection" can open it with the selection filled in; the Scripture Panel's rule (an empty choice is the whole chapter) is untouched and must stay so.

## 15. Process cleanup

- Started by this work: Playwright's production server on port 3100 (once, stopped by Playwright; no listener on 3100 afterwards), Vitest runs, and short-lived headless Chromium instances for screenshots, each closed by its script.
- No development server was started. The owner's on port 3000 was running throughout, was used read-only for the preview, and was left running.
- The temporary preview route (`src/app/preview-2c1b/`) was created and deleted and is not in the working tree. Patch scripts and screenshots are in the session's temporary directory, outside the repository.
- No production database command, no deployment, and no Git command that changes anything.
