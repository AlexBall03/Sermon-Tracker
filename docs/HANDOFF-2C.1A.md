# Phase 2C.1A Handoff — Dedicated Bible Reader Foundation

Written 10 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Bible reader" and "Scripture"); [DATABASE.md](DATABASE.md) has the table and the loader; [data/bible/README.md](../data/bible/README.md) has the dataset's source and checks; this is the summary.

## 1. Phase overview

Phase 2A put the King James text in the database and built the Scripture Panel for attaching passages to ideas. This phase builds the place to read it: `/bible`, in the main navigation, with book, chapter, and verse navigation, the existing word search, verse selection, and copying. It also restores the 116 psalm titles the dataset build had dropped.

**Status.** Everything in the brief is implemented and covered by tests. At the last complete run, lint, type checking, 591 unit and component tests, the production build, and the guest end-to-end suite passed; the final round of changes after that run was checked by lint and type checking only (section 13). The owner used the page signed in on the development server while it was being built and asked for the refinements in section 2's last list, all of which are in. **I did not see the page signed in myself**, and the signed-in end-to-end test is written but **has never run**: it needs the development test account described in section 13.

Not built, by design: favourites and highlights (2C.1B), attaching a selection to an idea or starting an idea from one (2C.1C), translations, and any per-user table.

## 2. Implemented features

- `/bible`, for active accounts only, `noindex`, third in the main navigation (Dashboard, Library, Bible; on a narrow screen the tab bar is Dashboard, Library, capture, Bible).
- All 66 books: books listed under Old and New Testament, the book being read open on its chapters, Previous and Next across book boundaries (disabled at Genesis 1 and Revelation 22), books of one chapter handled, and the same pair again at the foot of each chapter.
- **Go to verse**: a menu of the chapter's verse numbers. The verse is scrolled into view and tinted faintly for a moment; it is never selected.
- Search: the existing word search (words, phrases, OR, exclusion, prefix; scope; Show more; empty, invalid, and failed states), with results kept beside the text on a wide screen and in the sheet on a narrow one. A typed reference ("Romans 8:28", "Psalm 23", "Jude 5") goes straight there.
- Selection: one verse, neighbouring verses, verses that are apart (separate references), or the whole chapter on request. Nothing selected means nothing.
- Selection toolbar: the reference in words, Copy text, Copy reference, Copy link, Clear.
- Shareable addresses, and the reading position remembered on the device.
- Psalm titles above verse 1 of the 116 psalms that have one.
- Loading, error (with retry), empty, and boundary states; keyboard and screen-reader support; light and dark; reduced motion.

Refinements asked for by the owner during the work:

- The sidebar closes and opens with one animation (its place narrows while the panel slides left and fades), driven by a single round handle on the sidebar's edge that travels with it.
- Chapters settle into place with a short slide from the side they lie on, with no fade (a fade from clear was seen as a flash), and the chapters either side are fetched ahead so turning to one never shows the loading lines.
- Go to verse glides the page to the verse in one continuous ease and tints it faintly as it arrives; nothing stays marked afterwards, in the text or in the menu.
- The links at the foot of a chapter say "Previous" and "Next" above the chapter's name, and from them the next chapter comes up from below and the one before down from above (reading on, not turning aside).
- On a touch screen a sideways swipe over the text turns the chapter: left for the next, right for the one before. Scrolling, short touches, and slow drags are not taken for one.
- Arrows floating beside the text were tried (round arrows on a wide window, edge tabs on a phone) and **removed at the owner's request**. Previous and Next are in the chapter bar and at the foot of the chapter only.
- Selected verses that follow one another are drawn as one block, with square corners between them.
- Copied text: the first verse directly under the reference, each verse on its own line, and a line of `...` wherever verses were passed over.
- **Ctrl+C / Command+C** copies the selection and clears it. Settings has a new "Bible" section to choose what the shortcut copies: verse text (default), reference, or link.
- Searching with the box empty returns to the books.
- The verse dropdown in the chapter bar was replaced by "Go to verse" beside "Select chapter", so the bar holds only Previous, the chapter's name, and Next, centred over the text.

