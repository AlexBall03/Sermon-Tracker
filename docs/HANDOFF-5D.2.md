# Phase 5D.2 handoff: Offline sermon outlines

Implemented 14 October 2026. No migration and no new package. Next: Phase 5D.3.

## What changed

- **The decision.** The outline editor's store (`editor/store.ts`) stays the one owner of the outline in the browser, and it keeps its own in-memory queue and its autosave. What changed is where it saves: through an `OutlineApi`, which is now one of two things.
  - The server actions, as before.
  - `createDeviceOutlineApi` (`offline/outlines/operations.ts`). It checks each change as the server would, using the outline schemas, `tree.ts`, and both revisions. It then writes the device's copy and the queued change in one IndexedDB transaction.

  Only the 5C engine sends outline changes to the server. The store gained one thing: `confirmedSnapshot()`, the outline as its saves were last acknowledged.
- **Download.** `GET /api/offline/outlines` (`authorize("active")`, `private, no-store`) answers with a manifest built by `outlineManifest`: each outline's revision, its `updatedAt`, and its sermon. With `?ids=` (25 at most) it answers whole outlines through `getOutline`. On the device, `offline/outlines/refresh.ts` downloads only what changed. It never writes over `local`, keeps outlines that have queued work, refuses another account's answer, and reports a partial download.
- **On the device** (`offline/outlines/store.ts`): `[owner, "outline", id]` records hold `{ server, local, behind?, generation? }`, beside a `"state"/"outlines"` download record.
- **Sync.**
  - Six new types: `outline.entry.add`, `.update`, `.references`, `.move`, `.remove`, and `outline.numbering`. Their handlers are in `sync/apply-outlines.ts`, spread into `applyMutation`.
  - `MutationRecord.entityType` is now `"idea" | "outline"`. An outline change's `entityId` is always the outline's ID, so `sendable` sends one outline's changes strictly in order.
  - `rebaseFollowing` takes a predicate. `afterApplied` (`offline/outlines/sync.ts`) uses it to rebase only what each revision counts: a shape change rebases the shape changes behind it, and a words change rebases that entry's later words changes.
  - `Resolution.baseRevision` may now be `null`, meaning the change is made on what is there.
- **The application's editor** (`useOutlineSaving`, `offline/outlines/routing.ts`):
  - It saves to the server as before.
  - When an action throws and this device keeps outlines, it keeps the change on the device instead, made on `confirmedSnapshot`, and everything after it follows there.
  - When it opens on an outline that already has queued changes, it shows the device's copy and works behind them.
  - When that outline's queue is empty, it reads the page again.
  - The status line says "Saved on this device" while the outline's changes are on the device.
- **Offline page.** `/outlines` (`OfflineOutlines`) and `/outlines/<id>` (`OfflineOutline`) are drawn from the copy.
  - `/outlines` is the overview's own `OutlinesProvider` (now with a `navigation`), `OutlinesControls`, `OutlineResults`, and `Pagination`, over `searchLocalOutlines`.
  - `/outlines/<id>` is `OutlineEditor` with `device`. "Delete outline" is hidden there, and "Add from Saved Point" says it needs a connection.
  - The hub has a "Your outlines" card.
  - A sermon's page and card offline offer "Open Outline" when its outline is kept.
- **Settings.** Offline Storage has a real "Sermon outlines" block (`OfflineOutlinesSettings`) in place of "More offline content / Coming later". It has the switch (**off by default**, decided by the owner), the count and when it was last updated, a partial or failed state, the size, Update now, and Remove from this device. Removing keeps outlines with queued work and turns the switch off.
- **Pending list.** An outline's changes are one row: its sermon's title, an "Outline" badge, how many changes there are, the first change's status and conflict choices, and Discard (asks first).
- **Words.** New strings are in `offline` (`pending`, `settings`, `shell`, a new `outlines` section) and `outlines.editor` (`savedOnDevice`, `notKept`, `needsConnection`), in English and Spanish. The ideas page's offline note no longer lists outlines among what needs a connection.

## Conflicts and choices

