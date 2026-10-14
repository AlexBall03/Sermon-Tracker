# Handoff: Phase 4B — Interactive product tour

13 October 2026. No migration, no new package. Built together with two companion milestones: [Loading Experience 2.0](HANDOFF-LOADING.md) and the [Universal Social Sharing Card](HANDOFF-SOCIAL-CARD.md). **Status: implemented and verified in development (section 9).** Not deployed. Phase 4 is complete; Phase 5 (PWA & Offline Support) is next.

## 1. What was implemented

- An invitation on the dashboard for an account that has just finished first-time setup: what the tour covers, that it is optional, that it can be run again from Settings, **Take the Tour** and **Maybe Later**.
- A seven-stop tour over the real application, on the real pages: Your Dashboard, Capture an Idea, Your Library, The Bible, Outlines, Preaching Record, and You're ready to begin.
- **Restart Product Tour** in Settings, Appearance & Experience, beside Account setup.
- Where the tour stands, kept on the account in `users.tour_state` (the column Phase 4A left), written only forward.
- English and Spanish throughout.

Not built, on purpose: any record the tour creates, opens, or changes; a tour step that needs something done to go on; a tour on the landing page; any new navigation destination; any migration.

## 2. Files

| Where                                                                         | What                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/features/tour/model.ts`                                                  | `shouldOfferTour`, the stop IDs, the dashboard's section names             |
| `src/features/tour/steps.ts`                                                  | The seven stops: page, and `data-tour` targets for wide and narrow screens |
| `src/features/tour/tour.ts`                                                   | `offerTour`, `dismissTour`, `completeTour`: one `UPDATE` each              |
| `src/features/tour/actions.ts`                                                | `markTourOffered`, `dismissProductTour`, `completeProductTour`             |
| `src/features/tour/components/tour-provider.tsx`                              | `TourProvider`, `useTour`, and the overlay                                 |
| `src/features/tour/components/tour-invitation.tsx`                            | The dashboard's invitation                                                 |
| `src/features/tour/components/restart-tour-button.tsx`                        | Settings' button                                                           |
| `src/i18n/dictionaries/{en,es}/tour.ts`                                       | The words; three strings added to `settings.blocks` in each language       |
| `src/app/(app)/layout.tsx`                                                    | Mounts `TourProvider` around the shell                                     |
| `src/app/(app)/dashboard/page.tsx`, `dashboard-view.tsx`                      | Pass `offerTour` and render the invitation                                 |
| `src/app/(app)/settings/page.tsx`                                             | The "Product tour" block                                                   |
| `src/features/ideas/components/library/library-sections.tsx`                  | `data-tour` names on the library's section links                           |
| `tests/e2e/tour.spec.ts` (new), `onboarding.spec.ts`, `onboarding-account.ts` | End-to-end journeys, and `keepTourState`                                   |

## 3. Persistence and lifecycle

| From                       | To          | When                                                     |
| -------------------------- | ----------- | -------------------------------------------------------- |
| `not_offered`              | `offered`   | The invitation is shown (only for a `completed` account) |
| `not_offered` or `offered` | `dismissed` | Maybe Later; Skip Tour; Escape                           |
| anything but `completed`   | `completed` | Finish Tour on the last stop                             |

- Each write is one `UPDATE` on the caller's own row with its condition in the WHERE clause (`tour.ts`), as first-time setup's are. A repeat, a second tab, or a stale request matches no row and changes nothing; two answers at once settle on one.
- The state only moves on. A dismissed tour can still be completed by running it again from Settings; a completed tour stays completed however a replay ends.
- The actions `authorize("active")`, take the account from the session, accept no input at all, and revalidate `/dashboard` only when a row changed. An account still in setup is refused.
- The step in progress is the browser's. Reloading mid-tour ends it; an account that had not answered is invited again.
- Restarting is a replay: it writes nothing and resets nothing (setup, the profile, the preferences, and the account's data are untouched).

## 4. Decisions

- **Who is invited.** Only an account that finished setup itself (`completed`), until it answers. Accounts from before setup existed (`grandfathered`, every development account today, the owner's included) are not interrupted; they find the tour in Settings. Phase 4A left this choice open.
- **Finishing setup still writes nothing about the tour.** The dashboard offers it. `completeOnboarding` and `advanceStep` are unchanged.
- **The invitation is a card in the page**, under the header, above the sections or the "Start with an idea" panel, which it leaves as they are. It folds away when answered. It is not in the landing page's reconstruction.
- **The overlay is Base UI's modal `Dialog`**, the foundation every modal here already uses: focus kept in the card, the rest inert, Escape, and focus returned (to what started the tour, or to the page's heading when that is gone). No dependency was added.
- **A light, not a cut-out.** One rounded element whose very large shadow is the dim, with the focus ring's color on its edge. It glides between targets in 0.3 seconds and does not move under reduced motion.
- **Placement.** From `md` up the card sits beneath a bar control, in the corner beside a large part of the page, or in the middle. Below `md` it is a sheet just above the tab bar, so the tab it points at stays in view. It scrolls inside itself on a short screen. Buttons are 44px on touch.
- **Missing targets.** A stop waits for its page and its preferred target. It takes a fallback target only after 1.5 seconds, so a page still showing its loading skeleton is not mistaken for one without the target. After 3 seconds (8 for a page that never arrives) it shows the stop with nothing lit. A new account's first stop names only the dashboard sections that exist and says more will come.
- **The Bible stop** names only the translations on offer, so with Spanish switched off it does not mention the RVG.
- **`data-tour` names added**: `section-sermon-ideas`, `section-saved-scripture`, `section-preaching-record` on the library's section links. The Preaching Record stop points at the last.

## 5. Desktop and mobile

Seen in screenshots taken by the end-to-end spec at 1280 × 720 and a Pixel 7, on every stop:

- Desktop: the card under Capture and under each destination, clear of what is lit; in the corner on the dashboard; in the middle on the last stop.
- Phone: the sheet above the tab bar with the lit tab visible beneath it; the bar and the account button uncovered; nothing scrolls sideways.

## 6. Internationalization

A new `tour` dictionary in `en` and `es`, registered in both indexes, and `blocks.tour`, `blocks.tourDescription`, `blocks.restartTour` in `settings`. The Spanish follows the dashboard's own Spanish names (Inicio, Continúa trabajando, Retoma una idea). It is the agent's wording and was not reviewed by a Spanish reader. No English literal was added to a component.

## 7. Accessibility

Dialog semantics with the stop's title as its name and its words as its description; "Step n of 7" visible and announced politely on each stop; Next keeps focus throughout (it is `aria-disabled` while a page is on its way, never `disabled`); Escape skips; the page behind is inert; focus returns on close; reduced motion stills the light and the card. Not tested with a screen reader.

## 8. Dependencies and database

No package was added. No migration: `users.tour_state` and its CHECK are from `0014`. The development database's one account was written to by the end-to-end runs (section 9) and restored each time; it is `grandfathered` / `not_offered` now, as it was before.

## 9. Verification

Run on the final code unless it says otherwise.

| Check                                                                                                                                                                                                                                               | Result                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc --noEmit`                                                                                                                                                                                                                                  | **Pass**                                                                                                                                                                                                                 |
| ESLint on every file changed or added                                                                                                                                                                                                               | **Pass**                                                                                                                                                                                                                 |
| `prettier --check --end-of-line auto` on every file changed or added                                                                                                                                                                                | **Pass** (ten files were formatted with `--write`, by name)                                                                                                                                                              |
| `tour.test.ts` (PGlite, real access helpers and actions): every transition, repeats, `completed` final, grandfathered never offered, pending refused, another account untouched, the tour column alone written, two answers at once, a failed write | **Pass**, 9 of 9                                                                                                                                                                                                         |
| `tour-provider.test.tsx`: seven stops in order on their pages, Back, Skip, Escape and focus return, missing targets, narrow targets, translations on offer, Spanish, the invitation's offer, start, and Maybe Later                                 | **Pass**, 9 of 9                                                                                                                                                                                                         |
| `dashboard/page.test.tsx` (4 new: offered after setup, stays until answered, not after an answer or for grandfathered, Maybe Later) and `settings/page.test.tsx` (the restart block)                                                                | **Pass**, 29 of 29 and 9 of 9                                                                                                                                                                                            |
| `loading.test.tsx` (the splash, the sign-in hold)                                                                                                                                                                                                   | **Pass**, 17 of 17                                                                                                                                                                                                       |
| **The whole unit suite**, once (the shell, the root layout, and the dictionaries changed)                                                                                                                                                           | 1,848 of 1,855 passed; **7 timed out** at 30 seconds, each the first database test of a file this work did not touch, while a server and a browser ran beside it. Those 7 files rerun by themselves: **198 of 198 pass** |
| Playwright, first run (loading, public, dashboard, onboarding, tour), `--workers=1`, desktop and Pixel 7                                                                                                                                            | 49 passed, 2 failed, 1 skipped. Both failures were the new tour spec (a test that matched the hidden announcement as well as the visible step, and a card measured mid-transition), fixed in the code and the spec       |
| `tour.spec.ts` by itself, desktop and Pixel 7                                                                                                                                                                                                       | **Pass**, 4 of 4, on the code before the 1.5 second fallback (the fallback is covered by `tour-provider.test.tsx`); not rerun since, see section 10                                                                      |
| `onboarding.spec.ts` (extended: invited after setup, Maybe Later holds across a reload, setup run again does not invite)                                                                                                                            | **Pass**, desktop and Pixel 7, in the first run                                                                                                                                                                          |
| Final Playwright run on the final code: `loading`, `public` (including the share card's tags, the image's address, type, and 1200 × 630 size), `auth`, `dashboard`, desktop and Pixel 7                                                             | **87 passed, 1 skipped** (the mobile menu test, which skips itself at desktop width)                                                                                                                                     |
| Production build                                                                                                                                                                                                                                    | **Pass**, as each Playwright run builds, and five more `next build`s for the filming                                                                                                                                     |
| The sign-in page and the hand-off filmed frame by frame on a production build                                                                                                                                                                       | See [HANDOFF-LOADING.md](HANDOFF-LOADING.md), section 6: no collapsed frame                                                                                                                                              |

