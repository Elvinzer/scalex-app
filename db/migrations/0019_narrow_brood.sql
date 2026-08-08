DROP INDEX "meta_ad_metrics_daily_entity_date_idx";--> statement-breakpoint
DROP INDEX "meta_ad_sets_user_external_idx";--> statement-breakpoint
DROP INDEX "meta_ads_user_external_idx";--> statement-breakpoint
DROP INDEX "meta_campaigns_user_external_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_metrics_daily_account_entity_date_idx" ON "meta_ad_metrics_daily" USING btree ("user_id","ad_account_id","entity_key","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_sets_user_account_external_idx" ON "meta_ad_sets" USING btree ("user_id","ad_account_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_user_account_external_idx" ON "meta_ads" USING btree ("user_id","ad_account_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_campaigns_user_account_external_idx" ON "meta_campaigns" USING btree ("user_id","ad_account_id","external_id");