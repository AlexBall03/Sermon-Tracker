ALTER TABLE "ideas" DROP CONSTRAINT "ideas_status_check";--> statement-breakpoint
ALTER TABLE "ideas" DROP CONSTRAINT "ideas_sermon_type_check";--> statement-breakpoint
ALTER TABLE "ideas" ALTER COLUMN "status" SET DEFAULT 'idea';--> statement-breakpoint
ALTER TABLE "ideas" ALTER COLUMN "sermon_type" SET DEFAULT 'unspecified';--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "intended_format" text DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_intended_format_check" CHECK ("ideas"."intended_format" in ('full_length', 'mini', 'flexible', 'unspecified'));--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_status_check" CHECK ("ideas"."status" in ('idea', 'developing', 'ready', 'on_hold', 'captured'));--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_sermon_type_check" CHECK ("ideas"."sermon_type" is null or "ideas"."sermon_type" in ('topical', 'textual', 'expository', 'unspecified'));