## 3. Architecture decisions

- **The page is a Server Component; the reader is one Client Component tree.** The page authorises, reads the chapter the address names with the cached `getChapter`, and sends it with the page. After that the reader moves with `window.history.pushState` (which Next keeps in step with `useSearchParams`) and fetches a chapter at a time from the existing `/api/bible`, which authorises every request. No server round trip per chapter; Back and Forward still work.
- **The reader has its own selection model** and does not reuse `ScriptureBrowser`. The panel reads an empty choice as the whole chapter, and quick capture and the editor rely on that; the reader must not. The panel's behaviour is unchanged. Both share `PassageText`, `versesToReferences`, the chapter cache, and now the search hook and results list.
- **Search was extracted, not duplicated**: `useBibleSearch` and `SearchHits` came out of `ScriptureBrowser`, which now uses them. Its tests pass unchanged.
- **Device preferences follow the library's view**: one attribute on `<html>` set before first paint for the sidebar, `localStorage` for the reading position and the copy shortcut. Nothing new on the account.
- **Sidebar collapsed state is remembered on the device** (the brief asked for a decision): someone who reads with it closed wants it closed next time, and it is a reading habit, not part of an address.
- **Psalm titles are a second reference dataset** with their own file, table, checksum, and loader, so the 31,102 verses and their checksum are untouched.
- **No new dependency.**

## 4. Files created