| Conflict | Raised when | Choices |
| --- | --- | --- |
| `outlineStale` | A shape change (add, move, remove) was made on an older outline revision | Apply my changes to it (resent on the server's revision) · Use my account's version (every change to that outline dropped) |
| `entryStale` | The same field (title, notes, or passages) was changed both here and elsewhere, to different things | Keep mine (resent against the server's words) · Use my account's (this change and later ones of its kind for that entry dropped) |
| `entryMissing` | Words or passages for an entry that was removed elsewhere | Add it as a new point · Discard my changes |
| `entryMissing` | A move of an entry that was removed elsewhere | Discard my changes |
| `placement` | An addition whose place no longer exists | Add it as a point at the end · Discard my changes |
| `missing` | The outline (or its sermon) was deleted | Discard my changes (the copy is forgotten) |

The server settles these by itself, with nothing lost:
- A field changed only on the device is written.
- A field already as the device has it counts as done.
- An addition that already exists, a removal of what is gone, and a move to where the point already is all count as applied.
- When a saved point used for an addition was deleted first, the entry is added with the words the device showed.

## Verification

- `src/features/sync/apply-outlines.test.ts` (new, PGlite): **13 tests pass**. They cover:
  - an addition applied once, then answered `duplicate`, then idempotent under a new op;
  - a stale shape change becomes `outlineStale`, and nothing is written;
  - a move already made, and a removal of what is gone, count as applied;
  - `placement`;
  - shape and word revisions are counted apart;
  - a field-by-field merge applies when the fields differ, and becomes `entryStale` when the same field differs;
  - passages are merged the same way;
  - `entryMissing` and `missing`;
  - only `last_developed_at` and `updated_at` move on the sermon;
  - another account's outline is `missing` and nothing is written;
  - the manifest and the whole outlines are the owner's only;
  - `searchLocalOutlines` returns exactly what `listOutlines` returns for 6 queries at two page sizes, with an archived sermon and a refiled one left out.
- `src/features/offline/outlines/outlines.test.ts` (new, fake-indexeddb): **18 tests pass**. They cover:
  - the store driving the device API: add, type, and move are queued in order with the revisions the server will reach;
  - typing is folded into the waiting change;
  - passages, numbering (folded), and removal;
  - a second tab's stale change is refused and nothing is written;
  - neither the copy nor the change is written when the queue write fails;
  - account isolation;
  - the routing API falls back on a throw, follows to the device, and returns to the server when the queue empties;
  - the routing API keeps nothing when the setting is off;
  - the engine sends in order and rebases per kind;
  - everything acknowledged turns the copy into the server's, marked `behind`;
  - an interrupted send is recovered;
  - each conflict choice;
  - a download that is incremental, never touches `local`, keeps queued outlines, and refuses another account's answer.
- `src/features/outlines/editor/store.test.ts`: 42 tests pass, including a new one for `confirmedSnapshot`.
- `src/features/offline/components/offline-outlines.test.tsx` (new): **7 tests pass**. They cover:
  - the editor over the device's copy, saving "Saved on this device" without reaching the server;
  - a saved point needing a connection;
  - a restart on `generation`;
  - not on this device, and signed out;
  - the overview listing and searching;
  - the setting being off;
  - outline changes shown as one row in the pending list.
- Updated tests: `offline.test.ts` (the new setting), `components.test.tsx` (the outlines switch), and `outlines/page.test.tsx` (the sermon passed to the editor).
- Affected suites (outlines, offline, sync, the outlines pages, settings, ideas): **53 files, 880 tests pass** with `--maxWorkers=4`. `church-ministry-settings.test.tsx` failed once in a wider parallel run, the known timing flake from 5D.1, and passed when run again.
- `tsc --noEmit` is clean. ESLint and Prettier are clean on every changed file.
- `npm run build` succeeds. The local build skipped migrations, as designed.
- Playwright against that build (the server I started was stopped afterwards):
  - `tests/e2e/offline-outlines.spec.ts` (new, guest) **passes on desktop and mobile**. It seeds a sermon and its outline under a made-up account and goes offline. It opens the sermon, follows "Open Outline", adds a point, types, indents it, and moves another point down. It checks "Saved on this device" and that nothing scrolls sideways. It reloads offline and checks that everything persisted and that the queued changes are in order with the right base revisions. It then opens the outlines overview.
  - `tests/e2e/offline-ideas.spec.ts` still passes on both projects.
- Not run:
  - the whole unit suite at default parallelism;
  - `pwa.spec.ts` and the signed-in end-to-end specs;
  - a signed-in browser pass, including the application's editor losing its connection mid-edit and recovering, two real tabs, a real phone, and Spanish on screen.

## Limitations

- **Device fallback needs the setting.** The application's editor keeps a change on the device only where "Keep my outlines on this device" is on. With it off (the default), a save that gets no answer behaves as before: kept in the page, tried again, and announced as unsaved.
- **Lost replies to moves.** A lost reply comes back as `duplicate`, which carries no revision. For an addition, a removal, and words, the server's idempotent answers cover it. A shape change queued behind a lost *move* is answered `outlineStale`, and the person chooses "Apply my changes".
- **Some discards leave the copy briefly ahead.** "Use my account's" and Discard drop the change and the ones made on top of it. While other changes for that outline are still queued, the copy keeps showing what is left. It is marked `behind` and replaced by the next download once the queue empties.
- **Sermon passages can be stale.** The manifest refreshes the sermon's title, kind, status, and archive, but not its passages. Those are read with the outline and are refreshed when the outline itself changes.
- **Not available offline:**
  - adding a saved point (it says so);
  - deleting an outline;
  - creating an outline;
  - the outline's sermon page, unless ideas are kept too.
- **Search differences.** Offline search and title order compare lowercase text in JavaScript, as for ideas.
- **Download state across tabs.** Settings shows "Downloading…" only for a refresh started in that tab.

## For Phase 5D.3

- Follow the same pattern for saved Scripture and the preaching record:
  - a manifest plus `?ids=` route;
  - `{ server, local }` records;
  - an operations module that writes in one transaction with `putMutation`;
  - handlers that answer conflicts instead of overwriting;
  - choices in a `choicesFor`/`settle` pair;
  - a grouped or single row in `PendingChanges`.
- `afterApplied` is now dispatched by `entityType` in `SyncAgent`. A new kind adds its own branch there.

## Operational

No migration and no environment variables. Everything is additive. The new route and handlers are used only by devices that turn the setting on, or by an editor whose server stopped answering.
