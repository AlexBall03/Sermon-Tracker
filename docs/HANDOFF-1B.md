# Phase 1B Handoff — Database, Authentication & Administration

Written 9 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) is the technical reference; [DATABASE.md](DATABASE.md) and [ENVIRONMENTS.md](ENVIRONMENTS.md) cover migrations and setup.

## Status in one paragraph

All Phase 1B code is written and passes lint, type checking, unit tests, a production build, and end-to-end tests. **None of it has been run against a real Clerk instance or a real Neon database**, because no credentials were available. Sign-in, Google sign-in, invitation emails, the admin screens with live data, and the migration commands against Neon are unverified until the setup checklist in ENVIRONMENTS.md is completed.

## 1. What was implemented

- **Database layer**: Drizzle schema (`users`), server-only connection, first migration (`drizzle/0000_create_users.sql`).
- **Migration tooling**: `scripts/db/cli.mjs` (`migrate`, `stamp`, `status`) with the identity guard in `scripts/db/guard.mjs`. `npm run dev` migrates development first and aborts on failure.
- **Clerk**: provider in the root layout, `src/proxy.ts`, `/sign-in`, `/accept-invitation`, `/access-denied`, appearance mapped to the design tokens.
- **Provisioning and authorization**: `src/features/auth/` (`provisionUser`, `getAccess`, `requireActiveUser`, `requireAdmin`, `authorize`).
- **Administration**: `/admin` with user counts, user directory, role and status changes, and invitations (send, list pending, resend, revoke).
- **Authenticated shell**: `(app)` layout, `AppHeader` with mobile panel and account menu, loading and error states, placeholder `/dashboard`.
- **shadcn primitives** added and restyled: `alert-dialog`, `dropdown-menu`, `input`, `label`.

Dependencies added: `@clerk/nextjs`, `drizzle-orm`, `@neondatabase/serverless`, `server-only`; dev: `drizzle-kit`, `@electric-sql/pglite`.

## 2. Architecture changes

- New: `src/proxy.ts`, `src/db/`, `src/features/auth/`, `src/features/admin/`, `src/app/(app)/`, `scripts/db/`, `drizzle/`.
- `src/lib/env.ts` validates the Clerk and database variables and holds `isAuthConfigured()` and `requireDatabaseUrl()`.
- `src/lib/site.ts` gained `acceptInvitation`, `accessDenied`, and `appRoutes`.
- The interim `/sign-in` page was replaced by `sign-in/[[...sign-in]]/page.tsx`.
- No webhook, no route handlers, no new services.

## 3. Database schema

`users`: `id` (uuid PK), `clerk_user_id` (unique), `role` (`admin` | `user`), `status` (`active` | `disabled`), `created_at`, `updated_at`. Role and status are enforced by CHECK constraints. No other tables.

## 4. Authentication flow

1. The proxy sends guests on application paths to `/sign-in` and signed-in visitors on `/`, `/sign-in`, `/accept-invitation` to `/dashboard`.
2. Sign-in is Clerk's component with sign-up switched off. Account creation happens only at `/accept-invitation`, which shows Clerk's form only when the visitor arrives with an invitation ticket.
3. On the first signed-in request the application creates the user row if the identity is authorised (invited through this application, or the configured initial administrator).
4. Registration is closed at the provider by Clerk's **Restricted** sign-up mode. This is a dashboard setting and is not yet applied.

## 5. Authorization design

- Roles and status live only in PostgreSQL and are read on every request.
- Pages call `requireActiveUser()` / `requireAdmin()`; server actions call `authorize()`. The proxy is routing only.
- A disabled account is denied even with a valid Clerk session, and signing in never re-enables it.
- Initial administrator: the exact Clerk ID in `INITIAL_ADMIN_CLERK_USER_ID`, promoted at row creation or while no administrator exists. Never by email, never from request input.

## 6. Administration capabilities

- Counts: total, active, disabled users (database); pending invitations (Clerk, shown as "Unavailable" if Clerk cannot be reached).
- Users: name and email (from Clerk), role, status, date added. Make administrator / standard user, disable / re-enable, each behind a confirmation dialog, with the result announced in a status line.
- Invitations: invite by email, pending list, resend, revoke (confirmed).
- Safeguards: administrator-only on the server; Zod validation; an administrator cannot change their own account; the last active administrator cannot be demoted or disabled (checked inside a locked transaction). No account deletion.

## 7. Migration commands and safeguards

`npm run dev`, `dev:next`, `db:generate`, `db:migrate:dev`, `db:migrate:prod`, `db:status`, `db:stamp`. Details and the refusal table are in [DATABASE.md](DATABASE.md). In short: a command runs only when its target, `DATABASE_ENVIRONMENT`, and the stamp stored inside the database all agree; production uses a separate variable (`PRODUCTION_DATABASE_URL`) and a typed confirmation; nothing migrates on Vercel.

## 8. Environment variables

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `DATABASE_ENVIRONMENT`, `INITIAL_ADMIN_CLERK_USER_ID`, and (workstation only) `PRODUCTION_DATABASE_URL`. See [ENVIRONMENTS.md](ENVIRONMENTS.md).

## 9. Testing results

