ALTER TABLE "youtube_connections" ADD COLUMN "channel_traffic_sources" jsonb;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "channel_traffic_sources_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "channel_search_terms" jsonb;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "channel_search_terms_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "youtube_video_insights" ADD COLUMN "creator_content_type" text;