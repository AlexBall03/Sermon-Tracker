# Handoff: Phase 2F.3 — Expanded profile and preaching-class preference

12 October 2026. One migration (`0012_profile_and_preaching_class`), three columns on `users`, no new table, no new package. **Status: implemented; targeted tests, type checking, lint, formatting, and a production build pass; the whole unit suite and the end-to-end suite were not run, and nothing was seen in a signed-in browser (section 7).** Migration applied to development only. Not deployed.

## 1. What was implemented

- Settings (`/settings`) in five sections: Personal Information, Church & Ministry, Bible & Language, Appearance & Experience, Account. Every control that existed is still there; none was rebuilt.
- An optional **church name** and **ministry role**, each a line of the person's own words, saved on the account, editable and clearable.
- A switch, **I attend preaching class**, off for every account until chosen, saved on the account.
- That preference connected to the one preaching-class-specific thing the application has: the Preaching Class context suggestion.

Nothing of Phase 3 or Phase 4 was built: no onboarding, tour, redirect, or completion flag, and no account deletion or export.

## 2. What the inspection found

- The "Profile page" is `/settings`. Identity (name, picture, emails, password, connections, sessions) is Clerk's, reached through the existing forms.
- The only preferences on the account were `users.locale` and `users.bible_translation`, behind `getPreferences()`. The theme, the reader's copy shortcut, and the library's card or list view are kept in the browser.
- **No preaching-class feature existed beyond one suggestion.** "Preaching Class" is one of five suggested preaching contexts, offered as a chip in the record form (`ReferenceField`) and in the contexts dialog (`ReferenceManager`). There is no preaching-class format, filter, label, or page.

## 3. Data model

| Column                    | Type      | Rule                                               |
| ------------------------- | --------- | -------------------------------------------------- |
| `church_name`             | `text`    | Nullable; 1 to 120 characters once trimmed (CHECK) |
| `ministry_role`           | `text`    | Nullable; 1 to 80 characters once trimmed (CHECK)  |
| `attends_preaching_class` | `boolean` | Not null, default `false`                          |

On `users`, beside the language. Nothing is copied to Clerk, and the name is not copied from it. Existing accounts read as no church, no role, not attending. `users.updated_at` moves on a save, as it does for a language change; no idea, occasion, venue, or context is written.

## 4. Service and action (`src/features/preferences`)

- `model.ts`: `profileLimits`.
- `schemas.ts`: `profileSchemas(locale).profileUpdate`. A field left out is left alone; null or a blank clears a line; text is trimmed and its inner whitespace reduced; `attendsPreachingClass` must be a real boolean; unknown fields (an account ID, a role) are dropped; an input with none of the three is refused. No server code, so a browser form parses with it too.
- `preferences.ts`: `storedProfile(user)` and `saveProfile(db, userId, patch)`, one `UPDATE` on the caller's row.
- `actions.ts`: `updateProfile(input)`, the one server action: `authorize("active")`, the account from the session, messages in the account's language, `revalidatePath("/", "layout")`.
- `resolve.ts` / `current.ts`: `getPreferences().attendsPreachingClass`. The Spanish switch does not touch it.
- `client.tsx`: `PreachingClassProvider` in the `(app)` shell and `useAttendsPreachingClass()`, false without a provider.

## 5. What the preference does, and does not

**Does:** `suggestedContextOptions(locale, { attendsPreachingClass })` leaves the Preaching Class suggestion out when it is off. That is the one place the rule is written.

**Does not:**

- Create a context, an occasion, or an idea when switched on, for any account.
- Delete, rename, or hide anything when switched off. A context named "Preaching Class" that an account already has is still listed, chosen, filtered by, and managed, and what was preached in it is still in the record.
- Stop anyone writing "Preaching Class" as their own context.
- Change a status, a format, a sermon type, or any access. It is independent of the ministry role, which is independent of `users.role`.

## 6. Interface and localization

