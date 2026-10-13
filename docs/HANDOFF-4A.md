# Handoff: Phase 4A — First-time onboarding and profile setup

13 October 2026. One migration (`0014_onboarding_lifecycle`), four columns on `users`, no new table, no new package. **Status: implemented and verified in development (section 9). A unit test left failing by the commit before this phase was corrected too (section 10).** Migration applied to development only. Not deployed. Phase 4B, the product tour, was not started; Phase 3D is still open.

## 1. What was implemented

- A persisted setup lifecycle on every account, and a rule, enforced on the server for every page, action, and route, that a new account finishes setup before it reaches the application.
- `/onboarding`: a four-step wizard (Welcome, Church & Ministry, Preferences, All set) that resumes where it was left, on any device.
- Every account that existed beforehand keeps its access and everything it saved, and can run the same steps from **Run Account Setup** in Settings (Appearance & Experience) and leave at any point.
- English and Spanish throughout.

Not built, on purpose: any tour overlay, invitation, dismissal, or restart control; any new navigation item; any new preference.

## 2. Lifecycle schema

Four columns on `users` (`src/db/schema.ts`; lists in `src/features/onboarding/model.ts`):

| Column                    | Type                                   | Values                                             |
| ------------------------- | -------------------------------------- | -------------------------------------------------- |
| `onboarding_status`       | `text` not null, default `pending`     | `pending`, `completed`, `grandfathered`            |
| `onboarding_step`         | `text` not null, default `welcome`     | `welcome`, `ministry`, `preferences`, `finish`     |
| `onboarding_completed_at` | `timestamptz`, nullable                | Set exactly when the status is `completed` (CHECK) |
| `tour_state`              | `text` not null, default `not_offered` | `not_offered`, `offered`, `dismissed`, `completed` |

**One more column than the brief proposed.** With a completion date alone, an account marked by the migration and an account that finished the wizard would be indistinguishable. `onboarding_status` says which, and is the only thing that decides whether setup is owed (`needsOnboarding`: status is `pending`). Nothing is inferred from profile fields, creation dates, or saved ideas.

## 3. Migration and legacy accounts

`0014_onboarding_lifecycle`: four `ADD COLUMN`s, then `UPDATE "users" SET "onboarding_status" = 'grandfathered'`, then four CHECKs.

- The `ADD COLUMN`s and CHECKs are as `npm run db:generate` wrote them. **The `UPDATE` was added to the generated file by hand before it was applied anywhere** (the `0008` precedent). Do not edit the file again.
- The default must be `pending`, since it is what a new account gets, and PostgreSQL fills a new `NOT NULL DEFAULT` column in every existing row with that default. The `UPDATE` is what stops every existing account being sent through setup.
- Drizzle applies it in one transaction and the first `ALTER TABLE` holds an exclusive lock on `users` until commit, so no account can be created between the statements.
- It adds and changes nothing else: every other column of every row is as it was.
- **Safe under the code live while it runs, and after a rollback.** That code names none of the new columns; an account it creates takes the defaults, is `pending`, and is taken through setup by the first request the new code serves.
- `provisionUser` did not change. A new row is `pending` by the column's default.

## 4. Authentication and routing

Clerk still establishes identity and `users.status` still establishes access. Setup is a third, separate question, asked after those two and only in `src/features/auth/access.ts`:

| Helper                           | An account that owes setup                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `requireActiveUser()`            | Redirected to `/onboarding`                                 |
| `requireAdmin()`                 | Redirected to `/onboarding` (it goes through the one above) |
| `authorize("active" \| "admin")` | Refused: "Finish setting up your account first."            |
| `requireAccount()` (new)         | Admitted                                                    |
| `authorize("account")` (new)     | Admitted                                                    |

