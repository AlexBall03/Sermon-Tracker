CREATE TABLE "support_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ticket_id" uuid,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_attachments_pathname_unique" UNIQUE("pathname"),
	CONSTRAINT "support_attachments_type_check" CHECK ("support_attachments"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "support_attachments_size_check" CHECK ("support_attachments"."size" between 1 and 4194304)
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_author_check" CHECK ("support_messages"."author" in ('requester', 'admin')),
	CONSTRAINT "support_messages_visibility_check" CHECK ("support_messages"."visibility" = 'public' or ("support_messages"."visibility" = 'internal' and "support_messages"."author" = 'admin')),
	CONSTRAINT "support_messages_body_check" CHECK (char_length("support_messages"."body") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "support_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"subject" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"steps" text,
	"expected" text,
	"area" text,
	"use_case" text,
	"page_url" text,
	"user_agent" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"ip_hash" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester_read_at" timestamp with time zone,
	"admin_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_kind_check" CHECK ("support_tickets"."kind" in ('contact', 'bug', 'feature', 'feedback')),
	CONSTRAINT "support_tickets_status_check" CHECK ("support_tickets"."status" in ('open', 'under_review', 'planned', 'in_progress', 'resolved', 'closed')),
	CONSTRAINT "support_tickets_source_check" CHECK (("support_tickets"."source" = 'public' and "support_tickets"."user_id" is null and "support_tickets"."contact_email" is not null and "support_tickets"."kind" = 'contact') or ("support_tickets"."source" = 'app' and "support_tickets"."user_id" is not null and "support_tickets"."contact_email" is null)),
	CONSTRAINT "support_tickets_subject_check" CHECK (char_length("support_tickets"."subject") between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_status_events" ADD CONSTRAINT "support_status_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_status_events" ADD CONSTRAINT "support_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_attachments_owner_idx" ON "support_attachments" USING btree ("owner_id","ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_attachments_ticket_idx" ON "support_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_author_idx" ON "support_messages" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_status_events_ticket_idx" ON "support_status_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_ip_idx" ON "support_tickets" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_email_idx" ON "support_tickets" USING btree ("contact_email","created_at");