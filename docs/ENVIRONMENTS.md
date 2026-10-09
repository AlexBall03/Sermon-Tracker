# Environments

This repository is public. Never commit real credentials, in any file.

## Environments

| Environment | Where                      | Git branch         | Data (from Phase 1B)         |
| ----------- | -------------------------- | ------------------ | ---------------------------- |
| Development | Local machine              | any                | Development database         |
| Preview     | Vercel preview deployments | `dev`, PR branches | Preview/development database |
| Production  | Vercel, sermontracker.com  | `master`           | Production database          |

Preview deployments are never indexed: when `VERCEL_ENV` is set and is not `production`, the site sends `noindex` and `robots.txt` disallows everything.

## Variables

### Phase 1A

None are required. `VERCEL_ENV` is provided by Vercel automatically and read through `src/lib/env.ts`.

### Phase 1B (planned)

| Variable                            | Exposure    | Scope                                  |
| ----------------------------------- | ----------- | -------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser     | Separate values for dev and production |
| `CLERK_SECRET_KEY`                  | Server only | Separate values for dev and production |
| `DATABASE_URL`                      | Server only | A different database per environment   |

Exact names follow each provider's current documentation when they are added.

## Rules

- Local values go in `.env.local`, which is git-ignored. `.env.example` lists variable names with empty placeholders only.
- Set deployed values in Vercel's project settings, scoped separately to Development, Preview, and Production. Production secrets are not shared with Preview.
- Only variables prefixed `NEXT_PUBLIC_` may reach the browser. Everything else stays server-side.
- Add every new variable to the Zod schema in `src/lib/env.ts` and read it from there, so a missing or malformed value fails fast.
- Do not paste secrets into documentation, tests, fixtures, issues, or commit messages.