| File                                                                                                                                                                                 | What                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/app/(app)/bible/page.tsx`, `loading.tsx`                                                                                                                                        | The page and its outline while it loads                            |
| `src/features/scripture/reader-location.ts`                                                                                                                                          | The URL contract, chapter stepping, and the saved reading position |
| `src/features/scripture/selection.ts`                                                                                                                                                | The selection model and the copied text's format                   |
| `src/features/scripture/reader-sidebar.ts`                                                                                                                                           | The sidebar preference: storage, the attribute, the inline script  |
| `src/features/scripture/copy-preference.ts`                                                                                                                                          | What the copy shortcut copies                                      |
| `src/features/scripture/glide.ts`                                                                                                                                                    | The frame-by-frame scroll used by Go to verse                      |
| `src/features/scripture/swipe.ts`                                                                                                                                                    | Reading a touch as a turn of the page, or as nothing               |
| `src/features/scripture/use-bible-search.ts`                                                                                                                                         | The search request and its state, shared with the panel            |
| `src/features/scripture/components/bible-reader.tsx`                                                                                                                                 | `BibleReader`, `ReaderSidebarScript`, and the chapter view         |
| `src/features/scripture/components/reader-navigator.tsx`                                                                                                                             | `ReaderNavigator`, `useReaderNavigation`                           |
| `src/features/scripture/components/selection-toolbar.tsx`                                                                                                                            | `SelectionToolbar`                                                 |
| `src/features/scripture/components/search-hits.tsx`                                                                                                                                  | `SearchHits`, shared with the panel                                |
| `src/features/settings/components/bible-settings.tsx`                                                                                                                                | The Settings choice for the copy shortcut                          |
| `data/bible/kjv-psalm-titles.json`                                                                                                                                                   | The 116 titles (generated; never edited by hand)                   |
| `drizzle/0004_bible_psalm_titles.sql`, `meta/0004_snapshot.json`                                                                                                                     | The migration                                                      |
| Tests: `reader-location.test.ts`, `selection.test.ts`, `swipe.test.ts`, `components/bible-reader.test.tsx`, `settings/components/bible-settings.test.tsx`, `tests/e2e/bible.spec.ts` | Section 12                                                         |
| `docs/HANDOFF-2C.1A.md`                                                                                                                                                              | This file                                                          |

## 5. Files modified

- `src/lib/site.ts`, `src/components/layout/app-links.ts`: the route and the navigation link.
- `src/features/scripture/`: `books.ts` (`psalmsBook`, `translation`), `passages.ts` (psalm title reads), `use-chapter.ts` (keeps `title`; `keepChapter`), `search.ts` (`searchTips`), `components/passage-text.tsx` (`superscription`, `located`, `size`), `components/scripture-browser.tsx` (uses the shared search pieces; behaviour unchanged).
- `src/app/api/bible/[book]/[chapter]/route.ts`: answers `title` beside `verses`.
- `src/db/schema.ts`, `drizzle/meta/_journal.json`: `bible_psalm_titles`.
- `scripts/bible/build-dataset.mjs`, `dataset.mjs`; `scripts/db/seed-bible.mjs`, `cli.mjs`: building, checking, and loading the titles.
- `src/app/globals.css`: the `sidebar-closed:` variant and the `verse-found` animation.
- `src/components/layout/back-to-top.tsx`: steps aside while the selection toolbar is shown.
- `src/app/(app)/settings/page.tsx`: the "Bible" section.
- Tests: `scripts/bible/dataset.test.mjs`, `scripts/db/seed-bible.test.mjs`, `src/features/scripture/passages.test.ts`, `src/components/layout/app-header.test.tsx`, `src/app/(app)/settings/page.test.tsx`, `tests/e2e/auth.spec.ts`.
- `ARCHITECTURE.md`, `AGENTS.md`, `docs/ROADMAP.md`, `docs/DATABASE.md`, `data/bible/README.md`.

`data/bible/kjv.json` and `src/features/scripture/versification.ts` were regenerated by the builder and came out identical; they are not in the diff.

## 6. Database changes

**One migration: `0004_bible_psalm_titles`.** It creates `bible_psalm_titles (psalm smallint primary key, text text not null)` with CHECKs that the psalm is 1 to 150 and the text is not blank. It only adds a table, so it is safe under the code already in production.

**One new reference dataset**, `kjv-psalm-titles` (116 rows), loaded by the same `migrate` command as the verses, after the migrations: one transaction, delete then insert, count checked, edition recorded in `reference_datasets`. It is skipped when the recorded checksum and count match, so it is safe on every start and every deployment, and a fresh database and an existing one end the same. `bible_verses` is not touched.

No table for the reader, the reading position, or any preference.

**What was run:** `npm run db:generate` (once), and `npm run db:migrate:dev` against the development database, which applied the migration and loaded the titles; a second run reported "up to date", and `db:status` shows 5 applied, 0 pending, Bible loaded, Titles loaded. No production command, no `db:stamp`, no `drizzle-kit push`.

## 7. Bible URL contract

`features/scripture/reader-location.ts`, with no server code in it.

| Address                             | Means                                               |
| ----------------------------------- | --------------------------------------------------- |
| `/bible`                            | The chapter last read in this browser, or Genesis 1 |
| `/bible?book=43&chapter=3`          | John 3                                              |
| `/bible?book=43&chapter=3&verse=16` | John 3, brought to verse 16                         |

- `book` is the canonical number, 1 to 66. Every value is checked against the real verse counts.
- Parsing never throws. No real book: no location, so the saved place or Genesis 1. A chapter the book lacks: chapter 1. A verse the chapter lacks: dropped. Other parameters are ignored; of a repeated one the first is used.
- One place has one address (`book`, `chapter`, `verse`, in that order); any other spelling is rewritten in place.
- `verse` locates and never selects. A selection is not in the address; Copy link gives the chapter at the first verse chosen.
- Chapter and verse moves add history entries; the redirect from a bare `/bible` replaces its entry, so Back never lands on an address that only sends forward again.

## 8. Selection model

`features/scripture/selection.ts`: `none`, `verses` (sorted, each once, only real verses), or `chapter`.

- Click to select, click again to unselect; several stay selected. Verses that are apart are separate `ScriptureReference`s through the existing `versesToReferences`: John 3:3, 5, 6, 8 is John 3:3, John 3:5–6, John 3:8.
- **Nothing selected yields no references.** "Select chapter" is the only way to the whole chapter, which is the one chapter reference; choosing every verse one by one is the same state, and taking one verse out of it leaves the rest as verses.
- A selection lives in the chapter's view and cannot outlive its chapter. Interactive selection is within the chapter on screen; references across chapters remain valid everywhere else.
- Selected verses carry the emerald tint, an emerald number, and `aria-pressed`. Verses are buttons, so the keyboard selects them.
- `SelectionToolbar` takes `children`: that is where 2C.1B and 2C.1C add their actions, and they receive the same references.

## 9. Search integration

The same endpoint, parser, and validation as the panel, through the shared `useBibleSearch` (which drops a reply to a search that has been replaced) and `SearchHits`. In the reader: a typed reference navigates instead of searching, with an offer to search for the words instead; a result opens its chapter at its verse and stays marked in the list; "Books" and "Back to results" switch between browsing and results; an empty search returns to the books. No new search engine, index, or dependency.

## 10. Reading-position persistence

`localStorage["bible-location"]` holds `book.chapter`, written on every chapter shown and validated again when read. Order of preference on load: a valid place in the address, then the saved place, then Genesis 1. With no place in the address the reader shows loading lines until it knows where to go, so the wrong chapter is never flashed and server and browser render the same thing. Missing, refused, or nonsensical storage means Genesis 1. It is a device preference, not synchronised.

Two other device preferences sit beside it: `bible-sidebar` (`open` or `closed`) and `bible-copy` (`text`, `reference`, or `link`).

## 11. Psalm superscription restoration

- **Source:** the documented edition, `https://ebible.org/Scriptures/eng-kjv2006_usfm.zip`, downloaded again on 10 October 2026. Its SHA-256 matched the value recorded in `data/bible/README.md` (`5789dcd0…39c1`).
- **Extraction:** `scripts/bible/build-dataset.mjs` now keeps the USFM `\d` lines of the Psalms instead of discarding them, reduces them with the same rules as verse text, refuses a title that is not before a psalm's first verse or is in another book, and refuses any count but 116. Nothing was typed by hand.
- **Result:** `data/bible/kjv-psalm-titles.json`, 116 titles, checksum `8356d05f…713f` recorded in `scripts/bible/dataset.mjs`.
- **The verses are unchanged:** the rebuilt `kjv.json` has the same checksum as before (`32cf22df…a165`), 66 books, 1,189 chapters, 31,102 verses, and `versification.ts` is identical.
- **Cross-check:** against the publisher's verse-per-line export, for all 150 psalms, that file's verse 1 is exactly our title (where there is one) followed by our verse 1. 116 with a title, 34 without, no differences.
- **In the application:** a title is in its own table, read by `getPsalmTitles` (cached; an empty table is an error, never "no titles"), returned as `title` by the chapter endpoint, and shown above verse 1. It is not numbered, counted, selected, searched, or copied.

