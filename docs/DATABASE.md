# Database

Neon PostgreSQL, accessed through Drizzle ORM. Implemented in Phase 1B; ideas and the Bible were added in Phase 2A, tags in Phase 2B.1.

## Layout

| Path                        | Purpose                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `src/db/schema.ts`          | Tables, in TypeScript. The single place the schema is defined     |
| `src/db/index.ts`           | `getDb()`: the server-only connection (pooled WebSocket driver)   |
| `src/db/types.ts`           | `Database` type and log-safe error text                           |
| `src/db/testing.ts`         | In-memory PostgreSQL (PGlite) with the real migrations, for tests |
| `drizzle/`                  | Generated SQL migrations and Drizzle's journal. Committed         |
| `drizzle.config.ts`         | Drizzle Kit configuration (generation only)                       |
| `scripts/db/cli.mjs`        | `migrate`, `stamp`, `status` commands                             |
| `scripts/db/seed-bible.mjs` | Loads the King James text when a database lacks it                |
| `data/bible/kjv.json`       | The King James text, with its source in `data/bible/README.md`    |
| `scripts/db/guard.mjs`      | The rules that decide whether a command may touch a database      |

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

### `ideas`

One row per idea, of any kind, owned by one user. The allowed values and limits are in `src/features/ideas/model.ts`.

| Column        | Type          | Notes                                                                   |
| ------------- | ------------- | ----------------------------------------------------------------------- |
| `id`          | `uuid`        | Primary key. Defaults to `gen_random_uuid()`; the browser may supply it |
| `owner_id`    | `uuid`        | Not null, references `users.id`, `ON DELETE RESTRICT`                   |
| `kind`        | `text`        | `sermon`, `point`, or `undecided` (CHECK), default `undecided`          |
| `title`       | `text`        | Not null, 1 to 200 characters after trimming (CHECK)                    |
| `notes`       | `text`        | Optional, up to 20,000 characters (CHECK)                               |
| `status`      | `text`        | `captured`, `developing`, or `ready` (CHECK), default `captured`        |
| `sermon_type` | `text`        | Optional: `topical` or `expository` (CHECK)                             |
| `subject`     | `text`        | Optional, 1 to 200 characters (CHECK)                                   |
| `created_at`  | `timestamptz` | Default `now()`                                                         |
| `updated_at`  | `timestamptz` | Default `now()`, set by the application on update                       |

Indexes `ideas_owner_updated_idx (owner_id, updated_at desc)` and `ideas_owner_created_idx (owner_id, created_at desc)` serve the library's two date orders, and the first narrows every library query to one account. `UNIQUE (id, owner_id)` (`ideas_id_owner_key`) adds nothing to the primary key by itself; it exists so `idea_tags` can reference an idea together with its owner. `sermon_type` and `subject` are not tied to `kind`: they are kept when an idea is reclassified.

**Library search uses no special index.** It is `ILIKE '%word%'` on `title`, `notes`, and `subject`, always behind `owner_id = …`, so PostgreSQL reads one account's rows and no more. A trigram (`pg_trgm`) GIN index was considered and left out: it needs `CREATE EXTENSION` in a migration (and loading into PGlite for tests), it is not scoped to an owner, and on 20,000-character notes it would slow every save to speed a scan of a few thousand rows. Add it in its own migration if a single account ever grows large enough to notice.

### `tags`

A label one user can put on their ideas.

| Column       | Type          | Notes                                                 |
| ------------ | ------------- | ----------------------------------------------------- |
| `id`         | `uuid`        | Primary key, `gen_random_uuid()`                      |
| `owner_id`   | `uuid`        | Not null, references `users.id`, `ON DELETE RESTRICT` |
| `name`       | `text`        | Not null, 1 to 50 characters after trimming (CHECK)   |
| `created_at` | `timestamptz` | Default `now()`                                       |
| `updated_at` | `timestamptz` | Default `now()`, set by the application on update     |

`tags_owner_name_key` is a unique index on `(owner_id, lower(name))`: one name per account whatever its case, and the index that lists an account's tags. `UNIQUE (id, owner_id)` (`tags_id_owner_key`) is the target of `idea_tags`' foreign key. There is no colour column.

### `idea_tags`

Which tags are on which ideas.

| Column       | Type          | Notes                       |
| ------------ | ------------- | --------------------------- |
| `idea_id`    | `uuid`        | Not null                    |
| `tag_id`     | `uuid`        | Not null                    |
| `owner_id`   | `uuid`        | Not null; the owner of both |
| `created_at` | `timestamptz` | Default `now()`             |

