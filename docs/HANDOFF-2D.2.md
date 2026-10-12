# Phase 2D.2 Handoff — Classification, Library Integration & Archive/Restore

Written 12 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Classification in the interface" and "Library"); this is the summary.

## A. What was implemented

The interface for the classification data layer of Phase 2D.1. No migration, no schema change, no new server action.

- **Classification & Status**, a collapsible section in the idea editor and in quick capture: development status for every idea, and intended format and sermon type for sermons.
- **Sermon types explained** on request, with a definition and an example of each, in English and Spanish.
- **Library filters** for intended format and for active, archived, or all ideas, beside the existing ones.
- **Archived ideas left out by default**, in the query, from the library, the dashboard's recent ideas, and the idea picker.
- **Archive** (with a confirmation) and **Restore** on an idea's page, and **Restore** on an archived result in the library.

## B. What a person sees

- **In the editor**, under the notes: a row reading "Classification & Status" with the idea's classifications beside it in one line, for example "Developing · Full-Length · Textual". A format or type nobody chose is left out of the line. Opening it shows one dropdown per classification, each with a sentence saying what the chosen value means. A point or an undecided idea has the status dropdown only.
- **Beside "Sermon type"**, an information button opens the four definitions with their examples and a note that the types name a sermon's primary structure and are not hard boundaries. It opens on a click, a tap, or the keyboard.
- **In quick capture**, the same section is under "More details", closed. A capture that never opens it saves the defaults.
- **At the foot of an idea's page**, "Archive idea" beside "Delete idea". It asks first and says the idea is hidden, not deleted, and can be restored. The person stays on the page, which then shows "Archived {date}" with a "Restore idea" button, and no Archive button.
- **In the library's filter panel**: an "Intended format" group and a "Show" choice of Active, Archived, or All. Each is a removable chip when in force, and counts toward the number on the Filters button. "Clear filters" returns to active ideas.
- **On a result**: a sermon's format beside its type where one was chosen; on an archived idea, an "Archived" badge (separate from its status, which it keeps) and a "Restore" button.
- **Empty states**: "Every idea is archived", with a link to them, when nothing is active but something is archived; "No archived ideas", with a link back, when the archive is asked for and empty.

## C. How it is built

- **One control.** `ClassificationSection` only changes the form's draft. The editor still saves the whole draft through `ideaInput`, so a classification that was not touched goes back as it was; quick capture creates with the same draft.
- **`idea-fields.tsx`**: `StatusField` is gone and `SermonFields` is now `SubjectField` (the subject alone). The three choices moved from `Segmented` to `Select`, which holds four long Spanish labels without crowding.
- **The query.** `LibraryQuery` gained `formats` (URL `format`, repeatable) and `archive` (URL `archived`: `active`, `archived`, `all`; left out when `active`). `libraryConditions` adds `kind = 'sermon' AND intended_format IN (…)` and `archived_at IS NULL` / `IS NOT NULL`. The count and the page share one WHERE, so totals and pages agree.
- **`recentIdeas`** excludes archived ideas. **`archivedCount`** is new, for the "every idea is archived" state. Both have the owner in the WHERE clause.
- **The picker** (`/api/ideas/search`) was not changed: it searches with the default query, which is now active ideas only.
- **Archive and restore** call the 2D.1 actions and then `router.refresh()`. Success is shown only after the server answers; a refusal is shown in place and nothing changes. Controls are disabled while either runs.

## D. Deliberate exceptions to "archived is hidden"

- **`getIdea` returns an archived idea.** Its address, a link kept from before, and the Bible reader's way back to it all still open it, and it can be edited and restored there.
- **`attachReferences` does not check.** Nothing offers an archived idea to it; an address made by hand could still add a passage to one.
- **A tag's idea count includes archived ideas**, in the filter panel and in tag management. The count is what "deleting this tag takes it off N ideas" must say, so it was left whole. A tag can therefore show a count higher than the active ideas it finds.

## E. Legacy values

