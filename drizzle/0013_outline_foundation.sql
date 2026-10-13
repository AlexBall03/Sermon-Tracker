CREATE TABLE "outline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outline_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"parent_id" uuid,
	"entry_type" text DEFAULT 'point' NOT NULL,
	"position" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"notes" text,
	"source_point_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outline_entries_id_outline_key" UNIQUE("id","outline_id"),
	CONSTRAINT "outline_entries_entry_type_check" CHECK ("outline_entries"."entry_type" in ('introduction', 'point', 'conclusion')),
	CONSTRAINT "outline_entries_section_root_check" CHECK ("outline_entries"."entry_type" = 'point' or "outline_entries"."parent_id" is null),
	CONSTRAINT "outline_entries_not_own_parent_check" CHECK ("outline_entries"."parent_id" is null or "outline_entries"."parent_id" <> "outline_entries"."id"),
	CONSTRAINT "outline_entries_title_check" CHECK (char_length("outline_entries"."title") <= 200),
	CONSTRAINT "outline_entries_notes_check" CHECK ("outline_entries"."notes" is null or char_length("outline_entries"."notes") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "outline_entry_scripture_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"book" smallint NOT NULL,
	"chapter_start" smallint NOT NULL,
	"verse_start" smallint,
	"chapter_end" smallint,
	"verse_end" smallint,
	CONSTRAINT "outline_entry_scripture_references_position_key" UNIQUE("entry_id","position"),
	CONSTRAINT "outline_entry_scripture_references_book_check" CHECK ("outline_entry_scripture_references"."book" between 1 and 66),
	CONSTRAINT "outline_entry_scripture_references_start_check" CHECK ("outline_entry_scripture_references"."chapter_start" >= 1 and ("outline_entry_scripture_references"."verse_start" is null or "outline_entry_scripture_references"."verse_start" >= 1)),
	CONSTRAINT "outline_entry_scripture_references_chapter_end_check" CHECK ("outline_entry_scripture_references"."chapter_end" is null or "outline_entry_scripture_references"."chapter_end" > "outline_entry_scripture_references"."chapter_start"),
	CONSTRAINT "outline_entry_scripture_references_verse_end_check" CHECK ("outline_entry_scripture_references"."verse_end" is null or ("outline_entry_scripture_references"."verse_start" is not null and "outline_entry_scripture_references"."verse_end" >= 1 and ("outline_entry_scripture_references"."chapter_end" is not null or "outline_entry_scripture_references"."verse_end" > "outline_entry_scripture_references"."verse_start"))),
	CONSTRAINT "outline_entry_scripture_references_range_check" CHECK ("outline_entry_scripture_references"."chapter_end" is null or ("outline_entry_scripture_references"."verse_start" is null) = ("outline_entry_scripture_references"."verse_end" is null))
);
--> statement-breakpoint
CREATE TABLE "sermon_outlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"sermon_id" uuid NOT NULL,
	"numbering_config" jsonb DEFAULT '{"version":1,"preset":"traditional"}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_outlines_sermon_key" UNIQUE("sermon_id"),
	CONSTRAINT "sermon_outlines_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "sermon_outlines_numbering_config_check" CHECK (jsonb_typeof("sermon_outlines"."numbering_config") = 'object' and char_length("sermon_outlines"."numbering_config"::text) <= 4000)
);
--> statement-breakpoint
ALTER TABLE "outline_entries" ADD CONSTRAINT "outline_entries_outline_fk" FOREIGN KEY ("outline_id","owner_id") REFERENCES "public"."sermon_outlines"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_entries" ADD CONSTRAINT "outline_entries_parent_fk" FOREIGN KEY ("parent_id","outline_id") REFERENCES "public"."outline_entries"("id","outline_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_entries" ADD CONSTRAINT "outline_entries_source_point_fk" FOREIGN KEY ("source_point_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE set null ("source_point_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_entry_scripture_references" ADD CONSTRAINT "outline_entry_scripture_references_entry_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."outline_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_outlines" ADD CONSTRAINT "sermon_outlines_sermon_fk" FOREIGN KEY ("sermon_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outline_entries_section_key" ON "outline_entries" USING btree ("outline_id","entry_type") WHERE "outline_entries"."entry_type" <> 'point';--> statement-breakpoint
CREATE UNIQUE INDEX "outline_entries_root_position_key" ON "outline_entries" USING btree ("outline_id","position") WHERE "outline_entries"."parent_id" is null and "outline_entries"."entry_type" = 'point';--> statement-breakpoint
CREATE UNIQUE INDEX "outline_entries_child_position_key" ON "outline_entries" USING btree ("parent_id","position") WHERE "outline_entries"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "outline_entries_outline_idx" ON "outline_entries" USING btree ("outline_id");--> statement-breakpoint
CREATE INDEX "outline_entries_source_point_idx" ON "outline_entries" USING btree ("source_point_id");--> statement-breakpoint
CREATE INDEX "sermon_outlines_owner_updated_idx" ON "sermon_outlines" USING btree ("owner_id","updated_at" DESC NULLS LAST);