CREATE TYPE "public"."crm_import_status" AS ENUM('draft', 'committed', 'abandoned');--> statement-breakpoint
CREATE TABLE "crm_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"import_key" text NOT NULL,
	"status" "crm_import_status" DEFAULT 'draft' NOT NULL,
	"rows_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"merged_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"unresolved_count" integer DEFAULT 0 NOT NULL,
	"key_source" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crm_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone_normalized" text;--> statement-breakpoint
ALTER TABLE "crm_imports" ADD CONSTRAINT "crm_imports_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_imports" ADD CONSTRAINT "crm_imports_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_imports_account_key_idx" ON "crm_imports" USING btree ("account_id","import_key");--> statement-breakpoint
CREATE INDEX "crm_imports_account_created_idx" ON "crm_imports" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_account_phone_normalized_idx" ON "leads" USING btree ("account_id","phone_normalized");--> statement-breakpoint
CREATE POLICY "crm_imports_account_access" ON "crm_imports" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_imports"."account_id")) WITH CHECK (public.native_booking_account_member("crm_imports"."account_id"));