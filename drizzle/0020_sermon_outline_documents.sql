CREATE TABLE "sermon_outline_documents" (
	"outline_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_outline_documents_content_check" CHECK (jsonb_typeof("sermon_outline_documents"."content") = 'object'),
	CONSTRAINT "sermon_outline_documents_revision_check" CHECK ("sermon_outline_documents"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sermon_outline_documents" ADD CONSTRAINT "sermon_outline_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_outline_documents" ADD CONSTRAINT "sermon_outline_documents_outline_fk" FOREIGN KEY ("outline_id","owner_id") REFERENCES "public"."sermon_outlines"("id","owner_id") ON DELETE cascade ON UPDATE no action;