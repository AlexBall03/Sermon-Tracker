CREATE TABLE "app_settings" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"spanish_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "app_settings_singleton_check" CHECK ("app_settings"."singleton")
);
--> statement-breakpoint
CREATE TABLE "scripture_psalm_titles" (
	"translation" text NOT NULL,
	"psalm" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "scripture_psalm_titles_translation_psalm_pk" PRIMARY KEY("translation","psalm"),
	CONSTRAINT "scripture_psalm_titles_translation_check" CHECK ("scripture_psalm_titles"."translation" in ('kjv', 'rvg')),
	CONSTRAINT "scripture_psalm_titles_psalm_check" CHECK ("scripture_psalm_titles"."psalm" between 1 and 150),
	CONSTRAINT "scripture_psalm_titles_text_check" CHECK (char_length(btrim("scripture_psalm_titles"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "scripture_verses" (
	"translation" text NOT NULL,
	"book" smallint NOT NULL,
	"chapter" smallint NOT NULL,
	"verse" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "scripture_verses_translation_book_chapter_verse_pk" PRIMARY KEY("translation","book","chapter","verse"),
	CONSTRAINT "scripture_verses_translation_check" CHECK ("scripture_verses"."translation" in ('kjv', 'rvg'))
);
--> statement-breakpoint
ALTER TABLE "bible_favorites" DROP CONSTRAINT "bible_favorites_translation_check";--> statement-breakpoint
ALTER TABLE "bible_highlights" DROP CONSTRAINT "bible_highlights_translation_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bible_translation" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scripture_verses_search_idx" ON "scripture_verses" USING gin (to_tsvector('simple', translate("text", 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')));--> statement-breakpoint
ALTER TABLE "bible_favorites" ADD CONSTRAINT "bible_favorites_translation_check" CHECK ("bible_favorites"."translation" in ('kjv', 'rvg'));--> statement-breakpoint
ALTER TABLE "bible_highlights" ADD CONSTRAINT "bible_highlights_translation_check" CHECK ("bible_highlights"."translation" in ('kjv', 'rvg'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('en', 'es'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bible_translation_check" CHECK ("users"."bible_translation" is null or "users"."bible_translation" in ('kjv', 'rvg'));