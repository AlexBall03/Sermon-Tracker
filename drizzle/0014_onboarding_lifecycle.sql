ALTER TABLE "users" ADD COLUMN "onboarding_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_step" text DEFAULT 'welcome' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tour_state" text DEFAULT 'not_offered' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "onboarding_status" = 'grandfathered';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_onboarding_status_check" CHECK ("users"."onboarding_status" in ('pending', 'completed', 'grandfathered'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_onboarding_step_check" CHECK ("users"."onboarding_step" in ('welcome', 'ministry', 'preferences', 'finish'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_onboarding_completed_check" CHECK (("users"."onboarding_status" = 'completed') = ("users"."onboarding_completed_at" is not null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tour_state_check" CHECK ("users"."tour_state" in ('not_offered', 'offered', 'dismissed', 'completed'));