- `src/components/ui/switch.tsx` (new): a `button role="switch"` whose whole row is the control, with its label and description read with it. Emerald only when on.
- `ChurchMinistrySettings` (new): the two lines in one small form with Save, validated in the browser for quick feedback and again on the server; the switch saves the moment it is pressed, shows at once, and is put back with the reason if the server refuses or cannot be reached.
- Bible & Language holds two blocks: "Language and translation" (on the account) and "Bible reader" (on this device). Account holds "Your access" (read-only) and then password, connected accounts, and devices.
- The library's card or list view was left in the library: a second control here would duplicate it.
- English and Spanish in the `settings` dictionary: the section names and descriptions, four block names, and `ministry.*`. The Spanish wording is the agent's and was not seen on screen.
- A narrow change outside the page: the administrator's directory passed whole `users` rows to the browser, so `withIdentities` (`src/features/admin/clerk.ts`) now names the columns it sends and leaves the three profile fields out.

## 7. Verification

| Check                                                           | Result                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`                                             | **Pass**                                                                      |
| ESLint on the changed source files                              | **Pass**                                                                      |
| `prettier --check` on the changed files                         | **Pass**, read without regard to line endings (see below)                     |
| Targeted Vitest run (files below)                               | **Pass**: 23 files, 258 tests                                                 |
| `npm run build`                                                 | **Pass**, once; "not a production deployment, migrations skipped"             |
| `npm run db:status` before                                      | 12 applied, 1 pending (`0012_profile_and_preaching_class`); stamp development |
| `npm run db:migrate:dev`                                        | "applied 1 migration(s) to development"                                       |
| `npm run db:status` after                                       | 13 applied, 0 pending                                                         |
| The whole unit suite                                            | **Not run**                                                                   |
| `npx playwright test`                                           | **Not run**                                                                   |
| A signed-in browser, phone width, dark theme, Spanish on screen | **Not done**                                                                  |
| Phase 2F.2's Related Ideas in a signed-in browser               | **Not done**; still outstanding                                               |

Formatting: this checkout has CRLF line endings and Prettier expects LF, so a plain `prettier --check` flags files nobody touched. The changed files were checked with `--end-of-line auto` and pass. `drizzle/meta/_journal.json` is as Drizzle wrote it and did not pass before this phase either.

Test files run: everything in `src/features/preferences` (with the new `profile.test.ts`), `src/features/settings` (with the new `components/church-ministry-settings.test.tsx`), `src/app/(app)/settings`, `src/features/preaching/components`, `src/features/preaching/schemas.test.ts`, `src/i18n`, `src/features/admin`, and `src/features/auth`. The first run had one failure, in the new `profile.test.ts`: the test read `createOccurrence`'s result by the wrong field. The test was corrected; the code under test was not changed.

What the tests show, the database ones against an in-memory PostgreSQL running the committed migrations:

- A new account has no church, no role, and does not attend preaching class.
- Church name and ministry role are saved, tidied, changed one at a time, and cleared with null, an empty string, or blanks; a field left out is left alone; any words are taken for a role and the account's `role` does not move.
- Too long, not text, an empty input, and a non-boolean for the switch are refused and nothing is saved; refusals are said in the account's language; the table itself refuses a blank or over-long line.
- The switch is turned on and off and found again; the Spanish switch does not change it; it and the ministry role do not affect each other.
- With a sermon, a "Preaching Class" context, and an occasion recorded in it, switching the preference on and then off leaves every row of `preaching_contexts`, `preaching_occurrences`, and `ideas` exactly as it was; an account with no contexts gets none by switching it on.
- A signed-out or disabled caller is refused; an input naming another account's ID, a role, a status, a language, and a translation changes only the caller's three fields, and the other account's row is identical afterwards.
- The suggestion is absent by default and present with the preference, in the record form and the contexts dialog, in both languages; the name can still be typed; the account's own contexts are listed either way.
- The page: the five regions in order, in English and Spanish; the saved values shown; the language, translation, and copy shortcut together; no control over role or status.
- The form: starts from what is saved, saves both lines tidied, clears an emptied line, says what is wrong beside the line without sending, keeps what was typed on a refusal, saves the switch alone, puts it back on a refusal or a lost connection, and is in Spanish.

**Why not the whole unit suite.** The owner asked that it not be repeated without need. What this phase shares with the rest is the `users` table (three columns added, nothing altered), the `(app)` layout (one provider added), and the `settings` dictionary; the tests of each area that reads them were run, and type checking covers every caller. `ARCHITECTURE.md` does name a migration and a layout change as reasons for a whole run, so it is the right check before release.

**Why no end-to-end run.** As in Phases 2F.1 and 2F.2: the suite has not run since the routes moved in Phase 2E.2, no journey for this phase was written, and no signed-in browser session was available to the agent.

### Database and deployment

| Fact                                                | State                                     |
| --------------------------------------------------- | ----------------------------------------- |
| Migration `0012` applied to development             | Yes                                       |
| Migration `0012` applied to production or preview   | **No**                                    |
| Migrations `0009`, `0010`, and `0011` in production | **No**, as far as this repository records |
| Phase 2F.3 deployed                                 | **No**                                    |

A release from here applies `0009` through `0012` together during the production build.

## 8. Known limitations

- **Not seen in a signed-in browser.** The new section's layout at phone and desktop widths, the switch in both themes (its thumb and track colors were chosen from the tokens by reading them, not by looking), and the Spanish strings were not looked at on screen.
- **The older Clerk forms are still in English**: name, email addresses, password, connected accounts, devices, and the loading text around them. That was so before this phase and is listed in the roadmap; a Spanish reader sees Spanish headings over English forms in Personal Information and Account.
- **The name is first and last name, as Clerk holds them**, not a single display-name field.
- **`withIdentities` has no test of its own.** That it leaves the profile fields out is held by its return type and by naming each column.
- **An account that had the preference off and already made a "Preaching Class" context** sees no difference at all, which is intended; an account with it off that has none simply is not offered the chip.
- Carried and unchanged: the end-to-end suite, the signed-in browser pass for Phase 2E.2 onward, and Phase 2F.2's Related Ideas check are outstanding.

## 9. For the owner

1. Review and commit (`AGENTS.md` included).
2. Signed in to development, on Settings: save a church and a role, clear one, try a very long role; turn the switch on, open "Record preaching" on a sermon, press the plus beside Context, and see Preaching Class suggested; turn it off and see it gone, with any context you already made still in the list. Then phone width, the dark theme, and Spanish.
3. Before release: the whole unit suite once, and the end-to-end suite or the manual list in `docs/HANDOFF-2E.2.md`.

## 10. Readiness for onboarding (Phase 4)

What is ready to reuse:

- `profileSchemas(locale).profileUpdate` validates any subset of the three fields, in the browser and on the server, in either language.
- `updateProfile` saves any subset, so a setup step can send one field or all three. `setLocale` and `setBibleTranslation` already do the same for the other two preferences.
- `storedProfile(user)` and `getPreferences()` give a form its starting values. `ChurchMinistrySettings` and `Switch` take plain props and could be shown outside Settings.
- Defaults need no setup: an account that has said nothing has nulls and false.

What Phase 4 still has to decide, and nothing here assumes:

- How an account is known to have finished (or skipped) setup. No column for it was added, on purpose; existing accounts must not be sent through it by a default.
- Where the check lives. The proxy is routing only, and every page authorizes itself, so a redirect belongs with `requireActiveUser`'s callers, not in the proxy.
- Whether the name and picture are asked for there; they are Clerk's and go through the existing forms.
- Where the tour is restarted from (Settings has room in Appearance & Experience).

## 11. Readiness for Phase 3

Ready to plan. Nothing in this phase touches ideas, relations, or the preaching record's data, and Phase 3 does not depend on the profile. Two things carried forward from Phase 2F.2 still hold: outline entries are a table of their own with order and parent, naming a point's idea directly, and `sermon_points` should not grow into it. One thing from this phase: if the outline page ever shows something meant for preaching class, it asks `useAttendsPreachingClass()` / `getPreferences()` and only suggests; it does not restrict.

## Process

No Git command that changes anything was run (`git diff --stat`, `git status`, and `git show` were used to read). No server was started. No package was installed. The development database was changed only by `npm run db:migrate:dev` applying `0012`. Production and preview were not touched.
