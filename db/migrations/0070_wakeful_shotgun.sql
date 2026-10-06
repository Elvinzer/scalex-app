CREATE TYPE "public"."crm_message_ab_test_channel" AS ENUM('instagram', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."crm_message_ab_test_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."crm_message_ab_test_variant" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TABLE "crm_message_ab_test_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"variant" "crm_message_ab_test_variant" NOT NULL,
	"message_snapshot" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_message_ab_test_assignments_message_not_blank" CHECK (length(trim("crm_message_ab_test_assignments"."message_snapshot")) > 0)
);
--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_message_ab_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"create_idempotency_key" text NOT NULL,
	"channel" "crm_message_ab_test_channel" NOT NULL,
	"status" "crm_message_ab_test_status" DEFAULT 'active' NOT NULL,
	"variant_a_message" text NOT NULL,
	"variant_b_message" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_message_ab_tests_name_not_blank" CHECK (length(trim("crm_message_ab_tests"."name")) > 0),
	CONSTRAINT "crm_message_ab_tests_variant_a_not_blank" CHECK (length(trim("crm_message_ab_tests"."variant_a_message")) > 0),
	CONSTRAINT "crm_message_ab_tests_variant_b_not_blank" CHECK (length(trim("crm_message_ab_tests"."variant_b_message")) > 0)
);
--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ADD CONSTRAINT "crm_message_ab_test_assignments_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ADD CONSTRAINT "crm_message_ab_test_assignments_test_id_crm_message_ab_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."crm_message_ab_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ADD CONSTRAINT "crm_message_ab_test_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ADD CONSTRAINT "crm_message_ab_test_assignments_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" ADD CONSTRAINT "crm_message_ab_tests_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" ADD CONSTRAINT "crm_message_ab_tests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_message_ab_test_assignments_account_lead_idx" ON "crm_message_ab_test_assignments" USING btree ("account_id","lead_id");--> statement-breakpoint
CREATE INDEX "crm_message_ab_test_assignments_account_test_variant_idx" ON "crm_message_ab_test_assignments" USING btree ("account_id","test_id","variant","assigned_at");--> statement-breakpoint
CREATE INDEX "crm_message_ab_test_assignments_account_lead_test_idx" ON "crm_message_ab_test_assignments" USING btree ("account_id","lead_id","test_id");--> statement-breakpoint
CREATE INDEX "crm_message_ab_tests_account_status_idx" ON "crm_message_ab_tests" USING btree ("account_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_message_ab_tests_account_idempotency_idx" ON "crm_message_ab_tests" USING btree ("account_id","create_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_message_ab_tests_one_active_per_channel_idx" ON "crm_message_ab_tests" USING btree ("account_id","channel") WHERE "crm_message_ab_tests"."status" = 'active';--> statement-breakpoint
CREATE POLICY "crm_message_ab_test_assignments_account_access" ON "crm_message_ab_test_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.native_booking_account_member("crm_message_ab_test_assignments"."account_id") and exists (select 1 from public.crm_message_ab_tests as t where t.id = "crm_message_ab_test_assignments"."test_id" and t.account_id = "crm_message_ab_test_assignments"."account_id") and exists (select 1 from public.leads as l where l.id = "crm_message_ab_test_assignments"."lead_id" and l.account_id = "crm_message_ab_test_assignments"."account_id"));--> statement-breakpoint
CREATE POLICY "crm_message_ab_tests_account_access" ON "crm_message_ab_tests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.native_booking_account_member("crm_message_ab_tests"."account_id"));