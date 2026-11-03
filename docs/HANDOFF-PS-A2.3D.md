# Handoff: PS-A2.3D, Offline-device Conversion Awareness

**Status:** built and verified; ready for the owner's review. Not committed, not deployed, and no migration was run anywhere. `SERMON_DOCUMENT_CONVERSION` is unchanged and stays off in production.

**Git:** began on `dev` at `bbfedae` (the planning baseline) with a clean tree. Ends there, with the files below changed or new and nothing staged.

Before A2.3D, a device was never told an outline had become a sermon document. The offline page kept opening the device copy in the legacy editor and queuing changes the server would refuse. Now the device learns it from the server, keeps that knowledge for good, refuses legacy changes inside the IndexedDB transaction that would have written them, and shows a read-only, copyable review in place of the editor. Nothing kept or queued on the device is lost, merged, or reported as synced.

## Owner decisions (binding)

1. A full read-only review of the kept legacy copy, with copying, and working offline. No export, import, conversion, or merge.
2. Discard stays, behind an explicit confirmation. It is never automatic.
3. "Open in the new editor" is always visible and uses `/outlines/[id]`. The feedback about connectivity is truthful; `navigator.onLine` is never taken as proof that the server can be reached.
4. Plan-review corrections:
   - An editor open when the news arrives closes at once, and its never-kept words stay readable.
   - Discard is atomic and verified afterwards.
   - The existing offline navigation is reused (no `sessionStorage` marker).
   - Notifications go out only after the commit.

## What was built

| Area | Change |
| --- | --- |
| Server | `documentExistsFor` (`sermon-editor/persistence/authority.ts`): an `EXISTS` on `sermon_outline_documents` by primary key and owner, used as a column of `outlineManifest` (`outlines/outlines.ts`). That is one statement and one snapshot, with no N+1 queries and no content read. `outlineManifestFor` emits `documentAuthoritative` for every item. `OutlineManifestItem.documentAuthoritative?: boolean` is optional, so an older server's answer still types, and a missing field is not false. |
| Device record | `KeptOutline.documentAuthoritative?: true`, with `isAuthoritative`, `withAuthority`, and `authorityOnly` (`offline/outlines/store.ts`). `rewriteOutline` and `removeKeptOutlines` keep it, and a record that would be deleted becomes authority-only. `forgetAccount` (account deletion) still removes everything. |
| Refresh | `refresh.ts` merges a true in the manifest's own transaction, never downgrades on false or a missing field, downloads no legacy rows for a known document, never takes an unlisted outline for converted (a known one becomes authority-only), and announces only after the commit. `keep()` reads inside its own transaction, so a late row can't drop the marker. |
| Write boundary | `createDeviceOutlineApi.write()` (`operations.ts`) answers `document_authoritative` (the existing action code and message) right after reading the record inside its `accountData`+`mutations` transaction, before seeding, planning, put, fold, or append. Its own put goes through `withAuthority`. |
| Queue | `settleMutation(…, alongside?)` (`queue.ts`): with an `Alongside`, the record's settlement and the `accountData` write are one transaction, and `committed` is called only after it commits. On failure the transaction is aborted and nothing is told. The transition rules are now the pure `settled()`, and are unchanged. |
| Engine | `RunOptions.conflictAlongside` (`sync/engine.ts`); the agent passes `authorityAlongside` (`outlines/sync.ts`), which marks only the owner's outline and only for `documentAuthoritative`. |
| Settling | `outlineChoicesFor(record, authoritative)` returns `["discard"]` once the outline is known, and `settleOutline` refuses every other choice. All drops go through `dropChanges`: one transaction over the queue and the copy, writing nothing while a chosen record is `sending`. `discardOutlineChanges` returns `"dropped"` or `"sending"`. |
| Offline UI | `ConvertedOutline` (`offline/components/converted-outline.tsx`) and `review.ts`. `OfflineOutline` renders it for a known document. `OutlineEditor` gained `onStore` (offline page only). `PendingChanges` passes the authority, hides Retry, and reports a discard refused while sending. |
| Words | `offline.outlines.converted.*` and `offline.pending.discardSending`, in English and Spanish. |

## Guarantees and why they hold

