# Handoff: PS-A3, Production Editor Integration

**Status:** built and verified; ready for the owner's review. Not committed, not deployed, and no migration was run anywhere. Production behaviour is unchanged until the owner turns the conversion switch on there.

**Git:** began on `dev` at `674515f` ("Phase A2.3C is done") with a clean tree. Ends there, with the files below changed or new and nothing staged.

## Owner decisions (binding)

1. **Conversion behind a switch, off in production.** `SERMON_DOCUMENT_CONVERSION`, enforced on the server, failing closed. It stays off in production until A2.3D is built and live and A2.2's Vercel checks (Skew Protection, Deployment Protection, no rolling release) are done. An outline that already has a document always opens in the new editor.
2. **A minimal Insert menu in A3.** The semantic components the editor already has, from one visible menu. It is not the whole of UI.3. The title is `ideas.title`, shown read only, until UI.2C.
3. **`markDeveloped` on a confirmed save**, atomic with the conditional write, only when the stored content changed.
4. **Plan-review corrections:**
   - navigation protection is never released on the strength of disposal's flush;
   - a new session (Review) only after the old one ended, with its own read and inspection;
   - lock order verified before the `markDeveloped` change;
   - the legacy workflows checked and reported, not silently dropped.

## What was built

### A3.1: mounting and authorization

- **The page** (`src/app/(app)/outlines/[id]/page.tsx`):
  - First `requireActiveUser()`, the ID schema, then `getOutlineSermon` (owner-scoped). A missing outline and another account's are the same 404.
  - Then `hasDocument`:
    - **A row:** `OutlineDocumentHost`, whatever the switch says.
    - **No row, switch on:** `ConvertOnOpen`, given the legacy editor's page as its fallback.
    - **No row, switch off:** the legacy page exactly as before.
  - The page sends no document content.
- **The switch** (`persistence/rollout.ts`):
  - It is on only for exactly `on`, or when it is unset under `next dev`.
  - `convertOutlineDocument` refuses with `disabled` before reading anything while it is off.
- **`ConvertOnOpen`** (`host/convert-on-open.tsx`):
  - It converts once, from the browser, through the existing action (never during the server render; a prefetch cannot convert).
  - `converted`, `exists`, or `unreadable` opens the host.
  - `unsafe`, `too_large`, `disabled`, and queued legacy changes on this device (or a device that cannot say) keep the legacy editor, with a notice.
  - A failure offers "Try again". Never a blank document.
- **`OutlineDocumentHost`** (`host/outline-document-host.tsx`):
  - No session until Clerk has loaded and names the account the page was rendered for. Clerk's user is the `IdentitySignal`; `users.id` is the owner.
  - One `createEditorSession` per generation, made only after the previous session's `dispose()` resolved.
  - A session is rendered only for its own generation and asks for a successor at most once (both found as defects during A3; see below).
  - `SermonWorkspace` is mounted from `ready` with `restored.content` or `base.content`, with `sessionWriteGuard(() => session.canEdit())` through a new `extensions` prop, and attached in `onReady`.
  - `setEditable` follows `canEdit()` on every state change, for the view only.
  - An attach refusal or a refused document shows a message and stays not editable.
