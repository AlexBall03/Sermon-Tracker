# Phase 1C.1 Handoff — Dashboard, Custom Account Management & Navigation

Written 9 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference (see "Dashboard" and "Account management"); this is the summary.

## Status in one paragraph

`/dashboard` is now a real, personalised page and `/settings` is a first-party account-management interface that replaces Clerk's `UserProfile` modal. Clerk still does all identity work. Everything passes lint, type checking, unit tests, a production build, and the end-to-end suite. **No part of it has been exercised in a signed-in session or against live Clerk**: there were no test credentials, so the account operations are covered by mocked tests and the screens were reviewed with sample data. Phase 1C is not complete; 1C.2 remains.

## 1. What was implemented

**Dashboard**

- Welcome by first name, with "Welcome back" when there is no name or Clerk cannot be reached.
- An empty state where recent ideas will be listed.
- Shortcuts to Account settings and, for administrators only, Administration.
- The Capture → Develop → Preach workflow, and what a sermon idea, a point idea, and an undecided idea are.
- "At a glance": the four future figures as labels with a sentence each. No numbers, no zeros, no analytics link or route.
- Its own loading skeleton; the existing `(app)/error.tsx` covers errors.

**Settings**

- _Profile_: picture (upload, replace, remove), first and last name, email addresses (primary, verified and unverified states; add with an emailed 6-digit code, resend, make primary, remove).
- _Security_: change password with the current one, or set a first password on an account that signs in with Google; optional sign-out of other devices; connected accounts (connect, disconnect, blocked when it is the only way to sign in); signed-in devices with sign-out for the others.
- _Appearance_: the same Light / Dark control as the bar, plus "Use device setting".
- _Account_: role, status, and joining date, read-only.

**Navigation**

- Account menu and mobile panel: "Manage account" is now a **Settings** link to `/settings`. `openUserProfile` is no longer called anywhere.
- The account trigger shows the profile picture when there is one.
- Link row unchanged: Dashboard, and Admin for administrators. No links to pages that do not exist.

**Follow-up fixes after owner review**

- A button's leading icon no longer slides on hover. The nudge is now opt-in with `data-trailing` (set on the two landing-page arrows); before, it matched any icon whose label was plain text, including spinners.
- The mobile menus (public and application) animate out as well as in, through the shared `useNavPanel` hook. The bar stays opaque until the panel is gone.
- The current-page rule in the application bar sits just beneath the link's label instead of on the bar's bottom edge.

## 2. Architectural decisions

- **Custom interface, Clerk's engine.** No passwords, OAuth data, or verification state are stored or checked by the application. No schema change, no settings table, no API route, no new dependency.
- **Name changes run on the server** (`updateProfileName`): `authorize("active")`, Zod, and the Clerk ID from the session. There is no user ID parameter, and unknown fields are dropped.
- **Credential, email, OAuth, session, and picture changes run in the browser through Clerk's SDK.** This is deliberate: Clerk's Frontend API demands the current password, the emailed code, and reverification, while the Backend API (secret key) would let the server skip all three.
- **Reverification is Clerk's own dialog.** Every sensitive call is wrapped in `useReverification`; we did not build a custom challenge. This is the one Clerk-managed surface left in account management.
- **Clerk logic is separate from presentation**: `features/settings/hooks/` versus `features/settings/components/`.
- **Shared pieces moved out of `features/admin`** now that a second feature uses them: `Badge`, `ActionStatus`, `ConfirmDialog`, `formatDate`, `ActionResult`. The admin statistics strip became `StatStrip`. Behaviour is unchanged.
- **"Use device setting"** is new: it clears a manual theme choice (`setTheme("system")`). `ThemeToggle` itself is unchanged and there is still one store.

## 3. Important files

Added:

- `src/app/(app)/settings/page.tsx`, `loading.tsx`; `src/app/(app)/dashboard/loading.tsx`
- `src/features/dashboard/`: `greeting.ts`, `summary.ts`, `components/dashboard-view.tsx`, `workflow-overview.tsx`, `shortcut-link.tsx`
- `src/features/settings/`: `actions.ts`, `schemas.ts`, `clerk-errors.ts`, `hooks/*`, `components/*`
- `src/components/ui/`: `badge.tsx`, `avatar.tsx`, `stat-strip.tsx`, `action-status.tsx`, `confirm-dialog.tsx`
- `src/lib/action-result.ts`, `src/lib/format.ts`
- Tests beside the code (see section 4)

Modified: `dashboard/page.tsx`, `admin/page.tsx`, `components/layout/account-menu.tsx`, `app-header.tsx` (+ test), `features/admin/actions.ts`, `users-table.tsx`, `invitations-panel.tsx`, `lib/site.ts` (comment), `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/ENVIRONMENTS.md`, `AGENTS.md`.

Deleted: `features/admin/components/confirm-dialog.tsx` (moved).

## 4. Test results