| Check                                           | Result                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run lint`                                  | Pass                                                                                 |
| `npm run typecheck`                             | Pass                                                                                 |
| `npm run format:check`                          | Pass                                                                                 |
| `npm run test`                                  | 68 of 68 pass (12 files)                                                             |
| `npm run build`                                 | Pass without credentials; `/` static, `/dashboard` and `/admin` rendered per request |
| Build with placeholder Clerk keys               | Pass (compilation and prerendering only; the keys are not real)                      |
| `npm run test:e2e`                              | 35 pass, 1 skipped (mobile-menu test on desktop), desktop + mobile                   |
| `npm run db:migrate:dev` with no `DATABASE_URL` | Refuses with instructions, exit code 1                                               |

What the tests are:

- **Real PostgreSQL semantics, in memory (PGlite), using the committed migration**: unique Clerk ID, CHECK constraints, idempotent provisioning, uninvited identity creates no row, disabled account not re-enabled, initial-administrator rules, last-active-administrator protection, user counts.
- **Mocked Clerk**: `getAccess` and the `require…` helpers (signed out, uninvited, disabled, standard user versus admin); server actions (signed-out and standard-user callers rejected, forged self-promotion rejected, invalid role, status, ID, and email rejected).
- **Pure logic**: the migration guard matrix, credential masking, environment validation, database/deployment separation.
- **Components (jsdom)**: application bar links by role and labelled controls; users table content and action buttons.
- **Playwright, guest only**: application paths redirect to sign-in, no open sign-up form, access-denied page in both themes, `robots.txt`, plus the existing public and theme specs.

Not tested, and not claimed:

- Any real Clerk sign-in, Google OAuth, invitation email, or invitation acceptance.
- Clerk's appearance mapping as actually rendered. It type-checks, but the sign-in form has not been seen in a browser.
- The admin page, dashboard, application bar, account menu, and dialogs rendered in a browser while signed in (light or dark, desktop or mobile).
- Any connection to Neon, including the `migrate`, `stamp`, and `status` commands end to end. Their decision logic is unit tested; their SQL has not run.
- Concurrent transactions. PGlite is a single connection, so the advisory lock is exercised but not contended.
- Safari and Firefox.

## 10. Security considerations

- No secrets in the repository; `.env.example` has names only. `.env*` is git-ignored except the example.
- Connection strings are stripped from command output and logged errors.
- Server actions never return provider or database error text to the browser; they return fixed messages.
- Invitation metadata (`appAccess`) is Clerk public metadata: readable by the signed-in user, writable only with the secret key.
- Return URLs after sign-in are produced and validated by Clerk; the application defines no redirect parameter of its own.
- `npm audit` reports 9 high-severity advisories in the dependency tree after the installs. They were not triaged in this phase.
- npm reported install scripts not covered by `allowScripts` (`esbuild`, `unrs-resolver`). `drizzle-kit generate` worked regardless.

## 11. Remaining setup (owner)

In order; details in [ENVIRONMENTS.md](ENVIRONMENTS.md):

1. Create the Clerk application; enable email + password and Google.
2. Set **Restricted** sign-up mode in each Clerk instance.
3. Create the Neon project with `production` and `development` branches.
4. Fill in `.env.local`; run `npm run dev` (stamps and migrates development).
5. Create your Clerk user, set `INITIAL_ADMIN_CLERK_USER_ID`, sign in, open `/admin`.
6. Work through the verification list in ENVIRONMENTS.md step 10, and look at the Clerk forms in both themes. Adjust `src/lib/clerk-appearance.ts` if anything clashes.
7. For production: Clerk production instance and DNS, own Google OAuth client, Vercel variables per scope, `db:stamp -- prod`, `db:migrate:prod`.

## 12. Known limitations

- **Clerk styling is unseen.** Expect small adjustments once it renders.
- **Resend** creates a second invitation and then revokes the first. If the revoke fails, both remain pending until one is revoked by hand.
- **Disabling** blocks access through the database check; it does not end the person's Clerk session.
- **Deleted Clerk identities** leave their application row, labelled in the directory. There is no cleanup.
- **Users created directly in the Clerk dashboard** are denied unless they are the initial administrator or have `appAccess: true` added to their public metadata.
- **Directory and invitation lists are not paginated** in the interface. The invitation list reads the first 100 pending invitations.
- **Preview deployments share the development database and Clerk instance.**
- **Names on the dashboard** come from a Clerk API call on each visit to that page.
- **Line endings**: Prettier rewrote some existing files with LF endings, so `git status` may list files whose content did not change.
- The limitations in [HANDOFF-1A.1.md](HANDOFF-1A.1.md) still stand.

## 13. Readiness for Phase 1C

Ready to start once the live check in section 11 passes. Phase 1C builds on:

- `requireActiveUser()` for every new page, and `authorize("active")` for every new server action.
- `users.id` as the owner key for future tables.
- `AppHeader` for navigation; `appLinks()` is where new destinations are added, and the space before the theme control is reserved for quick capture.
- `src/app/(app)/dashboard/page.tsx` as the page to replace.

## Process cleanup

The only server started was Playwright's managed production server on port 3100, which stopped with its run. Nothing is listening on 3000, 3100, or 3200. No dev server was started. No Git state-changing commands were run.
