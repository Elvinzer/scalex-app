CREATE TYPE "public"."admin_idea_status" AS ENUM('backlog', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "admin_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "admin_idea_status" DEFAULT 'backlog' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_ideas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_ideas" ADD CONSTRAINT "admin_ideas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_ideas_status_position_idx" ON "admin_ideas" USING btree ("status","position");--> statement-breakpoint
CREATE INDEX "admin_ideas_created_by_idx" ON "admin_ideas" USING btree ("created_by_user_id");