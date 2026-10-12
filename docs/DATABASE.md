# Database

Neon PostgreSQL, accessed through Drizzle ORM. Implemented in Phase 1B; ideas and the Bible were added in Phase 2A, tags in Phase 2B.1. Phase 2B.2 added no migration: its filters are changes to the library query only (see "Library filters" under `idea_tags`). Phase 2C.1A added one, `0004_bible_psalm_titles`, for the titles of the Psalms; the Bible reader itself stores nothing. Phase 2C.1B added `0005_bible_favorites_and_highlights`: three tables of personal data, `bible_favorites`, `bible_favorite_verses`, and `bible_highlights`. It only adds tables, so it is safe under the code already live. Phase 2C.2 added `0006_scripture_translations_and_languages`: the Bible text by translation (`scripture_verses`, `scripture_psalm_titles`), two preference columns on `users`, and `app_settings`. It adds and widens only; see "Phase 2C.2 migration" below.

## Layout

| Path                               | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `src/db/schema.ts`                 | Tables, in TypeScript. The single place the schema is defined             |
| `src/db/index.ts`                  | `getDb()`: the server-only connection (pooled WebSocket driver)           |
| `src/db/types.ts`                  | `Database` type and log-safe error text                                   |
| `src/db/testing.ts`                | In-memory PostgreSQL (PGlite) with the real migrations, for tests         |
| `drizzle/`                         | Generated SQL migrations and Drizzle's journal. Committed                 |
| `drizzle.config.ts`                | Drizzle Kit configuration (generation only)                               |
| `scripts/db/cli.mjs`               | `migrate`, `stamp`, `status` commands                                     |
| `scripts/db/seed-bible.mjs`        | Loads each translation's text and psalm titles when a database lacks them |
| `scripts/bible/dataset.mjs`        | The list of translations: files, checksums, and expected counts           |
| `data/bible/kjv.json`              | The King James text, with its source in `data/bible/README.md`            |
| `data/bible/kjv-psalm-titles.json` | The titles of the Psalms, from the same source                            |
| `data/bible/rvg.json`              | The Reina-Valera Gómez text, with its source in the same README           |
| `data/bible/rvg-psalm-titles.json` | Its psalm headings                                                        |
| `scripts/db/guard.mjs`             | The rules that decide whether a command may touch a database              |

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

`tags_owner_name_key` is a unique index on `(owner_id, lower(name))`: one name per account whatever its case, and the index that lists an account's tags. `UNIQUE (id, owner_id)` (`tags_id_owner_key`) is the target of `idea_tags`' foreign key. There is no color column.

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

**Library filters (Phase 2B.2, no schema change).** Kind, status, and sermon type each take several values and become `IN (…)`; a sermon type still requires `kind = 'sermon'`. Tags are matched in a subquery correlated on the idea, never a join, so an idea is one row however many of the tags it has:

- any: `EXISTS (SELECT 1 FROM idea_tags WHERE idea_id = ideas.id AND owner_id = $owner AND tag_id IN (…))`
- all: `(SELECT count(*) FROM idea_tags WHERE idea_id = ideas.id AND owner_id = $owner AND tag_id IN (…)) = <number of distinct tags asked for>`

The primary key `(idea_id, tag_id)` makes that count exact, and the lookup is by the primary key's leading column. Because the owner is in the subquery, a tag ID that is unknown or belongs to another account is never counted: it finds nothing in "all" and is ignored in "any". No index was added.

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

A row names a passage and no translation: it is the same reference whatever text it is read in, and a second translation needs no change here and no second row.

**Adding to an idea (Phase 2C.1C)** changed no table. `attachReferences` runs in one transaction: it reads the idea `WHERE id = … AND owner_id = … FOR UPDATE`, which both checks ownership and holds the idea's row; reads the references it has; inserts those not already there, by all five numbers, at the positions after the last; and sets `updated_at`. Two requests for one idea therefore run one after the other, and the second sees what the first added. An editor's Save takes the same row lock through its `UPDATE` before it replaces the references. `UNIQUE (idea_id, position)` would refuse a collision if the lock were ever lost. There is deliberately no unique constraint over the passage itself: the code that was live before this phase replaces an idea's references by deleting and inserting, and a constraint added under it would have been a second thing to keep in step for no gain while every writer takes the lock.