- **`SermonWorkspace`:**
  - new optional `extensions` (appended after the editor's own, read once) and `onRefused` props;
  - the Insert menu at the start of the toolbar;
  - nothing else changed, and v3 is untouched.

### A3.2: persistence and recovery UX

- **Autosave** is only the session's controller and coordinator, with `documentTransport({ save: saveOutlineDocument })` and the browser's `online`/`offline` events (`host/signals.ts`).
  - Timings are A2's, unchanged.
  - No new timer, poll, or resend.
- **The indicator** (`host/save-status.ts`, `save-indicator.tsx`) maps `serverSaveStatus` to words, with the device's state first (`autosaveStatus`). "Kept on this device" is never said while the newest words are still being written, and "Saved" only for `saved`.

  | Status                        | Label                                                  | Action (always a press)                                |
  | ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
  | `unchanged`                   | No changes                                             |                                                        |
  | `pending`                     | Keeping on this device…                                |                                                        |
  | `local`, `waiting`            | Kept on this device                                    |                                                        |
  | `saving`                      | Saving…                                                |                                                        |
  | `saved`                       | Saved                                                  |                                                        |
  | `offline`                     | Offline · kept on this device                          |                                                        |
  | `unresolved`                  | Checking the last save…                                |                                                        |
  | `failed`                      | Couldn't save · trying again                           | Try again (`retry()`), only once no retry is scheduled |
  | `stalled`                     | Couldn't reach the server                              | Try again (`recover()`)                                |
  | blocked, conflict             | Changed elsewhere · your words are kept on this device | Review                                                 |
  | blocked, unauthorized         | Sign in again to save                                  | Sign in                                                |
  | `attention`, refused for size | Too large to save · shorten it                         |                                                        |
  | other refusal                 | Not saved · your words are kept on this device         | Review                                                 |
  | `unprotected`                 | Not kept anywhere yet                                  | Try again (`controller.retry()`)                       |

- **Leaving:**
  - `useLeaveGuard` guards in-app links, history, and unload while the newest words are not on the device (`pending`, `unprotected`).
  - `holdUnsavedWork` holds the application update per `holdsUnsavedWork`.
  - `beforeunload` is a prompt, never a durability claim.
- **Review** (conflict or refusal): a new session, made only once the old one's `dispose()` resolved. It reads the server and inspects the device itself; no claim, submission, or revision crosses.
- **Recovery** (`host/recovery-view.tsx`) is a full page in the outline page's frame, never a modal, with no editor on the page:
  - one `inspectRecovery()` each time the state is entered;
  - blocking units, with "Includes work restored earlier" for lineage;
  - switchable, complete, read-only previews of the recovered and the saved document (`host/document-preview.tsx`: the editor's own extensions, never editable, never scrolling inside itself);
  - Restore only for a restorable unit while it is the only one ("Discard the other work found first" otherwise);
  - Discard only after a confirmation dialog.
  - Outcomes:
    - `changed`, `server_changed`, `other_candidates`, `equivalent`, `unknown_token`: read the device again, with a note;
    - `read_failed`, `storage_failed`: an error, nothing changed;
    - `inspection_failed`: "Try again" (`recheck()`).
  - The restored editor opens from `restored.content`; the original is kept until the confirmed save's cleanup (A2.3C, unchanged).
- **Tabs:**
  - `read_only` shows "This outline is open in another tab", "Edit here" (`requestTakeover()`), the `declined` and `unanswered` answers, and a read-only preview from one GET (never polled).
  - `takeover_pending` waits.
  - After handing over, this tab opens a new session, which is read only.
  - `lost: lockLost` offers "Edit here again". The account changing shows "You're signed in as someone else"; Web Locks missing shows "This browser can't edit outlines".
- **`verification_failed`:**
  - offline, failed: "Try again" (`recheck()`);
  - unauthorized: sign in;
  - missing: back to the sermon;
  - **unreadable:** says nothing was changed and nothing will be saved over it, and offers no save.
- **Back-forward cache:** a page shown again with `persisted` and a `lost` session opens a new one.

### A3.3: usability and release

- **Insert menu** (`src/features/sermon-editor/insert-menu.tsx`): Introduction, Main point, Subpoint, Scripture passage… (a reference dialog, parsed with `parseReference` in either language), Preacher note, Script, Conclusion. Each entry has a one-line hint and is disabled where it can't apply.
  - **Commands** (`v4/commands.ts`): `insertPassage`'s placement became a shared `insertAfterLine` step, so `insertNote` and `insertScript` use it rather than copying it. `insertRolePoint` puts an introduction before the first main point (after the caret's line when there is none) and a conclusion at the end, once each, taking nothing over.
  - **Focus:** keys pressed straight after a choice go to the new component. A defect was found here and fixed (below).
- **Words:**
  - a new `sermonEditor` dictionary, in English and Spanish (the editor's own, as A1's "Boundary for A2" asked);
  - `outlines.actions.conversionDisabled` added in both.
- **Developing the sermon:** `updateDocument` is now one transaction:
  1. the sermon's idea row `FOR NO KEY UPDATE`;
  2. the document row `FOR UPDATE`, compared with the new content by jsonb equality;
  3. the conditional update, its `WHERE revision = expected` unchanged;
  4. `markDeveloped` only when it updated and the content differed.

## Pre-commit review and its correction (29 October 2026)

### The review

The independent review found no data-integrity or authorization defect. The owner-approved two-connection race passed twice on the development database (verified declared and stamped `development`; three backends; disposable records, all removed; everyone else's rows checksum-identical):

- forced and unforced saves at one revision: one `updated`, one `stale`;
- the development dates move only with a committed change;
- no deadlock against sermon deletion, outline deletion, a legacy write, or an idea edit.

It found one A3 regression, confirmed in a browser: after an edit reached "Saved", the first Back press stayed on the outline.

### The cause

`useLeaveGuard` borrows one history entry, so it can undo Back, the first time a page becomes unsaved, and it never gave the entry back. The legacy editor turned the guard on only after a failure; the sermon editor does at every pause in typing (`pending`).

### The correction (`src/components/layout/leave-guard.tsx`)

The borrowed entry is now shared by every guard on the page and marked with a token. It is taken away with one `history.back()` only when all of these hold:

- the page stops being unsaved while it stays mounted (an effect on that change, never a cleanup);
- no other guard on the page still holds work;
- leaving was not agreed (`allowLeaving()`);
- the current entry still carries that token, at the address it was made for.

The `popstate` answering it is kept from the router only while it lands on that same address, and only for one second; a later one is always the person's. The host calls `allowLeaving()` before deleting an outline. Nothing else changed: no new state, timer loop, session, or save path.

### Tests

- **`leave-guard.test.tsx`:** 15. Six new or rewritten:
  - at most one entry across cycles;
  - removed without the router seeing it;
  - the person's later Back let through;
  - no history moved on unmount or after `allowLeaving`;
  - only its own entry, on top, at its address;
  - kept while another guard holds work.
  - Two existing tests now wait for the removal they cause, and two assertions expect the token instead of `true`.
- **In the browser** (`sermon-document.spec.ts`, desktop and phone):
  - opened from the sermon's page;
  - three edit-and-save cycles leave at most one extra entry, and none once saved;
  - words not yet kept hold Back and a link, and ask;
  - once saved, one Back reaches the sermon's page and Forward returns;
  - the editor's own way back is the only navigation;
  - a settings form (Profile) holds Back while dirty and leaves at one press once it has nothing to lose.
- **Results:** the whole file passed 15 of 15. `library.spec.ts` (the idea editor's guard) passed 2 of 2.

## Lock order (correction 3)

| Transaction                       | Order                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Legacy writes (`lockOutlineRows`) | idea (`NO KEY UPDATE`), then outline (`FOR UPDATE`), then entries; `hasDocument` is a plain read |
| Conversion                        | the same, then the document insert                                                               |
| Deleting a sermon                 | idea, then outline (cascade), then document (cascade)                                            |
| Deleting an outline               | outline, then document; the idea is not locked                                                   |
| Document save (A3)                | idea, then document                                                                              |

The new save order agrees with all of them. Updating the document first and the idea second would have been the reverse of a sermon's deletion and could deadlock; this was found before building and avoided. No contradiction, so nothing was weakened.

The two-connection race was **not** rerun on development (it needs the owner's approval; A2.1/A2.2 ran theirs). PGlite proves atomicity and rollback, not concurrency.

## Defects found and fixed during A3

1. **Doubled successor session.** Right after a renewal, the host re-rendered once with the new generation but the old session, so a fresh view saw the old `lost` state and renewed again, leaving an extra session. Each session is now bound to its generation, and each asks for its successor at most once. Covered by the tab test.
2. **"Offline" shown for a scheduled save.** `waiting` (a save scheduled) was labelled offline. It is now "Kept on this device".
3. **"Kept on this device" said too early.** `serverSaveStatus` gives `offline` or `blocked` before the local state, so the label could say "kept" while the words were still being written. The device's state now comes first. Tests added.
4. **Insert menu swallowed typing.** Seen only in a real browser screenshot. Typing straight after a choice went to the closing menu: the pointer over the item takes focus back for a few frames, and each space chose the item again, so typing "Grace is unearned" made three empty points.
   - **Fix:** no closing animation on this menu, and a key reaching it after a choice moves focus to the editor in `keydown`, which takes the character with it; the menu never sees the key.
   - **Test:** the e2e journey now types with no wait, and counts points. It failed before the fix and passes after.

## Verification (actually run)

- **Unit and component (Vitest):**
  - `host/outline-document-host.test.tsx`: 13. A real session, controller, coordinator, and fake-indexeddb, with a stand-in workspace that makes a real v4 editor with the host's extensions. Covers:
    - opening and saving (one request);
    - the write guard after disposal;
    - Strict Mode (one live session, the previous one disposed first);
    - Clerk loading and mismatch;
    - the account changing mid-edit (words kept on the device);
    - unmount and a second tab;
    - unreadable;
    - read only and Edit here (exactly one editor);
    - recovery: previews, restore then saved, discard only after confirming, two units (Restore disabled);
    - Review after a conflict (old session disposed first, nothing of it resent);
    - a page reopened while a save is in flight, whose late answer lands without any resend.
  - `host/save-status.test.ts`: 20 (every status, "Saved" only for `saved`, the leave guard, actions, "kept" never said early).
  - `persistence/documents.test.ts`: 35. Five new for developing: a change marks; the same content does not; stale, invalid, too large, or missing do not; another owner is unaffected; a trigger-forced rollback leaves neither the document nor the dates changed. One existing assertion updated, by decision 3.
  - `persistence/actions.test.ts`: 18 (two new for the switch); `rollout.test.ts`: 2.
  - `editor-lab/v4/insert.test.ts`: 7 (placement, ownership, undo, the core accepting the result); all v4: 270.
  - `outlines/page.test.tsx`: 14 (three new for which editor opens).
- **Full suite** (`npx vitest run`): 3348 passed, 4 failed in 3 files, none of them touched by A3.
  - `preferences.test.ts`: the known missing `deleteIdentity` mock (`@/features/admin/clerk`). Still present.
  - `bible-reader.test.tsx` (1) and `church-ministry-settings.test.tsx` (3): pass when run alone (161 of 161), so timing under full-suite load.
- **Tooling:** `npm run typecheck`, ESLint, and `prettier --check` on every changed file: clean.
- **Build:** `npm run build`, six times, all passing. Its `migrate deploy` step returns before connecting unless `VERCEL_ENV=production` (`scripts/db/cli.mjs`), and printed "migrations skipped".
- **Real browser** (`tests/e2e/sermon-document.spec.ts`; production build, `next start`, conversion on, the development Clerk test account and development database): 11 passed (6 phone, 5 desktop; the phone journey runs on the phone only). The journeys:
  1. A new outline is converted on opening and written in with every Insert component, typed straight after each choice. An Outline Settings preset (Expressive) is applied. All of it is found again after a reload, exactly one point per choice, and the sermon is on the dashboard.
  2. Another tab is read only until Edit here, and the handover keeps the words.
  3. Words written offline survive the tab closing, show in recovery beside the server's version, are restored, are saved, and are found again.
  4. A save from another browser profile meanwhile gives a conflict; Review shows both versions; keeping one's own saves it.
  5. Another account's or an unknown outline gives 404 (page and GET route).
  6. On a phone: Regular layout, the Insert menu, saving, nothing scrolling sideways.
  - Each test removes the sermon it made. Desktop and phone screenshots of the editor, the Insert menu, offline, recovery, and read only were reviewed.
- **Conversion off (production today):**
  - The new specs skip by themselves.
  - `outline-editor.spec.ts` and `outlines-integration.spec.ts` (legacy editor; now skipped unless `SERMON_DOCUMENT_CONVERSION=off`) **fail**, and fail identically on an untouched build of `674515f`, so both failures predate A3:
    - integration: "Add point" after "Add from Saved Point" adds nothing;
    - editor: a 5-minute timeout.
  - The baseline was built from `git archive HEAD` in a scratch folder and removed afterwards.
- **Not run:**
  - the two-connection race on development (needs approval);
  - the whole e2e suite (only the outline specs, plus `test:e2e:ownership` during A2);
  - Safari, Firefox, a real phone, a screen reader;
  - signing out in another tab in a real browser (the account change is covered in the component test only);
  - a legacy outline with content converted in the browser (journey 1 converts a new, empty one; content fidelity is `conversion.test.ts`'s, from A2.2).

## Data-integrity invariants

| Invariant                               | Evidence                                                           |
| --------------------------------------- | ------------------------------------------------------------------ |
| No silent loss                          | The leave guard while not on the device; recovery tests; journey 3 |
| No blind overwrite                      | Conditional revisions unchanged; journey 4                         |
| No unauthorized edit or save            | The write guard; Clerk gating; 404 tests                           |
| No automatic merge, restore, or discard | Tests that wait 30 s and find nothing done                         |
| No unsafe deletion                      | Only A2.3C's operations; discard only after a confirmation         |
| No false "Saved"                        | `save-status` tests                                                |
| No replayed claim                       | Review and reopen tests (`sent` unchanged)                         |
| One pipeline                            | The session's only                                                 |
| No third attempt                        | A2's coordinator, unchanged                                        |
| No stale callback                       | Generation-bound sessions; the Strict Mode test                    |
| No editing before clearance             | Recovery and unreadable tests: no editor mounted                   |
| Account isolation                       | Owner `users.id`; Clerk mismatch blocks; owner scoping unchanged   |
| No early removal of originals           | A2.3C, unchanged                                                   |
| No uncontrolled conversion              | The switch, enforced on the server                                 |
| No excessive requests or polling        | One GET for the read-only preview; no timers added                 |
| No migration                            | None                                                               |

## Known limitations

### Cutover regressions (open; build or accept before turning conversion on in production)

- The new editor has no **Add from Saved Point** (the legacy `AddSavedPoint`).
- It has no **Expand/Collapse All** of points. Only passages expand and collapse.
- A **Scripture passage has no way to the Bible reader** (the legacy entry passages link with `outline=<id>`).

Today these affect only development and preview, where conversion is on.

### Rollout dependencies (not A3's)

1. A2.3D: devices told an outline is converted; `createDeviceOutlineApi` and the offline page stop offering legacy edits. Until then the offline page opens a converted outline's device copy in the legacy editor, and its changes come back as kept `documentAuthoritative` conflicts.
2. The owner's Vercel checks (A2.2 "Rollout" step 3).
3. `SERMON_DOCUMENT_CONVERSION=on` in production, by the owner.

### Approved and unbuilt (not regressions)

UI.2B.3 (personal presets), UI.2C (editable title and subtitle header, footer, title-storage decision), the rest of UI.3 (Page Break insertion, slash commands, the mobile insert bar, context menus, header and footer polish), UI.2D, UI.4.

### Other

- Opening an outline offline is read only (`verification_failed: offline`). Editing that continues after going offline is kept on the device and saved when back online.
- A deleted outline's drafts stay on the device until the account is forgotten (A2's rule: only an exact confirmation, a discard, or account deletion removes one).
- `markDeveloped` counts any change to the stored document, numbering and appearance included. The legacy outline rule does not count numbering.
- The two legacy-editor e2e failures above are pre-existing and unrelated to A3.
- From A2's list, still open before public release: Drizzle error logging of parameters, and the `zod` and transitive advisories.

## Files

- **New:**
  - `src/features/sermon-editor/host/`: `outline-document-host.tsx`, `convert-on-open.tsx`, `recovery-view.tsx`, `document-preview.tsx`, `save-status.ts`, `save-indicator.tsx`, `signals.ts`, and their tests `outline-document-host.test.tsx` and `save-status.test.ts`;
  - `src/features/sermon-editor/insert-menu.tsx`;
  - `src/features/sermon-editor/persistence/rollout.ts`, `rollout.test.ts`;
  - `src/features/editor-lab/v4/insert.test.ts`;
  - `src/i18n/dictionaries/{en,es}/sermonEditor.ts`;
  - `tests/e2e/sermon-document.spec.ts`;
  - this file.
- **Changed:**
  - `src/app/(app)/outlines/[id]/page.tsx`, `page.test.tsx`;
  - `persistence/documents.ts`, `documents.test.ts`, `actions.ts`, `actions.test.ts`;
  - `sermon-workspace.tsx`;
  - `editor-lab/v4/commands.ts`;
  - the `outlines` dictionaries and both dictionary indexes;
  - `playwright.config.ts` (the e2e server gets `SERMON_DOCUMENT_CONVERSION`, `on` by default);
  - `tests/e2e/outline-editor.spec.ts` and `outlines-integration.spec.ts` (run only with conversion off);
  - `.env.example`;
  - `AGENTS.md`, `ARCHITECTURE.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, `docs/ROADMAP.md`.

## Next

1. Owner review and commit.
2. Decide the three cutover regressions: build them in a small follow-up, or accept them.
3. A2.3D.
4. The Vercel checks, then the switch.
5. Optionally, the two-connection race for the new save transaction, on development, with approval.