## 10. Limitations and what is outstanding

- **`tour.spec.ts` and `onboarding.spec.ts` were not rerun on the final code.** They borrow the development account, which is also the owner's own: during the first run the owner signed in while `onboarding.spec.ts` held the account as one owing setup, and was sent through setup. That was the test, not the application. Both specs change the account only while running and restore it, and they should be run when the owner is not using the application: `npx playwright test onboarding --workers=1` and `npx playwright test tour --workers=1`.
- The tour was seen in screenshots taken by the spec, not watched by a person; no screen reader or real phone.
- A reload mid-tour ends it; the stop is not remembered (by design).
- The Spanish was not reviewed by a Spanish reader.

## 11. For the owner

1. Sign in once and watch: the sign-in card should never fold to a line, before the form or after you submit, and the loading screen should follow straight on.
2. Settings, Appearance & Experience, **Restart Product Tour**: go through, try Back and Escape, at a phone's width too, and in Spanish.
3. To see the invitation as a new account would: invite a new account from `/admin` and accept it, or run `onboarding.spec.ts` when you are not signed in elsewhere.
4. Review and commit. Nothing was committed or staged.

## Process

No Git command that changes state was run. No package was installed. Every server started was stopped: Playwright's own on port 3100 (stopped by Playwright), and the production servers on port 3101 started for screenshots and filming (stopped each time, confirmed by checking the port). The development database was written only by the end-to-end specs, to the one account, and restored.
