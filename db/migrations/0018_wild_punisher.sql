ALTER TYPE "public"."improvement_event_type" ADD VALUE 'meta_ads_action';--> statement-breakpoint
CREATE TABLE "meta_ad_metric_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"metric_row_id" uuid,
	"level" text NOT NULL,
	"entity_key" text NOT NULL,
	"date" date NOT NULL,
	"before_snapshot" jsonb NOT NULL,
	"after_snapshot" jsonb NOT NULL,
	"reason" text DEFAULT 'meta_retroactive_update' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" ADD CONSTRAINT "meta_ad_metric_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" ADD CONSTRAINT "meta_ad_metric_corrections_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" ADD CONSTRAINT "meta_ad_metric_corrections_metric_row_id_meta_ad_metrics_daily_id_fk" FOREIGN KEY ("metric_row_id") REFERENCES "public"."meta_ad_metrics_daily"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_ad_metric_corrections_user_date_idx" ON "meta_ad_metric_corrections" USING btree ("user_id","date");--> statement-breakpoint
CREATE POLICY "meta_ad_metric_corrections_account_access" ON "meta_ad_metric_corrections" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("meta_ad_metric_corrections"."user_id")) WITH CHECK (public.native_booking_account_member("meta_ad_metric_corrections"."user_id"));