- **Monotonic.** Nothing writes `documentAuthoritative: false`. Every writer of a `KeptOutline` is listed above and goes through `withAuthority` (or spreads the record it read in the same transaction). Refresh only ever sets the flag.
- **Race with an edit.** The guard and the authority writes are readwrite transactions on `accountData`, which IndexedDB runs one at a time. If authority commits first, the edit is refused and nothing is written. If the edit commits first, it stays kept and queued, and the next edit is refused. Both orders and a concurrent start in each order are tested.
- **Race with a refresh's rows.** `keep()` reads the stored record in its own transaction.
- **Partial refresh.** The marker is committed before rows are fetched. A later failure leaves the state `failed`, not `complete`, and leaves the local copy and the queue untouched.
- **Conflict atomicity.** The marker and the conflict commit together, or neither does. If neither does, the record stays `sending`, is recovered by the next run, and gets the same answer.
- **Discard.** `dropChanges` is one transaction. The view reads back the queue and the copy, and claims success only when nothing is left and the marker is intact.
- **Unkept editor words.** When the editor closes, its store is kept. Its rows and lost drafts are shown while it isn't `saved`; its later writes are refused by the boundary, never queued, and the leave guard holds.
- **Navigation.** The offline shell draws `/outlines/<id>` itself (it intercepts such links). So the button reloads that address: the server answers with the new editor, or the service worker serves the kept `/offline` again, which says the account wasn't reached. If the browser says it is offline, the view says so instead of navigating.
- **Older clients.** The server's A2.2 refusal is unchanged, and so are the legacy handlers.

## Verification (actually run)

- `npm run typecheck`: passes. `npm run lint`: 0 errors, 0 warnings.
- Prettier (`--end-of-line auto`) on the changed files: clean.
- `npx vitest run` for `offline`, `sync`, `outlines`, `sermon-editor/persistence`, and `i18n`: 46 files, **970 passed**.
- New: `offline/outlines/authority.test.ts` (29), `offline/components/converted-outline.test.tsx` (10), and 4 contract tests in `sync/apply-outlines.test.ts` (PGlite).
- Full `npm test`: 3454 tests, 1 failure, which did not reproduce when run alone (`ideas/components/idea-editor.test.tsx`, timing under load). One file fails to load: `preferences/preferences.test.ts` lacks a `deleteIdentity` mock that `account/live.ts` needs. That file and its imports are untouched by this phase. A separate, intermittent failure in `offline/ideas/ideas.test.ts` ("sends one idea's changes in order") comes from two saves in the same millisecond tying on `createdAt` and breaking the tie by random `opId`; that code is also untouched.
- `npx next build`: passes. `npm run build` was **not** used, because it runs `migrate deploy`. The server was started by hand on port 3100 with `SERMON_DOCUMENT_CONVERSION=off` and stopped afterwards.
- Playwright `tests/e2e/offline-outlines.spec.ts`, desktop and mobile: **4 passed**, including the new converted-outline journey (no editor, review, offline message for the new editor, survives a reload, confirmed Discard, no horizontal overflow).
- `offline-ideas.spec.ts` (desktop): passed.
- `outline-editor.spec.ts`: **skipped** (it needs Clerk test credentials that aren't available here).
- `pwa.spec.ts`: 4 failures in code this phase doesn't touch (the guest offline page's "not signed out" text, and the signed-in update notice). Not investigated further; unverified.

## Limitations

- Kept legacy work is copied by hand into the new editor. Nothing imports or merges it.
- A canonical document isn't available offline, so the new editor needs a connection.
- A conflict choice checked against the marker can race a marker that commits right after. The resent change is then refused by the server as `documentAuthoritative`, and the device marks itself.
- Before this release, an outline is known as converted only after a refresh or a sync answer. Until then the server is the only guard, as before.
- The online legacy editor on `/outlines/[id]` is no longer mounted for a converted outline (A3). A tab left open from before is refused by the server.

## Before conversion is turned on in production (the owner's)

1. Review and commit A2.3D, and let it reach production.
2. A2.2's Vercel checks: Skew Protection, Deployment Protection, no rolling release.
3. Then `SERMON_DOCUMENT_CONVERSION=on`.

## Owner review checklist

- Desktop, offline page: seed or download an outline, convert it online in another browser, refresh the device online, then go offline and open the outline. Check that there's no editor, the review is complete, Copy all and per-entry copy work, "Open in the new editor" says it needs a connection, and Discard asks first and keeps the view.
- Phone width: the same, with no sideways scrolling.
- Two tabs: with the offline editor open in one, a refresh in the other closes it, and words typed but not yet kept appear under "Typed in this tab, never kept".
- Spanish interface: the same, with the Spanish wording.
- Sync with an older queued change: the conflict row offers only "Discard my changes" and no "Try again".