### `scripture_verses`

The Bible, one row per verse of each translation: 31,102 rows for `kjv` and 31,102 for `rvg`. Shared, read-only reference data with no owner. The application never writes to it.

| Column        | Type       | Notes                  |
| ------------- | ---------- | ---------------------- |
| `translation` | `text`     | `kjv` or `rvg` (CHECK) |
| `book`        | `smallint` | 1 to 66                |
| `chapter`     | `smallint` |                        |
| `verse`       | `smallint` |                        |
| `text`        | `text`     | Plain verse text       |

The primary key `(translation, book, chapter, verse)` serves verse, passage, and chapter reads. Both translations number alike, so the same key but for its first column is the same verse in the other text. `scripture_verses_search_idx` is a GIN index on `to_tsvector('simple', translate(text, 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))`: words exactly as written, with accented vowels indexed as plain ones so "jehova" finds "Jehová". A query must use exactly that expression (`search-verses.ts` and the schema both take the letters from `search-fold.ts`). ñ is not folded. No extension is used.

### `scripture_psalm_titles`

The headings above verse 1 of the psalms, per translation: primary key `(translation, psalm)`, 116 rows for `kjv` and 123 for `rvg`. As before, a title is not a verse: it has no verse number and is not in the search index.

### `bible_verses` (superseded)

**No longer read or loaded.** It held the King James text before there were two translations, and is kept because the deployment that is live while migration 0006 runs still reads it, with no translation in its WHERE clause; Spanish rows added to it would have reached that code. `bible_psalm_titles` is kept for the same reason. Both are to be dropped by a later migration, once no deployment reads them. Their old description follows.

The King James Bible, one row per verse: 31,102 rows. Shared, read-only reference data with no owner. The application never writes to it.

| Column    | Type       | Notes            |
| --------- | ---------- | ---------------- |
| `book`    | `smallint` | 1 to 66          |
| `chapter` | `smallint` |                  |
| `verse`   | `smallint` |                  |
| `text`    | `text`     | Plain verse text |

The primary key `(book, chapter, verse)` serves verse, passage, and chapter reads. `bible_verses_search_idx` is a GIN index on `to_tsvector('simple', text)` for word search; a query must use exactly that expression to use it.

### `bible_psalm_titles`

The titles printed above verse 1 of 116 psalms ("A Psalm of David."). Shared, read-only reference data with no owner, like `bible_verses`, and deliberately apart from it: a title is not a verse, so it has no verse number, is not counted among the 31,102 verses, and is not in the search index.

| Column  | Type       | Notes                                   |
| ------- | ---------- | --------------------------------------- |
| `psalm` | `smallint` | Primary key, 1 to 150 (CHECK)           |
| `text`  | `text`     | Not null, not blank (CHECK). Plain text |

A psalm without a title has no row. The application never writes here. It reads all the rows at once (`getPsalmTitles`, cached) and treats an empty table as an error, so a database that has not been loaded is never mistaken for "no psalm has a title".

### `bible_favorites`

A saved passage (Phase 2C.1B): any verses a person chose to keep, with an optional label and notes. Personal data, owned like an idea.

