# Phase 5D.1 handoff: Offline ideas and library

Implemented 14 October 2026. One migration (`0016_idea_revision`), no new package. Next: Phase 5D.2.

## What changed

- **Revision.** `ideas.revision` (integer, default 0) is the version of what an idea says. `updateIdea` (now through `updateIdeaAt`), `attachReferences` when it adds a passage, `setIdeaKind`, and `classifyIdea` raise it. Archiving, restoring, outline work (`markDeveloped`), relations, and preaching do not. Online saves are unchanged.
- **Download.** `GET /api/offline/ideas` (`authorize("active")`, `private, no-store`) answers with the session's ID, every idea's revision plus the fields that move without it, and the tags; `?ids=` (at most 100) answers whole ideas. Queries go through `ideaManifest`, `ideasByIds`, `outlineIdsForSermons`, `occurrenceCounts`, and `listTags` (`src/features/sync/snapshot.ts`). The device (`offline/ideas/refresh.ts`) reads only what changed, never writes over unsent work, refuses another account's answer, and marks the copy complete only after the last batch.
- **On the device.** `accountData` gets an `ownerKind` index (database step 2). Each idea is `{ server, local }` (`store.ts`). `operations.ts` writes `local` and the queued change in one transaction. Quick capture kept on the device now goes through `createIdeaOffline`, so it appears in the offline library at once.
- **Sync.** New types `idea.update`, `idea.archive`, `idea.restore`, `idea.delete`, each a handler in `applyMutation`. `applied` carries the new revision. New conflicts: `stale` (with the server's copy), `missing`, `preached`, `outline`. The engine sends one idea's changes in order (`sendable`), rebases the ones behind on the revision just produced (`afterApplied`), retries in 0.5 s when another run holds the lock, and stops when its agent leaves the page.
- **Offline page.** `/library/sermon-ideas` and `/library/<id>` are drawn from the copy by the application's own library components and `IdeaEditor`, at their own addresses, with a "Your ideas" card on the hub. The copy always says it is the device's and when it was updated; a partial download says how much is missing; "not downloaded yet", "turned off", and "signed out" each have their own message.
- **Online editor.** With no answer from the server it keeps the change on the device ("Saved on this device…"). It saves nothing while changes made elsewhere about that idea are queued, and shows the server's copy once they have reached it.
- **Pending list.** `PendingCaptures` became `PendingChanges` (all kinds, with "waiting behind an earlier change", per-conflict choices, and Discard with a confirmation). It is used in Sync settings, the offline hub, the dashboard notice's count, the capture block in Offline Storage (captures only), and on an idea's page.
- **Settings.** Offline Storage has a real "Sermon ideas and points" block (`OfflineIdeasSettings`). It shows the switch (on by default, decided by the owner), how many ideas are kept and when they were updated, a partial or failed state, the size, Update now, and Remove from this device (which keeps ideas with queued work). Outlines is still "Coming later".
- **Words** in `offline` (`pending`, `shell`, `ideas`, `settings`) and `ideas.editor`, English and Spanish.

## Conflicts and choices

| Conflict | Choices |
| --- | --- |
| `missingTags` (create or edit) | Save without the deleted tags |
| `stale` edit | Keep my version (resent on the server's revision) · Use my account's version |
| `stale` deletion | Delete anyway · Keep the idea |
| `missing` edit | Save as a new idea · Discard my changes |
| `missing` archive or restore | Discard my changes |
| `preached` deletion | Archive it instead · Keep the idea |
| `outline` deletion | Delete it and its outline · Keep the idea |

"Use my account's version", "Discard", and "Keep" drop every change queued about that idea, since each was made on top of the ones before.

## Verification

- `src/features/sync/apply-ideas.test.ts` (new, PGlite) and `apply.test.ts`, 16 tests, all pass. They cover:
  - revision bumps only where listed
  - an edit applied once, then answered `duplicate`
  - a stale edit and a stale deletion return the server's copy and write nothing
  - a missing idea, missing tags, and another account's idea
  - archive and restore are idempotent
  - deletion of an idea already gone, with an unacknowledged outline, with preaching history, and with the outline acknowledged
  - the download lists only the account's own ideas
- `src/features/ideas/revisit.test.ts`: 21 tests pass. This includes a new parity test in which `searchLocalIdeas` returns exactly what `searchIdeas` returns for 12 queries. Those queries cover search, kinds, statuses, both revisit filters, archive views, dates, and orders.
- `src/features/offline/ideas/ideas.test.ts` (new, fake-indexeddb): 13 tests pass. They cover:
  - incremental refresh, and a refresh cut short (partial state)
  - account isolation and `wrongAccount`
  - a refresh never writes over `local` and keeps queued ideas
  - an atomic write plus enqueue
  - a preached sermon is refused
  - the page's newer copy is preferred
  - ordered sending with rebase
  - conflicts that block later changes, then "keep mine"
  - "use account's version" and "save as new"
  - an interrupted send, and an offline-to-online transition
- `src/features/offline/components/offline-ideas.test.tsx` (new): 8 tests pass. They cover:
  - the editor's fallback to the device, then queuing behind its own change
  - the editor blocked by changes made elsewhere
  - no account
  - the library when not downloaded, partial, searched, or for another account
  - stale-conflict choices and Discard
- Affected suites (ideas, offline, sync, settings, dashboard, lib): 42 files, 578 tests pass with `--maxWorkers=4`. At full parallelism, 2 to 4 timing-sensitive tests failed, and which ones changed between runs: `church-ministry-settings.test.tsx` (untouched by this phase) and the engine-driven tests in `components.test.tsx`. Each passes when run alone or with fewer workers.
- Outlines, preaching, pwa, and app tests: 40 files, 614 tests pass.
- `tsc --noEmit` is clean. ESLint and Prettier are clean on every changed file.
- `npm run build` succeeds. The local build skipped migrations, as designed. The prerendered `/offline` names the chunks that hold the offline library, so the worker's install step keeps them.
- Playwright on that build:
  - `tests/e2e/offline-ideas.spec.ts` (new, guest) passes on desktop and mobile. It seeds the device's copy under a made-up account, goes offline, opens `/library/sermon-ideas` through the service worker, searches, opens an idea, saves it on the device, and comes back to the library. It also checks for no sideways scroll.
  - In `pwa.spec.ts`, 8 tests pass and 2 fail on both projects. Both failures predate this phase: the offline-page test expects "have not been signed out", but the page says "haven't". The update test registers the same build version, which `isNewVersion` correctly does not offer. The signed-in update test ran against the development account in `.env.local`; it only signs in and reads the dashboard.
- Not run:
  - the whole unit suite at default parallelism
  - the signed-in end-to-end specs (library, dashboard, and the others)
  - a signed-in browser pass, including two real tabs, going offline in DevTools mid-edit, and a real phone

## Limitations

- A lost reply comes back as `duplicate`, which carries no revision. The copy is then marked to be read again in full. A further change already queued for that idea is answered `stale`, and the person chooses.
- The offline search matches lowercase text in JavaScript, and the title order is code-point order. PostgreSQL's ILIKE and its collation can differ from these for some non-ASCII titles.
- Not offline yet:
  - creating or managing tags (the picker shows its existing connection message)
  - related ideas
  - outlines
  - the preaching record
  - restoring from a card (the idea's page restores)
  - `/library`, the dashboard, and the other sections, which show the offline hub
- The offline views appear only where the service worker serves the offline page, which happens when a page cannot be reached at all. A slow server still shows the normal pages.
- After a failed refresh, the device tries again on the next trigger: opening the app, coming back online, or returning to the front after 5 minutes.
- Settings shows "Downloading…" only for a refresh started in that tab.
- "Remove from this device" also turns the switch off, or the agent would download the ideas again straight away.

## For Phase 5D.2

- Follow the same pattern:
  - a `revision` (or the existing `sermon_outlines.revision` and `outline_entries.revision`)
  - a manifest plus `?ids=` route that returns the owner
  - `{ server, local }` records under a new `kind` in `accountData`
  - `operations.ts`-style writes in one transaction with `putMutation`
  - handlers in `applyMutation` that answer `stale` with the server's copy
  - choices in `choicesFor`/`settle`
- `MutationRecord.entityType` is still only `"idea"`. Widen it, and key `sendable`'s ordering on type and ID, if outline entries and ideas could share IDs (both are UUIDs, so ordering by `entityId` is safe today).
- The outline store already has its own queue and revisions (`editor/store.ts`). Offline outlines must decide how that store and the sync queue meet. Do not run two queues for one entry.
- `IdeaOperationsProvider` and `LibraryProvider`'s `navigation` are the model for putting a feature's real screens on the offline page.

## Operational

Migration `0016_idea_revision` adds one column with a default. It is additive and works with the code already live. It is applied to development (17 of 17, checked with `npm run db:status`), and the production build applies it to production. No environment variables are needed.
