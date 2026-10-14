CREATE TABLE "sync_operations" (
	"owner_id" uuid NOT NULL,
	"op_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_owner_id_op_id_pk" PRIMARY KEY("owner_id","op_id")
);
--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;