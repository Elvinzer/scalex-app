CREATE TYPE "public"."crm_action_category" AS ENUM('prospecting', 'sales', 'appointment');--> statement-breakpoint
CREATE TYPE "public"."crm_action_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crm_event_source" AS ENUM('app', 'extension', 'migration', 'system');--> statement-breakpoint
CREATE TYPE "public"."crm_event_type" AS ENUM('lead_created', 'profile_captured', 'message_received', 'first_message_sent', 'response_received', 'conversation_started', 'value_content_sent', 'call_proposed', 'call_booked', 'stage_changed', 'outcome_changed', 'no_show_marked', 'lead_lost', 'lead_reopened', 'sale_validated', 'note_added', 'action_created', 'action_completed', 'action_cancelled', 'responsibility_changed', 'match_confirmed');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_outcome" AS ENUM('none', 'no_show', 'lost', 'sold');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_platform" AS ENUM('instagram', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_stage" AS ENUM('first_message_sent', 'conversation_in_progress', 'value_content_sent', 'call_proposed', 'call_booked');--> statement-breakpoint
CREATE TABLE "crm_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"category" "crm_action_category" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "crm_action_status" DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"responsible_user_id" uuid,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"source" "crm_event_source" DEFAULT 'app' NOT NULL,
	"source_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_call_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"sales_call_id" uuid NOT NULL,
	"source" "crm_event_source" DEFAULT 'app' NOT NULL,
	"confidence" text DEFAULT 'reliable' NOT NULL,
	"linked_by_user_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_call_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"type" "crm_event_type" NOT NULL,
	"source" "crm_event_source" NOT NULL,
	"source_event_key" text,
	"occurred_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_lead_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_lead_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_stage" "crm_lead_stage",
	"to_stage" "crm_lead_stage" NOT NULL,
	"actor_user_id" uuid,
	"responsible_setter_id" uuid,
	"source" "crm_event_source" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_responsibility_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"previous_setter_id" uuid,
	"next_setter_id" uuid,
	"actor_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "platform" "crm_lead_platform";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "canonical_profile_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalized_handle" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "social_first_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "social_last_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crm_stage" "crm_lead_stage" DEFAULT 'first_message_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crm_outcome" "crm_lead_outcome" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "message_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "crm_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_sales_call_id_sales_calls_id_fk" FOREIGN KEY ("sales_call_id") REFERENCES "public"."sales_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_events" ADD CONSTRAINT "crm_lead_events_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_events" ADD CONSTRAINT "crm_lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_events" ADD CONSTRAINT "crm_lead_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_responsible_setter_id_setters_id_fk" FOREIGN KEY ("responsible_setter_id") REFERENCES "public"."setters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_previous_setter_id_setters_id_fk" FOREIGN KEY ("previous_setter_id") REFERENCES "public"."setters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_next_setter_id_setters_id_fk" FOREIGN KEY ("next_setter_id") REFERENCES "public"."setters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_actions_account_due_idx" ON "crm_actions" USING btree ("account_id","status","due_at");--> statement-breakpoint
CREATE INDEX "crm_actions_account_responsible_idx" ON "crm_actions" USING btree ("account_id","responsible_user_id","status");--> statement-breakpoint
CREATE INDEX "crm_actions_lead_idx" ON "crm_actions" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_actions_account_idempotency_idx" ON "crm_actions" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_call_links_account_call_idx" ON "crm_call_links" USING btree ("account_id","sales_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_call_links_account_lead_call_idx" ON "crm_call_links" USING btree ("account_id","lead_id","sales_call_id");--> statement-breakpoint
CREATE INDEX "crm_call_links_account_lead_idx" ON "crm_call_links" USING btree ("account_id","lead_id");--> statement-breakpoint
CREATE INDEX "crm_lead_events_account_created_idx" ON "crm_lead_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_lead_events_lead_created_idx" ON "crm_lead_events" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_lead_events_account_type_idx" ON "crm_lead_events" USING btree ("account_id","type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_events_source_key_idx" ON "crm_lead_events" USING btree ("account_id","lead_id","type","source_event_key");--> statement-breakpoint
CREATE INDEX "crm_lead_stage_history_account_idx" ON "crm_lead_stage_history" USING btree ("account_id","changed_at");--> statement-breakpoint
CREATE INDEX "crm_lead_stage_history_lead_idx" ON "crm_lead_stage_history" USING btree ("lead_id","changed_at");--> statement-breakpoint
CREATE INDEX "crm_responsibility_history_account_idx" ON "crm_responsibility_history" USING btree ("account_id","changed_at");--> statement-breakpoint
CREATE INDEX "crm_responsibility_history_lead_idx" ON "crm_responsibility_history" USING btree ("lead_id","changed_at");--> statement-breakpoint
CREATE INDEX "leads_account_crm_stage_idx" ON "leads" USING btree ("user_id","crm_stage");--> statement-breakpoint
CREATE INDEX "leads_account_platform_handle_idx" ON "leads" USING btree ("user_id","platform","normalized_handle");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_account_profile_url_idx" ON "leads" USING btree ("user_id","platform","canonical_profile_url");--> statement-breakpoint
CREATE POLICY "lead_comments_account_access" ON "lead_comments" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from public.leads as l where l.id = lead_id and public.native_booking_account_member(l.user_id))) WITH CHECK (exists (select 1 from public.leads as l where l.id = lead_id and public.native_booking_account_member(l.user_id)));--> statement-breakpoint
CREATE POLICY "lead_stage_history_account_access" ON "lead_stage_history" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from public.leads as l where l.id = lead_id and public.native_booking_account_member(l.user_id))) WITH CHECK (exists (select 1 from public.leads as l where l.id = lead_id and public.native_booking_account_member(l.user_id)));--> statement-breakpoint
CREATE POLICY "leads_account_access" ON "leads" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("leads"."user_id")) WITH CHECK (public.native_booking_account_member("leads"."user_id"));--> statement-breakpoint
CREATE POLICY "crm_actions_account_access" ON "crm_actions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_actions"."account_id")) WITH CHECK (public.native_booking_account_member("crm_actions"."account_id"));--> statement-breakpoint
CREATE POLICY "crm_call_links_account_access" ON "crm_call_links" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_call_links"."account_id")) WITH CHECK (public.native_booking_account_member("crm_call_links"."account_id"));--> statement-breakpoint
CREATE POLICY "crm_lead_events_account_access" ON "crm_lead_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_lead_events"."account_id")) WITH CHECK (public.native_booking_account_member("crm_lead_events"."account_id"));--> statement-breakpoint
CREATE POLICY "crm_lead_stage_history_account_access" ON "crm_lead_stage_history" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_lead_stage_history"."account_id")) WITH CHECK (public.native_booking_account_member("crm_lead_stage_history"."account_id"));--> statement-breakpoint
CREATE POLICY "crm_responsibility_history_account_access" ON "crm_responsibility_history" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("crm_responsibility_history"."account_id")) WITH CHECK (public.native_booking_account_member("crm_responsibility_history"."account_id"));