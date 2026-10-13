# Handoff: Phase 3C — Sermon, library, and Bible integration

13 October 2026. No migration, no schema change, no new package. **Status: implemented and verified: type checking, lint, formatting, the whole unit suite (with one fix after it, re-run where it applied), a one-off concurrency run against development, a production build, and signed-in end-to-end journeys at desktop and phone widths (section 8). Not deployed.**

## 1. What was implemented

A signed-in person can now:

- find **Outlines** in the main navigation, and browse, search, and order their outlines at `/outlines`;
- create an outline for an existing sermon, or for one captured on the spot, and never get a second for the same sermon;
- open or create a sermon's outline from the sermon's page and from its card in Sermon Ideas;
- place a copy of a saved point idea in an outline ("Add from Saved Point"), with its heading, notes, and passages;
- put passages on any entry, read them in place, open them in the Bible, and come back to the outline;
- see outline work count as developing the sermon.

Nothing of Phase 3D (preview, print) or later was built. Creating a point idea from an entry was not built.

## 2. Decisions that were mine to make

| Decision                                                                                                                                                  | Why                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Outline work moves `updated_at` as well as `last_developed_at` on the sermon                                                                              | It is what `attachReferences` already does for a passage added from outside the idea's editor. A sermon being outlined rises in "recently updated"                       |
| What counts: words or passages that differ; an entry added, removed, or moved that bears content                                                          | One rule, in `entries.ts`. An empty point is a place to write, and walking it about changes nothing a sermon says                                                        |
| Not counted: making or deleting an outline, numbering, a move to the same place, a retry, anything stale or refused                                       | Stated in the brief, except deleting an outline, which I left out because destroying the outline is not developing the sermon                                            |
| Lock order is now ideas, then the outline, then entries (`lockForWrite`)                                                                                  | Stamping the sermon after holding the outline would deadlock against `deleteIdea`, which holds the idea and cascades to the outline                                      |
| A saved point's passages are copied too, on the server, up to the entry's 10                                                                              | 3A left it open. A point without its passages is half the point                                                                                                          |
| The reader's address gains `outline` beside `idea`                                                                                                        | A passage opened from an entry should lead back to the outline, not only to the sermon                                                                                   |
| "Create Outline" on a sermon's page and card is a link to `/outlines/new?sermon=<id>`; the overview's picker and a sermon captured for it create directly | The link is caught by the leave guard when the sermon has unsaved edits, and a slip on a card makes nothing. In the picker a sermon was chosen for exactly this          |
| The overview asks the server again when it is returned to with Back (`useFreshOnReturn`)                                                                  | Next shows a kept copy of a page on Back. Without this the "worked on" date and the count would be the ones from before                                                  |
| A long passage's "N more verses" line became a button, everywhere                                                                                         | The brief asked for one bounded behavior. The limits (6 in a preview, 12 in a row) were already consistent; they now come from one place, and the rest is one press away |
| No status filter or archive view on the overview                                                                                                          | An outline has no status, and the architecture leaves archived sermons' outlines out of lists                                                                            |

## 3. Where things are

```
src/features/outlines/
  outlines-query.ts                    The overview's address: q, sort, page.
  outlines.ts                          listOutlines (q, sort), outlineIdsForSermons, getOutlineSermon.
  entries.ts                           lockForWrite, bearsContent, the passage copy, markDeveloped calls.
  editor/store.ts                      The references operation; filling a copied point.
  components/outlines-state.tsx        OutlinesProvider, controls, the refresh on return.
  components/outline-results.tsx       The overview's cards.
  components/create-outline-dialog.tsx The sermon picker, and the way to a new sermon.
  components/use-start-outline.ts      Create and open, with a browser-made ID.
  components/outline-link.tsx          Open Outline / Create Outline, for a page or a card.
  components/add-saved-point.tsx       The saved-point picker.
  components/entry-passages.tsx        ScriptureField for one entry.
src/app/(app)/outlines/page.tsx        The overview.
src/features/ideas/ideas.ts            markDeveloped, statusAsRead.
```

Changed outside the feature: `app-links.ts` (navigation), `quick-capture.tsx` (`onSaved` on a seed), `idea-search.ts` and `/api/ideas/search` (`outline=1`), `idea-results.tsx` and the two library pages (the outline link, the delete wording), `passage-text.tsx`, `reference-chip.tsx`, `scripture-field.tsx` (`passageLimits`, `onMore`, `attachLabel`, `fullMessage`, a wider `origin`), `reader-location.ts`, `bible-reader.tsx`, and `bible/page.tsx` (`outline`).

## 4. Development tracking

`markDeveloped(tx, ownerId, ideaId)` in `ideas.ts` is the one write to `ideas` made on an outline's behalf: `updated_at` and `last_developed_at` to now, owner in the WHERE, inside the entry write's own transaction, so a write that fails or is refused stamps nothing. It is called from `createEntry`, `updateEntry`, `setEntryReferences`, `moveEntry`, and `deleteEntry`, each only after deciding the change was real:

