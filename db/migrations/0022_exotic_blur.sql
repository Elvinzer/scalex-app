ALTER TABLE "meta_campaign_profiles" ALTER COLUMN "campaign_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ALTER COLUMN "campaign_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ALTER COLUMN "type_source" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "meta_campaigns" ALTER COLUMN "campaign_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ALTER COLUMN "campaign_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ADD COLUMN "conversion_goal" text;--> statement-breakpoint
-- Meta does not provide the business funnel type reliably. Clear old
-- heuristic classifications while preserving valid manual choices.
UPDATE "meta_campaigns" SET "campaign_type" = NULL, "type_confidence" = NULL;--> statement-breakpoint
UPDATE "meta_campaign_profiles"
SET "campaign_type" = NULL, "conversion_goal" = NULL, "type_source" = 'pending'
WHERE "type_source" <> 'manual'
   OR "campaign_type" IS NULL
   OR "campaign_type" NOT IN ('vsl', 'webinar', 'instagram_profile_growth', 'retargeting');--> statement-breakpoint
UPDATE "meta_campaign_profiles"
SET "conversion_goal" = NULL
WHERE "campaign_type" NOT IN ('vsl', 'webinar')
   OR "conversion_goal" NOT IN ('call', 'sale');