- Every `(app)` page already called `requireActiveUser()` or `requireAdmin()`, and all 44 server-action call sites and 5 route handlers `authorize("active" | "admin")`. So no page, action, or route was edited to be closed to an unfinished account; they are closed because the helper they already ask now says so. The API routes answer 401.
- The two new forms are used only by the setup page, `advanceOnboarding`, `finishOnboarding`, and the three preference actions setup saves through (`setLocale`, `setBibleTranslation`, `updateProfile`, changed from `"active"` to `"account"`).
- A disabled or uninvited account is still denied first. Invitation-only provisioning is untouched. Onboarding is not a role.
- `/onboarding` is in `routes`, `privateRoutes` (so `robots.txt` disallows it), and `appRoutes` (so the proxy sends a guest to sign-in). The proxy itself was not changed and is still routing only.
- It lives in a new route group, `src/app/(setup)/`, with the bar and no navigation. It cannot be under `(app)`: that layout calls `requireActiveUser()` and would redirect in a loop.
- No loop: proxy → `/dashboard` → `requireActiveUser()` → `/onboarding`, whose page asks `requireAccount()`.
- A completed or grandfathered account that opens `/onboarding` gets the steps in `review` mode, which writes nothing about setup.

## 5. Resuming

- The stored step is the furthest reached. `advanceStep` is one `UPDATE … WHERE id = me AND onboarding_status = 'pending' AND onboarding_step IN (earlier steps)`, so a second tab left behind, another device, or a request sent twice matches no row and is answered with what is stored. Progress never moves backward.
- `completeOnboarding` is one `UPDATE … WHERE id = me AND onboarding_status = 'pending' AND onboarding_step = 'finish'`. Early, it is refused; again, or for an account that owes no setup, it answers done and writes nothing.
- In the wizard, what is typed is browser state until Continue. Continue saves first and records the step only when the save succeeded; a refusal or a lost connection leaves the fields and the step. Back never saves and never moves the stored step, so a reload opens at the furthest step reached, with the saved values.
- Neither action takes an account from its input. Both use the session's.

## 6. Reused, not rebuilt

| Step        | Validation and save                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Church      | `profileSchemas(locale).profileUpdate`, `updateProfile`, `profileLimits`, `TextField`, `Switch`, labels from `settings.ministry` |
| Preferences | `LanguageSettings` as mounted in Settings (`setLocale`, `setBibleTranslation`); `useThemeChoice` over the `next-themes` store    |

- Language and translation behave exactly as in Settings, because they are the same component and actions: a new language returns the translation to following it, a translation never writes the language, and with Spanish switched off nothing Spanish is offered or accepted and nothing stored is rewritten.
- Attending preaching class defaults to what is stored (false until chosen) and creates nothing.
- The theme is still the browser's. Nothing about appearance is saved to the account.
- A step whose values did not change is not sent again, so running setup from Settings overwrites nothing by being opened or paged through.

## 7. Decisions worth knowing

- **A sign-out on the first-time wizard.** A new account has no navigation and nowhere to go, so the wizard's top line offers Sign out (the existing `useAccountActions`). The brief did not ask for it.
- **Three themes in setup, two in the bar.** The brief asked for System, Light, and Dark. Setup shows the three as one `Segmented`; the bar's control and Settings are unchanged.
- **Review mode starts at Welcome and its progress is the browser's.** The stored step of an account that owes no setup is never read or written.
- **A grandfathered account that goes through the steps stays `grandfathered`.** It never owed setup, and Phase 4B can tell the two apart.
- **The directory still leaves the account's own fields out.** `DirectoryEntry` now omits the four lifecycle columns as well.
- **A bug the end-to-end run found, fixed here.** Next keeps the page that was left, hidden, when a link is followed. `ChurchMinistrySettings` held its own copy of the saved values, so after changing the ministry role in setup and returning to Settings, Settings showed the old one. It, and the wizard's own step, now take a value that was saved from elsewhere, field by field, and leave what is being typed alone.
- **An older test loosened.** `src/db/outline-migration.test.ts` asserted that `0013` was the last migration in the journal. It now asserts what it means: that `0013` follows `0012`.

## 8. Localization

A new `onboarding` dictionary in `en` and `es`, registered in both indexes, and three strings added to `settings` (`blocks.setup`, `blocks.setupDescription`, `blocks.runSetup`) with a reworded Appearance & Experience description. The church and language fields reuse the `settings` strings. The access helpers' refusal is an English literal, as its three neighbors there already are. The Spanish wording is the agent's and was not reviewed by a Spanish reader.

## 9. Verification

Everything below was run on the final code unless it says otherwise.

