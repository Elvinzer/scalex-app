ALTER TABLE "youtube_reporting_jobs" ADD COLUMN "remote_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "youtube_video_insights" ADD COLUMN "reach_status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
UPDATE "youtube_video_insights"
SET "reach_status" = 'available'
WHERE "impressions" IS NOT NULL OR "impressions_click_through_rate" IS NOT NULL;
