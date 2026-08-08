CREATE TYPE "public"."baseline_unit" AS ENUM('fraction', 'percent', 'eur', 'count');--> statement-breakpoint
CREATE TYPE "public"."initiative_status" AS ENUM('planned', 'in_progress', 'paused', 'completed', 'awaiting_measurement', 'measured', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."insight_decision" AS ENUM('todo', 'launched', 'later', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."insight_source_type" AS ENUM('diagnostic_metric', 'diagnostic_lever', 'funnel_stage', 'content_recommendation', 'copilote');--> statement-breakpoint
CREATE TYPE "public"."measurement_evidence_type" AS ENUM('observed', 'estimated', 'not_calculable', 'qualitative');--> statement-breakpoint
ALTER TYPE "public"."improvement_event_type" ADD VALUE 'initiative_launched';--> statement-breakpoint
ALTER TYPE "public"."improvement_event_type" ADD VALUE 'initiative_completed';--> statement-breakpoint
ALTER TYPE "public"."improvement_event_type" ADD VALUE 'initiative_measured';--> statement-breakpoint
CREATE TABLE "improvement_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"insight_record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"action_text" text NOT NULL,
	"status" "initiative_status" DEFAULT 'planned' NOT NULL,
	"due_date" date,
	"assigned_team_member_id" uuid,
	"todo_id" uuid,
	"project_id" uuid,
	"baseline" jsonb,
	"result_note" text,
	"snoozed_until" date,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"measured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "initiative_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"evidence" "measurement_evidence_type" NOT NULL,
	"metric_key" text,
	"unit" "baseline_unit",
	"before_value" real,
	"after_value" real,
	"delta_value" real,
	"before_period_start" date,
	"before_period_end" date,
	"after_period_start" date,
	"after_period_end" date,
	"sample_size" integer,
	"cash_impact_eur" real,
	"cash_currency" text,
	"source" text,
	"note" text,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "initiative_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "initiative_nudges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "initiative_weekly_focus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"initiative_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_weekly_focus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insight_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" "insight_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"insight_text" text NOT NULL,
	"source_label" text,
	"metric_key" text,
	"period_start" date,
	"period_end" date,
	"snapshot" jsonb NOT NULL,
	"impact_projection" jsonb,
	"decision" "insight_decision" DEFAULT 'todo' NOT NULL,
	"resume_at" date,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insight_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_insight_record_id_insight_records_id_fk" FOREIGN KEY ("insight_record_id") REFERENCES "public"."insight_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_assigned_team_member_id_team_members_id_fk" FOREIGN KEY ("assigned_team_member_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_measurements" ADD CONSTRAINT "initiative_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_measurements" ADD CONSTRAINT "initiative_measurements_initiative_id_improvement_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."improvement_initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_nudges" ADD CONSTRAINT "initiative_nudges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_nudges" ADD CONSTRAINT "initiative_nudges_initiative_id_improvement_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."improvement_initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_weekly_focus" ADD CONSTRAINT "initiative_weekly_focus_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_weekly_focus" ADD CONSTRAINT "initiative_weekly_focus_initiative_id_improvement_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."improvement_initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_records" ADD CONSTRAINT "insight_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "improvement_initiatives_user_insight_idx" ON "improvement_initiatives" USING btree ("user_id","insight_record_id");--> statement-breakpoint
CREATE INDEX "improvement_initiatives_user_status_due_idx" ON "improvement_initiatives" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "improvement_initiatives_assignee_idx" ON "improvement_initiatives" USING btree ("assigned_team_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_measurements_initiative_version_idx" ON "initiative_measurements" USING btree ("initiative_id","version");--> statement-breakpoint
CREATE INDEX "initiative_measurements_user_created_idx" ON "initiative_measurements" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_nudges_initiative_week_idx" ON "initiative_nudges" USING btree ("initiative_id","week_start");--> statement-breakpoint
CREATE INDEX "initiative_nudges_user_week_idx" ON "initiative_nudges" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_weekly_focus_user_week_idx" ON "initiative_weekly_focus" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_weekly_focus_initiative_week_idx" ON "initiative_weekly_focus" USING btree ("initiative_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_records_user_fingerprint_idx" ON "insight_records" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "insight_records_user_decision_idx" ON "insight_records" USING btree ("user_id","decision","created_at");--> statement-breakpoint
CREATE INDEX "insight_records_user_source_idx" ON "insight_records" USING btree ("user_id","source_type","created_at");--> statement-breakpoint
CREATE POLICY "improvement_initiatives_account_access" ON "improvement_initiatives" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("improvement_initiatives"."user_id")) WITH CHECK (public.native_booking_account_member("improvement_initiatives"."user_id"));--> statement-breakpoint
CREATE POLICY "initiative_measurements_account_access" ON "initiative_measurements" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("initiative_measurements"."user_id")) WITH CHECK (public.native_booking_account_member("initiative_measurements"."user_id"));--> statement-breakpoint
CREATE POLICY "initiative_nudges_account_access" ON "initiative_nudges" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("initiative_nudges"."user_id")) WITH CHECK (public.native_booking_account_member("initiative_nudges"."user_id"));--> statement-breakpoint
CREATE POLICY "initiative_weekly_focus_account_access" ON "initiative_weekly_focus" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("initiative_weekly_focus"."user_id")) WITH CHECK (public.native_booking_account_member("initiative_weekly_focus"."user_id"));--> statement-breakpoint
CREATE POLICY "insight_records_account_access" ON "insight_records" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("insight_records"."user_id")) WITH CHECK (public.native_booking_account_member("insight_records"."user_id"));