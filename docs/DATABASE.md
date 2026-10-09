# Database

Neon PostgreSQL, accessed through Drizzle ORM. Implemented in Phase 1B.

## Layout

| Path                   | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `src/db/schema.ts`     | Tables, in TypeScript. The single place the schema is defined     |
| `src/db/index.ts`      | `getDb()`: the server-only connection (pooled WebSocket driver)   |
| `src/db/types.ts`      | `Database` type and log-safe error text                           |
| `src/db/testing.ts`    | In-memory PostgreSQL (PGlite) with the real migrations, for tests |
| `drizzle/`             | Generated SQL migrations and Drizzle's journal. Committed         |
| `drizzle.config.ts`    | Drizzle Kit configuration (generation only)                       |
| `scripts/db/cli.mjs`   | `migrate`, `stamp`, `status` commands                             |
| `scripts/db/guard.mjs` | The rules that decide whether a command may touch a database      |

The pooled WebSocket driver (`@neondatabase/serverless` `Pool`) is used rather than the HTTP driver because role and status changes need interactive transactions. Use Neon's **pooled** connection string.

## Schema

### `users`

One row per person allowed into the application. Clerk owns the identity; this table owns authorization.

| Column          | Type          | Notes                                             |
| --------------- | ------------- | ------------------------------------------------- |
| `id`            | `uuid`        | Primary key, `gen_random_uuid()`                  |
| `clerk_user_id` | `text`        | Not null, unique                                  |
| `role`          | `text`        | `admin` or `user` (CHECK), default `user`         |
| `status`        | `text`        | `active` or `disabled` (CHECK), default `active`  |
| `created_at`    | `timestamptz` | Default `now()`                                   |
| `updated_at`    | `timestamptz` | Default `now()`, set by the application on update |

Role and status are text with CHECK constraints, not PostgreSQL enums, so adding a value is an ordinary migration. Names and email addresses are not stored; they are read from Clerk when needed.

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (add `-- --name=short_description` to name the file).
3. Review the SQL in `drizzle/` and commit it with the schema change.
4. `npm run dev` applies it to the development database.

Never edit a migration that has been applied anywhere, and never use `drizzle-kit push`. Nothing is created by hand in the Neon console.

## Commands

| Command                   | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Applies pending migrations to the development database, then starts Next. Aborts if migration fails |
| `npm run dev:next`        | Starts Next without touching a database (interface work only)                                       |
| `npm run db:generate`     | Writes a migration from schema changes                                                              |
| `npm run db:migrate:dev`  | Applies pending migrations to development                                                           |
| `npm run db:migrate:prod` | Applies pending migrations to production, after confirmation                                        |
| `npm run db:status`       | Target, stamp, applied and pending migrations (`-- prod` for production)                            |
| `npm run db:stamp -- dev` | Identifies a database as development (`-- prod` for production)                                     |

## How a database is identified

A hostname or database name is not trusted to tell development from production. Instead each database says what it is.

- **The stamp.** A one-row table, `sermon_tracker_meta.environment`, holds `development` or `production`. It lives outside the schema Drizzle manages.
- **The declaration.** `DATABASE_ENVIRONMENT` sits beside `DATABASE_URL` and says what that URL is meant to be. The production command does not read `DATABASE_URL` at all; it reads `PRODUCTION_DATABASE_URL`.

A command runs only when the command's target, the declaration, and the stamp all agree. Anything else is refused and nothing is changed:

| Situation                                                    | Result                              |
| ------------------------------------------------------------ | ----------------------------------- |
| `npm run dev` with a production URL pasted into `.env.local` | Refused: stamp says `production`    |
| `DATABASE_ENVIRONMENT` missing                               | Refused                             |
| Database has tables but no stamp                             | Refused; run `db:stamp` once        |
| Brand-new, empty database used for development               | Stamped `development` automatically |
| Production command pointed at a development database         | Refused                             |
| Development command inside the production deployment         | Refused                             |
| Any production migration on Vercel                           | Refused                             |

A Neon branch created from production copies production's stamp, so it is refused for development until you run `npm run db:stamp -- dev --force` against it. That is deliberate: a copy of production data should be relabelled on purpose.

The running application applies the same idea (`requireDatabaseUrl` in `src/lib/env.ts`): the production deployment refuses a database declared as anything but `production`, and every other runtime refuses one declared `production`.

Connection strings are never printed. Commands show the host and database name only, and error text has connection strings removed.

## Production migrations

Production migrations never run during a Vercel build or at application start. They are run by hand from a workstation:

```bash
# one time, to identify the production database
PRODUCTION_DATABASE_URL="…" npm run db:stamp -- prod

# each release that includes migrations
PRODUCTION_DATABASE_URL="…" npm run db:status -- prod
PRODUCTION_DATABASE_URL="…" npm run db:migrate:prod
```

`db:migrate:prod` prints the target and the pending migrations, then requires typing `migrate production` in an interactive terminal. Instead of the inline variable you may keep the URL in `.env.production.local`, which is git-ignored. In PowerShell, set it with `$env:PRODUCTION_DATABASE_URL = "…"` first.

Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so rerunning is safe. A failed migration is not rolled back automatically: read the error, fix forward with a new migration, and use Neon's point-in-time restore if data was damaged.

### Ordering with deployments

Vercel deploys `master` as soon as it is pushed, so the database must be ready first, and the old code must keep working against the new schema.

1. Merge to `dev`; the migration runs locally and against the development database.
2. Before merging to `master`, run `npm run db:migrate:prod`.
3. Merge to `master`. Vercel deploys code that expects the schema already in place.

Keep every migration backward compatible with the code currently in production ("expand, then contract"):

- **Adding** a table or a nullable/defaulted column is safe to apply ahead of the code.
- **Renaming or removing** takes two releases: first ship code that no longer uses the old column, then drop it in a later migration.
- **Tightening** (a new NOT NULL or CHECK) comes only after a release that writes valid values everywhere.

## Tests

Database tests use PGlite, an in-process PostgreSQL, and apply the committed migration files to a fresh instance per test. They never connect to Neon. PGlite is a single connection, so the tests prove constraints and logic but not behaviour under truly concurrent transactions.

## Data model direction (later phases)

See "Domain decisions" in [ARCHITECTURE.md](../ARCHITECTURE.md). In outline:

- **Ideas** — one table for sermon ideas, point ideas, and undecided ideas, distinguished by type and owned by a user.
- **Sermon-point associations** — a join table carrying order, optional parent (subpoints), sermon-specific wording and notes, and Scripture overrides.
- **Outline sections** — optional introduction and conclusion belong to the sermon, not to point records.
- **Preaching occurrences** (Phase 3) — when, where, and in what context a sermon was preached.

Conventions, already followed by `users`:

- UUID primary keys that can be generated on the client, for later offline capture.
- `created_at` and `updated_at` on every table.
- Every user-owned row carries the owner's `users.id`, and every query filters by it.
