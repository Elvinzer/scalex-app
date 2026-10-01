CREATE TABLE "crm_lead_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"platform" "crm_lead_platform" NOT NULL,
	"canonical_profile_url" text,
	"normalized_handle" text NOT NULL,
	"display_name" text,
	"search_name_normalized" text DEFAULT '' NOT NULL,
	"first_name" text,
	"last_name" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_lead_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_normalized" text;--> statement-breakpoint
ALTER TABLE "crm_lead_profiles" ADD CONSTRAINT "crm_lead_profiles_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_profiles" ADD CONSTRAINT "crm_lead_profiles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_lead_profiles_account_lead_idx" ON "crm_lead_profiles" USING btree ("account_id","lead_id");--> statement-breakpoint
CREATE INDEX "crm_lead_profiles_account_platform_handle_idx" ON "crm_lead_profiles" USING btree ("account_id","platform","normalized_handle");--> statement-breakpoint
CREATE INDEX "crm_lead_profiles_account_search_name_idx" ON "crm_lead_profiles" USING btree ("account_id","search_name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_profiles_account_platform_url_idx" ON "crm_lead_profiles" USING btree ("account_id","platform","canonical_profile_url");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_profiles_account_lead_platform_idx" ON "crm_lead_profiles" USING btree ("account_id","lead_id","platform");--> statement-breakpoint
CREATE INDEX "leads_account_email_normalized_idx" ON "leads" USING btree ("account_id","email_normalized");--> statement-breakpoint
CREATE POLICY "crm_lead_profiles_account_access" ON "crm_lead_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_lead_profiles"."account_id") and exists (select 1 from public.leads as l where l.id = "crm_lead_profiles"."lead_id" and l.account_id = "crm_lead_profiles"."account_id")) WITH CHECK (public.native_booking_account_member("crm_lead_profiles"."account_id") and exists (select 1 from public.leads as l where l.id = "crm_lead_profiles"."lead_id" and l.account_id = "crm_lead_profiles"."account_id"));
--> statement-breakpoint
UPDATE "leads"
SET "email_normalized" = lower(trim("email"))
WHERE "email" IS NOT NULL AND length(trim("email")) > 0 AND "email_normalized" IS NULL;
--> statement-breakpoint
UPDATE "leads"
SET
  "phone" = coalesce("phone", '+' || regexp_replace("canonical_profile_url", '^https?://(www[.])?wa[.]me/[+]?', '')),
  "phone_normalized" = coalesce("phone_normalized", '+' || regexp_replace("canonical_profile_url", '^https?://(www[.])?wa[.]me/[+]?', ''))
WHERE "phone" IS NULL
  AND "canonical_profile_url" ~ '^https?://(www[.])?wa[.]me/[+]?[1-9][0-9]{6,14}/?$';
--> statement-breakpoint
INSERT INTO "crm_lead_profiles" (
  "account_id", "lead_id", "platform", "canonical_profile_url", "normalized_handle",
  "display_name", "search_name_normalized", "first_name", "last_name", "captured_at", "updated_at"
)
SELECT
  l."account_id",
  l."id",
  l."platform",
  l."canonical_profile_url",
  coalesce(nullif(trim(l."normalized_handle"), ''), regexp_replace(trim(l."canonical_profile_url"), '^https?://[^/]+/', ''), 'unknown'),
  l."display_name",
  lower(regexp_replace(trim(coalesce(nullif(l."display_name", ''), nullif(concat_ws(' ', l."first_name", l."last_name"), ''), l."normalized_handle", '')), '[^a-zA-Z0-9]+', ' ', 'g')),
  nullif(l."social_first_name", ''),
  nullif(l."social_last_name", ''),
  l."captured_at",
  coalesce(l."updated_at", now())
FROM "leads" l
WHERE l."platform" IS NOT NULL
  AND (l."canonical_profile_url" IS NOT NULL OR l."normalized_handle" IS NOT NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_lead_events" (
  "account_id", "lead_id", "type", "source", "source_event_key", "captured_at", "metadata"
)
SELECT
  l."account_id",
  l."id",
  'profile_captured',
  'migration',
  'migration:legacy-profile-conflict:' || l."id",
  now(),
  jsonb_build_object('operation', 'legacy_profile_backfill', 'conflict', true, 'platform', l."platform", 'canonicalProfileUrl', l."canonical_profile_url")
FROM "leads" l
WHERE l."platform" IS NOT NULL
  AND l."canonical_profile_url" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "leads" other
    WHERE other."account_id" = l."account_id"
      AND other."platform" = l."platform"
      AND other."canonical_profile_url" = l."canonical_profile_url"
      AND other."id" <> l."id"
  )
ON CONFLICT DO NOTHING;
