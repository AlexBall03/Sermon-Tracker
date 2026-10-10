# Phase 2B.2 Handoff — Library Interface, Advanced Filtering & Tag Management

Written 10 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Library" and "Tags"); [DATABASE.md](DATABASE.md) has the SQL; this is the summary.

## 1. Phase overview

Phase 2B.1 built the library's query, tags, and URL contract with almost nothing on screen. This phase is the interface: the library can now be searched, filtered by several values at once, ordered, read as cards or as a list, and paged by number; tags can be managed from the library and put on ideas in the editor; and opening an idea and coming back returns to the same place.

**Status.** Everything in the brief is implemented and covered by tests, with one honest gap: **nothing was seen in a signed-in browser session.** The signed-in pages were checked by unit and component tests and by a temporary preview page fed sample data (deleted afterwards). The signed-in end-to-end test is written but **has never run**: it needs a development test account that only the owner can provide (section 13). Lint, type checking, 471 unit tests, the production build, and the guest end-to-end suite pass.

## 2. Features implemented

- Search box: icon, placeholder "Search titles, subjects, and notes...", clear button, 300 ms debounce, Enter applies at once, state in the URL.
- Expandable filter panel: kind, status, sermon type, and tags (each multi-select), tag matching Any or All, created and last-changed date ranges, Clear filters.
- Active filters as removable chips, shown with the panel open or closed, with a count on the Filters button.
- Sort menu over the six existing orders.
- Card view (default) and list view, remembered in the browser.
- Numbered pagination with a window and ellipses, Previous and Next, "Page x of y" on narrow screens.
- Result count: "12 matching ideas" or "Showing 25–48 of 126 ideas".
- Three distinct empty states (empty library, no search matches, no filter matches) and a no-tags state.
- Manage tags dialog: create, rename, delete with confirmation and usage count.
- Tag selection in the idea editor: view, search, add, remove, create while editing; saved atomically with the idea.
- Tags shown on library results and on the dashboard's recent ideas.
- Returning from an idea to the library as it was left.

## 3. Files created

