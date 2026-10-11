import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ideaKinds, ideaStatuses, sermonTypes } from "../features/ideas/model";
import { highlightColors, translationIds } from "../features/scripture/saved/model";

/**
 * Application roles and account statuses. Stored as text with CHECK
 * constraints so a new value is an ordinary migration.
 */
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

/** One row per person allowed into the application. Clerk owns the identity. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: text("role", { enum: userRoles }).notNull().default("user"),
    status: text("status", { enum: userStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'user')`),
    check("users_status_check", sql`${table.status} in ('active', 'disabled')`),
  ],
);

export type AppUser = typeof users.$inferSelect;

/**
 * Ideas. One kind of record for sermon ideas, point ideas, and thoughts not
 * yet classified, told apart by `kind`. A point never needs a sermon. The
 * allowed values and length limits are in features/ideas/model.ts.
 */
export const ideas = pgTable(
  "ideas",
  {
    /** May be generated in the browser, so capture can later work offline. */
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ideaKinds }).notNull().default("undecided"),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ideaStatuses }).notNull().default("captured"),
    /**
     * Sermon details. They are kept when an idea is reclassified, so turning
     * it back into a sermon loses nothing; only sermons show them.
     */
    sermonType: text("sermon_type", { enum: sermonTypes }),
    subject: text("subject"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("ideas_kind_check", sql`${table.kind} in ('sermon', 'point', 'undecided')`),
    check("ideas_status_check", sql`${table.status} in ('captured', 'developing', 'ready')`),
    check(
      "ideas_sermon_type_check",
      sql`${table.sermonType} is null or ${table.sermonType} in ('topical', 'expository')`,
    ),
    check("ideas_title_check", sql`char_length(btrim(${table.title})) between 1 and 200`),
    check(
      "ideas_subject_check",
      sql`${table.subject} is null or char_length(${table.subject}) between 1 and 200`,
    ),
    check("ideas_notes_check", sql`${table.notes} is null or char_length(${table.notes}) <= 20000`),
    index("ideas_owner_updated_idx").on(table.ownerId, table.updatedAt.desc()),
    index("ideas_owner_created_idx").on(table.ownerId, table.createdAt.desc()),
    // What idea_tags points at, so a tag can only ever join an idea of the same owner.
    unique("ideas_id_owner_key").on(table.id, table.ownerId),
  ],
);

export type Idea = typeof ideas.$inferSelect;

/**
 * Tags. Each belongs to one account and can be put on any of that account's
 * ideas, whatever their kind. A name is unique within the account without
 * regard to case; two accounts may use the same name.
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("tags_name_check", sql`char_length(btrim(${table.name})) between 1 and 50`),
    uniqueIndex("tags_owner_name_key").on(table.ownerId, sql`lower(${table.name})`),
    unique("tags_id_owner_key").on(table.id, table.ownerId),
  ],
);

export type Tag = typeof tags.$inferSelect;

/**
 * Which tags are on which ideas. The owner is repeated here and is part of
 * both foreign keys, so the database itself refuses to join one account's tag
 * to another account's idea. Deleting either side removes the row and leaves
 * the other side alone.
 */
