ALTER TYPE "public"."insight_source_type" ADD VALUE 'meta_ads';--> statement-breakpoint
CREATE TABLE "meta_ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text,
	"timezone" text,
	"account_status" integer,
	"disable_reason" text,
	"can_read" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ad_action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_external_id" text NOT NULL,
	"action_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_state" jsonb NOT NULL,
	"current_state" jsonb,
	"result_state" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meta_ad_action_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ad_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"level" text NOT NULL,
	"entity_key" text NOT NULL,
	"entity_external_id" text,
	"campaign_external_id" text,
	"ad_set_external_id" text,
	"ad_external_id" text,
	"date" date NOT NULL,
	"date_end" date NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"ctr" real,
	"cpc_cents" real,
	"cpm_cents" real,
	"leads" integer DEFAULT 0 NOT NULL,
	"landing_page_views" integer DEFAULT 0 NOT NULL,
	"video_3s_views" integer DEFAULT 0 NOT NULL,
	"video_thruplay" integer DEFAULT 0 NOT NULL,
	"video_p25" integer DEFAULT 0 NOT NULL,
	"video_p50" integer DEFAULT 0 NOT NULL,
	"video_p75" integer DEFAULT 0 NOT NULL,
	"video_p95" integer DEFAULT 0 NOT NULL,
	"video_p100" integer DEFAULT 0 NOT NULL,
	"profile_visits" integer DEFAULT 0 NOT NULL,
	"follows" integer DEFAULT 0 NOT NULL,
	"registrations" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"purchase_value_cents" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"available_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"attribution_settings" jsonb NOT NULL,
	"calculation_version" text DEFAULT 'meta-ads-v1' NOT NULL,
	"raw" jsonb NOT NULL,
	"consolidation_until" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ad_metrics_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"effective_status" text,
	"targeting" jsonb,
	"daily_budget_cents" integer,
	"lifetime_budget_cents" integer,
	"raw" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ad_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"campaign_external_id" text,
	"ad_set_external_id" text,
	"ad_external_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "meta_ad_touchpoints_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "meta_ad_touchpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"effective_status" text,
	"creative_name" text,
	"thumbnail_url" text,
	"permalink_url" text,
	"raw" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ads_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meta_user_id" text NOT NULL,
	"meta_user_name" text,
	"access_token_encrypted" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_ad_account_id" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"initial_sync_status" text DEFAULT 'pending' NOT NULL,
	"initial_sync_completed_at" timestamp with time zone,
	"last_sync_started_at" timestamp with time zone,
	"last_sync_completed_at" timestamp with time zone,
	"last_sync_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ads_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "meta_ads_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_campaign_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"campaign_type" text DEFAULT 'other' NOT NULL,
	"type_source" text DEFAULT 'heuristic' NOT NULL,
	"target_cpa_cents" integer,
	"target_roas" real,
	"lead_value_cents" integer,
	"attribution_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"performance_goal" text,
	"status" text,
	"effective_status" text,
	"campaign_type" text DEFAULT 'other' NOT NULL,
	"type_confidence" real,
	"landing_page_url" text,
	"daily_budget_cents" integer,
	"lifetime_budget_cents" integer,
	"start_time" timestamp with time zone,
	"stop_time" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "meta_ads_connected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_connection_id_meta_ads_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_ads_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_action_logs" ADD CONSTRAINT "meta_ad_action_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_action_logs" ADD CONSTRAINT "meta_ad_action_logs_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_metrics_daily" ADD CONSTRAINT "meta_ad_metrics_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_metrics_daily" ADD CONSTRAINT "meta_ad_metrics_daily_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_touchpoints" ADD CONSTRAINT "meta_ad_touchpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_ad_set_id_meta_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."meta_ad_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads_connections" ADD CONSTRAINT "meta_ads_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ADD CONSTRAINT "meta_campaign_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ADD CONSTRAINT "meta_campaign_profiles_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_accounts_user_external_idx" ON "meta_ad_accounts" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_user_name_idx" ON "meta_ad_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_action_logs_user_idempotency_idx" ON "meta_ad_action_logs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "meta_ad_action_logs_user_created_idx" ON "meta_ad_action_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_metrics_daily_entity_date_idx" ON "meta_ad_metrics_daily" USING btree ("user_id","entity_key","date");--> statement-breakpoint
CREATE INDEX "meta_ad_metrics_daily_campaign_date_idx" ON "meta_ad_metrics_daily" USING btree ("user_id","campaign_external_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_sets_user_external_idx" ON "meta_ad_sets" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "meta_ad_sets_campaign_idx" ON "meta_ad_sets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "meta_ad_touchpoints_user_captured_idx" ON "meta_ad_touchpoints" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_user_external_idx" ON "meta_ads" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "meta_ads_ad_set_idx" ON "meta_ads" USING btree ("ad_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_campaign_profiles_user_campaign_idx" ON "meta_campaign_profiles" USING btree ("user_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_campaigns_user_external_idx" ON "meta_campaigns" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "meta_campaigns_account_status_idx" ON "meta_campaigns" USING btree ("ad_account_id","effective_status");--> statement-breakpoint
CREATE POLICY "meta_ad_accounts_account_access" ON "meta_ad_accounts" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_accounts"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_accounts"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ad_action_logs_account_access" ON "meta_ad_action_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_action_logs"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_action_logs"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ad_metrics_daily_account_access" ON "meta_ad_metrics_daily" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_metrics_daily"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_metrics_daily"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ad_sets_account_access" ON "meta_ad_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_sets"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_sets"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ad_touchpoints_account_access" ON "meta_ad_touchpoints" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_touchpoints"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_touchpoints"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ads_account_access" ON "meta_ads" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ads"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ads"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_ads_connections_account_access" ON "meta_ads_connections" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ads_connections"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ads_connections"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_campaign_profiles_account_access" ON "meta_campaign_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_campaign_profiles"."user_id")) WITH CHECK (public.native_booking_account_member("meta_campaign_profiles"."user_id"));--> statement-breakpoint
CREATE POLICY "meta_campaigns_account_access" ON "meta_campaigns" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_campaigns"."user_id")) WITH CHECK (public.native_booking_account_member("meta_campaigns"."user_id"));