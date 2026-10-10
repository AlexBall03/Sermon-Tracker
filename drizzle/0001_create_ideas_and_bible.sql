CREATE TABLE "bible_verses" (
	"book" smallint NOT NULL,
	"chapter" smallint NOT NULL,
	"verse" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "bible_verses_book_chapter_verse_pk" PRIMARY KEY("book","chapter","verse")
);
--> statement-breakpoint
CREATE TABLE "idea_scripture_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"book" smallint NOT NULL,
	"chapter_start" smallint NOT NULL,
	"verse_start" smallint,
	"chapter_end" smallint,
	"verse_end" smallint,
	CONSTRAINT "idea_scripture_references_position_key" UNIQUE("idea_id","position"),
	CONSTRAINT "idea_scripture_references_book_check" CHECK ("idea_scripture_references"."book" between 1 and 66),
	CONSTRAINT "idea_scripture_references_start_check" CHECK ("idea_scripture_references"."chapter_start" >= 1 and ("idea_scripture_references"."verse_start" is null or "idea_scripture_references"."verse_start" >= 1)),
	CONSTRAINT "idea_scripture_references_chapter_end_check" CHECK ("idea_scripture_references"."chapter_end" is null or "idea_scripture_references"."chapter_end" > "idea_scripture_references"."chapter_start"),
	CONSTRAINT "idea_scripture_references_verse_end_check" CHECK ("idea_scripture_references"."verse_end" is null or ("idea_scripture_references"."verse_start" is not null and "idea_scripture_references"."verse_end" >= 1 and ("idea_scripture_references"."chapter_end" is not null or "idea_scripture_references"."verse_end" > "idea_scripture_references"."verse_start"))),
	CONSTRAINT "idea_scripture_references_range_check" CHECK ("idea_scripture_references"."chapter_end" is null or ("idea_scripture_references"."verse_start" is null) = ("idea_scripture_references"."verse_end" is null))
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text DEFAULT 'undecided' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'captured' NOT NULL,
	"sermon_type" text,
	"subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_kind_check" CHECK ("ideas"."kind" in ('sermon', 'point', 'undecided')),
	CONSTRAINT "ideas_status_check" CHECK ("ideas"."status" in ('captured', 'developing', 'ready')),
	CONSTRAINT "ideas_sermon_type_check" CHECK ("ideas"."sermon_type" is null or "ideas"."sermon_type" in ('topical', 'expository')),
	CONSTRAINT "ideas_title_check" CHECK (char_length(btrim("ideas"."title")) between 1 and 200),
	CONSTRAINT "ideas_subject_check" CHECK ("ideas"."subject" is null or char_length("ideas"."subject") between 1 and 200),
	CONSTRAINT "ideas_notes_check" CHECK ("ideas"."notes" is null or char_length("ideas"."notes") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "reference_datasets" (
	"name" text PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"row_count" integer NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_scripture_references" ADD CONSTRAINT "idea_scripture_references_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_scripture_references_primary_key" ON "idea_scripture_references" USING btree ("idea_id") WHERE "idea_scripture_references"."is_primary";--> statement-breakpoint
CREATE INDEX "ideas_owner_updated_idx" ON "ideas" USING btree ("owner_id","updated_at" DESC NULLS LAST);