| Check                                                               | Result                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                  | **Pass**                                                                                                                                                                                                                                                                                                                                                                |
| ESLint on the files touched                                         | **Pass**                                                                                                                                                                                                                                                                                                                                                                |
| `prettier --check --end-of-line auto` on the files touched          | **Pass**                                                                                                                                                                                                                                                                                                                                                                |
| The whole unit suite (`npx vitest run`), once                       | 103 files, 1,792 tests: **1,790 passed, 2 failed**. One was `outline-migration.test.ts` (section 7), fixed and rerun: pass. The other was `outlines/page.test.tsx`, which was already failing; its expectation was corrected and it was rerun: pass (section 10). It was run before the fix in section 7's "bug" item; the files that fix touched were rerun afterwards |
| Focused runs after the last change                                  | **Pass**: `features/onboarding`, `features/settings/components/church-ministry-settings.test.tsx`, `app/(app)/settings`, `app/(setup)`, the two migration tests                                                                                                                                                                                                         |
| `npm run db:status` before                                          | 14 applied, 1 pending (`0014_onboarding_lifecycle`); stamp development                                                                                                                                                                                                                                                                                                  |
| `npm run db:migrate:dev`                                            | "applied 1 migration(s) to development"                                                                                                                                                                                                                                                                                                                                 |
| `npm run db:status` after                                           | 15 applied, 0 pending                                                                                                                                                                                                                                                                                                                                                   |
| Production build                                                    | **Pass**, as the build each Playwright run makes; not run separately                                                                                                                                                                                                                                                                                                    |
| `onboarding.spec.ts` (new), desktop and Pixel 7, `--workers=1`      | **Pass**, 4 of 4, on the third run. The first two each failed its second journey: once for the spec's own lookup, once for the bug in section 7                                                                                                                                                                                                                         |
| `library.spec.ts`, desktop and mobile                               | **Pass**, 4 of 4, run after the onboarding spec: a grandfathered account still gets in, and the test account was put back                                                                                                                                                                                                                                               |
| The other signed-in specs, and the guest specs                      | **Not run**                                                                                                                                                                                                                                                                                                                                                             |
| Production or preview; a first invitation through Clerk's own email | **Not done**                                                                                                                                                                                                                                                                                                                                                            |
| A screen reader, a real phone, Spanish reviewed by a Spanish reader | **Not done**                                                                                                                                                                                                                                                                                                                                                            |

**What the unit and database tests show** (PGlite with the committed migrations; Clerk mocked):

- A newly provisioned account is `pending` at `welcome` with no tour offered; an existing one is returned as it is.
- Migration `0014` on a database of four existing accounts leaves all four `grandfathered` and every other column identical; an account inserted afterwards as the previous release inserts it is `pending`; the CHECKs refuse bad values.
- A pending account is redirected from `requireActiveUser` and `requireAdmin`, refused by `authorize("active" | "admin")`, and admitted by `requireAccount` and `authorize("account")`; so is a new administrator. Completed and grandfathered accounts pass everywhere. A disabled account is denied before setup is considered; a guest and a stranger are kept out of setup.
- With the real access helpers and the real actions together: a pending account saves its profile, language, and translation; a new language resets the translation and a translation leaves the language; Spanish and the RVG are refused while switched off and what was stored is kept; setup finishes with every optional field blank.
- Progress persists across a new session, never regresses for a stale request, is unchanged by a repeat, and refuses an unknown step and any account in its input. Finishing is refused before the last step, happens once however often asked (two at once included), revalidates only when it really finished, and touches no other account.
- An account that owes no setup keeps its row byte for byte and its access after calling both setup actions.
- The wizard: resumes at the stored step; validates beside the field; a refused or unreachable save keeps the input and does not advance; the save comes before the step is recorded; an unchanged step is not sent; review mode calls neither setup action; Spanish; Spanish switched off.
- Settings still has its five sections and controls, and now the entry.

**What the end-to-end journey did**, at 1280px and at a Pixel 7's width, as the development test account made `pending` for the run: signed in; was sent to `/onboarding` from `/dashboard`, `/library/sermon-ideas`, `/outlines`, `/bible`, `/settings`, and `/admin`; got 401 from `/api/ideas/search`; passed Welcome; saved a church, a role, and the preaching-class switch; reloaded on step 3 and found the step and, going back, the values; switched the theme to dark and back; switched the wizard to Spanish and back (where Spanish is on); was still held to setup on step 4; pressed Open Dashboard and reached it; opened Sermon Ideas; found the saved values in Settings. Then, as a finished account: opened setup from Settings, changed the role, left with Exit setup, found the new role in Settings, and still reached the dashboard, the steps, and Sermon Ideas. Sideways overflow was checked on each step.

