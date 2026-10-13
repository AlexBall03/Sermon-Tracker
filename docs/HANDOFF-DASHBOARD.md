# Handoff: Dashboard Redesign & Practical Workspace Refresh

13 October 2026. No migration, no schema change, no new package. **Status: implemented; checked as section 8 says.** Not deployed. This milestone has no phase number: it came between Phase 4A and Phase 4B at the owner's direction. The tour (4B), the landing page, and the PWA were not started.

## 1. What was implemented

`/dashboard` is now the workspace, where it was the welcome screen of Phase 1C.

- **Header**: the greeting, one line, and three actions: Capture an idea, Start or open outline, Record preaching.
- **Continue Working** (new): the sermons being developed now, each with its outline and the way back in.
- **Revisit an Idea**: as it was, beside Continue Working.
- **Recent Ideas**: the five latest ideas of every kind, as compact rows.
- **Recent Preaching** (new): the three latest occasions from the Preaching Record.
- **At a Glance**: four real counts in place of four sentences.
- **An empty workspace**: one invitation, "Start with an idea".
- The loading skeleton follows the new layout. English and Spanish throughout.

Removed: the three-stage "How your workspace works" explainer (`workflow-overview.tsx` and its strings) and `IdeaList` (`features/ideas/components/idea-list.tsx`), which only the dashboard used.

Not built, on purpose: an activity feed, an event or audit log, stored counters, a summary table, a cache, polling, an analytics page, outline status or progress, any part of the tour, sample data.

## 2. How it works

The full contract is "Dashboard" in `ARCHITECTURE.md`. In short:

| Section                                   | Query                                                                               | Limit   |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| Continue Working                          | `continueWorking` (new, `ideas.ts`), then `outlinesForSermons` (new, `outlines.ts`) | 4       |
| Revisit an Idea                           | `revisitIdeas` (unchanged)                                                          | 3       |
| Recent Ideas                              | `recentIdeas` (slimmed)                                                             | 5       |
| Recent Preaching, Times Preached          | `searchHistory` (unchanged): `items` and `total` of one call                        | 3       |
| Sermon Ideas, Point Ideas, In Development | `workspaceCounts` (new, `ideas.ts`)                                                 | one row |

- **Continue Working**: `kind = 'sermon'`, not archived, status `idea` or `developing` (`activeStatuses`, new in `model.ts`), and `last_developed_at is not null`; ordered by `last_developed_at desc, id desc`. So a sermon only captured is not in it, `ready` and `on_hold` are not in it, and a status, tag, kind, archive, or preaching change neither admits a sermon nor moves it. No activity tracking was added: this is `last_developed_at` as Phases 2F.1 and 3C defined it.
- **Its outlines**: one query for the sermons returned, with the count of entries taken over a join. No entry is read, and nothing is asked once per sermon.
- **Figures**: counted on each request. In Development is sermons at `developing`. Times Preached is every occasion ever recorded, archived and refiled sermons' included.
- **Every query** names the owner in its WHERE clause; the page asks `requireActiveUser()` before any of them.

## 3. Reused, not rebuilt

- Quick capture: `CaptureButton`.
- Outlines: `CreateOutlineDialog` (and so `useStartOutline` and `createOutline`), mounted by a small `DashboardOutlineButton`; `OutlineLink` for a sermon with no outline; `outlineHref`.
- Preaching: `RecordPreachingProvider` and the one `OccurrenceDialog`, `DashboardRecordButton` (as before), `searchHistory`, `formatDay`, `sermonHistoryHref`.
- Ideas: `revisitIdeas`, `DevelopedLine`, the status and kind names.
- Shared: `PageHeader`, `StatStrip`, `Badge`, `buttonVariants`.
- `useFreshOnReturn` was private to the outlines overview. It is now `src/lib/use-fresh-on-return.ts`, used by both.

## 4. Decisions worth knowing

