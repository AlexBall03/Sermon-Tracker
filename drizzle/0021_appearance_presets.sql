CREATE TABLE "appearance_preset_operations" (
	"owner_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"preset_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_preset_operations_owner_id_operation_id_pk" PRIMARY KEY("owner_id","operation_id"),
	CONSTRAINT "appearance_preset_operations_kind_check" CHECK ("appearance_preset_operations"."kind" in ('create', 'duplicate')),
	CONSTRAINT "appearance_preset_operations_fingerprint_check" CHECK (char_length("appearance_preset_operations"."fingerprint") = 64)
);
--> statement-breakpoint
CREATE TABLE "appearance_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"appearance" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_presets_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "appearance_presets_name_check" CHECK (char_length(btrim("appearance_presets"."name")) between 1 and 80 and "appearance_presets"."name" = btrim("appearance_presets"."name")),
	CONSTRAINT "appearance_presets_appearance_check" CHECK (jsonb_typeof("appearance_presets"."appearance") = 'object' and octet_length("appearance_presets"."appearance"::text) <= 65536),
	CONSTRAINT "appearance_presets_revision_check" CHECK ("appearance_presets"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_builtin_appearance_preset" text DEFAULT 'balanced';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_personal_appearance_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "appearance_default_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "appearance_preset_operations" ADD CONSTRAINT "appearance_preset_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_presets" ADD CONSTRAINT "appearance_presets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_presets_owner_name_key" ON "appearance_presets" USING btree ("owner_id",lower("name"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_appearance_preset_fk" FOREIGN KEY ("default_personal_appearance_preset_id","id") REFERENCES "public"."appearance_presets"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_builtin_appearance_preset_check" CHECK ("users"."default_builtin_appearance_preset" is null or "users"."default_builtin_appearance_preset" in ('minimal', 'balanced', 'expressive'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_appearance_preset_check" CHECK (("users"."default_builtin_appearance_preset" is null) <> ("users"."default_personal_appearance_preset_id" is null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_appearance_default_revision_check" CHECK ("users"."appearance_default_revision" >= 1);