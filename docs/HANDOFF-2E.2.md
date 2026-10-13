# Handoff: Phase 2E.2 — Preaching Record UI, integration, and verification

12 October 2026. No migration, no schema change, no new package. The Phase 2E.1 services and actions are used as they were. **Status: implemented; unit suite and production build pass; the end-to-end suite was not run (sections 10 and 13).** Not deployed.

## 1. Final library route structure

| Route                       | What it is                                       |
| --------------------------- | ------------------------------------------------ |
| `/library`                  | Library overview                                 |
| `/library/sermon-ideas`     | Sermon Ideas (what `/library` used to list)      |
| `/library/saved-scripture`  | Saved Scripture (was `/library/scripture`)       |
| `/library/preaching-record` | Preaching Record (planned as `/library/history`) |
| `/library/<id>`             | One idea, unchanged                              |

The addresses are `routes.library`, `routes.sermonIdeas`, `routes.savedScripture`, and `routes.preachingRecord` in `src/lib/site.ts`. The model is **Library → section → one record**. The three section names are static folders, so none can be taken for an idea's ID, and an idea's ID is validated as a UUID before anything is read.

## 2. Library overview

`src/app/(app)/library/page.tsx`. A heading ("Library", "Your sermon ideas, saved Scripture, and preaching records in one place.") and three cards, one per section, each one link with an icon, the section's name, and a line about it. The cards come from the same `librarySections` list as the section navigation. They stack on a phone and sit three across from `md`.

It checks access itself, runs no query, has no page action, no "Back to Library", and marks no section as current. The optional "recently edited" list was left out: the dashboard already has it.

## 3. Section pages

All three begin with `LibrarySectionHeader` (`src/features/ideas/components/library/library-sections.tsx`), in this order: Back to Library, the section's own `h1` and description, its main action if any, the section navigation, then the page's content.

- **Sermon Ideas**: action is Capture an idea, as before. Search, filters, tags, statuses, classification, archive, and pages are unchanged; only the head and the addresses moved.
- **Saved Scripture**: no header action. The Capture button it had inherited from the shared "Library" header was removed, since nothing is made on this page (capture is still in the app bar). Its empty state still leads to the Bible.
- **Preaching Record**: action is Record preaching, with the same action in its empty state. Search, date, sermon, venue, context, format, and AM/PM filters, pages, recording, editing, deleting, and venue and context management are as built earlier in this phase.

Each section's title was "Library" with a hidden `h2`; it is now the section's own name, and the empty-state headings moved from `h3` to `h2` to match. Browser titles follow. Each section has its own `loading.tsx`; `library/loading.tsx` now outlines the overview and also stands for an idea's page.

## 4. Back to Library

`BackLink` (`src/components/layout/back-link.tsx`): a quiet link with a left arrow above the title, 32px tall (44px on touch), with hover and the global focus ring. It is a real link to `/library`, never browser history. It appears once on each section page, through `LibrarySectionHeader`, and not on the overview.

An idea's page uses the same component, labeled "Back to Sermon Ideas", leading to Sermon Ideas as it was left (`from`). The idea not-found page says the same, and its text is now in the dictionaries.

## 5. Section navigation

`LibrarySections` is unchanged in look: three links with icons, `aria-current="page"` on the one shown, wrapping on narrow screens. It is on the three section pages only. The overview uses cards instead and highlights nothing.

## 6. Record Preaching entry points

One form (`OccurrenceDialog`), one set of schemas (`preachingSchemas(locale)`), one action (`recordOccurrence`). It opens over the page it was asked for on, and closes back to it.

| Where                                   | Sermon                                                    |
| --------------------------------------- | --------------------------------------------------------- |
| Preaching Record header and empty state | Chosen in the form; preselected when filtered to a sermon |
| A sermon's page: header, and its record | Preselected                                               |
| A sermon's card in Sermon Ideas         | Preselected                                               |
| Dashboard shortcuts (new)               | Chosen in the form                                        |

The last three go through `RecordPreachingProvider`. For the dashboard, its context now also opens the form with no sermon (`useRecordPreaching`), used by `RecordShortcut`, a card in the existing shortcuts column styled like the others. The dashboard page reads the account's venues and contexts for it. The action is offered only on ideas filed as sermons, archived ones included, which is the server's own rule.

The dashboard's workflow sentence no longer says the preaching record is still to come.

## 7. Redirects and deep links

