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