| Check                  | Result                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run lint`         | Pass                                                                 |
| `npm run typecheck`    | Pass                                                                 |
| `npm run format:check` | Pass                                                                 |
| `npm run test`         | 123 of 123 pass (21 files; was 68 in 12)                             |
| `npm run build`        | Pass, as the first step of the end-to-end run, with local Clerk keys |
| `npm run test:e2e`     | 35 pass, 1 skipped (mobile-menu test on desktop), desktop + mobile   |

New and changed tests, **all with Clerk mocked**:

- Dashboard: refuses to render without an active account; name and both fallbacks; Administration shortcut only for administrators; no digits and no analytics link in "At a glance".
- Settings page: redirects when signed out or denied; four sections; the Account section has no controls.
- `updateProfileName`: signed-out and disabled callers rejected; invalid input rejected before Clerk is called; a submitted user ID, role, status, or metadata is ignored and the session's ID is used; a Clerk failure returns a fixed message.
- Schemas and error wording, including that provider text is never passed through.
- Forms: profile validation, success, and refusal; picture type check; password change, mismatch, OAuth-only "set a password", and Clerk's refusal in our words; email states, validation, add → code → verify, confirmed removal; connect, the only-sign-in-method block, confirmed disconnect.
- Navigation: Settings links to `/settings` from both menus, `openUserProfile` never called, sign-out and Escape still work, no future links.
- Theme: the settings control and the bar's control change together in both directions through one `localStorage` key; "Use device setting".
- End-to-end (guest only, unchanged): `/dashboard` and `/settings` send a guest to sign-in.

Visually reviewed in headless Chromium at 390, 768, 1280, and 1440, light and dark: the dashboard, settings, password form with errors, the code form, confirmation dialogs, the account menu, the mobile menu, keyboard focus, and theme sync. No horizontal overflow, no console errors, no control under 40px on a touch viewport. **This used a temporary route with sample data, since deleted, on the owner's running dev server.**

## 5. Security considerations

- Nothing new is stored. PostgreSQL still holds only `clerk_user_id`, role, status, and timestamps.
- The secret key is used only in `features/settings/actions.ts` (server). Browser code uses the signed-in session through Clerk's SDK.
- No action accepts a role, a status, or a user ID, so self-promotion and self-re-enabling are not expressible. Administration's own rules are untouched.
- The application's `disabled` status blocks the server action and every page. It does not stop a disabled person with a still-valid Clerk session from calling Clerk's Frontend API directly to change their own Clerk profile. That was already true (disabling does not revoke sessions; see HANDOFF-1B) and grants no access to the application.
- Clerk error text is never shown; codes map to fixed messages.
- Picture type and size are checked in the browser for feedback only; Clerk validates the upload.
- No public registration, no account deletion.

## 6. Known limitations

- **Provider list is a constant** (Google). Clerk's SDK has no public list of enabled providers. If Google is off in an instance, "Connect" reports that it could not be connected.
- **"Only way to sign in" is judged by password and connected accounts.** If an instance also allows sign-in by emailed code, the block is stricter than Clerk requires.
- **Unverified leftovers**: an abandoned Google connection shows as "Not finished" and can be removed. The reason Clerk gives for the failure is not shown.
- **Devices** uses Clerk's cached session list for the page's lifetime; reload to see a session created elsewhere.
- **The reverification dialog and any Clerk-hosted OAuth screens** are Clerk's, styled only as far as `clerk-appearance.ts` reaches.
- **Password rules** shown are ours (8–128 characters, confirmation). Clerk's instance policy may be stricter, in which case its refusal is shown in our words.
- **Line endings**: I ran `npm run format` once, which rewrote the working copy of many untouched files from CRLF to LF. `git diff` shows content changes in only the files listed above; the rest appear in `git status` until they are staged, exactly as noted in HANDOFF-1B.
- Limitations in the earlier handoffs still stand.

## 7. Unverified Clerk functionality

Written against the installed SDK's types (`@clerk/nextjs` 7.9.13) and tested only with mocks:

- `user.updatePassword`, with and without a current password, and `signOutOfOtherSessions`
- `user.createEmailAddress` → `prepareVerification({ strategy: "email_code" })` → `attemptVerification`, `update({ primaryEmailAddressId })`, `destroy`
- `user.createExternalAccount` and the redirect back to `/settings`; `externalAccount.destroy`
- `user.getSessions` and `session.revoke`
- `user.setProfileImage`, including removal with `null`
- `useReverification`: that Clerk's dialog appears, retries the call, and reports cancellation as expected
- The error codes in `clerk-errors.ts`. Any code that differs falls back to a generic message rather than failing.
- `clerkClient().users.updateUser` for names
- `/dashboard`, `/settings`, and the account menu in a real signed-in session, in any browser

## 8. Required external configuration

See [ENVIRONMENTS.md](ENVIRONMENTS.md) step 1: email verification by code, password sign-in, default permissions for adding and removing addresses and connected accounts, and reverification left on. Google as in step 3. No new environment variables.

## 9. Remaining for Phase 1C.2

1. Run the "Account management" checklist in ENVIRONMENTS.md step 10 on the development instance, then fix whatever live Clerk does differently (error codes and the reverification dialog's styling are the likeliest).
2. Complete the outstanding 1B live checks (sign-in, invitations, admin, migrations against Neon).
3. Look at the settings screens in a real session on a phone, and in Safari and Firefox.
4. Deployment and hardening, including the carried-over `NEXT_PUBLIC_CLERK_SIGN_IN_URL` routing note from 1B.1 and the untriaged `npm audit` advisories from 1B.

## Readiness

Ready for 1C.2. The code is complete for its scope and nothing is knowingly broken, but treat every account operation as unproven until step 1 above has been done.

## Process cleanup

No dev server was started: the owner's server on port 3000 was already running, was used for the visual review, and was left running. The only server started was Playwright's managed production server on port 3100, which stopped with its run (port confirmed free afterwards). Headless browsers were closed by their scripts. The temporary `src/app/design-preview/` route was deleted; the screenshot scripts lived outside the repository. No Git state-changing commands were run. The work was done on `master`, because that was the checked-out branch and switching is the owner's call; move it to `dev` before committing.