## 12. Tests added or modified

Unit and component tests went from 471 to **591** (47 files) at the last complete run; the swipe tests and a few reader tests were added after it.

- `reader-location.test.ts`: parsing, invalid book, chapter, and verse, repeated and unknown parameters, canonical addresses and round trips, stepping within and across books, Genesis 1 and Revelation 22, one-chapter books, where a reference lands, and the saved position (round trip, malformed values, unavailable storage).
- `selection.test.ts`: select and unselect, order and duplicates, verses that are apart, the explicit whole chapter, empty meaning nothing, and the copied text's format.
- `bible-reader.test.tsx`: where the reader opens (address, saved place, Genesis 1, precedence, normalising, the chapter sent with the page); going to a verse and its light; moving between chapters by the bar, the foot links, and a swipe, the chapters either side being ready, and Back and Forward; the navigation, its handle, and the narrow-screen sheet; selecting; copying by button and by Ctrl+C; searching, including a stale reply and an empty search; loading and failure; Psalm 119 and psalm titles.
- `swipe.test.ts`: a sideways swipe in each direction, and a short touch, a scroll, and a slow drag being nothing.
- `bible-settings.test.tsx`: the copy-shortcut choice.
- `dataset.test.mjs`: 116 titles, the recorded checksum, detection of a changed, added, or removed title, psalms without one, no markup, and the verses unchanged.
- `seed-bible.test.mjs`: loading, idempotence, a new edition, rollback on failure, refusal of bad data, the database's own constraints, and the verses left alone.
- `passages.test.ts`: `title` in the endpoint's answer, a psalm without one, and the endpoint still serving verses when titles cannot be read.
- `scripture.test.tsx` passes **unchanged**, which is the check that quick capture's and the editor's panel behave as before.
- `tests/e2e/bible.spec.ts`: the signed-in scenario on desktop and mobile (skipped; section 13). `tests/e2e/auth.spec.ts`: a guest is sent from `/bible` to sign-in, and `robots.txt` disallows it.