| File                                                              | What                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/features/ideas/components/library/library-state.tsx`         | `LibraryProvider`, `useLibrary`, `LibraryResults`              |
| `src/features/ideas/components/library/library-search.tsx`        | The search box                                                 |
| `src/features/ideas/components/library/library-toolbar.tsx`       | Filters button, sort, view switcher, Manage tags               |
| `src/features/ideas/components/library/library-filters.tsx`       | The filter panel                                               |
| `src/features/ideas/components/library/filter-chips.tsx`          | Active-filter chips                                            |
| `src/features/ideas/components/library/library-view.ts`           | The view preference: storage, the attribute, the inline script |
| `src/features/ideas/components/library/view-switcher.tsx`         | `ViewSwitcher`, `LibraryViewScript`                            |
| `src/features/ideas/components/library/idea-results.tsx`          | Results as cards or rows                                       |
| `src/features/ideas/components/library/pagination.tsx`            | `Pagination`, `pageWindow`                                     |
| `src/features/ideas/components/library/tag-manager.tsx`           | The Manage tags dialog                                         |
| `src/features/ideas/components/tag-picker.tsx`                    | Tag selection for the editor                                   |
| `src/features/ideas/components/tag-chip.tsx`                      | `TagChip`, `TagList`                                           |
| `src/features/ideas/components/library/library-controls.test.tsx` | Search, filters, chips, sort, view, tag management (40 tests)  |
| `src/features/ideas/components/library/results.test.tsx`          | Results, page window, pagination (12 tests)                    |
| `src/features/ideas/components/tag-picker.test.tsx`               | The tag picker (8 tests)                                       |
| `tests/e2e/library.spec.ts`                                       | Signed-in end-to-end test (skipped without a test account)     |
| `docs/HANDOFF-2B.2.md`                                            | This file                                                      |

## 4. Files modified

- `src/features/ideas/library-query.ts`, `model.ts`, `ideas.ts`, `schemas.ts`: the query contract and its SQL (sections 5 and 7), `IdeaDraft.tags`.
- `src/app/(app)/library/page.tsx`, `loading.tsx`, `[id]/page.tsx`: the new page, its skeleton, and the idea page's tags and way back.
- `src/features/ideas/components/idea-editor.tsx`, `idea-fields.tsx` (`TagsField`), `idea-list.tsx` (tags on the dashboard's cards).
- `src/components/layout/page-header.tsx`: an optional `action`.
- `src/app/globals.css`: the `list-view:` and `card-view:` variants.
- Tests: `library-query.test.ts`, `library.test.ts`, `tags.test.ts`, `idea-editor.test.tsx`, `library/page.test.tsx`, `dashboard/page.test.tsx` (fixture only), `tests/e2e/loading.spec.ts`.
- `playwright.config.ts` (loads `.env.local`), `.env.example` (`E2E_CLERK_USER_EMAIL`), `package.json` and `package-lock.json` (`@clerk/testing`, development only).
- `ARCHITECTURE.md`, `AGENTS.md`, `docs/DATABASE.md`, `docs/ROADMAP.md`.

## 5. Architecture changes

- **The page stays a Server Component.** It authorises, parses the URL, runs `searchIdeas` and `listTags` together, and renders. Results and pagination are server-rendered links; only the controls are Client Components, sharing one small context (`LibraryProvider`) instead of one large component.
- **One place navigates.** `useLibrary().apply(change)` builds the next address with `libraryHref`, always from the query _last asked for_, and returns to page 1 unless the change names a page. That is what keeps a debounced search and a filter click from undoing each other. Navigation runs in a transition: controls update at once (`useOptimistic`), results dim with `aria-busy`, and the page does not scroll.
- **View preference without a flash.** One attribute on `<html>` (`data-library-view`), set before first paint by an inline script and read by two Tailwind variants. The results are one piece of markup, so switching view re-renders nothing and cannot mismatch at hydration.
- **`IdeaDraft` carries `tags`.** The editor turns them into `tagIds` on every save. Quick capture is unchanged and sends none.
- No new dependency in the application. `@clerk/testing` is a development dependency for the signed-in test.

## 6. Database changes

**None. No migration was added in Phase 2B.2**, and `drizzle/` is untouched. Multi-value filters and tag matching are changes to `libraryConditions` in `ideas.ts` only. "All tags" is one correlated, counted subquery (SQL in [DATABASE.md](DATABASE.md)); a library page is still three queries. No index was added and the decision against a trigram index stands. No database command was run apart from the build's own migration step, which reported nothing to do.

## 7. URL query contract

`/library?q=&kind=&kind=&status=&status=&type=&type=&tag=&tag=&tag_mode=&created_from=&created_to=&updated_from=&updated_to=&sort=&page=`

| Parameter                                                  | Values                                     | Notes                 |
| ---------------------------------------------------------- | ------------------------------------------ | --------------------- |
| `q`                                                        | Text, cut to 200 characters, first 8 words | Unchanged             |
| `kind`                                                     | `sermon`, `point`, `undecided`             | **Now repeatable**    |
| `status`                                                   | `captured`, `developing`, `ready`          | **Now repeatable**    |
| `type`                                                     | `topical`, `expository`                    | **Now repeatable**    |
| `tag`                                                      | Tag ID, up to 20                           | Repeatable, as before |
| `tag_mode`                                                 | `any` (default), `all`                     | **New**               |
| `created_from`, `created_to`, `updated_from`, `updated_to` | `YYYY-MM-DD`                               | Unchanged             |
| `sort`                                                     | The six orders                             | Unchanged             |
| `page`                                                     | Whole number from 1                        | Unchanged             |

- **Compatibility:** every address valid in 2B.1 still works; `?kind=sermon` reads as a list of one.
- **Parsing:** never throws. Unknown values in a repeated filter are dropped and the rest kept; duplicates collapse; an invalid `tag_mode` is `any`; unknown parameters are ignored.
- **Writing:** fixed parameter order, filter values in the model's order, tag IDs sorted, defaults omitted, `tag_mode=all` only when a tag is chosen. One query has one address.
- **In `LibraryQuery`:** `kind`, `status`, `sermonType` became `kinds`, `statuses`, `sermonTypes` (arrays), and `tagMode` was added. Anything that builds a `LibraryQuery` by hand must use the new names.
- **Page resets** on any change to search, filters, tag mode, dates, or sort. Changing view or opening the panel touches neither the page nor the address.
- **New on idea links only:** `/library/<id>?from=<library query string>` (section 11).

## 8. Filter semantics

- Within a filter, any chosen value matches (OR). Between filters, all must hold (AND). An empty filter does not restrict.
- Sermon type matches sermon ideas only. A point that kept `topical` from its time as a sermon does not match, whatever kinds are chosen.
- Tags, **Any** (default): the idea has at least one chosen tag. **All**: it has every one. No tags chosen: no restriction in either mode. A tag chosen twice counts once.
- A tag ID that is unknown or another account's: ignored in Any, matches nothing in All. It can never surface someone else's idea, because the owner is inside the tag subquery as well as the main query.
- Dates are UTC days, inclusive at both ends, one end or both. A range that ends before it starts finds nothing; the inputs prevent making one, and an address that carries one is explained in the panel and in the empty state.
- All of it happens in PostgreSQL before counting and paging.

## 9. Tag-management behaviour

- **Create:** validated by the existing `tagNameSchema` (trimmed, inner spaces collapsed, 1–50 characters). A duplicate, in any case, answers "You already have a tag with that name." and the typed name stays in the box.
- **Rename:** in place. Enter saves, Escape leaves the rename without closing the dialog. Saving the same name does not call the server. No record is duplicated.
- **Delete:** behind a confirmation that says how many ideas the tag comes off and that the ideas are kept. A deleted tag is also removed from the library's current filter.
- **Usage counts** come from `listTags`' one grouped query.
- **Nothing is shown as done before the server answers.** Failures (invalid, duplicate, missing, connection) show a fixed message; no database text reaches the screen.
- **Security is unchanged from 2B.1:** every action calls `authorize("active")` and takes the owner from the session. The dialog sends only a tag ID and a name.
- **`updated_at`:** creating, renaming, or deleting a tag does not touch any idea's `updated_at`, so the library does not reorder. Saving an idea with its tags does, because the idea was saved.
- **In the editor:** the draft starts from the idea's current tags and every save sends them. A tag created in the picker exists immediately; attaching it happens with Save, atomically. An unknown tag fails the whole save with "One of those tags no longer exists." and leaves the idea as it was.

## 10. UI components introduced

`LibraryProvider` / `useLibrary` / `LibraryResults`, `LibrarySearch`, `LibraryToolbar`, `LibraryFilters`, `FilterChips`, `ViewSwitcher` / `LibraryViewScript`, `IdeaResults`, `Pagination`, `TagManager`, `TagPicker`, `TagsField`, `TagChip` / `TagList`. `PageHeader` gained `action`. Existing primitives were reused: `Select` for the order, `Segmented` for Any / All, `Dialog`, `ConfirmDialog`, `Popover`, `Input`, `Button`, `Badge`, `ActionStatus`.

Design notes: tokens only; cards and the filter panel are opaque surfaces, glass only on the dialog and popovers; emerald marks selection, the current page, and hover or focus (a card's border, a list row's left edge); nothing lifts on hover; touch targets grow under `pointer-coarse`; the global reduced-motion rule applies, and the view switch skips its cross-fade under reduced motion.

## 11. Navigation and state preservation

- Search, filters, tag mode, dates, order, and page are in the URL, so reload, Back, Forward, and shared links all keep them.
- An idea opened from the library carries `from`; its "Library" link and its redirect after deletion lead back to that exact address. `from` is re-parsed as a library query, so it can only produce a `/library…` address.
- The view preference is in `localStorage` (`library-view`) and survives visits.
- The filter panel's open state is local to the page and starts closed.

## 12. Tests added or modified

Unit tests went from 370 to **471** (43 files).

- **Query and parser** (`library-query.test.ts`): single-value compatibility, repeated and duplicate values, unknown values dropped, tag mode, canonical addresses, unrelated filters preserved, the filter helpers, and the way back (including hostile `from` values).
- **Filtering on PGlite** (`library.test.ts`): several kinds, statuses, and sermon types; OR within and AND across; sermon type against a point that kept one; tag Any and All with none, one, several, duplicate, unknown, and another account's tags; tags with search and dates; counts and paging.
- **Tags** (`tags.test.ts`): an unrelated edit that sends the idea's current tags keeps them, and leaves the links themselves untouched. Creation, uniqueness, rename, delete, counts, rollback, and isolation were already covered in 2B.1.
- **Components**: search (debounce, Enter, clear, history, following the address, not undoing a concurrent filter), filter panel, tag mode, dates, chips, sort, view switch and persistence, results, pagination, tag manager, tag picker.
- **Editor** (`idea-editor.test.tsx`): existing tags sent back on an unrelated edit, removal, adding, creating while editing, refusal keeps the selection, reclassifying leaves tags alone, the way back after deletion.
- **Pages** (`page.test.tsx`): new query shape, controls present, count line, the three empty states, pager links, `from`, and that `from` never leads anywhere but the library.
- **`tests/e2e/loading.spec.ts`**: rewritten to be deterministic (section 14).
- **`tests/e2e/library.spec.ts`**: new, signed in, currently skipped.

## 13. Verification commands and results

| Command               | Result                             | Notes                                                                                               |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run lint`        | Pass                               |                                                                                                     |
| `npm run typecheck`   | Pass                               |                                                                                                     |
| `npm run test`        | **471 of 471 pass** (43 files)     | Was 370 in 40                                                                                       |
| `npm run build`       | Pass                               | "not a production deployment, migrations skipped"                                                   |
| `npm run test:e2e`    | **45 pass, 3 skipped, 0 failed**   | Default 8 workers. Skipped: the 2 signed-in library tests (no test account) and 1 pre-existing skip |
| Prettier              | Every file added or changed passes | `npm run format:check` as a whole was not run: it reports the untouched CRLF files noted before     |
| `npm run db:generate` | Not run                            | No schema change                                                                                    |

