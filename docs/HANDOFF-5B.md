# Phase 5B handoff: offline storage, Bible downloads, offline capture

Phase 5B gives each device its own offline store (IndexedDB): whole Bible translations to read without a connection, quick captures kept on the device when the server cannot be reached, and an Offline Storage section in Settings. No migration. Two new packages: `idb` (a typed IndexedDB wrapper) and `fake-indexeddb` (dev, for tests).

The same change carries four fixes the owner reported: the back-to-top button on short pages, the install notice landing on its own block in Settings, pull to refresh in the installed app, and the loading screen on every launch of the installed app.

## What was built

- **`src/features/offline`**. The database is `db.ts`: one database, versioned by the `migrations` array. Never change a step that has shipped; add one. It has five stores:
  - `meta`: the active account, the permitted translations, and this device's settings;
  - `bibleDatasets` and `bibleChapters`: shared reference data;
  - `mutations`: an account's queued changes;
  - `accountData`: reserved for 5D, written by nothing yet.

  The types are in `model.ts`.

- **Bible downloads** (`bible/`).
  - **Package.** A translation is sent in about eight parts of whole books (`packageParts`) by `GET /api/bible/package/[translation]/[part]`. The route checks access with `authorize("active")`, answers 404 for a translation not on offer (RVG while Spanish is off), and answers 503 for anything incomplete.
  - **Download.** The device writes each part beside the edition it already has, under the new version, in one transaction with its "part done" note, so an interrupted download resumes from the first missing part.
  - **Verification.** When every part is in, the device reads the whole text back and checks it against the committed checksums (`committedEditions`, the same SHA-256 values as `scripts/bible/dataset.mjs`; a test keeps them equal). Only then does it become the active edition, and only then is the old one deleted. A failure (network, quota, integrity, unavailable, storage) leaves the active edition untouched.
  - **Automatic download.** `OfflineAgent` (`(app)` shell) downloads the reading translation when the browser is idle (`auto.ts`). It skips Save-Data connections, and after 3 failed tries of one edition it waits for "Try again".
- **Offline reading**:
  - `loadChapter` asks the network and, when there is no answer, reads the device (`readLocalChapter`).
  - `BibleReader local` has no marks, favorites, highlights, or attaching, and choosing a translation is not saved.
  - The cached `/offline` page is now `OfflineShell`. It reads the Bible kept on the device in the real reader, offers Quick Capture under the last signed-in account, and lists what is waiting. Served at a Bible address it opens the reader at once, so the installed app reopened offline on the Bible is still the Bible.
  - The App Router keeps the browser's address on hydration, so going back online and reloading opens the real page there.
- **Offline capture**:
  - When `createIdea` throws (no answer; `navigator.onLine` is never consulted) and this device keeps captures, the capture is enqueued as `idea.create`, with `opId = entityId =` the idea's own ID. The toast says it is on the device, not in the account. If the device cannot keep it either, the form keeps every word.
  - `PendingCaptures` offers "Save to account". It calls `createIdea(payload, entityId)`, which is idempotent, and removes the entry only on `ok`. Deleting asks for confirmation.
- **Account context**:
  - The `(app)` shell records `users.id` as the active account, and the `(auth)` shell forgets it. Queued work is never deleted by signing out or switching.
  - Every queue read and write takes the owner and filters by it.
- **Settings → Offline Storage** (`#offline`, a sixth section) has four parts:
  - **Quick Capture:** a switch, plus the waiting list (`#offline-capture`).
  - **Bible translations:** the state of each translation, Download / Try again / Resume / Remove (Remove asks to confirm), and the "keep my reading translation" switch.
  - **Ideas and outlines:** shown disabled, as "Coming later".
  - **Storage:** an approximate estimate.
