# Phase 2A Handoff — Data Model, Quick Capture & Scripture

Written 9 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Ideas" and "Scripture"); [DATABASE.md](DATABASE.md) has the tables and the Bible loading; this is the summary.

## Status in one paragraph

Ideas can be captured, listed, edited, reclassified, and deleted, each owned by one account. The complete King James Bible is in the database and is used to validate, preview, read, select, and search Scripture. Everything passes lint, type checking, unit tests, a production build, and the end-to-end suite, and the migrations and Bible load ran against the development Neon database. **The signed-in screens were not exercised by me in a real session**: the automation browser had no session and signing in through Clerk is the owner's to do. The owner used the running dev server during the work and reported issues that were fixed; one of them (text search failing) was fixed without being re-confirmed in a session. Production has not been migrated: that happens on the next production deployment.

## 1. What was implemented

**Ideas**

- One `ideas` table for sermon, point, and undecided ideas; `idea_scripture_references` for their passages.
- Server actions `createIdea`, `updateIdea`, `changeIdeaKind`, `deleteIdea`; queries `getIdea`, `listIdeas`.
- `/library`: the owner's ideas, most recently changed first (up to 200). `/library/<id>`: edit, reclassify, delete with confirmation.
- Dashboard: the five latest ideas, or an invitation to capture. The four summary figures are still described, not counted.

**Quick capture**

- One dialog for the whole shell, opened from the bar (desktop), the centre of the tab bar (mobile), the dashboard, and the library.
- Only the idea is required; kind starts as Undecided. Scripture is always visible; notes, status, and sermon details are behind "More details".
- Enter saves from the idea field; Ctrl or Command with Enter saves from notes; Enter in the Scripture field adds the reference.
- A failed save keeps every field. Closing with something written asks first, and discarding really discards. The idea's ID is generated in the browser before the first attempt, so a double submit or a retry saves one idea.

**Scripture**

- The King James text, 31,102 verses, loaded automatically (see section 3).
- References are structured and validated against the real chapter and verse counts, in the browser and again on the server.
- One component system (`features/scripture`) with three levels: Quick Preview (popover, or bottom sheet when narrow), Scripture Panel (side panel, or full sheet when narrow, or inside quick capture), and the Bible reader (not built; it will reuse `ScriptureBrowser` and `PassageText`).
- In the panel: text search with operators, Book / Chapter / Verse filters to go to a passage, and verse selection by tapping, any number, tap again to unselect.

**Changes asked for by the owner during the work**

- Verse selection is a free multi-select. Verses that are not adjacent are attached as separate references ("Genesis 1:1–4" and "Genesis 1:7").
- **Bible text search was brought into this phase** (it had been planned for 2B/2C): `GET /api/bible/search`, and one extra migration for its index.
- The panel's box searches text; a passage is reached with the filters. A reference typed into the search box is still offered as "Go to …".
- "Add to idea" leaves the panel open when the idea is on screen beside it (the two-column capture dialog, the side panel), so several passages can be added in a row; it clears the selection and says what was added. Where the panel covers the idea (narrow screens) it closes and returns to the idea. Replacing a reference always closes.
- Leaving an idea's page with unsaved edits asks first, however it is left: any link in the app, the browser's Back and Forward, and closing or reloading the tab (`useLeaveGuard`). Choosing to leave throws the edits away, so they are not there on return. Quick capture is guarded the same way while something is written, and closing it (the X, Escape, a click outside) asks "Discard this idea?" first; every close also clears its validation messages.
- Dropdowns are a custom `Select` (no native `<select>`); the selected option is emerald.
- The bar's Capture control is a quiet outlined pill, not a solid emerald button.
- Administration left the main navigation; it is in the account menu and the mobile account sheet, where it already was.
- **Standing instruction:** when the Bible page exists, add it to the main navigation; when the outline page exists, add it too (`components/layout/app-links.ts`).

## 2. Architectural decisions

- **Unified idea record.** `kind` distinguishes the three. `sermon_type` and `subject` are kept when an idea stops being a sermon, so reclassifying loses nothing in either direction. Reclassifying is its own action and touches only `kind`.
- **References are a child table, as numbers.** No verse text is stored on an idea and there is no foreign key to the Bible table, so the Bible can be reloaded without touching ideas.
- **Ownership is in the SQL.** Every query in `features/ideas/ideas.ts` has the owner in its WHERE clause; a missing idea and someone else's are the same answer everywhere.
- **The Bible is reference data, not a migration.** The table is created by a migration; the text is loaded by the migrate command from `data/bible/kjv.json` and versioned by checksum. A 4 MB migration would have run for every test database.
- **Chapters are fetched one at a time** through `GET /api/bible/<book>/<chapter>` and cached on the server with `use cache`. This is the application's only cached read; it involves nothing about the caller. The browser keeps the chapters it has opened and never holds the whole text.
- **Search is PostgreSQL full-text search with the `simple` configuration**: exact words, no stemming, no stop words. The query string is built by hand from letters and digits only (`buildSearchQuery`).
- **Never more than one modal layer.** Inside quick capture the panel shares the dialog (beside the form when wide, in its place when narrow), and a narrow-screen preview goes straight to it.
- **No new dependencies.** Dialog, Popover, and Select are Base UI primitives already installed; the toast is 80 lines of our own.

## 3. Database

Two migrations, both additive, both safe ahead of the code now in production:

- `0001_create_ideas_and_bible`: `ideas`, `idea_scripture_references`, `bible_verses`, `reference_datasets`.
- `0002_bible_search_index`: a GIN index on `bible_verses` for word search.

`npm run dev` and the production build's migrate step now also load the Bible when the database does not hold the committed edition: one transaction, about ten seconds, then one cheap check on every later run. A failed load rolls back and fails the command. Details in [DATABASE.md](DATABASE.md).