export const ideaTags = pgTable(
  "idea_tags",
  {
    ideaId: uuid("idea_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ideaId, table.tagId] }),
    foreignKey({
      name: "idea_tags_idea_fk",
      columns: [table.ideaId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "idea_tags_tag_fk",
      columns: [table.tagId, table.ownerId],
      foreignColumns: [tags.id, tags.ownerId],
    }).onDelete("cascade"),
    index("idea_tags_tag_idx").on(table.tagId),
  ],
);

/**
 * A passage attached to an idea, as numbers only: book 1 to 66 in canonical
 * order, then where it starts and ends. The text is read from `bible_verses`
 * when shown and is never copied here.
 *
 *   John 3          chapter_start 3
 *   John 3:16       chapter_start 3, verse_start 16
 *   John 3:16-18    chapter_start 3, verse_start 16, verse_end 18
 *   Genesis 1-2     chapter_start 1, chapter_end 2
 *   John 3:16-4:2   chapter_start 3, verse_start 16, chapter_end 4, verse_end 2
 */
export const ideaScriptureReferences = pgTable(
  "idea_scripture_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    book: smallint("book").notNull(),
    chapterStart: smallint("chapter_start").notNull(),
    verseStart: smallint("verse_start"),
    chapterEnd: smallint("chapter_end"),
    verseEnd: smallint("verse_end"),
  },
  (table) => [
    unique("idea_scripture_references_position_key").on(table.ideaId, table.position),
    uniqueIndex("idea_scripture_references_primary_key")
      .on(table.ideaId)
      .where(sql`${table.isPrimary}`),
    check("idea_scripture_references_book_check", sql`${table.book} between 1 and 66`),
    check(
      "idea_scripture_references_start_check",
      sql`${table.chapterStart} >= 1 and (${table.verseStart} is null or ${table.verseStart} >= 1)`,
    ),
    check(
      "idea_scripture_references_chapter_end_check",
      sql`${table.chapterEnd} is null or ${table.chapterEnd} > ${table.chapterStart}`,
    ),
    check(
      "idea_scripture_references_verse_end_check",
      sql`${table.verseEnd} is null or (${table.verseStart} is not null and ${table.verseEnd} >= 1 and (${table.chapterEnd} is not null or ${table.verseEnd} > ${table.verseStart}))`,
    ),
    check(
      "idea_scripture_references_range_check",
      sql`${table.chapterEnd} is null or (${table.verseStart} is null) = (${table.verseEnd} is null)`,
    ),
  ],
);

/**
 * The King James Bible, one row per verse. Shared, read-only reference data:
 * it has no owner, the application never writes to it, and it is loaded from
 * data/bible/kjv.json by the database commands (see docs/DATABASE.md).
 */
export const bibleVerses = pgTable(
  "bible_verses",
  {
    book: smallint("book").notNull(),
    chapter: smallint("chapter").notNull(),
    verse: smallint("verse").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.book, table.chapter, table.verse] }),
    // Word search. The "simple" configuration indexes every word exactly as
    // written, with no stemming and no stop words, so a search behaves like a
    // concordance. Queries must use the same expression (features/scripture/search.ts).
    index("bible_verses_search_idx").using("gin", sql`to_tsvector('simple', ${table.text})`),
  ],
);

