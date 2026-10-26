import type { JSONContent } from "@tiptap/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ideaKinds, ideaStatuses, intendedFormats, sermonTypes } from "../features/ideas/model";
import { notificationKinds } from "../features/notifications/model";
import { onboardingStatuses, onboardingSteps, tourStates } from "../features/onboarding/model";
import { entryTypes } from "../features/outlines/model";
import type { NumberingConfig } from "../features/outlines/numbering";
import { actualFormats, timesOfDay } from "../features/preaching/model";
import { highlightColors } from "../features/scripture/saved/model";
import { accentFold } from "../features/scripture/search-fold";
import {
  messageAuthors,
  messageVisibilities,
  ticketKinds,
  ticketSources,
  ticketStatuses,
} from "../features/support/model";
import { translationIds } from "../features/scripture/translations";
import { locales } from "../i18n/locales";

/**
 * Application roles and account statuses. Stored as text with CHECK
 * constraints so a new value is an ordinary migration.
 */
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

/** `deleting`: locked for good while the account is removed (features/account/deletion.ts). Never moves back. */
export const userStatuses = ["active", "disabled", "deleting"] as const;
export type UserStatus = (typeof userStatuses)[number];

/** One row per person allowed into the application. Clerk owns the identity. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: text("role", { enum: userRoles }).notNull().default("user"),
    status: text("status", { enum: userStatuses }).notNull().default("active"),
    /** The language of the interface. */
    locale: text("locale", { enum: locales }).notNull().default("en"),
    /**
     * The Bible translation the person chose. Null until they choose one, and
     * until then it follows the interface language (KJV in English, RVG in
     * Spanish). Changing the language sets it back to null.
     */
    bibleTranslation: text("bible_translation", { enum: translationIds }),
    /** The person's church, as they wrote it. Null when they have not said. */
    churchName: text("church_name"),
    /**
     * What the person does in ministry, in their own words. It describes them
     * and grants nothing: `role` above is what decides access.
     */
    ministryRole: text("ministry_role"),
    /**
     * Whether the person said they attend preaching class. It is only ever
     * what they chose: nothing works it out from their history or contexts.
     */
    attendsPreachingClass: boolean("attends_preaching_class").notNull().default(false),
    /**
     * First-time setup (features/onboarding/model.ts). A new row is `pending`
     * and must finish it; an account from before there was one is
     * `grandfathered`, set by the migration that added the column and by
     * nothing since. It is the only thing that says whether setup is owed.
     */
    onboardingStatus: text("onboarding_status", { enum: onboardingStatuses })
      .notNull()
      .default("pending"),
    /** The furthest step of setup the account has reached. It only moves forward. */
    onboardingStep: text("onboarding_step", { enum: onboardingSteps }).notNull().default("welcome"),
    /** When the account finished setup itself. Null for one that never owed it. */
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Where the product tour stands. Kept for Phase 4B; nothing writes it yet. */
    tourState: text("tour_state", { enum: tourStates }).notNull().default("not_offered"),
    /** Optional support email: replies to the account's feedback, and its status changes. */
    emailReplies: boolean("email_replies").notNull().default(true),
    emailStatus: boolean("email_status").notNull().default(true),
    /** Whether support notifications go to the devices this account turned push on for. */
    pushSupport: boolean("push_support").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'user')`),
    check("users_status_check", sql`${table.status} in ('active', 'disabled', 'deleting')`),
    check("users_locale_check", sql`${table.locale} in ('en', 'es')`),
    check(
      "users_bible_translation_check",
      sql`${table.bibleTranslation} is null or ${table.bibleTranslation} in ('kjv', 'rvg')`,
    ),
    check(
      "users_church_name_check",
      sql`${table.churchName} is null or char_length(btrim(${table.churchName})) between 1 and 120`,
    ),
    check(
      "users_ministry_role_check",
      sql`${table.ministryRole} is null or char_length(btrim(${table.ministryRole})) between 1 and 80`,
    ),
    check(
      "users_onboarding_status_check",
      sql`${table.onboardingStatus} in ('pending', 'completed', 'grandfathered')`,
    ),
    check(
      "users_onboarding_step_check",
      sql`${table.onboardingStep} in ('welcome', 'ministry', 'preferences', 'finish')`,
    ),
    // Finished is said twice, and the two must agree.
    check(
      "users_onboarding_completed_check",
      sql`(${table.onboardingStatus} = 'completed') = (${table.onboardingCompletedAt} is not null)`,
    ),
    check(
      "users_tour_state_check",
      sql`${table.tourState} in ('not_offered', 'offered', 'dismissed', 'completed')`,
    ),
  ],
);

export type AppUser = typeof users.$inferSelect;

/**
 * Settings of the whole application, as one row. `spanish_enabled` is the
 * administrator's switch: off, the Spanish interface and the Spanish Bible are
 * unavailable to everyone, and English and the King James are used instead.
 * Nothing a person saved is changed by it. A database with no row yet is one
 * where nothing has been switched off.
 */
export const appSettings = pgTable(
  "app_settings",
  {
    singleton: boolean("singleton").primaryKey().default(true),
    spanishEnabled: boolean("spanish_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [check("app_settings_singleton_check", sql`${table.singleton}`)],
);

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
    /**
     * The development status. `captured`, which is what `idea` was called
     * before Phase 2D.1, was rewritten and refused by migration 0008.
     */
    status: text("status", { enum: ideaStatuses }).notNull().default("idea"),
    /** The length the sermon is meant for, not how it was delivered on any occasion. */
    intendedFormat: text("intended_format", { enum: intendedFormats })
      .notNull()
      .default("unspecified"),
    /**
     * Sermon details. They are kept when an idea is reclassified, so turning
     * it back into a sermon loses nothing; only sermons show them.
     *
     * Null is what `unspecified` was before Phase 2D.1; migration 0008 filled
     * the nulls and made the column NOT NULL.
     */
    sermonType: text("sermon_type", { enum: sermonTypes }).notNull().default("unspecified"),
    subject: text("subject"),
    /**
     * When the idea was archived; null while it is not. It is no status: an
     * archived idea keeps its status, format, type, and everything else, and
     * is given them back as they were.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /**
     * When the idea's content was last worked on: its title, subject, notes,
     * or passages. Null until that first happens after it was captured, so an
     * idea from before this column is measured from `createdAt`. A change of
     * status, format, type, kind, or tags, archiving, and preaching never set
     * it; `updatedAt` is the one that moves for any write.
     */
    lastDevelopedAt: timestamp("last_developed_at", { withTimezone: true }),
    /**
     * The version of what the idea itself says: its kind, title, notes,
     * subject, classifications, passages, and tags. Raised by one on each
     * write that changes any of those (features/ideas/ideas.ts) and by
     * nothing else: not archiving, outline work, relations, or preaching.
     * A change queued offline (Phase 5D.1) names the revision it was made
     * against, and a different one here is a conflict, never an overwrite.
     */
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("ideas_kind_check", sql`${table.kind} in ('sermon', 'point', 'undecided')`),
    check("ideas_status_check", sql`${table.status} in ('idea', 'developing', 'ready', 'on_hold')`),
    check(
      "ideas_intended_format_check",
      sql`${table.intendedFormat} in ('full_length', 'mini', 'flexible', 'unspecified')`,
    ),
    check(
      "ideas_sermon_type_check",
      sql`${table.sermonType} in ('topical', 'textual', 'expository', 'unspecified')`,
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
 * Which sermon ideas are related to which. The relation has no direction, so
 * each pair is stored once, with the lower ID first: the CHECK refuses a
 * sermon related to itself and the same pair written the other way round, and
 * the primary key refuses it twice. Reading a sermon's relations looks at both
 * columns.
 *
 * The owner is repeated and is part of both foreign keys, as in `idea_tags`,
 * so the database itself refuses a relation across accounts. Deleting either
 * sermon removes the row and leaves the other sermon alone. Whether an idea is
 * a sermon is not something a foreign key can say; `linkIdeas` checks it with
 * both rows locked. Nothing about a relation is stored on an idea.
 */
export const sermonRelations = pgTable(
  "sermon_relations",
  {
    sermonAId: uuid("sermon_a_id").notNull(),
    sermonBId: uuid("sermon_b_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sermonAId, table.sermonBId] }),
    foreignKey({
      name: "sermon_relations_sermon_a_fk",
      columns: [table.sermonAId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "sermon_relations_sermon_b_fk",
      columns: [table.sermonBId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    check("sermon_relations_order_check", sql`${table.sermonAId} < ${table.sermonBId}`),
    index("sermon_relations_sermon_b_idx").on(table.sermonBId),
  ],
);

/**
 * Which point ideas are related to which sermon ideas. A point may be related
 * to any number of sermons and stays one record; removing the row removes
 * neither idea. It says only that the two go together: it has no order and
 * nothing written for one sermon. A sermon's outline, when there is one, is
 * its own table and names a point directly, without needing a row here.
 *
 * Owned and deleted like `sermon_relations`.
 */
export const sermonPoints = pgTable(
  "sermon_points",
  {
    sermonId: uuid("sermon_id").notNull(),
    pointId: uuid("point_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sermonId, table.pointId] }),
    foreignKey({
      name: "sermon_points_sermon_fk",
      columns: [table.sermonId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "sermon_points_point_fk",
      columns: [table.pointId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    check("sermon_points_distinct_check", sql`${table.sermonId} <> ${table.pointId}`),
    index("sermon_points_point_idx").on(table.pointId),
  ],
);

/**
 * A passage attached to an idea, as numbers only: book 1 to 66 in canonical
 * order, then where it starts and ends. The text is read from `scripture_verses`
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
 * The Bible, one row per verse of each translation. Shared, read-only
 * reference data: it has no owner, the application never writes to it, and it
 * is loaded from data/bible/<translation>.json by the database commands (see
 * docs/DATABASE.md). Every translation numbers its chapters and verses alike.
 */
export const scriptureVerses = pgTable(
  "scripture_verses",
  {
    translation: text("translation", { enum: translationIds }).notNull(),
    book: smallint("book").notNull(),
    chapter: smallint("chapter").notNull(),
    verse: smallint("verse").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.translation, table.book, table.chapter, table.verse] }),
    check("scripture_verses_translation_check", sql`${table.translation} in ('kjv', 'rvg')`),
    // Word search. The "simple" configuration indexes every word exactly as
    // written, with no stemming and no stop words, so a search behaves like a
    // concordance; accented vowels are indexed as plain ones. Queries must use
    // the same expression (features/scripture/search-verses.ts).
    index("scripture_verses_search_idx").using(
      "gin",
      sql`to_tsvector('simple', translate(${table.text}, ${sql.raw(`'${accentFold.from}', '${accentFold.to}'`)}))`,
    ),
  ],
);

/**
 * The titles printed above verse 1 of many psalms, for each translation. They
 * belong to the psalm and not to any verse, so they are kept apart from
 * `scripture_verses`: they are not numbered, counted, selected, or searched.
 * A psalm without a title has no row.
 */
export const scripturePsalmTitles = pgTable(
  "scripture_psalm_titles",
  {
    translation: text("translation", { enum: translationIds }).notNull(),
    psalm: smallint("psalm").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.translation, table.psalm] }),
    check("scripture_psalm_titles_translation_check", sql`${table.translation} in ('kjv', 'rvg')`),
    check("scripture_psalm_titles_psalm_check", sql`${table.psalm} between 1 and 150`),
    check("scripture_psalm_titles_text_check", sql`char_length(btrim(${table.text})) > 0`),
  ],
);

/**
 * Superseded by `scripture_verses` in Phase 2C.2 and no longer read or
 * loaded. It is kept, with the King James text it holds, because the
 * deployment live while that migration ran still read it; a later migration
 * drops it.
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

/** Superseded by `scripture_psalm_titles` in Phase 2C.2, and kept for the same reason as `bible_verses`. */
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
 * `scripture_verses` when shown and is never copied here.
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
    check("bible_favorites_translation_check", sql`${table.translation} in ('kjv', 'rvg')`),
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
    check("bible_highlights_translation_check", sql`${table.translation} in ('kjv', 'rvg')`),
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

/**
 * Where a sermon was preached. Each belongs to one account and can be used on
 * any number of its occasions. A name is unique within the account without
 * regard to case; two accounts may use the same name.
 */
export const preachingVenues = pgTable(
  "preaching_venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** The town, or whatever else tells two venues of one name apart. */
    locality: text("locality"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("preaching_venues_name_check", sql`char_length(btrim(${table.name})) between 1 and 80`),
    check(
      "preaching_venues_locality_check",
      sql`${table.locality} is null or char_length(btrim(${table.locality})) between 1 and 120`,
    ),
    uniqueIndex("preaching_venues_owner_name_key").on(table.ownerId, sql`lower(${table.name})`),
    // What preaching_occurrences points at, so an occasion can only name its own owner's venue.
    unique("preaching_venues_id_owner_key").on(table.id, table.ownerId),
  ],
);

export type PreachingVenue = typeof preachingVenues.$inferSelect;

/**
 * What kind of occasion a sermon was preached on: a regular service, a
 * preaching class, a conference. Never the weekday or the part of the day,
 * which the occasion's date and `time_of_day` say. Owned and named like a
 * venue. No account is given any until it chooses or writes one.
 */
export const preachingContexts = pgTable(
  "preaching_contexts",
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
    check("preaching_contexts_name_check", sql`char_length(btrim(${table.name})) between 1 and 80`),
    uniqueIndex("preaching_contexts_owner_name_key").on(table.ownerId, sql`lower(${table.name})`),
    unique("preaching_contexts_id_owner_key").on(table.id, table.ownerId),
  ],
);

export type PreachingContext = typeof preachingContexts.$inferSelect;

/**
 * One occasion a sermon was preached on. The sermon is an idea and keeps its
 * one identity however often it is preached; nothing about an occasion is
 * stored on the idea, and recording one changes nothing there.
 *
 * The owner is repeated and is part of all three foreign keys, as in
 * `idea_tags`, so the database itself refuses an occasion that names another
 * account's sermon, venue, or context. Each is ON DELETE RESTRICT: history is
 * never removed, or left pointing at nothing, because something else was
 * deleted. Whether the idea is a sermon is not something a foreign key can
 * say; `createOccurrence` checks it with the idea's row locked.
 *
 * The same sermon may be preached twice on one date, so nothing here is
 * unique but the ID.
 */
export const preachingOccurrences = pgTable(
  "preaching_occurrences",
  {
    /** May be generated in the browser, so a repeated submission saves one row. */
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sermonId: uuid("sermon_id").notNull(),
    /** The calendar date where it was preached, as YYYY-MM-DD. It is never a moment and never converted. */
    preachedOn: date("preached_on", { mode: "string" }).notNull(),
    /** Null when it was not said. */
    timeOfDay: text("time_of_day", { enum: timesOfDay }),
    venueId: uuid("venue_id"),
    contextId: uuid("context_id"),
    /** The format it was delivered in, which the sermon's intended format does not decide. */
    actualFormat: text("actual_format", { enum: actualFormats }).notNull().default("unspecified"),
    /** Null when it was not said, which is not the same as zero. */
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    /** A link to a recording kept elsewhere. Nothing is uploaded, fetched, or embedded. */
    recordingUrl: text("recording_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "preaching_occurrences_sermon_fk",
      columns: [table.sermonId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "preaching_occurrences_venue_fk",
      columns: [table.venueId, table.ownerId],
      foreignColumns: [preachingVenues.id, preachingVenues.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "preaching_occurrences_context_fk",
      columns: [table.contextId, table.ownerId],
      foreignColumns: [preachingContexts.id, preachingContexts.ownerId],
    }).onDelete("restrict"),
    check(
      "preaching_occurrences_time_of_day_check",
      sql`${table.timeOfDay} is null or ${table.timeOfDay} in ('am', 'pm')`,
    ),
    check(
      "preaching_occurrences_actual_format_check",
      sql`${table.actualFormat} in ('full_length', 'mini', 'flexible', 'unspecified')`,
    ),
    check(
      "preaching_occurrences_duration_check",
      sql`${table.durationMinutes} is null or ${table.durationMinutes} between 0 and 1440`,
    ),
    check(
      "preaching_occurrences_notes_check",
      sql`${table.notes} is null or char_length(${table.notes}) <= 5000`,
    ),
    check(
      "preaching_occurrences_recording_url_check",
      sql`${table.recordingUrl} is null or (${table.recordingUrl} like 'https://%' and char_length(${table.recordingUrl}) <= 2048)`,
    ),
    // History, most recently preached first, for one account.
    index("preaching_occurrences_owner_date_idx").on(
      table.ownerId,
      table.preachedOn.desc(),
      table.id.desc(),
    ),
    // One sermon's occasions and their count, and the check made when an idea is deleted.
    index("preaching_occurrences_sermon_idx").on(table.sermonId, table.preachedOn.desc()),
    index("preaching_occurrences_venue_idx").on(table.venueId),
    index("preaching_occurrences_context_idx").on(table.contextId),
  ],
);

export type PreachingOccurrence = typeof preachingOccurrences.$inferSelect;

/**
 * A sermon's outline: one to a sermon, and never without one. It holds only
 * how the outline is numbered and how often its shape has changed; the
 * outline itself is its entries, and one with no entries is still an outline.
 *
 * The owner is repeated and is part of the foreign key, as in `idea_tags`.
 * Deleting the sermon removes its outline, as it does its references and
 * tags; deleting the outline leaves the sermon alone. Whether the idea is a
 * sermon is not something a foreign key can say; `createOutline` checks it
 * with the idea's row locked. Nothing about an outline is stored on the idea.
 */
export const sermonOutlines = pgTable(
  "sermon_outlines",
  {
    /** May be generated in the browser, so a repeated submission makes one outline. */
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    sermonId: uuid("sermon_id").notNull(),
    /**
     * How the points are numbered: the name of a built-in style, or a custom
     * one in full (features/outlines/numbering.ts). Numbers are worked out
     * from it when the outline is shown and are never stored on an entry.
     */
    numberingConfig: jsonb("numbering_config")
      .$type<NumberingConfig>()
      .notNull()
      .default({ version: 1, preset: "traditional" }),
    /**
     * How many times the outline's shape has changed: an entry added, moved,
     * or removed. A change that names the revision it was made against is
     * refused when another got there first. Editing an entry's words does not
     * move it.
     */
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "sermon_outlines_sermon_fk",
      columns: [table.sermonId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("cascade"),
    // One outline to a sermon, whatever asks for a second and however the requests arrive.
    unique("sermon_outlines_sermon_key").on(table.sermonId),
    // What outline_entries points at, so an entry can only belong to its outline's owner.
    unique("sermon_outlines_id_owner_key").on(table.id, table.ownerId),
    check(
      "sermon_outlines_numbering_config_check",
      sql`jsonb_typeof(${table.numberingConfig}) = 'object' and char_length(${table.numberingConfig}::text) <= 4000`,
    ),
    index("sermon_outlines_owner_updated_idx").on(table.ownerId, table.updatedAt.desc()),
  ],
);

export type SermonOutline = typeof sermonOutlines.$inferSelect;

/**
 * The entries of an outline: its points, at any depth, and its optional
 * introduction and conclusion. A point under another is a subpoint; there is
 * no type for that, and no limit on how deep they go.
 *
 * An entry holds its own words. One made from a saved point idea copies the
 * point's title and notes and remembers where they came from
 * (`source_point_id`); after that the two are edited apart, and deleting the
 * point clears the link and keeps the entry. The number an entry is shown
 * with is never part of its title.
 *
 * What the table itself refuses: a parent in another outline (the parent key
 * carries the outline), an entry of another account's outline or made from
 * another account's point (both keys carry the owner), an entry that is its
 * own parent, an introduction or conclusion under anything, a second of
 * either, and two points at one place under one parent. What it cannot say is
 * that a parent is a point and not a section, or that no entry is under one
 * of its own descendants; the service checks both with the outline's row
 * locked.
 */
export const outlineEntries = pgTable(
  "outline_entries",
  {
    /** May be generated in the browser, so a repeated submission adds one entry. */
    id: uuid("id").primaryKey().defaultRandom(),
    outlineId: uuid("outline_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    /** The point this one is under. Null for a main point and for a section. */
    parentId: uuid("parent_id"),
    entryType: text("entry_type", { enum: entryTypes }).notNull().default("point"),
    /**
     * A point's place among the points with the same parent: 0, 1, 2, … with
     * none missing. A section has no place to keep and holds 0.
     */
    position: integer("position").notNull(),
    /** May be empty: an entry can be made first and written afterwards. */
    title: text("title").notNull().default(""),
    notes: text("notes"),
    /** The saved point idea this entry was made from, while that idea exists. */
    sourcePointId: uuid("source_point_id"),
    /** How many times the entry's words have been changed. Moving it does not count. */
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "outline_entries_outline_fk",
      columns: [table.outlineId, table.ownerId],
      foreignColumns: [sermonOutlines.id, sermonOutlines.ownerId],
    }).onDelete("cascade"),
    // What the parent key points at, so a parent is always in the same outline.
    unique("outline_entries_id_outline_key").on(table.id, table.outlineId),
    foreignKey({
      name: "outline_entries_parent_fk",
      columns: [table.parentId, table.outlineId],
      foreignColumns: [table.id, table.outlineId],
    }).onDelete("cascade"),
    // In the migration this is ON DELETE SET NULL ("source_point_id"): only the
    // link is cleared, and the owner stays. See docs/DATABASE.md.
    foreignKey({
      name: "outline_entries_source_point_fk",
      columns: [table.sourcePointId, table.ownerId],
      foreignColumns: [ideas.id, ideas.ownerId],
    }).onDelete("set null"),
    check(
      "outline_entries_entry_type_check",
      sql`${table.entryType} in ('introduction', 'point', 'conclusion')`,
    ),
    check(
      "outline_entries_section_root_check",
      sql`${table.entryType} = 'point' or ${table.parentId} is null`,
    ),
    check(
      "outline_entries_not_own_parent_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
    check("outline_entries_title_check", sql`char_length(${table.title}) <= 200`),
    check(
      "outline_entries_notes_check",
      sql`${table.notes} is null or char_length(${table.notes}) between 1 and 2000`,
    ),
    // At most one introduction and one conclusion.
    uniqueIndex("outline_entries_section_key")
      .on(table.outlineId, table.entryType)
      .where(sql`${table.entryType} <> 'point'`),
    // One point to a place, among the main points and under each parent. The
    // second also reads the points under a parent, and serves the cascade.
    uniqueIndex("outline_entries_root_position_key")
      .on(table.outlineId, table.position)
      .where(sql`${table.parentId} is null and ${table.entryType} = 'point'`),
    uniqueIndex("outline_entries_child_position_key")
      .on(table.parentId, table.position)
      .where(sql`${table.parentId} is not null`),
    index("outline_entries_outline_idx").on(table.outlineId),
    index("outline_entries_source_point_idx").on(table.sourcePointId),
  ],
);

export type OutlineEntry = typeof outlineEntries.$inferSelect;

/**
 * A passage on an outline entry, as numbers only, exactly as on an idea
 * (`idea_scripture_references`): no text, and no translation. It is a table
 * of its own because a reference row belongs to one thing, and that table's
 * rows belong to ideas. An entry has no main text, so there is no
 * `is_primary`.
 */
export const outlineEntryScriptureReferences = pgTable(
  "outline_entry_scripture_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull(),
    position: smallint("position").notNull(),
    book: smallint("book").notNull(),
    chapterStart: smallint("chapter_start").notNull(),
    verseStart: smallint("verse_start"),
    chapterEnd: smallint("chapter_end"),
    verseEnd: smallint("verse_end"),
  },
  (table) => [
    // Named here: the name Drizzle would make up is longer than PostgreSQL keeps.
    foreignKey({
      name: "outline_entry_scripture_references_entry_fk",
      columns: [table.entryId],
      foreignColumns: [outlineEntries.id],
    }).onDelete("cascade"),
    unique("outline_entry_scripture_references_position_key").on(table.entryId, table.position),
    check("outline_entry_scripture_references_book_check", sql`${table.book} between 1 and 66`),
    check(
      "outline_entry_scripture_references_start_check",
      sql`${table.chapterStart} >= 1 and (${table.verseStart} is null or ${table.verseStart} >= 1)`,
    ),
    check(
      "outline_entry_scripture_references_chapter_end_check",
      sql`${table.chapterEnd} is null or ${table.chapterEnd} > ${table.chapterStart}`,
    ),
    check(
      "outline_entry_scripture_references_verse_end_check",
      sql`${table.verseEnd} is null or (${table.verseStart} is not null and ${table.verseEnd} >= 1 and (${table.chapterEnd} is not null or ${table.verseEnd} > ${table.verseStart}))`,
    ),
    check(
      "outline_entry_scripture_references_range_check",
      sql`${table.chapterEnd} is null or (${table.verseStart} is null) = (${table.verseEnd} is null)`,
    ),
  ],
);

/**
 * An outline's Preacher Studio sermon document (A2.1): one complete schema v4
 * document, as `restoreSermonDocument` accepted it and `doc.toJSON()` wrote
 * it. It is read and written only by
 * `src/features/sermon-editor/persistence/documents.ts`, and nothing creates
 * one yet: no page, no conversion, no sync.
 *
 * It is not part of the outline organizer (`src/features/outlines`) and does
 * not change it. Its `revision` is its own: how many times the document was
 * saved. `sermon_outlines.revision` still counts the legacy entries' shape,
 * and neither moves the other.
 *
 * The owner is repeated and is part of the key to the outline, so a document
 * can only belong to its outline's owner, and deleting the outline (or its
 * sermon) removes it. There is no size CHECK: the limit is the service's
 * (`documentLimits`), so it can change without a migration.
 */
export const sermonOutlineDocuments = pgTable(
  "sermon_outline_documents",
  {
    /** One document to an outline. */
    outlineId: uuid("outline_id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: jsonb("content").$type<JSONContent>().notNull(),
    /** 0 when created; one more for every save accepted against the revision before it. */
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "sermon_outline_documents_outline_fk",
      columns: [table.outlineId, table.ownerId],
      foreignColumns: [sermonOutlines.id, sermonOutlines.ownerId],
    }).onDelete("cascade"),
    check("sermon_outline_documents_content_check", sql`jsonb_typeof(${table.content}) = 'object'`),
    check("sermon_outline_documents_revision_check", sql`${table.revision} >= 0`),
  ],
);

export type SermonOutlineDocument = typeof sermonOutlineDocuments.$inferSelect;

/**
 * Changes sent from a device's offline queue (Phase 5C), one row per change
 * the server has applied, under its owner. The row is written in the same
 * transaction as the change, so a change delivered again (a retry, a second
 * tab, a reply that never arrived) is answered from here and never applied
 * twice, even after what it made was deleted. `op_id` is the device's own ID
 * for the change; for a quick capture it is the idea's ID. Nothing is stored
 * here but the fact: never the change's content.
 */
export const syncOperations = pgTable(
  "sync_operations",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opId: uuid("op_id").notNull(),
    type: text("type").notNull(),
    entityId: uuid("entity_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.opId] })],
);

/**
 * Contact and feedback (Phase 6A, features/support). A ticket is one
 * conversation. One sent from the public contact form has no account and
 * carries the sender's name and address; one sent from Help & Feedback has its
 * account, taken from the session, and no address of its own (the address is
 * Clerk's, asked for when mail is sent). `locale` is the sender's language
 * when they wrote, so mail about the ticket is in it.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    /** May be generated in the browser, so a repeated submission saves one ticket. */
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ticketKinds }).notNull(),
    source: text("source", { enum: ticketSources }).notNull(),
    status: text("status", { enum: ticketStatuses }).notNull().default("open"),
    subject: text("subject").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    /** A bug report's steps, what was expected, and where it happened. */
    steps: text("steps"),
    expected: text("expected"),
    area: text("area"),
    /** A feature request's reason: what it would let the person do. */
    useCase: text("use_case"),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    locale: text("locale", { enum: locales }).notNull().default("en"),
    /** A one-way hash of the public sender's network address, for rate limiting only. */
    ipHash: text("ip_hash"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the requester last opened it; a later public message is unread for them. */
    requesterReadAt: timestamp("requester_read_at", { withTimezone: true }),
    /** When an administrator last opened it; a later message from the requester is unread. */
    adminReadAt: timestamp("admin_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "support_tickets_kind_check",
      sql`${table.kind} in ('contact', 'bug', 'feature', 'feedback')`,
    ),
    check(
      "support_tickets_status_check",
      sql`${table.status} in ('open', 'under_review', 'planned', 'in_progress', 'resolved', 'closed')`,
    ),
    // A public message has an address and no account; an account's has an account and no address.
    check(
      "support_tickets_source_check",
      sql`(${table.source} = 'public' and ${table.userId} is null and ${table.contactEmail} is not null and ${table.kind} = 'contact') or (${table.source} = 'app' and ${table.userId} is not null and ${table.contactEmail} is null)`,
    ),
    check("support_tickets_subject_check", sql`char_length(${table.subject}) between 1 and 160`),
    index("support_tickets_user_idx").on(table.userId, table.lastMessageAt.desc()),
    index("support_tickets_status_idx").on(table.status, table.lastMessageAt.desc()),
    index("support_tickets_ip_idx").on(table.ipHash, table.createdAt),
    index("support_tickets_email_idx").on(table.contactEmail, table.createdAt),
  ],
);

export type SupportTicket = typeof supportTickets.$inferSelect;

/**
 * What was said on a ticket, oldest first; the first is the submission
 * itself. An `internal` message is a note between administrators and is never
 * shown to, or mailed to, the requester.
 */
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    /** Null for a public sender, who has no account. */
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "restrict" }),
    author: text("author", { enum: messageAuthors }).notNull(),
    visibility: text("visibility", { enum: messageVisibilities }).notNull().default("public"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("support_messages_author_check", sql`${table.author} in ('requester', 'admin')`),
    // Only an administrator writes an internal note.
    check(
      "support_messages_visibility_check",
      sql`${table.visibility} = 'public' or (${table.visibility} = 'internal' and ${table.author} = 'admin')`,
    ),
    check("support_messages_body_check", sql`char_length(${table.body}) between 1 and 5000`),
    index("support_messages_ticket_idx").on(table.ticketId, table.createdAt),
    index("support_messages_author_idx").on(table.authorUserId, table.createdAt),
  ],
);

export type SupportMessage = typeof supportMessages.$inferSelect;

/** Every change of a ticket's status, by whom and when. */
export const supportStatusEvents = pgTable(
  "support_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: ticketStatuses }).notNull(),
    toStatus: text("to_status", { enum: ticketStatuses }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("support_status_events_ticket_idx").on(table.ticketId, table.createdAt)],
);

export type SupportStatusEvent = typeof supportStatusEvents.$inferSelect;

/**
 * A screenshot in private Blob storage. It is uploaded before its ticket
 * exists and belongs to its uploader until a ticket of theirs takes it; one
 * still unattached after a day is deleted. It is only ever served through
 * `/api/support/attachments/<id>`, to its owner or an administrator.
 */
export const supportAttachments = pgTable(
  "support_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "cascade" }),
    pathname: text("pathname").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "support_attachments_type_check",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check("support_attachments_size_check", sql`${table.size} between 1 and 4194304`),
    index("support_attachments_owner_idx").on(table.ownerId, table.ticketId, table.createdAt),
    index("support_attachments_ticket_idx").on(table.ticketId),
  ],
);

export type SupportAttachment = typeof supportAttachments.$inferSelect;

/**
 * What an account is told about (features/notifications). One row per
 * recipient and event: the same event never makes a second. It names its
 * ticket and kind, never what anyone wrote.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: notificationKinds }).notNull(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    status: text("status", { enum: ticketStatuses }),
    eventKey: text("event_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "notifications_kind_check",
      sql`${table.kind} in ('reply', 'status', 'new_ticket', 'user_reply', 'contact')`,
    ),
    unique("notifications_recipient_event_key").on(table.recipientId, table.eventKey),
    index("notifications_recipient_created_idx").on(table.recipientId, table.createdAt.desc()),
  ],
);

export type Notification = typeof notifications.$inferSelect;

/** A device an account turned push notifications on for. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_owner_idx").on(table.ownerId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
