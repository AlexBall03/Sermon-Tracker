UPDATE "ideas" SET "status" = 'idea' WHERE "status" = 'captured';--> statement-breakpoint
UPDATE "ideas" SET "sermon_type" = 'unspecified' WHERE "sermon_type" IS NULL;--> statement-breakpoint
ALTER TABLE "ideas" DROP CONSTRAINT "ideas_status_check";--> statement-breakpoint
ALTER TABLE "ideas" DROP CONSTRAINT "ideas_sermon_type_check";--> statement-breakpoint
ALTER TABLE "ideas" ALTER COLUMN "sermon_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_status_check" CHECK ("ideas"."status" in ('idea', 'developing', 'ready', 'on_hold'));--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_sermon_type_check" CHECK ("ideas"."sermon_type" in ('topical', 'textual', 'expository', 'unspecified'));