- **Recent Ideas no longer shows passages, tags, or notes.** The rows name the idea, its kind, its status, and its date. `recentIdeas` therefore returns the rows alone (`IdeaRecord[]`) and no longer runs the two extra queries for references and tags. The Scripture chips that used to open a preview from the dashboard are gone with them; they are on the idea's page and in Sermon Ideas.
- **One outline action, named "Start or open outline".** It opens the overview's picker, which opens an outline that exists and makes one for a sermon that has none.
- **The empty workspace is "no active idea and nothing preached".** The header's two secondary actions are hidden with it. An account whose ideas are all archived but which has a preaching record gets Recent Preaching and the actions, not the invitation.
- **Recent Preaching is left out, not shown empty, for an account with no sermon.** There is nothing it could record.
- **A row of Recent Preaching leads to that sermon's record** (the Preaching Record filtered to it), where an occasion is read and changed. The dashboard has no occasion dialog of its own.
- **`workspaceCounts` is the one query the page catches.** On failure its three figures read "Unavailable" and the rest of the page stands. Any other failure goes to the `(app)` error boundary, as before.
- **Continue Working is a panel of rows**, like the other three, after the owner saw it as loose cards: the tops did not line up and one sermon left a hole. All four panels are in one grid with even gaps. Its rows are not one link (each has two actions), so the title is underlined with dots.
- **At a Glance stays last.** The figures are context; at the top they would push Continue Working down a phone's screen.
- **The outline icon changed across the application**, at the owner's request while this was built: `List` (a dot before each line) in place of `ListTree`, in the navigation, the tab bar, `OutlineLink`, the outline cards, the setup wizard's feature list, and the dashboard.
- **`/dashboard` is now revalidated by the preaching and outline actions** (`refresh` in each), as the idea actions already did. `updateEntry` and `setEntryReferences` still revalidate nothing; the dashboard asks again when a kept copy is shown.
- **`StatStrip` takes an `unavailable` label.** The word was an English literal. The administrator's page does not pass one and still says "Unavailable".
- **`AppLink` has an `id`**, so the navigation can carry `data-tour` names that do not change with the language.

## 5. Database

None. No migration, no column, no index. The reads are within one owner and served by `ideas_owner_updated_idx`, `UNIQUE (sermon_id)` on `sermon_outlines`, and `preaching_occurrences_owner_date_idx`; what remains to sort or count is one account's ideas. Development and production databases were not written to by this work.

## 6. Localization

`dashboard` rewritten in `en` and `es` together: `description`, `empty`, `outline`, `continue`, `recent`, `preaching`, and `summary` are new or changed; `workflow` and the `pending` sentences are gone; `revisit` and `record` are as they were. Statuses, kinds, "Last developed", an outline's size (with its singular), AM and PM, "Archived", and "Now filed as" are read from the dictionaries that own them. Dates go through `formatDate` and `formatDay`. The Spanish wording is the agent's and was not reviewed by a Spanish reader. The loading skeleton's screen-reader line is still English, as it was.

## 7. For Phase 4B

`data-tour` names, which nothing reads: `dashboard-workspace`, `continue-working`, `revisit-ideas`, `recent-ideas`, `recent-preaching`, `at-a-glance`, `start-outline`, `record-preaching`, `quick-capture` (the bar) and `tab-quick-capture` (the tab bar), `nav-dashboard`, `nav-library`, `nav-outlines`, `nav-bible`, and the same four as `tab-…`. The Preaching Record is reached from `recent-preaching` and `record-preaching`; it has no navigation item. A section that an account has nothing for is not rendered, so a tour must not assume every name is on the page. `users.tour_state` was not touched.

## 8. Verification

| Check                                                      | Result                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                         | **Pass**, on the final code                                                                                                                                                                                                                                                                   |
| ESLint on the files touched                                | **Pass**                                                                                                                                                                                                                                                                                      |
| `prettier --check --end-of-line auto` on the files touched | **Pass**                                                                                                                                                                                                                                                                                      |
| Focused unit, database, and component tests                | **Pass**: 18 files across three runs, listed below                                                                                                                                                                                                                                            |
| Production build (`npx next build`)                        | **Pass**, once, on the final code. The migration step of `npm run build` was not run; there is no migration                                                                                                                                                                                   |
| The whole unit suite                                       | **Not run.** It was started and stopped at the owner's direction before it finished; no result was read from it                                                                                                                                                                               |
| `tests/e2e/dashboard.spec.ts` (new)                        | **Written, not run**                                                                                                                                                                                                                                                                          |
| Any other end-to-end spec                                  | **Not run**                                                                                                                                                                                                                                                                                   |
| A browser                                                  | The owner looked at the page signed in, in development, at desktop and narrower widths in the dark theme while it was built, and three changes came of it (section 4). The agent did not see it. The light theme, Spanish, a phone, a keyboard pass, and a screen reader were **not checked** |
| Production or preview                                      | **Not touched**                                                                                                                                                                                                                                                                               |