| Column                                       | Type          | Notes                                                                             |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `id`                                         | `uuid`        | Primary key, `gen_random_uuid()`                                                  |
| `owner_id`                                   | `uuid`        | Not null, references `users(id)` ON DELETE RESTRICT                               |
| `translation`                                | `text`        | Not null. CHECK: `kjv`. The translation it was saved in                           |
| `selection_key`                              | `text`        | Not null. SHA-256 of the verses in canonical order (`book.chapter.verse`, …)      |
| `reference`                                  | `text`        | Not null. The passage as written: "Romans 3:10, 23; 6:23"                         |
| `first_book`, `first_chapter`, `first_verse` | `smallint`    | Not null. Where the passage begins                                                |
| `label`                                      | `text`        | Nullable. CHECK: 1 to 120 characters after trimming                               |
| `notes`                                      | `text`        | Nullable. CHECK: at most 2,000 characters                                         |
| `created_at`, `updated_at`                   | `timestamptz` | Not null. `updated_at` moves on any change to the label, the notes, or the verses |

- **`UNIQUE (owner_id, translation, selection_key)`** is what makes a favorite itself: its verses and its translation, never its label or notes. Saving is `INSERT … ON CONFLICT DO NOTHING` followed by a read, so two requests for the same passage, however they arrive, leave one row; changing a favorite's verses to another's is refused by the same constraint and reported as a conflict.
- `UNIQUE (id, owner_id)` exists for `bible_favorite_verses` to point at.
- `reference` and the three `first_*` columns are derived from the verses and rewritten in the same transaction whenever the verses are. They are stored so the library can search (`ILIKE`), order (biblical order), and page in SQL.
- Indexes: `(owner_id, created_at DESC)`, `(owner_id, updated_at DESC)`, `(owner_id, first_book, first_chapter, first_verse)`, one for each order the library offers.
- No highlight is stored here. A favorite's colors are read from `bible_highlights` when they are shown or filtered by.

### `bible_favorite_verses`

The verses of a favorite, one row each.

| Column                     | Type       | Notes                                                |
| -------------------------- | ---------- | ---------------------------------------------------- |
| `favorite_id`              | `uuid`     | Not null                                             |
| `owner_id`                 | `uuid`     | Not null. Repeats the favorite's owner               |
| `position`                 | `smallint` | Not null. 0, 1, 2, … in canonical order              |
| `book`, `chapter`, `verse` | `smallint` | Not null. CHECK: book 1 to 66, chapter and verse ≥ 1 |

- Primary key `(favorite_id, book, chapter, verse)`: a verse is in a favorite once. `UNIQUE (favorite_id, position)`.
- Foreign key `(favorite_id, owner_id)` → `bible_favorites (id, owner_id)` ON DELETE CASCADE. As in `idea_tags`, the owner is part of the key, so a verse row for another account's favorite cannot exist, and deleting a favorite removes its rows and nothing else.
- Index `(owner_id, book, chapter)`: the favorites that touch the chapter being read, and the library's book filter.
- **There is no foreign key to `bible_verses`.** That table is replaced wholesale when a new edition is loaded, and a test database holds no Bible. A verse is checked against the generated verse counts (`versification.ts`) on the server before it is written. A psalm's title is not a verse and has no number, so it can never be one of these rows.

### `bible_highlights`

Highlighted verses. Personal data.

| Column                     | Type          | Notes                                                |
| -------------------------- | ------------- | ---------------------------------------------------- |
| `owner_id`                 | `uuid`        | Not null, references `users(id)` ON DELETE RESTRICT  |
| `translation`              | `text`        | Not null. CHECK: `kjv`                               |
| `book`, `chapter`, `verse` | `smallint`    | Not null. CHECK: book 1 to 66, chapter and verse ≥ 1 |
| `color`                    | `text`        | Not null. CHECK: `yellow`, `green`, `blue`, `red`    |
| `created_at`, `updated_at` | `timestamptz` | Not null                                             |

- **Primary key `(owner_id, translation, book, chapter, verse)`**: a verse has one color or none, by construction. Highlighting is one `INSERT … ON CONFLICT DO UPDATE` for every verse asked for, so a selection changes together and a color replaces the one before; removing is one `DELETE`.
- The same key serves the read: one chapter's highlights for one account are one index range.
- Highlights and favorites do not reference each other. Either can exist without the other, and deleting one never touches the other.

