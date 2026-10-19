# Handoff — PS-0C.1: Notification Efficiency Optimization

**Status: Complete** (19 October 2026, on `dev`, uncommitted). Implements the bell findings of the PS-0C investigation. Nothing about how notifications are created, stored, delivered, or read changed: no schema, migration, dependency, endpoint, action, or UI change.

## What changed

The notification bell used to ask `GET /api/notifications` every 60 seconds while its tab was visible, and again on every `focus` and `visibilitychange` (both usually fire together), with no regard for being offline. It now asks through one refresher.

| File                                                                | Change                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/features/notifications/model.ts`                               | `pollMs` 60 s → 15 min; new `minRefreshMs` (30 s) and `notificationsChangedMessage`                         |
| `src/features/notifications/refresh.ts` (new)                       | `createRefresher`: gates, throttle, in-flight coalescing, stale-answer protection, abort on dispose         |
| `src/features/notifications/components/notification-bell.tsx`       | Wires every trigger to the refresher; markup unchanged                                                      |
| `src/features/pwa/service-worker.ts`                                | `push` also posts `{ type: "NOTIFICATIONS_CHANGED" }` to same-origin windows; the notification is unchanged |
| `src/features/notifications/refresh.test.ts` (new)                  | Refresher unit tests                                                                                        |
| `src/features/notifications/components/notification-bell.test.tsx`  | Bell lifecycle tests                                                                                        |
| `src/features/pwa/service-worker.test.ts`                           | Push-to-page messaging tests                                                                                |
| `AGENTS.md`, `ARCHITECTURE.md`, `docs/PREACHER-STUDIO-MIGRATION.md` | The bell's rule, its description, and the migration record                                                  |

## Refresh lifecycle

Every ask is one of three kinds:

- **Routine**, throttled to one per 30 s: the bell mounting, the 15-minute fallback, the tab shown again, window focus, and the bell coming on screen (a `ResizeObserver`, so after the window crosses the `md` breakpoint the newly shown bell loads once).
- **Event**, not throttled: the network coming back (`online`), and the service worker's `NOTIFICATIONS_CHANGED`.
- **Explicit**, not throttled: opening the panel, and after marking one or all read.

For every kind, nothing is asked while the bell is off screen (the bar draws one per screen size), the document is hidden, or `navigator.onLine` is false. An event or explicit ask refused that way is owed, and the next routine trigger makes it past the throttle. Two asks never run at once: a routine ask during one is dropped; any other is owed and made once, after the current one settles. Marking read invalidates around the write (before and after), so an answer started before it is thrown away and a fresh one asked for: an older answer can never restore an unread badge. A failed ask keeps the last data shown (as before) and is not retried; the next trigger tries again. Unmounting removes every listener, clears both timers, disconnects the observer, and aborts the request in flight.

The worker posts only the message type, to each same-origin window (`clients.matchAll({ type: "window", includeUncontrolled: true })`), inside the push event's `waitUntil` beside `showNotification`; any error in messaging is swallowed and never prevents the system notification. The page accepts only an object whose `type` is exactly `NOTIFICATIONS_CHANGED`; the worker does not react to that type from a page.

## Expected efficiency (estimated, not measured)

|                                        | Before                        | After                                        |
| -------------------------------------- | ----------------------------- | -------------------------------------------- |
| Fallback interval                      | 60 s                          | 15 min                                       |
| Interval requests per visible tab-hour | ~60                           | ~4                                           |
| Focus + visibility together            | 2 requests                    | 1                                            |
| Routine requests (any trigger)         | unbounded                     | ≤ 1 per 30 s                                 |
| Hidden tab / off-screen bell           | 0 interval; focus still asked | 0                                            |
| Offline                                | attempted on every trigger    | none; one on reconnect                       |
| After a push                           | next poll (≤ 60 s)            | immediately, in each open window             |
| Multiple visible tabs                  | each polls                    | each refreshes on its own, at the lower rate |

Each request is one function invocation and, per PS-0C, about three SELECTs (the access lookup's user row, the unread count, the latest 8). Actual Vercel CPU and Neon compute savings depend on production traffic; other activity can keep Neon awake, so autosuspension is not guaranteed by this change.

## Verification

- `npx vitest run src/features/notifications src/features/pwa` — 11 files, 73 tests passed.
- `npm run typecheck` — passed.
- `npx eslint src/features/notifications src/features/pwa/service-worker.ts src/features/pwa/service-worker.test.ts` — no problems.
- `npx prettier --check --end-of-line auto` on the changed sources — clean (other differences are only the Windows checkout's CRLF).
- Request counts were checked by the tests' fetch-count assertions (15-minute fallback, throttle, coalescing, hidden, offline, reconnect, push message, unmount).

Not run: `npm run build` (it runs the database migration command; not needed for this change), the full unit suite, the end-to-end suite, and a browser Network-panel check (a signed-in bell needs a development database). No server was started.

## Limitations and risks

- **Installed PWAs** get the new worker through the existing update flow (`applyUpdate`, never forced). Until then an old worker does not message; the bell still refreshes on focus, visibility, reconnect, opening, and the fallback.
- **Push messaging** reaches only devices that subscribed to push and windows that are open; a closed or suspended page learns on its next focus or visibility change. Browsers may delay delivering a message to a page that is frozen in the background. iOS delivers push only to the installed app (16.4+).
- **Multiple tabs** each refresh independently; nothing is shared between tabs.
- A routine refresh still fetches the latest 8 items with the count, even with the panel closed (the endpoint was left as is).
- `navigator.onLine` is a hint: a request made while it says online can still fail, and is then not retried.
- A newly delivered notification on a device without push shows up within 15 minutes, or at the next focus, visibility change, or opening of the panel, instead of within a minute.

## Remaining (PS-6)

The generalized notification architecture in `docs/PREACHER-STUDIO-MIGRATION.md` section 12 (administrator announcements, release notes), removing the fallback poll entirely, sharing one refresh across tabs, and a count-only request for a closed panel.

## Next

Ready for PS-1A.
