CREATE TABLE "crm_call_match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_call_match_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_call_match_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"sales_call_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"confidence" text,
	"input_fingerprint" text NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"model_version" text,
	"key_source" text,
	"failure_code" text,
	"generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD COLUMN "accepted_suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_call_match_candidates" ADD CONSTRAINT "crm_call_match_candidates_suggestion_id_crm_call_match_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."crm_call_match_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_match_candidates" ADD CONSTRAINT "crm_call_match_candidates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD CONSTRAINT "crm_call_match_suggestions_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD CONSTRAINT "crm_call_match_suggestions_sales_call_id_sales_calls_id_fk" FOREIGN KEY ("sales_call_id") REFERENCES "public"."sales_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_call_match_candidates_suggestion_lead_idx" ON "crm_call_match_candidates" USING btree ("suggestion_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_call_match_candidates_suggestion_rank_idx" ON "crm_call_match_candidates" USING btree ("suggestion_id","rank");--> statement-breakpoint
CREATE INDEX "crm_call_match_candidates_lead_idx" ON "crm_call_match_candidates" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_call_match_suggestions_account_call_fingerprint_idx" ON "crm_call_match_suggestions" USING btree ("account_id","sales_call_id","input_fingerprint");--> statement-breakpoint
CREATE INDEX "crm_call_match_suggestions_account_status_idx" ON "crm_call_match_suggestions" USING btree ("account_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "crm_call_match_suggestions_call_idx" ON "crm_call_match_suggestions" USING btree ("sales_call_id","updated_at");--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_accepted_suggestion_id_crm_call_match_suggestions_id_fk" FOREIGN KEY ("accepted_suggestion_id") REFERENCES "public"."crm_call_match_suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "crm_call_match_candidates_account_access" ON "crm_call_match_candidates" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from public.crm_call_match_suggestions as s inner join public.leads as l on l.id = lead_id and l.account_id = s.account_id where s.id = suggestion_id and public.native_booking_account_member(s.account_id))) WITH CHECK (exists (select 1 from public.crm_call_match_suggestions as s inner join public.leads as l on l.id = lead_id and l.account_id = s.account_id where s.id = suggestion_id and public.native_booking_account_member(s.account_id)));--> statement-breakpoint
CREATE POLICY "crm_call_match_suggestions_account_access" ON "crm_call_match_suggestions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_call_match_suggestions"."account_id") and exists (select 1 from public.sales_calls as c where c.id = "crm_call_match_suggestions"."sales_call_id" and c.user_id = "crm_call_match_suggestions"."account_id")) WITH CHECK (public.native_booking_account_member("crm_call_match_suggestions"."account_id") and exists (select 1 from public.sales_calls as c where c.id = "crm_call_match_suggestions"."sales_call_id" and c.user_id = "crm_call_match_suggestions"."account_id"));