**Later translations.** Both personal tables carry `translation`, and it is part of what identifies a favorite and a highlight, so a highlight made in one translation is a different row from the same verse in another and nothing is carried across. Admitting a translation is a migration that widens the two CHECKs (and `translationIds` in `features/scripture/saved/model.ts`); no existing row changes. `bible_verses` itself still has no translation column: that is the additive change the translation phase makes.

**Saved Scripture search and filters.** Search is `ILIKE '%word%'` on `reference`, `label`, and `notes`, every word required, behind `owner_id = …`, as the idea library's is. The book and color filters are subqueries correlated on the favorite, never joins, so a passage is one row however many of its verses match:

```sql
-- book: any verse of the passage is in it
EXISTS (SELECT 1 FROM bible_favorite_verses v
        WHERE v.favorite_id = f.id AND v.owner_id = $owner AND v.book = $book)
-- color: any verse of the passage is highlighted in one of them
EXISTS (SELECT 1 FROM bible_favorite_verses v
        JOIN bible_highlights h ON h.owner_id = $owner AND h.translation = f.translation
         AND h.book = v.book AND h.chapter = v.chapter AND h.verse = v.verse
        WHERE v.favorite_id = f.id AND v.owner_id = $owner AND h.color IN (…))
```

A page of results is five queries whatever its size: the count, the favorites, their verses, their colors, and the text of their first three verses.

### `reference_datasets`

Which edition of each reference dataset a database holds: `name`, `checksum`, `row_count`, `loaded_at`. The rows the loader keeps are `scripture-kjv` and `scripture-rvg` (31,102 each), and `scripture-kjv-psalm-titles` (116) and `scripture-rvg-psalm-titles` (123). A database that existed before Phase 2C.2 also has `kjv` and `kjv-psalm-titles`, which describe the superseded tables and are no longer consulted.

### `app_settings`

Settings of the whole application, as one row (`singleton boolean PRIMARY KEY`, CHECK true). `spanish_enabled boolean NOT NULL DEFAULT true` is the administrator's switch; `updated_at` and `updated_by` (references `users.id`, `ON DELETE SET NULL`) say when and by whom it was last changed. A database with no row has nothing switched off. It is read on every request (once per request) and written by one upsert, so a change is in force on the next request with no deployment. Nothing else is written when it changes: no preference, favorite, or highlight.

### Preferences on `users`

| Column              | Type   | Notes                                                                                                   |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `locale`            | `text` | Not null, default `en`; `en` or `es` (CHECK). The interface language                                    |
| `bible_translation` | `text` | Nullable; `kjv` or `rvg` (CHECK). Null means "the one in the interface's language", until one is chosen |

The two are independent and neither action writes the other. What is in force for a request is computed from them and from `app_settings` (`resolvePreferences`): with Spanish off, English and `kjv`, whatever is stored. The stored values are never rewritten by the switch.

### Phase 2C.2 migration

`0006_scripture_translations_and_languages` creates `scripture_verses`, `scripture_psalm_titles`, and `app_settings`; adds `users.locale` (with a default) and `users.bible_translation` (nullable); and replaces the CHECK on `bible_favorites.translation` and `bible_highlights.translation` with one that also admits `rvg`. Every existing row satisfies the new constraints, no row is rewritten, and nothing is dropped, so it is safe under the code already live: that code names the columns it reads, inserts users without the new columns, and goes on reading `bible_verses`, which is untouched. The new tables are filled by the loader in the same command.

## Bible text

The text is data, not a migration. Each translation lives in `data/bible/<translation>.json` (the list is `datasets` in `scripts/bible/dataset.mjs`) and every `migrate` command loads each one when needed, after any pending migrations and under the same identity checks:

