DROP INDEX "leads_account_crm_stage_idx";--> statement-breakpoint
DROP INDEX "leads_account_platform_handle_idx";--> statement-breakpoint
DROP INDEX "leads_account_profile_url_idx";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "account_id" uuid;--> statement-breakpoint
UPDATE "leads" SET "account_id" = "user_id" WHERE "account_id" IS NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_account_crm_stage_idx" ON "leads" USING btree ("account_id","crm_stage");--> statement-breakpoint
CREATE INDEX "leads_account_platform_handle_idx" ON "leads" USING btree ("account_id","platform","normalized_handle");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_account_profile_url_idx" ON "leads" USING btree ("account_id","platform","canonical_profile_url");--> statement-breakpoint
ALTER POLICY "leads_account_access" ON "leads" TO authenticated USING (public.native_booking_account_member("leads"."account_id")) WITH CHECK (public.native_booking_account_member("leads"."account_id"));
