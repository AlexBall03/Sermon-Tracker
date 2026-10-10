# Sermon Tracker

**Capture. Develop. Preach.**

Sermon Tracker is a web application for preachers to capture, organise, develop, and preserve sermon ideas. Its purpose is idea tracking, not manuscript writing.

Production domain: [sermontracker.com](https://sermontracker.com)

## Status

**Phase 1B implemented:** database, invitation-only authentication, administration, and the authenticated shell, on top of the Phase 1A foundation and landing page. Idea tracking has not started. See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/HANDOFF-1B.md](docs/HANDOFF-1B.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui · Clerk · Neon PostgreSQL · Drizzle ORM · Zod · Vitest · Playwright · npm · Vercel

## Getting started

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env.local   # then fill in development values
npm run dev                  # migrates the development database, then http://localhost:3000
```

`npm run dev` needs a development database and Clerk keys; [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) has the setup checklist. To work on the interface without them, use `npm run dev:next`.

## Commands

| Command                   | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Apply development migrations, then start the dev server       |
| `npm run dev:next`        | Dev server only, no database                                  |
| `npm run db:generate`     | Generate a migration from schema changes                      |
| `npm run db:migrate:dev`  | Apply pending migrations to development                       |
| `npm run db:migrate:prod` | Apply pending migrations to production (asks to confirm)      |
| `npm run db:status`       | Show target, stamp, and pending migrations                    |
| `npm run db:stamp`        | Identify a database as development or production              |
| `npm run build`           | Production build; on Vercel production, then migrates it      |
| `npm run start`           | Serve the production build                                    |
| `npm run lint`            | ESLint                                                        |
| `npm run typecheck`       | Generate route types, then `tsc --noEmit`                     |
| `npm run format`          | Prettier (with Tailwind class sorting)                        |
| `npm run test`            | Unit and component tests (Vitest)                             |
| `npm run test:e2e`        | End-to-end tests (Playwright; builds and serves on port 3100) |
| `npm run brand:assets`    | Regenerate raster icons and the share image from the SVG mark |

First-time Playwright setup: `npx playwright install chromium`.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — technical source of truth: structure, design system, routing, domain decisions
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases and current status
- [docs/DATABASE.md](docs/DATABASE.md) — database direction and migration convention
- [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) — environments, variables, secrets
- [docs/HANDOFF-1B.md](docs/HANDOFF-1B.md) — Phase 1B handoff, remaining setup, and Phase 1C readiness

## Branches

`master` is production. `dev` is development.