## 13. Verification commands and results

**Read this first.** The table below is the last complete run. After it, at the owner's direction, the full suite was **not** run again for the final changes: the controlled glide for Go to verse, the removal of the chapter fade, fetching the neighbouring chapters ahead, the new foot-of-chapter links and their vertical arrival, swipe, the removal of the side arrows, and joined corners on neighbouring selected verses. What was run after those: lint and type checking (pass), and the reader's own component tests and the swipe tests (70 passing) before the side arrows were removed; the removal itself and the joined corners were checked by lint and type checking only. Run `npm run test` and `npm run test:e2e` before committing; the counts will be higher than those shown.

| Command                  | Result                                | Notes                                                                                        |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run lint`           | Pass                                  |                                                                                              |
| `npm run typecheck`      | Pass                                  |                                                                                              |
| `npm run test`           | **591 of 591 pass** (47 files)        | Was 471 in 43                                                                                |
| `npm run build`          | Pass                                  | As part of the end-to-end run; "not a production deployment, migrations skipped"             |
| `npm run test:e2e`       | **49 pass, 7 skipped, 0 failed**      | Skipped: 4 signed-in Bible tests and 2 signed-in library tests (no test account), 1 existing |
| `npm run db:generate`    | Wrote `0004_bible_psalm_titles`       |                                                                                              |
| `npm run db:migrate:dev` | Applied; second run "up to date"      | Development database only                                                                    |
| Prettier                 | Files added or changed were formatted | `format:check` as a whole was not run: it reports the untouched CRLF files noted before      |

**Signed-in end-to-end tests did not run.** `tests/e2e/bible.spec.ts` covers the twelve steps in the brief (sign in, open Bible, John 3, select 3:16, add verses that are apart, copy, search, open a result, move between chapters, reload, a deep link overriding the saved place, the mobile sheet) plus Ctrl+C, Go to verse, an empty search, a psalm title, a nonsense address, and the sidebar handle. To run it: put an admitted development Clerk user's address in `.env.local` as `E2E_CLERK_USER_EMAIL=...`, then `npm run test:e2e`. It refuses a production key. Because it has never executed, expect that a selector may need adjusting on the first run.

## 14. Visual QA completed

Done with a temporary, unauthenticated preview route that rendered the real reader inside the real application bar, on the owner's running development server, with the Bible endpoints answered from the committed dataset by a headless browser. The route was deleted afterwards.

- Screenshots at 375, 820, and 1280 pixels in both themes: a chapter, a selection with its toolbar (also after scrolling), search results, the sidebar open and put away, the narrow-screen sheet and its results, a psalm with a title, Psalm 119 opened at verse 105, the end of a chapter, and the loading state. No horizontal overflow and no console errors at any size.
- Later rounds, at desktop and phone sizes: the sidebar handle, Go to verse and its glide (traced frame by frame for stalls), the verse tint, the foot-of-chapter links, and swiping with real touch input (a swipe turns the chapter; a scroll and a slow drag do not).
- Measured in the browser rather than judged by eye: the chapter and sidebar animations run and finish; the handle follows the sidebar's edge and keeps focus; the chapter's name is centred over the text column with the sidebar open and closed; a verse gone to is scrolled clear of the bars, tinted, and untinted again; Ctrl+C puts the expected text on the clipboard and clears the selection.
- Fixed as a result: a verse menu too narrow for three digits; "Psalms 3" where "Psalm 3" is meant; the Back to top button over the next-chapter link at the foot of a chapter; the located verse's marker.

**Limits.** This is not a signed-in check, and the preview's text came from the dataset file, not through the application's own endpoint. The owner saw the page signed in during the work and reported the points in section 2; I did not. Not checked on a real phone or with a screen reader.

## 15. Known issues

- **Signed-in end-to-end coverage has never run**, here or for the library.
- **A browser that cached a psalm before this release** keeps that chapter without its title for up to a day (the endpoint's existing `max-age`), then gets it.
- **Until a production build has loaded the titles**, psalms are served without them (logged, and not cached by the browser). The build that ships this code loads them, so this window should not be seen.
- **Back and Forward do not restore the scroll position** within a chapter beyond what the browser does itself; a move by the reader's own controls starts the new chapter at the top.
- **The document title stays "Bible"** whatever chapter is open.
- **The full test suite was not rerun after the last round of changes** (section 13).
- **Under reduced motion** the sidebar and chapter changes are immediate and Go to verse jumps instead of gliding; the verse tint is held for two seconds and removed, without a fade.
- **Each chapter shown fetches its two neighbours** (two small, cacheable requests) so that turning the page is immediate.
- **Selection is within one chapter.** A passage across chapters cannot be selected in the reader yet.
- `npm run format:check` still reports the untouched CRLF files, as in earlier phases.

## 16. Remaining requirements for Phase 2C.1B

Build on:

- **`SelectionToolbar`'s `children`**: Favourite and Highlight actions go there and receive `ScriptureReference[]`, already split into unbroken passages, with the whole chapter as one reference.
- **`selection.ts`** for what is selected; **`reader-location.ts`** for links to a favourite's place (`readerHref`).
- **The sidebar** has room under the search box for a Favourites view; `useReaderNavigation`'s `view` is where a third view belongs.
- **`PassageText`** will need a way to draw persistent highlight colours per verse. Keep it separate from `selected`: a highlight is stored, a selection is temporary, and a verse can be both.

To decide or build:

- **A migration** for favourites and highlights: per-user tables keyed by owner and reference (or verse), a colour, an optional note; never copying or changing the shared text. Follow `idea_tags`: the owner in every WHERE clause, and constraints that make a cross-account row impossible.
- **Highlight colours as tokens** in `globals.css`, for both themes, distinct from the emerald of selection.
- **Server actions** with `authorize("active")`, Zod, and the owner from the session; references validated with `scriptureReferenceSchema`.
- **How highlights reach the reader**: one read per chapter for the signed-in account, uncached, beside the cached text.

## 17. Owner actions required

- **Commit** the work, including `drizzle/0004_bible_psalm_titles.sql`, `drizzle/meta/`, and `data/bible/kjv-psalm-titles.json`.
- Nothing by hand for production: the next production build applies the migration and loads the titles.
- Optional: set `E2E_CLERK_USER_EMAIL` and run `npm run test:e2e` to exercise the signed-in specs.

## 18. Confirmation of process cleanup

- Started by this work: Playwright's own production server on port 3100, several times, each stopped by Playwright (port 3100 confirmed free after the last); short-lived headless Chromium instances for screenshots and measurements, each closed by its script.
- No development server was started. The owner's on port 3000 was running throughout, was used read-only for the visual checks, and was left running.
- The temporary preview route (`src/app/preview-2c1a/`) was created and deleted several times and is not in the working tree. Patch scripts, screenshots, and the downloaded archives are in the system temporary directory, outside the repository.
- No production database command, no deployment, and no Git command that changes anything: only `git status`, `git diff`, and `git ls-files`.
