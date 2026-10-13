ALTER TABLE "users" ADD COLUMN "church_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ministry_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attends_preaching_class" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_church_name_check" CHECK ("users"."church_name" is null or char_length(btrim("users"."church_name")) between 1 and 120);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ministry_role_check" CHECK ("users"."ministry_role" is null or char_length(btrim("users"."ministry_role")) between 1 and 80);