- `updateEntry` reads the entry again under its locks and compares the fields named;
- `setEntryReferences` compares the stored list with the new one by `referenceKey`, order included;
- add, move, and remove ask `bearsContent` of the entry and everything under it.

`needsAttention`, `revisitAfterDays`, and the library's `revisit` filters are untouched. No status, format, sermon type, archive date, or preaching record is written.

## 5. Concurrency

Every entry write begins with `lockForWrite`: the outline's sermon (`FOR NO KEY UPDATE`), with the source point when there is one (`FOR KEY SHARE`), the two ideas lower ID first; then the outline (`FOR UPDATE`). `createOutline` and `deleteIdea` already took the idea first.

The committed test (`entries.test.ts`, "locking") checks the order from the statements sent, for every operation and for a point whose ID sorts before and after the sermon's. The races were run three times against the development database on separate connections, from a temporary test file that made a throwaway account, removed it and everything under it, asserted nothing was left, and was then deleted:

| Race                                                                                                   | Result, each of three runs                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 8 simultaneous `createOutline` for one sermon                                                          | 1 `created`, 7 `exists`, one row                                                |
| Seven entry writes of every kind against `deleteIdea` of the sermon, 5 rounds                          | Nothing thrown; sermon, outline, and entries all gone                           |
| Three entries made from a point against the point's deletion and two `linkIdeas` of the pair, 6 rounds | Nothing thrown; every entry made is kept with its link cleared; positions whole |
| 12 writes at once on one outline (edits, passages, moves, additions)                                   | All made, none lost, revisions counted, sermon stamped                          |

No deadlock and no escaped foreign-key error in any run.

## 6. Editor rules kept from 3B

One store; shape only through `addPoint`, `addSection`, `move`, `remove`; an answer never over a field; "Saved" only with nothing queued, on its way, or different; no revalidation on a save of words or passages; no drag-and-drop package; Tab left alone. Passages are a third field beside the heading and the notes and follow the same rules, including the stale-entry merge and its conflict. A point made from a saved point is the one case where an answer fills a field, and only a field the person has not touched since it was shown.

## 7. Localization

New strings in `outlines` (`overview`, `picker`, `link`, and additions to `editor`), `navigation` (`outlines`), `ideas` (`deleteDescription` takes whether there is an outline), and `scripture` (`readMore`, `backToOutline`), in English and Spanish. Component and page tests render Spanish for the overview and the picker.

## 8. Verification

Everything below was run on the final code unless it says otherwise.

| Check                                                             | Result                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                | **Pass**                                                                                                                                                                                                                                                                                                                                                                  |
| ESLint on the files touched                                       | **Pass**                                                                                                                                                                                                                                                                                                                                                                  |
| `prettier --check --end-of-line auto` on the source files touched | **Pass**                                                                                                                                                                                                                                                                                                                                                                  |
| The whole unit suite (`npx vitest run`)                           | 99 files, 1,724 tests: **1,708 passed, 16 failed**, all 16 from one effect in `outlines-state.tsx` added after the focused runs. It was fixed, and the two files it failed (`create-outline-dialog.test.tsx`, `overview.test.tsx`), the rest of the outline components, and the i18n tests were run again: **pass**, 105 tests. The whole suite was not run a second time |
| One-off concurrency run against development (section 5)           | **Pass**, three runs                                                                                                                                                                                                                                                                                                                                                      |
| Production build                                                  | **Pass**, as the build each Playwright run makes; not run separately                                                                                                                                                                                                                                                                                                      |
| `outlines-integration.spec.ts` (new), desktop and mobile          | **Pass**, 2 of 2                                                                                                                                                                                                                                                                                                                                                          |
| `outline-editor.spec.ts`, desktop and mobile                      | **Pass**, 2 of 2, after the spec changes below                                                                                                                                                                                                                                                                                                                            |
| `scripture-ideas.spec.ts`, desktop and mobile                     | **Pass**, 2 of 2, after the spec change below                                                                                                                                                                                                                                                                                                                             |
| `library.spec.ts`, desktop and mobile                             | **Pass**, 4 of 4                                                                                                                                                                                                                                                                                                                                                          |
| `preaching-record.spec.ts`, desktop and mobile                    | **Pass**, 4 of 4, twice, after the spec changes below. It had never run to the end before                                                                                                                                                                                                                                                                                 |
| `bible.spec.ts`, `saved-scripture.spec.ts`, and the guest specs   | **Not run**                                                                                                                                                                                                                                                                                                                                                               |
| Spanish in a browser, a screen reader, a real phone               | **Not run**                                                                                                                                                                                                                                                                                                                                                               |