**Tests run, all passing:**

- `src/app/(app)/dashboard/page.test.tsx` (rewritten, 25 tests): access refusal with no query asked; every query asked for the session's account with its limit; the greeting; the empty workspace and its zeros; the three actions, each once; the recording form and the outline picker opening and creating nothing; a sermon with an outline and one without; the server's order kept; each section's empty line; occasions listed one by one, a repeat included, with nothing supposed that was not recorded and an archived, refiled sermon marked; partial workspaces; real figures; "Unavailable" on a failed count; Spanish.
- `src/features/ideas/workspace.test.ts` (new, 14 tests, PGlite): `continueWorking` by owner, kind, each status, never-developed, archive and restore, order, not moved by status or tags, moved by work on content, limit and ties; `recentIdeas` across kinds; `workspaceCounts` with zeros, archived ideas, and another account.
- `src/features/outlines/outlines.test.ts` (one test added): `outlinesForSermons` for an outline with entries, an empty one, a sermon with none, and another account's.
- `src/features/outlines/actions.test.ts` (expectation updated for the dashboard's revalidation), `src/features/preaching/occurrences.test.ts` (assertions added: the latest three of four, with the total), `src/features/preaching/actions.test.ts`.
- Dependents: `src/features/ideas/{ideas,actions,tag-actions,classification,library}.test.ts` (callers of `recentIdeas`), `src/app/(app)/outlines` (the overview and its state), `src/app/(app)/admin` (`StatStrip`), `src/components/layout/app-header.test.tsx`, `src/features/onboarding/components`.

The preaching, admin, and outline-action tests were last run before the icon change and the Continue Working restyle, neither of which touches what they cover.

A bug the tests caught while this was built: the first `outlinesForSermons` counted entries in a subquery, as `listOutlines` does. Without a join in the statement Drizzle writes the outer column unqualified, the subquery compared `outline_entries.outline_id` to its own `id`, and every count was zero. It now counts over a left join.

## 9. Known limitations

- **The whole unit suite and every end-to-end spec are unrun** on this code. `preaching-record.spec.ts` presses "Record preaching" on the dashboard; the button and its name are unchanged, but the spec was not run. Its account must have an active idea or a preaching record, or the button is not shown.
- **`dashboard.spec.ts` has never run.** It reads only and writes nothing; it adapts to an account with nothing.
- **Light theme, Spanish, a real phone, keyboard, and screen reader were not looked at.** Spanish labels are longer ("Abrir Registro de predicación", "Iniciar o abrir bosquejo"); the layout wraps by construction but was not seen.
- **Sermons from before `last_developed_at` existed** (migration `0010`) that were worked on only before it have no date and are not in Continue Working until they are worked on again. That is the column's meaning, not a fault; they appear under Revisit an Idea.
- **A sermon worked on and then left for 30 days** can be in both Continue Working and Revisit an Idea when an account has few developed sermons. The two rules are independent on purpose.
- **The header's secondary actions are hidden in an empty workspace**, so a brand-new account records and outlines from the Preaching Record and Outlines until it has an idea.
- Carried and unchanged: migrations `0009` to `0014` are applied to development only, and the live checks of Phase 1C.2 are outstanding.

## 10. For the owner

1. Review and commit (`AGENTS.md`, the two deleted files, and the new ones included).
2. Look at the dashboard in the light theme, in Spanish, and on a phone; and as an account with nothing (a newly invited one).
3. Optional, a few minutes each, alone: `npx playwright test dashboard`, and `npx playwright test preaching-record`.
4. Decide whether the old Scripture chips on Recent Ideas are missed (section 4).

## Process

No Git command that changes state was run. No package was installed. No server was started or left running; the owner's own development server was not touched. Two files were deleted (`workflow-overview.tsx`, `idea-list.tsx`). Prettier was run with `--write` only on named files this work wrote or edited. The whole unit suite was started in the background and stopped when the owner said it was not wanted.