**Signed-in end-to-end tests did not run.** `tests/e2e/library.spec.ts` covers: open the library, create tags (and a refused duplicate), search, tag two ideas in the editor, an unrelated edit keeping tags, several filters, Any then All, list view surviving a reload, opening an idea and returning to the same address (by link and by Back), removing a chip, clearing filters, an out-of-range page, and a search with no matches; it then deletes what it made. To run it:

1. In the **development** Clerk instance, have a user who is admitted to the application (an invited user, or the initial administrator).
2. Put that user's address in `.env.local` as `E2E_CLERK_USER_EMAIL=...`.
3. `npm run test:e2e`.

It refuses to run against a production publishable key. Because it has never executed, expect that a selector may need adjusting on the first run. Numbered pages are not exercised end to end (that would need more than 24 ideas in the test account); they are covered by component and page tests.

**Visual check.** A temporary, unauthenticated route with sample data was served by the owner's running dev server and inspected at 375, 820, and 1280 pixels in both themes, cards and list, with the filter panel, tag dialog, and tag picker open; no horizontal overflow at any width. The route was deleted.

## 14. Known issues

- **Not seen signed in**, as above. Worth ten minutes by hand: the checklist is in section 13's scenario list.
- **The splash timing failures are resolved, in the tests.** Investigation: with the production server up, the full suite at 8 workers failed 2 runs in 4, and `loading.spec.ts` repeated six times at 8 workers failed 8 of 36. The causes were in the tests, not the splash: (1) the splash waits for the page's `load` event, which took over 5 seconds with every worker loading the landing page, so fixed wall-clock limits (5 s default waits, "under 4 s") measured the machine; (2) the `"leaving"` state lasts 0.45 s and was being polled for from outside, so a busy runner could look away and miss it. The tests now record each state change inside the page with a `MutationObserver` and assert the order and the gaps: never down before 1.75 s, down within 1.5 s of the later of the 1.8 s minimum and `load`, fade between 0.4 and 1.95 s. That is a stricter statement than before, and independent of load. After the change: 48 of 48 at 8 workers under the same stress, and the full suite green on seven consecutive runs. No splash code and no worker count was changed.
- **Quick capture cannot set tags.** Deferred (section 15).
- **Tag changes made in the editor's picker do not refresh the editor's tag list from the server**; the picker keeps tags created in it locally, so nothing is missing on screen.
- **Offset paging**, **substring search without ranking**, **UTC days**, and **no cap on tags per account** stand as in the 2B.1 handoff.
- `npm install` of `@clerk/testing` printed npm's notice about install scripts awaiting approval for packages already present (`esbuild`, `unrs-resolver`); nothing was approved or changed.

