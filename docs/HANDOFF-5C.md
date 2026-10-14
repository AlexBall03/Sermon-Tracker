# Phase 5C handoff: Offline synchronization engine

Implemented 14 October 2026. One migration (`0015_sync_operations`), no new package. Next: Phase 5D.

## What changed

- **Server ledger.** The new table `sync_operations` has the primary key `(owner_id, op_id)`. `applyMutation` (`src/features/sync/apply.ts`) writes a change and its ledger row in one transaction, so a change delivered again is answered `duplicate` and writes nothing. That covers a retry, a reply that was lost, and a second tab. The ledger also closes a Phase 5B hole: a late retry used to recreate an idea that had been deleted after it was saved. `createIdea` with an ID (online quick capture) now goes through the same function.
- **Action.** `syncMutation` (`src/features/sync/actions.ts`) authorizes with `authorize("active")` and checks that the record's owner is the session's. Its answers:
  - `applied` or `duplicate`: the change is in the account.
  - `conflict`: the change and the account's data disagree.
  - `rejected`: the change cannot be applied as it is.
  - `auth`: the session refused the request.
  - `wrongAccount`: the record belongs to another account.
- **Engine.** `runSync` (`src/features/offline/sync/engine.ts`) works like this:
  - It holds a Web Lock per owner.
  - It recovers records interrupted mid-send.
  - It sends due records oldest first, with a 30 s timeout per send.
  - A passing failure waits with an exponential backoff (2 s doubling to 10 min). After 6 such failures in a row the record becomes `failed`.
  - On `auth` or `wrongAccount` it stops without touching the record.
- **Queue.** `queue.ts` now has the transitions `claim`, `settle`, `retry`, `resolve`, and `recoverInterrupted`, and notifies other tabs through a `BroadcastChannel`. The record fields `nextAttemptAt`, `autoAttempts`, and `conflict` are new, and so is the status `conflict`. The record shape is additive, so there is no IndexedDB migration.
- **Agent.** `SyncAgent` runs inside `OfflineAgent`. It syncs on opening, on `online`, on returning to the front, on new work in any tab, when a backoff is due, and on Sync now.
- **Unsaved work.** Queued records never hold unsaved work. Only the brief enqueue in quick capture holds it, as in 5B.
- **UI.** `PendingCaptures` now shows each capture's status (waiting, syncing, not saved, needs your choice) and the next try. It offers Save now, Try again, and Delete. A conflict offers "Save without the deleted tags". The old direct `createIdea` call from the list is gone.
- **Settings.** `/settings/sync` is real (`SyncSettings`): it shows the status counts, the last sync, Sync now, and the queue. Its words are in `offline.sync` and `offline.pending.status`, in English and Spanish. The settings "Coming Soon" strings were removed.

## Conflicts

The only kind of change today is a new idea. Its one real conflict is a tag deleted after the capture was made. The server names the missing tags and writes nothing. The person then chooses to save the capture without them, or to delete it. An ID that belongs to another account is `rejected` (`taken`).

`baseRevision` is carried end to end. Handlers for updates and deletes (5D) should check it inside `applyMutation`'s transaction, with the row locked, and answer `conflict` with the server's copy.

## Verification

- `src/features/sync/apply.test.ts` (PGlite, 6 tests):
  - a duplicate delivery makes one idea
  - a save followed by a lost answer makes one idea
  - an idea deleted before a late retry stays deleted
  - another account's ID is rejected
  - a deleted tag is a conflict, and the change is applied once settled
  - an invalid payload is rejected
- `src/features/offline/sync/engine.test.ts` (11 tests):
  - reconnect after an offline capture
  - reload with pending work, and recovery of an interrupted send
  - a timed-out send retried once
  - backoff, stopping, and a manual retry
  - two concurrent runs, with and without Web Locks
  - session expiry pauses
  - account switch and `wrongAccount`
  - a conflict and a rejection kept, then resolved
  - statuses persist, and none counts as unsaved work
- The component tests for engine-driven sending, conflict resolution, and Sync status. The existing offline, settings, ideas actions, quick capture, and unsaved-work tests, with 215 passing in the affected files.
- `tsc --noEmit` and ESLint on the changed files are clean.
- Not run: the whole unit suite, a production build, the end-to-end suite, and a signed-in browser pass, including two real tabs and going offline in DevTools.

## Operational

Migration `0015_sync_operations` is applied by the normal build migrate. It is additive, so it works with the code already live. It needs no environment variables.
