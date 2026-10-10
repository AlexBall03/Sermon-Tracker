CREATE TABLE "idea_tags" (
	"idea_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_tags_idea_id_tag_id_pk" PRIMARY KEY("idea_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_id_owner_key" UNIQUE("id","owner_id"),
	CONSTRAINT "tags_name_check" CHECK (char_length(btrim("tags"."name")) between 1 and 50)
);--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_id_owner_key" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "idea_tags" ADD CONSTRAINT "idea_tags_idea_fk" FOREIGN KEY ("idea_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_tags" ADD CONSTRAINT "idea_tags_tag_fk" FOREIGN KEY ("tag_id","owner_id") REFERENCES "public"."tags"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_tags_tag_idx" ON "idea_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_owner_name_key" ON "tags" USING btree ("owner_id",lower("name"));--> statement-breakpoint
CREATE INDEX "ideas_owner_created_idx" ON "ideas" USING btree ("owner_id","created_at" DESC NULLS LAST);