Applied to the development database during this work: both migrations and the Bible load (confirmed 31,102 rows through the load's own count check, and `npm run db:status` reports "Bible: loaded").

## 4. Routes and operations

| Route                                  | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| `/library`                             | The owner's ideas                       |
| `/library/<id>`                        | One idea: edit, reclassify, delete      |
| `GET /api/bible/<book>/<chapter>`      | One chapter's verses                    |
| `GET /api/bible/search?q=&in=&offset=` | A page of verses matching a word search |

All four require an active account and check it themselves. Server actions are listed in section 1.

## 5. Security

- Every page, action, and route handler calls the access helpers; nothing relies on the proxy.
- No action accepts an owner. The Zod schema drops unknown keys, and the service names each column it writes.
- IDs are validated as UUIDs before any query. A malformed ID never reaches the database.
- Database errors are logged without connection strings and answered with fixed messages.
- Search input cannot reach PostgreSQL as syntax: only letters, digits, and the builder's own operators survive, and the result is still a bound parameter.
- Bible endpoints are for signed-in accounts only, so there is no public endpoint to scrape.
- `ideas.owner_id` is `ON DELETE RESTRICT`: an account that owns ideas cannot be deleted by accident. A future account-deletion feature must decide what happens to them.

## 6. Checks run

| Check                    | Result                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`           | Pass                                                                                                                                                                                               |
| `npm run typecheck`      | Pass                                                                                                                                                                                               |
| `npm run test`           | 257 of 257 pass (34 files; was 123 in 21)                                                                                                                                                          |
| `npm run build`          | Pass, as the first step of the end-to-end run                                                                                                                                                      |
| `npm run test:e2e`       | 39 pass, 1 skipped (mobile-menu test on desktop)                                                                                                                                                   |
| `npm run format:check`   | Every file added or changed passes. The command as a whole reports 75 files that this work did not touch: they have CRLF line endings in the working copy (Git `autocrlf`), as HANDOFF-1C.1 noted. |
| `npm run db:migrate:dev` | Applied both migrations and loaded the Bible; a second run reported "up to date"                                                                                                                   |

New tests cover: the dataset (counts, checksum, no markup, known verses); the loader on an in-memory PostgreSQL (load, rerun, new edition, rollback on failure); reference parsing, formatting, and validation; the search query builder, including hostile input; search and chapter reads and their route handlers; idea CRUD, ownership on every operation, reclassification, idempotent create, and the database constraints; the actions with access mocked; quick capture, the editor, the Scripture components, and the library pages.

The leave guard was tried in Chrome on two temporary pages (since deleted): a link click was held and asked, Back was undone and asked with the typed text intact, and "Leave" then went to the previous page.

Visual check: the Scripture browser, dropdowns, and the bar were looked at in Chrome through a temporary route with faked data (since deleted). Dark theme, one desktop width. Not checked by me: light theme, mobile widths, the side panel and bottom sheet containers, and anything in a signed-in session.

## 7. Known limitations

- **Psalm titles are not stored.** See `data/bible/README.md`.
- **Words supplied by the translators are not marked** (italics in print).
- **Search is exact-word.** "love" does not find "loved"; `lov*` does. There is no ranking; results are in canonical order. Negative-only searches are refused.
- **A passage across chapters** can be typed ("John 3:16-4:2") or kept when editing, but cannot be built by tapping: tapping selects within the chapter on screen.
- **The library shows the 200 most recently changed ideas**, with no paging, search, or filters.
- **The leave guard adds one history entry** for the page the first time there are unsaved edits (in the editor or in quick capture) (that is what makes Back reversible). After saving, the first Back press therefore appears to do nothing. Closing, reloading, or leaving the site shows the browser's own wording, which cannot be changed. The settings forms are not guarded.
- **Dates** are shown in UTC, as elsewhere in the app.
- **"Add to idea" always means the idea being captured or edited.** Choosing among existing ideas arrives with the Bible reader, where there is no current idea.
- **In development**, a route importing the module that holds the cached chapter read was served a stale copy after that module was edited ("searchVerses is not a function" in the dev log). The search query now lives in its own module. If it is seen again, restart the dev server.
- Limitations in the earlier handoffs still stand, including that live Clerk behaviour from 1C.1 is unverified.

## 8. Manual action for the owner

1. Try text search again in your session; it was fixed after you reported it and I could not sign in to confirm.
2. Look at capture, the library, and the Scripture panel on a phone, and in the light theme.
3. Decide whether the United Kingdom position on the King James text matters to you (`data/bible/README.md`).
4. Deploying to production will migrate and load the Bible during the build, adding roughly ten seconds once. Nothing needs to be run by hand.
5. Git: nothing was staged or committed. `data/bible/kjv.json` is 4 MB and new.

## 9. Deferred

**Phase 2B (library):** search, filters, tags, paging, list options; the dashboard's real figures where their data exists.

**Phase 2B or 2C (Bible):** the dedicated reader page and its place in the main navigation; choosing an existing idea from the reader; psalm titles; ranking or stemming in search if wanted.

**Phase 2C:** sermon–point associations (a join table on `ideas.id`; additive). Reclassifying an idea that has associations will need a rule.

**Later phases:** outlines (and their place in the main navigation), preaching history, offline capture and Bible, sharing, export.

## Process cleanup

No dev server was started: the owner's server on port 3000 was already running and was left running. Playwright's managed production server on port 3100 stopped with its run (port confirmed free). Two temporary routes (`/design-preview`, `/api/probe-tmp`) and a temporary probe script were created and deleted; the browser tabs opened for the visual check were closed. No Git state-changing commands were run. No production database command was run.
