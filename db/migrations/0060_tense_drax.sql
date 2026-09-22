CREATE TABLE "youtube_card_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"captured_on" date NOT NULL,
	"card_type" text NOT NULL,
	"card_id" text NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"click_rate" real,
	"teaser_impressions" integer,
	"teaser_clicks" integer,
	"raw_row" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_card_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_end_screen_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"captured_on" date NOT NULL,
	"element_type" text NOT NULL,
	"element_id" text NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"click_rate" real,
	"raw_row" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_end_screen_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_reporting_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"report_type_id" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_report_start_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_reporting_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_reporting_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"report_id" text NOT NULL,
	"report_type_id" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"create_time" timestamp with time zone NOT NULL,
	"downloaded_at" timestamp with time zone,
	"row_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_reporting_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "youtube_video_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"captured_on" date NOT NULL,
	"views" integer,
	"estimated_minutes_watched" integer,
	"average_view_percentage" real,
	"impressions" integer,
	"impressions_click_through_rate" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_video_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "reporting_sync_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "reporting_last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD COLUMN "reporting_last_error" text;--> statement-breakpoint
ALTER TABLE "youtube_card_metrics" ADD CONSTRAINT "youtube_card_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_end_screen_metrics" ADD CONSTRAINT "youtube_end_screen_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_reporting_jobs" ADD CONSTRAINT "youtube_reporting_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_reporting_reports" ADD CONSTRAINT "youtube_reporting_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_video_snapshots" ADD CONSTRAINT "youtube_video_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_card_metrics_unique_idx" ON "youtube_card_metrics" USING btree ("user_id","video_id","captured_on","card_type","card_id");--> statement-breakpoint
CREATE INDEX "youtube_card_metrics_user_video_idx" ON "youtube_card_metrics" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_end_screen_metrics_unique_idx" ON "youtube_end_screen_metrics" USING btree ("user_id","video_id","captured_on","element_type","element_id");--> statement-breakpoint
CREATE INDEX "youtube_end_screen_metrics_user_video_idx" ON "youtube_end_screen_metrics" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_reporting_jobs_user_type_idx" ON "youtube_reporting_jobs" USING btree ("user_id","report_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_reporting_jobs_job_idx" ON "youtube_reporting_jobs" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_reporting_reports_user_report_idx" ON "youtube_reporting_reports" USING btree ("user_id","report_id");--> statement-breakpoint
CREATE INDEX "youtube_reporting_reports_user_type_start_idx" ON "youtube_reporting_reports" USING btree ("user_id","report_type_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_video_snapshots_user_video_day_idx" ON "youtube_video_snapshots" USING btree ("user_id","video_id","captured_on");--> statement-breakpoint
CREATE INDEX "youtube_video_snapshots_user_video_idx" ON "youtube_video_snapshots" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE POLICY "youtube_connections_account_access" ON "youtube_connections" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_connections"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_connections"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_video_insights_account_access" ON "youtube_video_insights" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_video_insights"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_video_insights"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_card_metrics_account_access" ON "youtube_card_metrics" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_card_metrics"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_card_metrics"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_end_screen_metrics_account_access" ON "youtube_end_screen_metrics" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_end_screen_metrics"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_end_screen_metrics"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_reporting_jobs_account_access" ON "youtube_reporting_jobs" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_reporting_jobs"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_reporting_jobs"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_reporting_reports_account_access" ON "youtube_reporting_reports" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_reporting_reports"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_reporting_reports"."user_id"));--> statement-breakpoint
CREATE POLICY "youtube_video_snapshots_account_access" ON "youtube_video_snapshots" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("youtube_video_snapshots"."user_id")) WITH CHECK (public.native_booking_account_member("youtube_video_snapshots"."user_id"));