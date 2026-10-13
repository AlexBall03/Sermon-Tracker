CREATE TABLE "preaching_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preaching_contexts_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "preaching_contexts_name_check" CHECK (char_length(btrim("preaching_contexts"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "preaching_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"sermon_id" uuid NOT NULL,
	"preached_on" date NOT NULL,
	"time_of_day" text,
	"venue_id" uuid,
	"context_id" uuid,
	"actual_format" text DEFAULT 'unspecified' NOT NULL,
	"duration_minutes" integer,
	"notes" text,
	"recording_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preaching_occurrences_time_of_day_check" CHECK ("preaching_occurrences"."time_of_day" is null or "preaching_occurrences"."time_of_day" in ('am', 'pm')),
	CONSTRAINT "preaching_occurrences_actual_format_check" CHECK ("preaching_occurrences"."actual_format" in ('full_length', 'mini', 'flexible', 'unspecified')),
	CONSTRAINT "preaching_occurrences_duration_check" CHECK ("preaching_occurrences"."duration_minutes" is null or "preaching_occurrences"."duration_minutes" between 0 and 1440),
	CONSTRAINT "preaching_occurrences_notes_check" CHECK ("preaching_occurrences"."notes" is null or char_length("preaching_occurrences"."notes") <= 5000),
	CONSTRAINT "preaching_occurrences_recording_url_check" CHECK ("preaching_occurrences"."recording_url" is null or ("preaching_occurrences"."recording_url" like 'https://%' and char_length("preaching_occurrences"."recording_url") <= 2048))
);
--> statement-breakpoint
CREATE TABLE "preaching_venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"locality" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preaching_venues_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "preaching_venues_name_check" CHECK (char_length(btrim("preaching_venues"."name")) between 1 and 80),
	CONSTRAINT "preaching_venues_locality_check" CHECK ("preaching_venues"."locality" is null or char_length(btrim("preaching_venues"."locality")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "preaching_contexts" ADD CONSTRAINT "preaching_contexts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preaching_occurrences" ADD CONSTRAINT "preaching_occurrences_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preaching_occurrences" ADD CONSTRAINT "preaching_occurrences_sermon_fk" FOREIGN KEY ("sermon_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preaching_occurrences" ADD CONSTRAINT "preaching_occurrences_venue_fk" FOREIGN KEY ("venue_id","owner_id") REFERENCES "public"."preaching_venues"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preaching_occurrences" ADD CONSTRAINT "preaching_occurrences_context_fk" FOREIGN KEY ("context_id","owner_id") REFERENCES "public"."preaching_contexts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preaching_venues" ADD CONSTRAINT "preaching_venues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preaching_contexts_owner_name_key" ON "preaching_contexts" USING btree ("owner_id",lower("name"));--> statement-breakpoint
CREATE INDEX "preaching_occurrences_owner_date_idx" ON "preaching_occurrences" USING btree ("owner_id","preached_on" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "preaching_occurrences_sermon_idx" ON "preaching_occurrences" USING btree ("sermon_id","preached_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "preaching_occurrences_venue_idx" ON "preaching_occurrences" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "preaching_occurrences_context_idx" ON "preaching_occurrences" USING btree ("context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preaching_venues_owner_name_key" ON "preaching_venues" USING btree ("owner_id",lower("name"));