- Primary key `(idea_id, tag_id)`: a tag is on an idea once.
- `idea_tags_idea_fk`: `(idea_id, owner_id)` references `ideas (id, owner_id)`, `ON DELETE CASCADE`.
- `idea_tags_tag_fk`: `(tag_id, owner_id)` references `tags (id, owner_id)`, `ON DELETE CASCADE`.
- `idea_tags_tag_idx (tag_id)` serves the tag filter, the per-tag counts, and the cascade when a tag is deleted.

Because one `owner_id` must satisfy both foreign keys, a row can only join a tag and an idea that belong to the same account. Deleting an idea or a tag removes its rows here and nothing else.

### `idea_scripture_references`

The passages attached to an idea, in order, as numbers. No verse text is stored here and there is no foreign key to `bible_verses`.

| Column          | Type       | Notes                                                             |
| --------------- | ---------- | ----------------------------------------------------------------- |
| `id`            | `uuid`     | Primary key                                                       |
| `idea_id`       | `uuid`     | Not null, references `ideas.id`, `ON DELETE CASCADE`              |
| `position`      | `smallint` | Order within the idea; unique with `idea_id`                      |
| `is_primary`    | `boolean`  | A sermon's main text; at most one per idea (partial unique index) |
| `book`          | `smallint` | 1 to 66, canonical order (CHECK)                                  |
| `chapter_start` | `smallint` | At least 1                                                        |
| `verse_start`   | `smallint` | Null for a whole chapter                                          |
| `chapter_end`   | `smallint` | Set only when the passage leaves its first chapter                |
| `verse_end`     | `smallint` | Set only when the passage covers more than one verse              |

CHECK constraints keep the four range columns coherent (an end after its start; a verse at both ends of a cross-chapter range or at neither). Whether the chapter and verse exist is validated by the application against the real verse counts.

### `bible_verses`

The King James Bible, one row per verse: 31,102 rows. Shared, read-only reference data with no owner. The application never writes to it.

| Column    | Type       | Notes            |
| --------- | ---------- | ---------------- |
| `book`    | `smallint` | 1 to 66          |
| `chapter` | `smallint` |                  |
| `verse`   | `smallint` |                  |
| `text`    | `text`     | Plain verse text |

The primary key `(book, chapter, verse)` serves verse, passage, and chapter reads. `bible_verses_search_idx` is a GIN index on `to_tsvector('simple', text)` for word search; a query must use exactly that expression to use it.

### `reference_datasets`

Which edition of each reference dataset a database holds: `name` (`kjv`), `checksum`, `row_count`, `loaded_at`.

## Bible text

The text is data, not a migration. It lives in `data/bible/kjv.json` and every `migrate` command loads it when needed, after any pending migrations and under the same identity checks:

- The command compares the checksum of the committed text with `reference_datasets`. If they match and the row count is 31,102, it does nothing. This is one small query on every `npm run dev`.
- Otherwise it replaces the contents of `bible_verses` in **one transaction on one connection**: delete, insert book by book, count, record the edition. Readers see the old text or the new, never part of each. Any failure rolls back, changes nothing, and fails the command, so a production build fails and the previous deployment keeps serving.
- A first load takes about ten seconds against Neon.
- `npm run db:status` reports `Bible: loaded` or `not loaded`.
- A manual production migration (`db:migrate:prod`) asks for its confirmation when either a migration or the Bible load is pending.

To change the text, see `data/bible/README.md`. Tests load the real dataset into an in-memory PostgreSQL to prove the loader; other database tests insert the few verses they need.

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (add `-- --name=short_description` to name the file).
3. Review the SQL in `drizzle/` and commit it with the schema change.
4. `npm run dev` applies it to the development database.

Never edit a migration that has been applied anywhere, and never use `drizzle-kit push`. Nothing is created by hand in the Neon console.

## Commands

| Command                   | What it does                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Applies pending migrations to the development database and loads the Bible if it is missing, then starts Next. Aborts if either fails |
| `npm run dev:next`        | Starts Next without touching a database (interface work only)                                                                         |
| `npm run db:generate`     | Writes a migration from schema changes                                                                                                |
| `npm run db:migrate:dev`  | Applies pending migrations to development                                                                                             |
| `npm run build`           | Builds; in the Vercel production deployment only, then applies pending migrations to production and loads the Bible if it is missing  |
| `npm run db:migrate:prod` | Applies pending migrations to production by hand, after confirmation                                                                  |
| `npm run db:status`       | Target, stamp, applied and pending migrations (`-- prod` for production)                                                              |
| `npm run db:stamp -- dev` | Identifies a database as development (`-- prod` for production)                                                                       |

## How a database is identified

A hostname or database name is not trusted to tell development from production. Instead each database says what it is.