## 15. Deferred features

- Tag selection in quick capture (the roadmap listed it for 2B.2; the phase brief scoped tags to the editor). The server already accepts `tagIds` on create; the capture dialog needs the tag list and a `TagsField`.
- Bulk selection and bulk actions.
- A dedicated tag-management page; a cap on tags per account; tag colours.
- Everything in later phases: the Bible reader and favourites (2C.1), sermon-point associations (2C.2), outlines, analytics.

## 16. Git working-tree status

Branch `dev`. Nothing was staged or committed; only read-only Git commands were run. 27 tracked files modified and these added: `src/features/ideas/components/library/` (12 files), `src/features/ideas/components/tag-chip.tsx`, `tag-picker.tsx`, `tag-picker.test.tsx`, `tests/e2e/library.spec.ts`, `docs/HANDOFF-2B.2.md`. `AGENTS.md` is among the modified files (two lines; section 5 of that file's project notes).

## 17. Process cleanup

- Started by this work: one production server (`next start --port 3100`) for the end-to-end investigation, stopped by its process ID; Playwright's own managed server on 3100 for the final run, stopped by Playwright; short-lived headless Chromium instances for screenshots, closed by their script. Port 3100 was confirmed free afterwards.
- No dev server was started. The owner's dev server on port 3000 was running throughout, was used read-only for the visual check, and was left running.
- The temporary preview route (`src/app/preview-2b2/`) was deleted. Patch scripts and screenshots stayed in the session's temporary directory, outside the repository.
- No production database command, no deployment, no Git write.

## 18. Starting point for Phase 2C.1 (dedicated KJV Bible reader)

Already in place:

- **Text and reads.** `bible_verses` is loaded from `data/bible/kjv.json` by the migrate command. `getChapter` (cached, `use cache`) behind `GET /api/bible/<book>/<chapter>`, and full-text search behind `GET /api/bible/search`, both for active accounts.
- **Components.** `ScriptureBrowser` is the reader's content already (search, Book / Chapter / Verse navigation, verse selection, a footer action) and is identical in every container. ARCHITECTURE.md's Scripture table reserves the third level for exactly this: "Bible reader — a page that hosts the same `ScriptureBrowser`". `PassageText` is the only renderer of Bible text.
- **References.** `{ book, chapterStart, verseStart, chapterEnd, verseEnd }` with parsing, formatting, and validation in `features/scripture/reference.ts`; ideas store them in `idea_scripture_references`. Nothing in 2B.2 changed that storage.
- **Navigation.** Add the Bible page to `components/layout/app-links.ts` when it exists; the tab bar holds five including capture. Add its path to `src/lib/site.ts` so the proxy and `robots.txt` cover it.

To decide or build:

- **Favourites and highlights need a migration**: a per-user table keyed by owner and verse (or reference), with a colour, never copying or changing the shared text. Follow the `idea_tags` pattern: owner in every WHERE clause, and constraints that make a cross-account row impossible.
- **Attaching a passage to an existing idea** from the reader needs an idea chooser. `searchIdeas` with a `LibraryQuery` is the query for it, and `updateIdea` already replaces references atomically; remember that a form sending `tagIds` must send the idea's current tags (AGENTS.md).
- **URL state for the reader** (book, chapter, selection) should follow the library's approach: one parser and serialiser module with no server imports, lenient parsing, one address per state.
- **Psalm titles** are not in the current dataset shape; check `data/bible/README.md` before assuming.