/** Which edition of each reference dataset a database holds. */
export const referenceDatasets = pgTable("reference_datasets", {
  name: text("name").primaryKey(),
  checksum: text("checksum").notNull(),
  rowCount: integer("row_count").notNull(),
  loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The titles printed above verse 1 of many psalms ("A Psalm of David."). They
 * belong to the psalm and not to any verse, so they are kept apart from
 * `bible_verses`: they are not numbered, counted, selected, or searched.
 * Shared, read-only reference data, loaded from data/bible/kjv-psalm-titles.json
 * by the database commands. A psalm without a title has no row.
 */
export const biblePsalmTitles = pgTable(
  "bible_psalm_titles",
  {
    psalm: smallint("psalm").primaryKey(),
    text: text("text").notNull(),
  },
  (table) => [
    check("bible_psalm_titles_psalm_check", sql`${table.psalm} between 1 and 150`),
    check("bible_psalm_titles_text_check", sql`char_length(btrim(${table.text})) > 0`),
  ],
);

/**
 * A saved passage: any verses a person chose to keep, with an optional label
 * and notes. The verses are in `bible_favorite_verses`; the text is read from
 * `bible_verses` when shown and is never copied here.
 *
 * What makes a favorite itself is its verses and its translation, never its
 * label or notes: `selection_key` is a digest of the verses in canonical
 * order, and it is unique within an account and a translation, so the same
 * passage cannot be saved twice however the requests arrive. `reference` is
 * the passage as it is written ("Romans 3:10, 23; 6:23") and the `first_*`
 * columns are where it begins; all are rewritten with the verses, and exist
 * so the library can search and order in SQL.
 */
export const bibleFavorites = pgTable(
  "bible_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    translation: text("translation", { enum: translationIds }).notNull(),
    selectionKey: text("selection_key").notNull(),
    reference: text("reference").notNull(),
    firstBook: smallint("first_book").notNull(),
    firstChapter: smallint("first_chapter").notNull(),
    firstVerse: smallint("first_verse").notNull(),
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("bible_favorites_translation_check", sql`${table.translation} in ('kjv')`),
    check(
      "bible_favorites_label_check",
      sql`${table.label} is null or char_length(btrim(${table.label})) between 1 and 120`,
    ),
    check(
      "bible_favorites_notes_check",
      sql`${table.notes} is null or char_length(${table.notes}) <= 2000`,
    ),
    check("bible_favorites_first_check", sql`${table.firstBook} between 1 and 66`),
    unique("bible_favorites_selection_key").on(
      table.ownerId,
      table.translation,
      table.selectionKey,
    ),
    // What bible_favorite_verses points at, so a verse row can only belong to its favorite's owner.
    unique("bible_favorites_id_owner_key").on(table.id, table.ownerId),
    index("bible_favorites_owner_created_idx").on(table.ownerId, table.createdAt.desc()),
    index("bible_favorites_owner_updated_idx").on(table.ownerId, table.updatedAt.desc()),
    index("bible_favorites_owner_place_idx").on(
      table.ownerId,
      table.firstBook,
      table.firstChapter,
      table.firstVerse,
    ),
  ],
);

export type BibleFavorite = typeof bibleFavorites.$inferSelect;

/**
 * The verses of a favorite, one row each, in canonical order (`position`).
 * The owner is repeated and is part of the foreign key, as in `idea_tags`.
 * Deleting the favorite removes its rows and nothing else.
 */
export const bibleFavoriteVerses = pgTable(
  "bible_favorite_verses",
  {
    favoriteId: uuid("favorite_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    position: smallint("position").notNull(),
    book: smallint("book").notNull(),
    chapter: smallint("chapter").notNull(),
    verse: smallint("verse").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.favoriteId, table.book, table.chapter, table.verse] }),
    unique("bible_favorite_verses_position_key").on(table.favoriteId, table.position),
    foreignKey({
      name: "bible_favorite_verses_favorite_fk",
      columns: [table.favoriteId, table.ownerId],
      foreignColumns: [bibleFavorites.id, bibleFavorites.ownerId],
    }).onDelete("cascade"),
    check(
      "bible_favorite_verses_place_check",
      sql`${table.book} between 1 and 66 and ${table.chapter} >= 1 and ${table.verse} >= 1`,
    ),
    index("bible_favorite_verses_owner_place_idx").on(table.ownerId, table.book, table.chapter),
  ],
);

/**
 * Highlighted verses. The primary key is the account, the translation, and
 * the verse, so a verse has one color or none, and a chapter's highlights
 * are one index range. They know nothing of favorites: either can exist
 * without the other.
 */
export const bibleHighlights = pgTable(
  "bible_highlights",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    translation: text("translation", { enum: translationIds }).notNull(),
    book: smallint("book").notNull(),
    chapter: smallint("chapter").notNull(),
    verse: smallint("verse").notNull(),
    color: text("color", { enum: highlightColors }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.translation, table.book, table.chapter, table.verse],
    }),
    check("bible_highlights_translation_check", sql`${table.translation} in ('kjv')`),
    check(
      "bible_highlights_color_check",
      sql`${table.color} in ('yellow', 'green', 'blue', 'red')`,
    ),
    check(
      "bible_highlights_place_check",
      sql`${table.book} between 1 and 66 and ${table.chapter} >= 1 and ${table.verse} >= 1`,
    ),
  ],
);
