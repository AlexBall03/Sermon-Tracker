CREATE TABLE "sermon_points" (
	"sermon_id" uuid NOT NULL,
	"point_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_points_sermon_id_point_id_pk" PRIMARY KEY("sermon_id","point_id"),
	CONSTRAINT "sermon_points_distinct_check" CHECK ("sermon_points"."sermon_id" <> "sermon_points"."point_id")
);
--> statement-breakpoint
CREATE TABLE "sermon_relations" (
	"sermon_a_id" uuid NOT NULL,
	"sermon_b_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_relations_sermon_a_id_sermon_b_id_pk" PRIMARY KEY("sermon_a_id","sermon_b_id"),
	CONSTRAINT "sermon_relations_order_check" CHECK ("sermon_relations"."sermon_a_id" < "sermon_relations"."sermon_b_id")
);
--> statement-breakpoint
ALTER TABLE "sermon_points" ADD CONSTRAINT "sermon_points_sermon_fk" FOREIGN KEY ("sermon_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_points" ADD CONSTRAINT "sermon_points_point_fk" FOREIGN KEY ("point_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_relations" ADD CONSTRAINT "sermon_relations_sermon_a_fk" FOREIGN KEY ("sermon_a_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_relations" ADD CONSTRAINT "sermon_relations_sermon_b_fk" FOREIGN KEY ("sermon_b_id","owner_id") REFERENCES "public"."ideas"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sermon_points_point_idx" ON "sermon_points" USING btree ("point_id");--> statement-breakpoint
CREATE INDEX "sermon_relations_sermon_b_idx" ON "sermon_relations" USING btree ("sermon_b_id");