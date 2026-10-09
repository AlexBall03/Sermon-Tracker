# Database

**Nothing here is implemented yet.** Database work begins in Phase 1B. This document records the agreed direction so later phases follow it consistently.

## Stack

- Neon PostgreSQL
- Drizzle ORM, with the schema defined in TypeScript in this repository
- Migrations generated from schema changes by Drizzle Kit and committed to the repository

Routine schema changes never require hand-editing SQL in the Neon console.

## Migration convention

### Development

`npm run dev` will check for pending migrations, apply them to the **development** database, and then start the Next.js dev server. Pulling a branch with new migrations and running `npm run dev` is enough to be up to date.

Workflow for a schema change:

1. Edit the Drizzle schema.
2. Generate a migration.
3. Review and commit the generated SQL with the schema change.
4. `npm run dev` applies it locally.

### Production

- Production migrations are a deliberate, separate step.
- They **do not** run during the Vercel build.
- No GitHub Actions or other CI is involved.

### Safeguards

Development migration tooling must refuse to run against production. At minimum:

- Each environment has its own Neon branch/database and its own connection string.
- The dev migration script checks the target before connecting and aborts if it resolves to the production database or if `VERCEL_ENV` is `production`.
- Running production migrations requires an explicit, differently named command and an explicit confirmation.

Phase 1B implements these scripts. Do not add placeholder migration commands before then.

## Data model direction

See "Domain decisions" in [ARCHITECTURE.md](../ARCHITECTURE.md) for the reasoning. In outline:

- **Ideas** — one table for sermon ideas, point ideas, and undecided ideas, distinguished by type and owned by a user.
- **Sermon-point associations** — a join table between a sermon idea and a point idea, carrying order, optional parent (subpoints), sermon-specific wording and notes, and Scripture overrides. The point remains an independent record.
- **Outline sections** — optional introduction and optional conclusion belong to the sermon, not to point records.
- **Preaching occurrences** (Phase 3) — when, where, and in what context a sermon was preached, with user-configurable venues and contexts.

Conventions to adopt from the first migration:

- UUID primary keys that can be generated on the client, for later offline capture.
- `created_at` and `updated_at` on every table.
- Every user-owned row carries the owner's ID, and every query filters by it.

Table and column definitions are decided in the phase that builds them.