- For each translation, the command compares the checksum of the committed text with its row in `reference_datasets`. If they match and the row count is 31,102, it does nothing. This is a few small queries on every `npm run dev`.
- Otherwise it replaces **that translation's rows** of `scripture_verses` in **one transaction on one connection**: delete where the translation is this one, insert book by book, count, record the edition. Readers see the old text or the new, never part of each, and the other translation is not touched. Any failure rolls back, changes nothing, and fails the command, so a production build fails and the previous deployment keeps serving.
- A first load takes about ten seconds per translation against Neon.
- `npm run db:status` reports `KJV`, `KJV titles`, `RVG`, and `RVG titles` as `loaded` or `not loaded`.
- Safe to run again: a loaded edition is skipped, and loading one twice leaves the same rows.
- A manual production migration (`db:migrate:prod`) asks for its confirmation when either a migration or the Bible load is pending.

**The titles of the Psalms** are a second dataset, loaded the same way and by the same command, after the migrations (their table is one of them) and after the verses:

- `psalmTitlesAreCurrent` compares the checksum of a translation's titles file with its row and the count with the number that translation has (116 or 123). A database without the table yet is simply "not loaded".
- `seedPsalmTitles` replaces that translation's rows of `scripture_psalm_titles` in one transaction on one connection: delete, insert, count, record. It does not touch the verses. A failure rolls back and fails the command.
- Running it again does nothing; a fresh database and one that already had the verses end the same.
- `npm run db:status` reports `Titles: loaded` or `not loaded`, and `db:migrate:prod` asks for its confirmation when the titles are pending too.
- **Order with a deployment.** The migration only adds a table, so it is safe under the code already live. Until a production build has loaded the titles, the new code serves psalms without them (logged, and not kept by the browser); it does not fail.

To change the text, see `data/bible/README.md`. Tests load the real dataset into an in-memory PostgreSQL to prove the loader; other database tests insert the few verses they need.

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (add `-- --name=short_description` to name the file).
3. Review the SQL in `drizzle/` and commit it with the schema change.
4. `npm run dev` applies it to the development database.

Never edit a migration that has been applied anywhere, and never use `drizzle-kit push`. Nothing is created by hand in the Neon console.

## Commands

| Command                   | What it does                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Applies pending migrations to the development database and loads the Bible and the psalm titles if they are missing, then starts Next. Aborts if any of it fails |
| `npm run dev:next`        | Starts Next without touching a database (interface work only)                                                                                                    |
| `npm run db:generate`     | Writes a migration from schema changes                                                                                                                           |
| `npm run db:migrate:dev`  | Applies pending migrations to development                                                                                                                        |
| `npm run build`           | Builds; in the Vercel production deployment only, then applies pending migrations to production and loads the Bible if it is missing                             |
| `npm run db:migrate:prod` | Applies pending migrations to production by hand, after confirmation                                                                                             |
| `npm run db:status`       | Target, stamp, applied and pending migrations (`-- prod` for production)                                                                                         |
| `npm run db:stamp -- dev` | Identifies a database as development (`-- prod` for production)                                                                                                  |

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

- **Ideas** — implemented in Phase 2A (above). **Tags** — implemented in Phase 2B.1 (above). **Favorites and highlights** — implemented in Phase 2C.1B (above). **Scripture from the Bible to an idea** — Phase 2C.1C, with no schema change (see `idea_scripture_references`).
- **A second translation** — implemented in Phase 2C.2 (above): `scripture_verses` and `scripture_psalm_titles` hold each translation's text. Favorites and highlights carry a translation and are never carried from one to the other. References on ideas carry none and need none. Still to do: a migration that drops `bible_verses` and `bible_psalm_titles`.
- **Sermon-point associations** — a join table carrying order, optional parent (subpoints), sermon-specific wording and notes, and Scripture overrides.
- **Outline sections** — optional introduction and conclusion belong to the sermon, not to point records.
- **Preaching occurrences** (Phase 3) — when, where, and in what context a sermon was preached.

Conventions, already followed by `users`:

- UUID primary keys that can be generated on the client, for later offline capture.
- `created_at` and `updated_at` on every table.
- Every user-owned row carries the owner's `users.id`, and every query filters by it.
