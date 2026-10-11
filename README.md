# Sermon Tracker

**Capture. Develop. Preach.**

Sermon Tracker is a web application for preachers to capture, organise, develop, and preserve sermon ideas. Its purpose is idea tracking, not manuscript writing.

Production domain: [sermontracker.com](https://sermontracker.com)

## Status

**Implemented through Phase 2C.1B:** invitation-only accounts and administration; capturing, editing, tagging, searching, and filtering sermon and point ideas; the King James Bible to read, search, and copy from; and Scripture favorites and highlights, kept in the library's Saved Scripture section. Attaching Scripture to ideas from the reader (2C.1C) is next. See [docs/ROADMAP.md](docs/ROADMAP.md) for every phase and [docs/HANDOFF-2C.1B.md](docs/HANDOFF-2C.1B.md) for the latest.

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
- `docs/HANDOFF-*.md` — one per phase; the latest is [docs/HANDOFF-2C.1B.md](docs/HANDOFF-2C.1B.md)

## Branches

`master` is production. `dev` is development.