- **The stamp.** A one-row table, `sermon_tracker_meta.environment`, holds `development` or `production`. It lives outside the schema Drizzle manages.
- **The declaration.** `DATABASE_ENVIRONMENT` sits beside `DATABASE_URL` and says what that URL is meant to be. On a workstation the production command does not read `DATABASE_URL` at all; it reads `PRODUCTION_DATABASE_URL`.

A command runs only when the command's target, the declaration, and the stamp all agree. Anything else is refused and nothing is changed:

| Situation                                                    | Result                              |
| ------------------------------------------------------------ | ----------------------------------- |
| `npm run dev` with a production URL pasted into `.env.local` | Refused: stamp says `production`    |
| `DATABASE_ENVIRONMENT` missing                               | Refused                             |
| Database has tables but no stamp                             | Refused; run `db:stamp` once        |
| Brand-new, empty database used for development               | Stamped `development` automatically |
| Production command pointed at a development database         | Refused                             |
| Development command inside the production deployment         | Refused                             |
| Production migration in a preview deployment                 | Refused                             |
| Production build, database declared and stamped `production` | Migrated                            |
| Production build, brand-new empty database                   | Stamped `production`, then migrated |

A Neon branch created from production copies production's stamp, so it is refused for development until you run `npm run db:stamp -- dev --force` against it. That is deliberate: a copy of production data should be relabelled on purpose.

The running application applies the same idea (`requireDatabaseUrl` in `src/lib/env.ts`): the production deployment refuses a database declared as anything but `production`, and every other runtime refuses one declared `production`.

Connection strings are never printed. Commands show the host and database name only, and error text has connection strings removed.

## Production migrations

The production deployment migrates its own database. `npm run build` is `next build`, then `node scripts/db/cli.mjs migrate deploy`:

- **Anywhere but the Vercel production deployment** (a local build, a preview): it prints that migrations were skipped and does nothing. Previews use the development database, which `npm run dev` migrates.
- **In the production deployment** (`VERCEL_ENV=production`): it connects with the deployment's own `DATABASE_URL`, checks the declaration and the stamp, prints the host, database name, and pending migrations, and applies them without a prompt. Pushing to `master` is the confirmation. With nothing pending it exits at once.
- **The first deployment**: an empty, unstamped database is stamped `production` and migrated. A database that already has tables but no stamp is refused, as is one stamped `development`.

It runs after the code has compiled and before Vercel puts the deployment live. If it refuses or a migration fails, the build fails and the previous deployment keeps serving. The reason is in the build log.

Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so rerunning is safe. A failed migration is not rolled back automatically: read the error, fix forward with a new migration, and use Neon's point-in-time restore if data was damaged.

### By hand, from a workstation

The same commands remain for looking at production or repairing it:

```bash
PRODUCTION_DATABASE_URL="…" npm run db:status -- prod
PRODUCTION_DATABASE_URL="…" npm run db:stamp -- prod
PRODUCTION_DATABASE_URL="…" npm run db:migrate:prod
```

`db:migrate:prod` prints the target and the pending migrations, then requires typing `migrate production` in an interactive terminal. From a workstation an unstamped production database is never stamped automatically. Instead of the inline variable you may keep the URL in `.env.production.local`, which is git-ignored. In PowerShell, set it with `$env:PRODUCTION_DATABASE_URL = "…"` first.

### Ordering with deployments

While a production build runs, and again after any rollback, the previous deployment's code is serving requests against the new schema. Nothing here stops two production builds from migrating at the same moment, so avoid pushing a second release with migrations while the first is still building.

Keep every migration backward compatible with the code currently in production ("expand, then contract"):

- **Adding** a table or a nullable/defaulted column is safe to apply ahead of the code.
- **Renaming or removing** takes two releases: first ship code that no longer uses the old column, then drop it in a later migration.
- **Tightening** (a new NOT NULL or CHECK) comes only after a release that writes valid values everywhere.

## Tests

Database tests use PGlite, an in-process PostgreSQL, and apply the committed migration files to a fresh instance per test. They never connect to Neon. PGlite is a single connection, so the tests prove constraints and logic but not behaviour under truly concurrent transactions.

## Data model direction (later phases)

See "Domain decisions" in [ARCHITECTURE.md](../ARCHITECTURE.md). In outline:

- **Ideas** — implemented in Phase 2A (above). **Tags** — implemented in Phase 2B.1 (above).
- **Sermon-point associations** — a join table carrying order, optional parent (subpoints), sermon-specific wording and notes, and Scripture overrides.
- **Outline sections** — optional introduction and conclusion belong to the sermon, not to point records.
- **Preaching occurrences** (Phase 3) — when, where, and in what context a sermon was preached.

Conventions, already followed by `users`:

- UUID primary keys that can be generated on the client, for later offline capture.
- `created_at` and `updated_at` on every table.
- Every user-owned row carries the owner's `users.id`, and every query filters by it.
