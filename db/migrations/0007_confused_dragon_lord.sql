CREATE TYPE "public"."content_recommendation_status" AS ENUM('new', 'building', 'filming', 'published');--> statement-breakpoint
ALTER TYPE "public"."conversation_topic_type" ADD VALUE 'content_idea';--> statement-breakpoint
ALTER TYPE "public"."improvement_event_type" ADD VALUE 'content_recommendation_accepted';--> statement-breakpoint
CREATE TABLE "content_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"angle" text NOT NULL,
	"rationale" text NOT NULL,
	"est_impact" integer,
	"impact_basis" text,
	"effort" text NOT NULL,
	"status" "content_recommendation_status" DEFAULT 'new' NOT NULL,
	"source_video_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_video_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_recommendations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "winning_patterns" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"formats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title_structures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"angles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_video_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analyzed_video_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "winning_patterns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_recommendations" ADD CONSTRAINT "content_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_recommendations_user_created_idx" ON "content_recommendations" USING btree ("user_id","created_at");--> statement-breakpoint
-- video_attributions and the deep YouTube insight columns already exist in the
-- shared database but were absent from the last committed Drizzle snapshot.
-- They are intentionally not replayed here; 0007 only applies this feature's
-- new tables/types while the generated 0007 snapshot records the full schema.