- **Dashboard:** `OfflineNotice` sits after the install notice. It always says when captures are waiting. It introduces offline use once, until dismissed (`localStorage` `offline-notice`), and only after the tour invitation has been answered.
- **Settings arrival:** `ScrollToHash` keeps the address's target in view while the page settles, until the person scrolls.

The service worker is unchanged apart from its tests: `/api/bible/package/*` is asserted untouched. Nothing account-specific is in the Cache API.

## Fixes reported by the owner

- `backToTopVisible`: a page too short to scroll a full screen shows the button at its foot. Overscroll no longer toggles it.
- The install notice links to `/settings#install`. Before this, no element had the id `appearance`.
- `PullToRefresh`, in the installed app only. Crossing the threshold is shown visually (the ring fills and turns emerald, the arrow turns over, the indicator grows, and the words change), because the installed app has no vibration. Letting go runs `router.refresh()`, which keeps unsaved text.
- The splash script also raises the splash on the first page of each launch of the installed app (`sessionStorage` `st-launched`). The `st_seen` session cookie had outlived launches.

## Checks

These were run, with these results:

- **New tests, all passing:** the offline layer, downloads (interruption, resume, no partial activation, a checksum mismatch keeping the old edition, quota, removal, offline chapter reads, an unavailable translation, the cap on automatic tries), the package route, components, quick capture, the splash script, pull to refresh, scroll to hash, back to top, and the dialog touch guard.
- **The whole unit suite, once:** 1,948 of 1,952 passed. Of the 4 failures:
  - Two were tests out of date with this phase (the settings section count, and a "Settings" link on the dashboard). Both were fixed.
  - Two were timing flakes under load (the outline editor's save failure and the church-ministry switch). Both pass when run alone. The church-ministry test is unrelated to this phase and missed its 1-second `findByText` wait again under load.
- **After the dialog change**, the suites that use dialogs were run again: ideas, Scripture components, outlines, tour, settings, preaching, and dashboard. 841 of 842 passed; the one failure was that same church-ministry flake.
- **Static checks:** `npm run typecheck` and `eslint src` are clean, and Prettier is clean on the new files.
- **Production build:** `next build` succeeds. The prerendered `/offline` names the chunks of the reader, the downloader, and the dialog guard, so the worker's existing install step keeps them.

Not done:

- a real installed app on a phone (the iOS dialog, keyboard, splash, and pull-to-refresh behavior is untested on a device);
- a cold offline launch in a browser;
- the end-to-end suite, which needs the owner's signed-in account.

Also in this change, reported by the owner while it was built:

- The dialog primitive adds `DialogViewport`. On a phone, a drag never scrolls the page behind a dialog, and `top`/`full` dialogs follow the visible area while the keyboard is up (`--vv-top`, `--vv-h`).
- The Record Preaching date field no longer widens its column on iOS, and the form's body clips sideways overflow.

## For Phase 5C

- **The queue** is `queue.ts` over `MutationRecord`. It carries `opId`, `owner`, `type`, `entityType`/`entityId`, `payload` with `schemaVersion`, `createdAt`, `attempts`/`lastAttemptAt`, `status` (`pending`/`sending`/`failed`/`done`), `error.kind` (`network`/`auth`/`validation`/`conflict`/`server`), and `baseRevision`. Add types to `MutationType` and `mutationSchemaVersions`.
- **The processor** should:
  - claim `pending`/`failed` records per owner;
  - run under `navigator.locks` (the pattern is in `downloadTranslation`) so tabs do not race;
  - send them through the existing actions by `entityId`, which are idempotent for `idea.create`;
  - record the result with `markAttempt`, and call `removeMutation` on success.
- **Authorization:** check again on every send. The active account in IndexedDB is a convenience, never permission.
- **Replace the manual "Save to account"** with the processor (or keep it as "Sync now"), and keep the `OfflineNotice` count.
- **The offline shell's capture** writes under the last signed-in account. 5C must refuse a record whose owner is not the signed-in account (`authorize("active")` already does), and must keep the record for its owner.