Unchanged from 2D.1, and covered again where this phase touches it: `captured` reads as `idea` and a null sermon type as `unspecified` through `asRead`, in every archive view; the status and type filters still match the old values; nothing writes them. Migration `0007` was not altered and **the tightening migration was not written**.

## F. Decisions made where the brief left room

- **The roadmap disagreed with the brief.** The roadmap had library filters as 2D.3 (and said that line was a guess). The brief puts them in 2D.2 and makes 2D.3 the legacy tightening. The brief was followed and the roadmap rewritten to match; confirm that is what was meant.
- **The definitions and examples are the brief's**, replacing 2D.1's (soul winning, David and Goliath). "Not Specified" has a definition and no example.
- **"Mini Sermon" is now "Mini"**, as the brief lists it, in both languages.
- **The Spanish title for 1 Samuel 17:29 is "¿Acaso no hay una causa?"**, which is the verse as `data/bible/rvg.json` has it. 2D.1 had "¿No hay una causa?".
- **Undecided ideas are treated as points are**: status only.
- **Archiving keeps the person on the idea's page** instead of returning to the library, so the result and the way to undo it are in front of them.
- **Archive is on the idea's page only**, not on library cards. Restore is in both places, since archived results are where a person looks for it.
- **The section is closed by default in the editor too.** Its closed line is how the page displays the classifications.

## G. Validation

| Command             | Result                        | Notes                                                                                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | Pass                          |                                                                                                                           |
| `npm run lint`      | Pass                          |                                                                                                                           |
| `npm run test`      | **1,135 of 1,135** (64 files) | Was 1,113 in 63 files                                                                                                     |
| `npm run build`     | Pass                          | Migrations skipped outside a production deploy                                                                            |
| `npm run test:e2e`  | **Not run**                   | No `E2E_CLERK_USER_EMAIL` is configured; one journey was added to `tests/e2e/library.spec.ts` and has never been executed |

**New and changed tests.** `library-query.test.ts` (the two parameters: parsing, invalid values, one address per query, counting, clearing); `library.test.ts` (format among sermons only, the three archive views alone and with search, status, and a tag, totals and pages, old-format rows in the archive, `recentIdeas`, `archivedCount`); `classification-section.test.tsx`, new (closed by default, the one-line summary, sermon against point, one change leaving the others, the guide, Spanish); `idea-editor.test.tsx` (archive only after confirming, a refusal, an archived idea's notice and restore, unsaved edits kept); `results.test.tsx` (badge, format, restore on archived ideas only); `library-controls.test.tsx` (format and archive filters and their chips); `library/page.test.tsx` (the two new empty states). Existing tests were changed only where a control or a wording they named changed; none was removed.

## H. Not verified, and known limits

- **Nothing was looked at in a browser.** No signed-in session is available to the agent. The layout of the new section, the filter panel's two new groups, the archived notice, and the Restore button on a card and on a list row, on a phone and a desktop, in both themes and both languages, are unseen. The list row is the likeliest to need adjusting: its right-hand column now holds the date and, on an archived idea, a button.
- **The end-to-end journey was written blind** and may need its selectors corrected the first time it runs.
- **The sermon-type guide is a popover of four entries.** On a short phone screen it scrolls inside itself.
- **The Spanish wording is the agent's**, not a native speaker's.
- **Archive has no undo toast.** Restore is one press on the same page.
- **No bulk archive or restore.**

## I. For the owner

- Review and commit. No Git command that changes anything was run.
- Nothing to configure and nothing to migrate: this release has no migration. It can ship before or after the tightening migration, but not in the same release as it if `0007` has not yet been live.
- Look at the screens listed in section H, in both themes and at phone width.
- To run the signed-in end-to-end tests, set `E2E_CLERK_USER_EMAIL` as `tests/e2e/library.spec.ts` describes.
- Confirm the roadmap's new lines for 2D.2 and 2D.3.

## J. Ready for 2D.3

Ready. What it inherits: the tightening migration described in DATABASE.md, after which `asRead`, `legacyIdeaStatus`, `storedIdeaStatuses`, and the two filter allowances in `libraryConditions` can go; the browser pass and the end-to-end run above; and any refinement those turn up.
