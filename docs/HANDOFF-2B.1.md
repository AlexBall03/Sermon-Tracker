# Phase 2B.1 Handoff — Library Data, Search, Filtering, Tags & Pagination

Written 10 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Library" and "Tags"); [DATABASE.md](DATABASE.md) has the tables; this is the summary.

## Status in one paragraph

The library is now a real query: searched, filtered, ordered, counted, and paged by PostgreSQL, 24 ideas at a time, with no ceiling. Tags exist as owned, reusable records with every operation the interface will need. The library's state has a validated URL contract. **Almost none of this is visible yet, by design.** `/library` gained Previous and Next links and reads its query from the URL; the search box, filters, tag controls, and numbered pages are Phase 2B.2. Lint, type checking, unit tests, and a production build pass, and the migration ran against the development database. The end-to-end suite passes with two workers; at the default eight, two timing tests of the splash screen, which this phase did not touch, failed (section 9). **I did not see `/library` in a signed-in session**: the automation browser has none.

## 1. What was implemented

- `searchIdeas`: one page of the owner's library for a query, with the total.
- Search across title, subject, and notes; filters for kind, status, sermon type, tags, and created and updated dates; six orders; offset paging.
- `tags` and `idea_tags`, with service functions and server actions to create, list, rename, and delete tags and to set, add, and remove them on an idea.
- `tagIds` as an optional part of creating and updating an idea.
- `library-query.ts`: parse URL parameters into a typed query, and write a query back as a URL.
- `/library`: reads the query from the URL; "No ideas match" when a search or filter finds nothing; Previous / Next when there is more than one page.
- `listIdeas` and its 200 limit are gone. The dashboard's five come from `recentIdeas`.

## 2. Database changes

One migration, `0003_tags_and_library`, additive and safe ahead of the code now in production:

- `tags` (`id`, `owner_id`, `name`, `created_at`, `updated_at`); CHECK on the name's length; unique index `tags_owner_name_key (owner_id, lower(name))`; `UNIQUE (id, owner_id)`.
- `idea_tags` (`idea_id`, `tag_id`, `owner_id`, `created_at`); primary key `(idea_id, tag_id)`; composite foreign keys to `ideas (id, owner_id)` and `tags (id, owner_id)`, both `ON DELETE CASCADE`; index `idea_tags_tag_idx (tag_id)`.
- `ideas`: `UNIQUE (id, owner_id)` (the foreign key's target) and index `ideas_owner_created_idx (owner_id, created_at desc)`.

**The generated file was reordered by hand before it was ever applied.** Drizzle Kit wrote `ALTER TABLE ideas ADD CONSTRAINT ideas_id_owner_key` last, after the foreign key that needs it, which PostgreSQL rejects. That statement was moved above the foreign keys; nothing else was changed, and the snapshot is as generated. It is now applied to the development database and must not be edited again.

No trigram index and no extension: see "No trigram index" under Library in ARCHITECTURE.md.

## 3. New services and actions

| Where                             | What                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `features/ideas/ideas.ts`         | `searchIdeas`, `recentIdeas` (was `listIdeas`); every idea read now includes `tags`; `createIdea` / `updateIdea` save `tagIds`   |
| `features/ideas/tags.ts`          | `listTags`, `createTag`, `renameTag`, `deleteTag`, `getIdeaTags`, `setIdeaTags`, `addIdeaTags`, `removeIdeaTags`, `tagsForIdeas` |
| `features/ideas/tag-actions.ts`   | Server actions `createTag`, `renameTag`, `deleteTag`, `setIdeaTags`, `addIdeaTags`, `removeIdeaTags`                             |
| `features/ideas/library-query.ts` | `LibraryQuery`, `parseLibraryQuery`, `serializeLibraryQuery`, `libraryHref`, `isFiltered`, `searchTerms`, `defaultLibraryQuery`  |
| `features/ideas/model.ts`         | `librarySorts`, `librarySortLabels`, `libraryPageSize`, `searchLimits`, `tagLimits`, `tagFilterLimit`                            |
| `features/ideas/schemas.ts`       | `tagNameSchema`, `tagIdSchema`, `tagIdsSchema`; `ideaInputSchema.tagIds`                                                         |
| `db/types.ts`                     | `isUniqueViolation`                                                                                                              |

Reading tags is not an action. A page calls `listTags(getDb(), user.id)` after `requireActiveUser()`, as the library page calls `searchIdeas`.

## 4. Search semantics

- Case-insensitive, and a word matches anywhere inside a longer one ("faith" finds "unfaithful").
- Several words: every one must be found; each may be in the title, the notes, or the subject. No phrases, no operators.
- Whitespace is collapsed. The text is cut to 200 characters and the first 8 distinct words are used. An empty search is no search.
- `%`, `_`, and `\` are escaped and match themselves. All input is a bound parameter.
- **A subject is searched only on a sermon.** A point or undecided idea may still hold the subject it had as a sermon, but nothing shows it, so a match there would be unexplained.
- No ranking: results follow the chosen order.

## 5. Filtering and sorting semantics

- `kind`, `status`, `type`: one value each. Different filters must all hold.
- `type` matches sermons only. A point that kept `topical` from its time as a sermon is not a topical sermon. So `kind=point&type=topical` finds nothing.
- `tag` may repeat. An idea with **any** of the tags matches, and appears once.
- Dates are `YYYY-MM-DD`, read as UTC days (the zone every date in the app is shown in), inclusive at both ends. A person west of UTC who captures an idea late in the evening will find it under the next day's date, exactly as the date printed on the card says.
- A range that ends before it starts finds nothing.
- Orders: `updated-desc` (default), `updated-asc`, `created-desc`, `created-asc`, `title-asc`, `title-desc`. Each ends with the ID, so ties never reshuffle between pages. Titles ignore case.

## 6. Pagination behaviour

- Offset paging, 24 to a page (`libraryPageSize`). The service accepts another size, bounded to 1–100; the URL does not expose it.
- The result is `{ items, total, page, pageSize, totalPages }`. `total` counts every match.
- A page past the end returns the last page and reports its number. Zero, negative, fractional, and non-numeric pages are page 1.
- An empty result is `{ items: [], total: 0, page: 1, totalPages: 0 }`.
- Three queries for a page with results: count, ideas, then references and tags together. Two more never happen per idea.

## 7. Tag ownership and security

- Every tag has one owner; every statement in `tags.ts` has that owner in its WHERE clause.
- Every action calls `authorize("active")` itself and takes the owner from the session. No input can carry one.
- IDs are validated as UUIDs before any query.
- A missing record and someone else's give the same answer everywhere: "That tag no longer exists.", "That idea no longer exists.", "One of those tags no longer exists." When both an idea and a tag are foreign, the idea is reported, so nothing is learned about the tag.
- The database enforces the same rule: `idea_tags` cannot hold a tag and an idea of different accounts, under either owner. Tested with direct inserts.
- A duplicate name is refused with "You already have a tag with that name." Uniqueness ignores case and is per account.
- Assignment is transactional. One bad tag in a list leaves the idea exactly as it was, and an idea being created with a bad tag is not created.
- `tags.owner_id` is `ON DELETE RESTRICT`, like `ideas.owner_id`: a future account-deletion feature must decide what happens to both.
- Database errors are logged without connection strings and answered with fixed messages.

## 8. URL query contract

`/library?q=&kind=&status=&type=&tag=&tag=&created_from=&created_to=&updated_from=&updated_to=&sort=&page=`

The table of values is under "Library" in ARCHITECTURE.md. In short: invalid values become defaults without an error, unknown parameters are ignored, the first value wins where one is expected, defaults are left out when writing, and the order of parameters is fixed. The URL names no account, so a link is safe to share: whoever opens it sees their own ideas, and a tag ID from another account matches nothing.

## 9. Checks run

| Check                    | Result                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`           | Pass                                                                                                                                             |
| `npm run typecheck`      | Pass                                                                                                                                             |
| `npm run test`           | 370 of 370 pass (40 files; was 280 in 36)                                                                                                        |
| `npm run build`          | Pass                                                                                                                                             |
| `npm run test:e2e`       | **43 pass, 1 skipped, 2 failed** on the default 8 workers; **45 pass, 1 skipped** with `--workers=2`. See below                                  |
| `npm run db:generate`    | Wrote `0003_tags_and_library` (then reordered, section 2)                                                                                        |
| `npm run db:migrate:dev` | Applied 1 migration; a second run reported "up to date"; `db:status` shows 4 applied, 0 pending                                                  |
| Prettier                 | Every file added or changed passes. `npm run format:check` as a whole was not run: it reports the untouched CRLF files noted in earlier handoffs |

**The end-to-end failures are in `tests/e2e/loading.spec.ts`, which this phase did not touch**, and they are about timing on the public landing page: the splash "stays up long enough to be seen" expects it to lift within 4 seconds and measured about 5, and the progress bar was still running when the test stopped waiting. Which of the file's tests failed changed from run to run (four runs at the default worker count: a different one or two each time). Run one at a time (`--workers=1`) the file passed 6 of 6, twice, and the whole suite passed with two workers. The owner's dev server was running on the same machine throughout. I read this as the machine being too busy for those time limits, not a fault in the splash, but **I could not compare against the code before this phase**, since that needs a Git stash or checkout. Worth one run of `npm run test:e2e` with nothing else running.

New tests: the query parser and serialiser (`library-query.test.ts`); search, every filter, every order, paging, and isolation on an in-memory PostgreSQL (`library.test.ts`, including 250 ideas with one timestamp and 125 with one title, paged through under all six orders); the tag service, constraints, cascades, rollback, and cross-account refusals at both the service and the table (`tags.test.ts`); the tag actions and ideas saved with tags (`tag-actions.test.ts`); and the library page's use of the URL and its pager (`page.test.tsx`). Existing idea, action, dashboard, quick-capture, editor, and Scripture tests pass unchanged apart from the rename of `listIdeas`.

**PGlite and Neon.** Nothing in this phase uses a feature the two treat differently: no extension, no full-text search, plain `ILIKE`, `EXISTS`, and composite foreign keys. Two things PGlite cannot show: how the planner uses the indexes on real data, and two transactions racing (two tags created with one name at the same instant). The second is covered by the unique index, and `renameTag` turns that error into the duplicate answer.

No end-to-end test was added. Every new behaviour is behind sign-in and Playwright has no session; the existing suite covers that `/library` still sends a guest to sign in.

## 10. Known limitations

- **No interface for any of it** beyond Previous / Next. A search or filter can only be typed into the address bar. Tags can only be created by calling the actions.
- **Tags are fetched but not shown** on cards or in the editor.
- **Search is substring matching, unranked.** "pray" finds "prayer"; "prayed" does not find "pray". No stemming, no typo tolerance.
- **No search index.** Fine for thousands of ideas per account; revisit with `pg_trgm` if one account reaches tens of thousands.
- **Offset paging** can show an idea twice, or skip one, if the library changes between two page loads.
- **Dates are UTC days**, as everywhere in the app.
- **One value per filter** for kind, status, and type. "Sermons and points but not undecided" is not expressible. Tags are the only multi-value filter.
- **No limit on how many tags an account may create.** `listTags` returns them all.
- **Tagging does not change `updated_at`** when done through the tag actions, but saving an idea with `tagIds` does, because the idea itself was saved.
- **The title order has no index**; it sorts one account's matches in memory.
- Limitations in the earlier handoffs still stand.

## 11. Outstanding manual verification

1. Open `/library` signed in. It should look as before, with the count line reading "N ideas, most recently changed first".
2. With more than 24 ideas, check Previous / Next and "Page x of y" at the foot, on a phone as well.
3. Try `/library?q=<a word you know is there>`, then one that is not: "No ideas match" with "Show all ideas".
4. Try `/library?kind=sermon&sort=title-asc` and `/library?page=999` (should land on the last page).
5. Quick capture, editing, reclassifying, and deleting an idea: unchanged in code paths and passing in tests, but not watched in a session.
6. Deploying to production applies `0003_tags_and_library` during the build. Nothing needs to be run by hand.
7. Git: nothing was staged or committed.

## 12. For Phase 2B.2

Ready to build on:

- **Filter and search controls** set URL parameters. Build every link and `router.push` target with `libraryHref({ ...query, <change>, page: 1 })`; read the current state with `parseLibraryQuery(useSearchParams())`. `library-query.ts` has no server imports. Remember that a client component calling `useSearchParams()` must sit inside `<Suspense>` under Cache Components, or the production build fails.
- **Numbered pages** need only `page` and `totalPages`, already returned. The Previous / Next `nav` in `library/page.tsx` is about thirty lines and is meant to be replaced.
- **Sort menu**: `librarySorts` and `librarySortLabels` in `model.ts`.
- **Tag filter and tag picker**: `listTags` gives id, name, and `ideaCount`. Pass it from the page to the client components as props.
- **Tags on cards**: `idea.tags` is already on every item `IdeaList` receives.
- **Tags in quick capture and the editor**: add `tagIds` to `IdeaDraft` and send it. The server already saves it atomically and answers "One of those tags no longer exists." if one has gone. The editor's page must pass the idea's current `tags` as the initial value; if it sends `tagIds: []` by default it will clear them.
- **Creating a tag inline** while capturing: `createTag` returns the new `{ id, name }`.
- **Tag management page**: `createTag`, `renameTag`, `deleteTag` are complete. Deleting should go through `ConfirmDialog` and can say how many ideas lose the tag (`ideaCount`).

Decide before starting:

- Whether a tag filter should offer "all of these" as well as "any of these". The query supports only "any".
- Whether kind, status, or type should accept several values. That is a change to `LibraryQuery`, the parser, and three lines of `libraryConditions`.
- Whether an account needs a cap on its number of tags.
- Where the view preference (cards or list) lives. Nothing is stored per user today; the theme uses `localStorage`.
- Whether the count line's "Show all ideas" link stays once there is a proper clear-filters control.

## Process cleanup

No dev server was started: the owner's server on port 3000 was already running and was left running. Playwright's managed production server on port 3100 stopped with its run (port confirmed free). Patch scripts were kept in the session's temporary directory, outside the repository. No Git state-changing commands were run. No production database command was run.