### Database and deployment

| Fact                                              | State                                     |
| ------------------------------------------------- | ----------------------------------------- |
| Migration `0014` applied to development           | Yes                                       |
| Migration `0014` applied to production or preview | **No**                                    |
| Migrations `0009` to `0013` in production         | **No**, as far as this repository records |
| Phase 4A deployed                                 | **No**                                    |

The development database was written to by the migration and by the end-to-end runs: the test account's own row (made `pending`, then restored by the spec to what it was, profile and preferences included) and the ideas `library.spec.ts` makes and removes. **Every development account that existed on 13 October 2026 is now `grandfathered`**, the owner's included. To see first-time setup by hand, invite a new account, or run the spec. Production was not touched.

## 10. Known limitations

- **A test that was already failing was corrected.** `src/app/(app)/outlines/page.test.tsx`, "names the sermon, leads back to it, and hands the editor what it edits and no more", failed before this phase: the page has passed `sermonReferences` to the editor since commit `1678f08`, and the test did not expect it. The expectation now names it (an empty list for a sermon with no passages). The page was not changed. Rerun by itself: 11 of 11 pass.
- **One existing test is sensitive to a busy machine:** `church-ministry-settings.test.tsx`, "puts the switch back…", waits the default second for a message and failed three times when run beside other work, the first time before this phase had touched that component. It passed 7 of 7 runs by itself.
- **The end-to-end spec borrows the shared test account.** While it runs, every other signed-in spec would be sent to setup, so it must run by itself (`npx playwright test onboarding --workers=1`). If a run dies before restoring, the account is left owing setup; run the spec again and it is restored as `grandfathered`.
- **A true first sign-in was not exercised in a browser.** The spec resets an existing account's row; provisioning a brand-new identity is covered by the unit tests only.
- **Review mode keeps its place while the browser keeps the page.** Leave setup on step 3, come back by the link, and it may open on step 3. A reload starts at Welcome.
- **The access helpers' refusals are in English**, the new one included, as before.
- **An account created by the old code during the production build is let in by that code** and taken through setup once the new code is live. Intended.
- Carried and unchanged: Phase 3D is not started, and its list of release checks stands.

## 11. For the owner

1. Review and commit (`AGENTS.md` and the migration included).
2. Signed in to development as yourself: Settings, Appearance & Experience, **Run Account Setup**; go through, change something, exit, and see it in Settings. Then phone width, the dark theme, and Spanish.
3. To see it as a new account: invite one from `/admin` and accept the invitation.
4. Before release: the release applies `0009` through `0014` together during the production build.

## 12. For Phase 4B

What is there to build on:

- `users.tour_state`, with its four values and CHECK, `not_offered` for every account, grandfathered ones included. Nothing reads or writes it. `tourStates` and `TourState` are in `src/features/onboarding/model.ts`.
- `onboarding_status` tells an account that just finished setup (`completed`, with `onboarding_completed_at`) from one that never went through it (`grandfathered`), which is what deciding whom to offer the tour to needs.
- `finishOnboarding` lands on `/dashboard` and offers nothing. The dashboard is where an invitation belongs.
- Settings, Appearance & Experience, has the "Account setup" block; a restart control belongs beside it.
- The pattern for a lifecycle write: one `UPDATE` on the caller's own row with its conditions in the WHERE clause, behind an action that takes the account from the session (`onboarding.ts`, `actions.ts`).

What 4B has to decide, and nothing here assumes:

- Whether grandfathered accounts are offered the tour, or only find it in Settings.
- Which transitions of `tour_state` are allowed (for instance whether `dismissed` can return to `offered`), and whether a restart is a state or just a replay.
- Which access level the tour's actions need. A tour runs for an account that has finished setup, so `authorize("active")` should do; `"account"` is for setup alone.

## Process

One Git command that changes state was run, by mistake: a `git stash` of one file, appended to a test command. It held only this phase's 16-line change to `church-ministry-settings.tsx`; it was undone at once with `git stash pop`, and the stash list, `HEAD`, and the working tree were confirmed as they had been. No commit, stage, branch, push, or pull was made. No package was installed. No server was left running: the only servers were Playwright's own, on port 3100, which it stopped. Prettier was run with `--write` only on named files this phase wrote or edited. The development database was changed only as section 9 says.