New and changed tests: `outlines-query.test.ts` (7), `create-outline-dialog.test.tsx` (15), `overview.test.tsx` (9), and additions to `entries.test.ts` (development, the passage copy, the lock order), `outlines.test.ts` (search, order, status, `outlineIdsForSermons`), `actions.test.ts` (revalidation), `store.test.ts` (passages, copied points), `outline-editor.test.tsx` (passages, saved points), `library/page.test.tsx` (outline links, delete wording), `reader-location.test.ts`, `bible-reader.test.tsx`, the search route's test, and `app-header.test.tsx`.

**What the new journey did**, at 1280px and at a Pixel 7's width: captured a point with notes and a passage; reached Outlines from the navigation; captured a sermon from the picker and landed in its new outline; confirmed an empty outline left the sermon "never developed"; chose the same sermon again and was sent to the same outline; placed the saved point and found its heading, notes, and passage; reworded the copy; added a point and two passages; read Psalm 23 in place, found Psalm 119 bounded at twelve verses with "Read 164 more verses", and opened the rest in the panel; went to the Bible and back to the outline; reloaded and found everything; removed a passage; went to the sermon and found "Open Outline"; found the sermon no longer "never developed" and its card leading to the outline; found the outline in the overview by search with its count; confirmed the saved point unchanged and unrelated; deleted the point and found the copy kept without its link; deleted the sermon, whose confirmation named the outline, and found the outline gone. Sideways overflow was checked on the overview, both pickers, the editor with passages, and the sermon's page.

**What the end-to-end runs taught, and what was changed in the specs** (none of it a change to the application):

- Run eight workers at once, every signed-in journey failed on the default five-second waits. Run one spec at a time with two workers, they pass. The signed-in specs should be run that way.
- A sermon's card now has a link whose name contains the sermon's title, so a lookup of the card's link by title needs `exact: true`. Changed in `library.spec.ts`, `outline-editor.spec.ts`, `scripture-ideas.spec.ts`, and `preaching-record.spec.ts`.
- `outline-editor.spec.ts` failed one run in five by itself, at two steps that read the page the instant after an action. Its reads of the drawn outline now retry, its "left a moment after typing" step waits for the save's response before reloading, and its cleanup waits for the streamed results before deciding there is nothing to delete (it had been leaving its sermon behind after passing runs).
- `scripture-ideas.spec.ts` checked a radio that is not drawn; it now presses its label.
- `preaching-record.spec.ts`, written in Phase 2E.2 and never executed until now, had four faults of its own, none in the application: it clicked "Save changes" after refiling an idea, which takes effect at once and leaves Save disabled, so it waited out its five minutes; it chose from a second dropdown while the first was still closing; it pressed Escape to close a manager while its confirmation was still closing; and its cleanup counted records before they were streamed. All four were fixed in the spec. The sign-in redirect seen once did not recur when the spec was run by itself.
- Two parallel tests once drew the same run prefix in the same millisecond. Not changed.

### Database and deployment

No migration. The development database was touched by the concurrency run and the end-to-end journeys, as the test account and a throwaway account. Failed end-to-end runs left test ideas, occasions, a venue, and contexts behind; they were removed through the application by temporary specs (since deleted), and a read-only count afterwards found no test idea, tag, venue, or context, and no throwaway account. Production and preview were not touched. Nothing was deployed. A release from here still applies `0009` through `0013`; this phase adds nothing to that, and its code needs `0013`.

## 9. Known limitations

- **A saved point's link survives until the page is read again.** Delete the point in another tab and the open editor still shows "From a saved point", leading to a not-found page, until it reloads.
- **A copied point's notes and passages arrive with the server's answer**, a moment after its heading.
- **The overview's "Worked on" date moves for a change of numbering too**, since any write to the outline moves `updated_at`. The sermon's development date does not.
- **Passages re-sent after a stale answer wait the usual 0.9 seconds**, as words do.
- **An entry write costs about four more queries than in 3B** (the sermon's lock, the re-read, the stamp). Not measured.
- **The picker shows eight sermons** and narrows by typing, like every idea picker.
- **The Spanish wording is the agent's** and was not reviewed by a Spanish reader.
- Carried and unchanged from 3B: outdent does not take following points along; the row menu holds every action; a save that fails after its page was left may never be reported.

## 10. For Phase 3D

- Preview and print can read an outline with `getOutline` and number it with `numberOutline`; passages are numbers and need `Passage` or the chapter API for text, in the account's translation from `getPreferences()`.
- The overview has room for a "Preview" action per card; the editor's toolbar has room beside Numbering.
- Still open: making a point idea from an entry; whether the dashboard should show outlines.
- Worth doing in 3D's release checks: run every signed-in spec, one at a time, `bible.spec.ts` and `saved-scripture.spec.ts` included (not run in this phase).

## Process

No Git command that changes anything was run. No package was installed. No server was left running: the only servers were Playwright's own, on port 3100, which it stopped. Prettier was run with `--write` only on named files this phase wrote or edited. Two temporary files (the concurrency test and the cleanup spec) were created and deleted.
