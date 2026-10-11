CREATE TABLE "bible_favorite_verses" (
	"favorite_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"book" smallint NOT NULL,
	"chapter" smallint NOT NULL,
	"verse" smallint NOT NULL,
	CONSTRAINT "bible_favorite_verses_favorite_id_book_chapter_verse_pk" PRIMARY KEY("favorite_id","book","chapter","verse"),
	CONSTRAINT "bible_favorite_verses_position_key" UNIQUE("favorite_id","position"),
	CONSTRAINT "bible_favorite_verses_place_check" CHECK ("bible_favorite_verses"."book" between 1 and 66 and "bible_favorite_verses"."chapter" >= 1 and "bible_favorite_verses"."verse" >= 1)
);
--> statement-breakpoint
CREATE TABLE "bible_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"translation" text NOT NULL,
	"selection_key" text NOT NULL,
	"reference" text NOT NULL,
	"first_book" smallint NOT NULL,
	"first_chapter" smallint NOT NULL,
	"first_verse" smallint NOT NULL,
	"label" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bible_favorites_selection_key" UNIQUE("owner_id","translation","selection_key"),
	CONSTRAINT "bible_favorites_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "bible_favorites_translation_check" CHECK ("bible_favorites"."translation" in ('kjv')),
	CONSTRAINT "bible_favorites_label_check" CHECK ("bible_favorites"."label" is null or char_length(btrim("bible_favorites"."label")) between 1 and 120),
	CONSTRAINT "bible_favorites_notes_check" CHECK ("bible_favorites"."notes" is null or char_length("bible_favorites"."notes") <= 2000),
	CONSTRAINT "bible_favorites_first_check" CHECK ("bible_favorites"."first_book" between 1 and 66)
);
--> statement-breakpoint
CREATE TABLE "bible_highlights" (
	"owner_id" uuid NOT NULL,
	"translation" text NOT NULL,
	"book" smallint NOT NULL,
	"chapter" smallint NOT NULL,
	"verse" smallint NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bible_highlights_owner_id_translation_book_chapter_verse_pk" PRIMARY KEY("owner_id","translation","book","chapter","verse"),
	CONSTRAINT "bible_highlights_translation_check" CHECK ("bible_highlights"."translation" in ('kjv')),
	CONSTRAINT "bible_highlights_color_check" CHECK ("bible_highlights"."color" in ('yellow', 'green', 'blue', 'red')),
	CONSTRAINT "bible_highlights_place_check" CHECK ("bible_highlights"."book" between 1 and 66 and "bible_highlights"."chapter" >= 1 and "bible_highlights"."verse" >= 1)
);
--> statement-breakpoint
ALTER TABLE "bible_favorite_verses" ADD CONSTRAINT "bible_favorite_verses_favorite_fk" FOREIGN KEY ("favorite_id","owner_id") REFERENCES "public"."bible_favorites"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_favorites" ADD CONSTRAINT "bible_favorites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_highlights" ADD CONSTRAINT "bible_highlights_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bible_favorite_verses_owner_place_idx" ON "bible_favorite_verses" USING btree ("owner_id","book","chapter");--> statement-breakpoint
CREATE INDEX "bible_favorites_owner_created_idx" ON "bible_favorites" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bible_favorites_owner_updated_idx" ON "bible_favorites" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bible_favorites_owner_place_idx" ON "bible_favorites" USING btree ("owner_id","first_book","first_chapter","first_verse");