- `/library/scripture` → `/library/saved-scripture` and `/library/history` → `/library/preaching-record`, in `next.config.ts`, temporary (307), query string carried across.
- `/library` is not redirected in the config. Its page sends an address that still carries an ideas query (`/library?q=grace&kind=sermon&page=2`) to the same query on Sermon Ideas, by parsing it with `parseLibraryQuery` and redirecting only when the result differs from the default. `/library` alone, or with parameters the ideas query does not know, stays on the overview. There is no loop: Sermon Ideas never redirects.
- `/library/<id>` and its `from` parameter are untouched.

## 8. Localization

English and Spanish, in the existing dictionaries:

- `library`: `description` (new wording), `back`, `descriptions.{ideas,scripture,history}`, `overview.{ideas,scripture,history}`.
- `ideas`: `page.back` ("Back to Sermon Ideas"), `page.notFound`.
- `dashboard`: `record.{title,description}`, and the workflow description.

"Preaching Record" is the name everywhere people read it. The Spanish switch is untouched. The Spanish wording is the agent's.

## 9. Phase 2E.3 folded into this step

Phase 2E.3 ("integration, end-to-end testing, and final hardening") no longer exists. On 12 October 2026 its checks became part of this step, now named "Preaching Record UI, integration, and verification". Phase 2F is next, then Phase 3. `docs/HANDOFF-2E.1.md` still mentions 2E.3; it is left as it was written.

The rule this follows is now written down for every later phase: "How much to verify" in `ARCHITECTURE.md`, with a pointer in `AGENTS.md`.

What 2E.3 was to do, and where each item stands:

| Item                                                    | Status                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Whole unit suite                                        | **Run, passed**                                                 |
| Production build                                        | **Run, passed**                                                 |
| End-to-end suite, signed in                             | **Not run** (owner's decision, 12 October 2026)                 |
| End-to-end journey for recording preaching              | **Written, never executed**                                     |
| Signed-in look at phone and desktop widths, both themes | **Not done**                                                    |
| Redirects in a running app                              | **Not checked in a browser**; would be covered by the run above |
| Unused dictionary keys                                  | **Removed**                                                     |

## 10. Verification

Everything below was run on the code as it stands at the end of this session, except where a line says otherwise.

| Check                                                   | Result                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                     | **Pass**                                                                                          |
| `npm run test -- --maxWorkers=4` (the whole unit suite) | **Pass: 78 files, 1,324 tests**, 320 s                                                            |
| `npm run build`                                         | **Pass**; 23 static pages; migrate step printed "not a production deployment, migrations skipped" |
| ESLint and `prettier --check` on the changed files      | **Pass**                                                                                          |
| `npm run db:status` (development)                       | 10 applied, 0 pending; stamp development                                                          |
| `npx playwright test`                                   | **Not run**                                                                                       |

The whole unit suite and the build ran before `tests/e2e/preaching-record.spec.ts` was last reformatted and before the documentation edits; neither is compiled into the application or collected by Vitest. The new spec passes ESLint and `tsc --noEmit`.

**Why the whole unit suite (Level 3).** This phase changed things many features share: the routes in `src/lib/site.ts`, `next.config.ts`, `library-query.ts`, `saved-query.ts`, layout components, four dictionaries, and `deleteIdea`'s return type; and Phase 2E.1 had left the whole suite unrun. One run, at the end, was warranted. It found nothing.

**Why the whole end-to-end suite was planned, and what its absence means.** Every signed-in spec crosses the restructured routes, and four of them (`library`, `saved-scripture`, `scripture-ideas`, `auth`) were edited for the new addresses without being run. The owner chose to skip the run. So the following are checked by unit and component tests and by reading only, never in a browser against a real database:

- the two `next.config.ts` redirects and the `/library?q=…` redirect with a real server;
- recording, editing, and removing an occasion through the real form, and making a venue and a context in it;
- the four Record Preaching entry points opening the form with the right sermon;
- the layout at phone width, both themes, and keyboard order of the overview, back link, form, and dashboard shortcut.

The edited specs and the new one may themselves hold wrong selectors. Expect to correct the tests on their first run, as happened in Phase 2D.3.

### Security and integrity

Read in this session, in the code:

- All nine actions in `src/features/preaching/actions.ts` begin with `authorize("active")`, take the owner from the session, and parse their input with `preachingSchemas(locale)` before any query.
- `GET /api/preaching/sermons` authorizes, takes only the search text from the address, and searches through `searchIdeas` with the session's owner.
- The overview, the three sections, an idea's page, and the dashboard each call `requireActiveUser()` and pass `user.id` to every preaching query. The Preaching Record drops a `sermon` in the address that is not the account's own.

Proved by tests that passed in the whole-suite run (written in Phase 2E.1, not duplicated): another account's occasion, venue, or context is "missing"; invalid input is refused in the account's language; a retried submission records once; only a sermon can be recorded, and the idea's row is locked first; a venue or context that history names is kept; a preached sermon is not deleted; history survives archiving and refiling; migration `0009` leaves every existing row as it was.

Not rerun: the concurrent-connection run against the development database from Phase 2E.1. Nothing in `occurrences.ts`, `venues.ts`, `contexts.ts`, or `deleteIdea` has changed since.

### Database and deployment

These are five separate facts:

| Fact                                   | State                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified in development                | Yes, as listed above; `0009` applied to development                                                                                                                                            |
| Production build passes                | Yes, locally                                                                                                                                                                                   |
| Migration `0009` reviewed              | Yes. Three `CREATE TABLE`, six foreign keys on the new tables, six indexes. It alters and drops nothing, creates no rows, and is safe under the code now live and after a rollback. Not edited |
| Migration `0009` applied to production | **No**                                                                                                                                                                                         |
| Phase 2E deployed to production        | **No**                                                                                                                                                                                         |

Nothing was done to production. This phase adds no migration of its own.

## 11. Changed in this session

- New: `tests/e2e/preaching-record.spec.ts`. Two journeys, each in the desktop and mobile projects: the overview to each section and back, with the old addresses; and one sermon recorded, changed, searched, filtered, opened from all four entry points, refused deletion, refiled, and archived, with its own cleanup.
- Removed, unused: `library.saved.heading`, `preaching.history.heading`, `ideas.editor.back`, in both languages.
- `docs/ROADMAP.md`, `ARCHITECTURE.md` ("How much to verify"), `AGENTS.md`, this file.

No application behavior changed.

## 12. Known limitations

- **Everything under "what its absence means" above.**
- **Venues and contexts cannot be managed while the record is empty.** "Manage venues" and "Manage contexts" are in the record's toolbar, which is not drawn when the account has no occasion at all. A venue made in the form and then left with no record cannot be renamed or deleted until something is recorded again. Found by reading the page while writing the new journey; not changed, since it is a design choice for the owner. The new journey's cleanup works round it.
- **Spanish was not looked at in a browser.** It is covered by component tests that take a `locale` and by the dictionary tests. The Spanish wording is the agent's.
- **The two `next.config.ts` redirects have no automated test that has run.**
- **Loading outlines say "Loading…" in English**, as every `loading.tsx` already did. The idea page's outline is the overview's three blocks.
- There is no development journal in the repository; the handoffs and the roadmap are the record.

## 13. What is left before release

For the owner, in this order:

1. Review and commit.
2. Run the end-to-end suite: `npm run test:e2e -- --workers=3` (it builds first; `E2E_CLERK_USER_EMAIL` is already in `.env.local`). Correct any test that is merely out of date; treat anything else as a defect. A failed run leaves its ideas, venues, and contexts behind under an `e2e…` prefix.
3. Or, by hand, signed in to development:
   - `/library` shows three cards; each opens its section; each section has one "Back to Library" and marks itself in the section navigation.
   - `/library/scripture?q=x`, `/library/history`, and `/library?q=x` arrive at the new addresses with the query kept; `/library` alone stays.
   - Record preaching from the record's header, a sermon's page, a sermon's card, and the dashboard; make a venue and a context in the form; choose PM, then edit it back to not specified.
   - Search and filter the record; open `?page=999`.
   - Try to delete the preached sermon, the venue, and the context: each is refused and says why.
   - Refile the sermon as a point (Record preaching goes, the record stays), then archive it (still in the record, marked Archived).
   - The same pages at phone width, in the dark theme, and in Spanish.
4. Optional before release: `npm run db:status -- prod` should show `0009` as the one pending migration.
5. Push to `master`. The production build applies `0009`; do not push a second release with a migration while it builds.
6. Smoke-test production: record one occasion and remove it.

## 14. Readiness for Phase 2F

The code is ready to build on: the services, actions, routes, and dictionaries are settled, and the unit suite and build are clean. **Phase 2E is not fully verified until step 2 or 3 above is done.** If Phase 2F starts first, it starts on end-to-end specs that have not been run since the routes moved, and should run them before changing any page they cross.

## Process

No Git command that changes anything was run. One server was started (the production build on port 3100) and stopped; the owner's dev server on port 3000 was not touched. No package was installed. The development database was read by `npm run db:status` and by nothing else.
