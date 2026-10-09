# Environments

This repository is public. Never commit real credentials, in any file.

## Environments

| Environment | Where                      | Git branch         | Clerk instance | Database           |
| ----------- | -------------------------- | ------------------ | -------------- | ------------------ |
| Development | Local machine              | any                | Development    | Neon `development` |
| Preview     | Vercel preview deployments | `dev`, PR branches | Development    | Neon `development` |
| Production  | Vercel, sermontracker.com  | `master`           | Production     | Neon `production`  |

Preview deployments share the development Clerk instance and database. They never receive production credentials, and they never run migrations: the development database is migrated by `npm run dev` on a workstation.

Preview deployments are never indexed: when `VERCEL_ENV` is set and is not `production`, the site sends `noindex` and `robots.txt` disallows everything.

## Variables

| Variable                            | Exposure    | Used by              | Notes                                                   |
| ----------------------------------- | ----------- | -------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser     | App                  | `pk_test_…` for development, `pk_live_…` for production |
| `CLERK_SECRET_KEY`                  | Server only | App                  | `sk_test_…` / `sk_live_…`                               |
| `DATABASE_URL`                      | Server only | App, dev migrations  | Neon **pooled** connection string                       |
| `DATABASE_ENVIRONMENT`              | Server only | App, dev migrations  | `development` or `production`; must match the database  |
| `INITIAL_ADMIN_CLERK_USER_ID`       | Server only | App                  | `user_…` of the first administrator, per Clerk instance |
| `PRODUCTION_DATABASE_URL`           | Workstation | `db:*` prod commands | Never set in Vercel or `.env.local`                     |
| `VERCEL_ENV`                        | Server only | App                  | Provided by Vercel                                      |

All are optional when the application is built: without Clerk keys the public site still works, `/sign-in` says authentication is not configured, and application routes redirect there. `npm run dev` does require the database variables; use `npm run dev:next` to work on the interface without them.

## Rules

- Local values go in `.env.local`, which is git-ignored. `.env.example` lists variable names only.
- Set deployed values in Vercel's project settings, scoped separately. Production secrets are not shared with Preview.
- Only variables prefixed `NEXT_PUBLIC_` may reach the browser.
- Add every new variable to the Zod schema in `src/lib/env.ts` and read it from there.
- Do not paste secrets into documentation, tests, fixtures, issues, or commit messages.

## Setup checklist

Steps marked **dashboard** cannot be done from the repository. Dashboard menu names are as they were when this was written and may have moved; the setting names are what matter.

### 1. Clerk instances (dashboard)

Create one Clerk application. It starts with a **Development** instance; create the **Production** instance when you are ready to deploy (it needs the `sermontracker.com` domain and the DNS records Clerk lists).

In **each** instance:

- **Email address**: enabled, with password sign-in.
- **Paths**: sign-in URL `/sign-in`, sign-up URL `/accept-invitation`. (The application also sets these itself.)

### 2. Invitation-only registration (dashboard)

In each instance: **Configure → Restrictions → Sign-up mode → Restricted**.

This is what actually prevents registration. In Restricted mode Clerk rejects any sign-up, by password or by Google, that does not come from an invitation. The application adds a second check of its own: it admits only identities carrying the metadata its invitations attach (see "Authentication and authorization" in ARCHITECTURE.md).

Do not rely on the absence of a sign-up link. Confirm the mode is set in both instances.

### 3. Google sign-in (dashboard)

**Configure → SSO connections → Add connection → Google**.

- Development: Clerk's shared credentials work as they are.
- Production: Clerk requires your own Google OAuth client. Create it in Google Cloud Console (OAuth consent screen, then an OAuth client ID of type Web application), add the redirect URI Clerk displays, and paste the client ID and secret into Clerk.

With Restricted mode on, a Google account that has not been invited cannot create an account.

### 4. Neon branches (dashboard)

Create one Neon project. Keep the default branch as **production** and create a second branch named **development**. Create the development branch before production holds real data, or expect to relabel it (see "How a database is identified" in [DATABASE.md](DATABASE.md)).

### 5. Connection strings (dashboard)

For each branch, copy the **pooled** connection string from Neon's Connect panel (the host contains `-pooler`).

### 6. Local `.env.local`

```bash
cp .env.example .env.local
```

Fill in the development Clerk keys, the development branch URL, and `DATABASE_ENVIRONMENT=development`. Leave `INITIAL_ADMIN_CLERK_USER_ID` empty until step 8. Then:

```bash
npm run dev
```

The first run stamps the empty development database and applies the migrations.

### 7. Vercel variables (dashboard)

| Variable                            | Production scope    | Preview scope        |
| ----------------------------------- | ------------------- | -------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production instance | Development instance |
| `CLERK_SECRET_KEY`                  | Production instance | Development instance |
| `DATABASE_URL`                      | Production branch   | Development branch   |
| `DATABASE_ENVIRONMENT`              | `production`        | `development`        |
| `INITIAL_ADMIN_CLERK_USER_ID`       | Production user ID  | Development user ID  |

Do not add `PRODUCTION_DATABASE_URL` to Vercel. If the Neon–Vercel integration is installed, check that it has not set a production `DATABASE_URL` on the Preview scope.

### 8. First administrator

Clerk user IDs differ between instances, so do this once per instance.

1. In the Clerk dashboard, **Users → Create user** (or invite yourself from **Users → Invitations**) and sign up.
2. Open the user and copy the **User ID** (`user_…`).
3. Set `INITIAL_ADMIN_CLERK_USER_ID` to it (`.env.local`, and the matching Vercel scope; redeploy).
4. Sign in. Your application account is created as an administrator.

Rules: only that exact Clerk ID is ever bootstrapped; it happens when the account row is first created, or later only while the application has no administrator at all; it never overrides a role another administrator has since set. The variable can stay set. Everyone else is invited from `/admin`.

### 9. Production database

```bash
PRODUCTION_DATABASE_URL="…" npm run db:stamp -- prod      # once
PRODUCTION_DATABASE_URL="…" npm run db:migrate:prod       # before each release with migrations
```

See [DATABASE.md](DATABASE.md) for the safeguards and deployment ordering.

### 10. Verify a deployment

- [ ] `/` loads signed out; `/dashboard` and `/admin` redirect to `/sign-in`.
- [ ] `/accept-invitation` without a link shows "An invitation is required".
- [ ] Signing up with an uninvited email, and with an uninvited Google account, is rejected by Clerk.
- [ ] The initial administrator signs in, lands on `/dashboard`, and can open `/admin`.
- [ ] Inviting an address from `/admin` sends an email; the link opens `/accept-invitation` and completes sign-up; the new person appears in the user list as a standard user.
- [ ] A standard user visiting `/admin` sees "You do not have access".
- [ ] Disabling a user locks them out on their next request; re-enabling restores access.
- [ ] Resend and revoke work on a pending invitation.
- [ ] Sign out returns to `/`; signed in, `/` and `/sign-in` redirect to `/dashboard`.
- [ ] Light and dark themes on sign-in, dashboard, and admin, on a phone and a desktop.
