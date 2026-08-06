CREATE TYPE "public"."native_booking_question_type" AS ENUM('radio', 'checkbox', 'text', 'textarea', 'select');--> statement-breakpoint
CREATE TYPE "public"."native_booking_reminder_status" AS ENUM('pending', 'processing', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "native_booking_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"type" "native_booking_question_type" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "native_booking_reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "native_booking_reminder_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_reminder_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "native_booking_reminder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"delay_minutes" integer NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_reminder_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "native_booking_leads" ADD COLUMN "answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "cancellation_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "reschedule_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "sales_calls" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "native_booking_questions" ADD CONSTRAINT "native_booking_questions_event_id_native_booking_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."native_booking_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_reminder_deliveries" ADD CONSTRAINT "native_booking_reminder_deliveries_booking_id_native_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."native_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_reminder_deliveries" ADD CONSTRAINT "native_booking_reminder_deliveries_rule_id_native_booking_reminder_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."native_booking_reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_reminder_rules" ADD CONSTRAINT "native_booking_reminder_rules_event_id_native_booking_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."native_booking_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_questions_event_position_idx" ON "native_booking_questions" USING btree ("event_id","position");--> statement-breakpoint
CREATE INDEX "native_booking_questions_event_idx" ON "native_booking_questions" USING btree ("event_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_reminder_deliveries_booking_rule_idx" ON "native_booking_reminder_deliveries" USING btree ("booking_id","rule_id");--> statement-breakpoint
CREATE INDEX "native_booking_reminder_deliveries_due_idx" ON "native_booking_reminder_deliveries" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_reminder_rules_event_delay_idx" ON "native_booking_reminder_rules" USING btree ("event_id","delay_minutes");--> statement-breakpoint
CREATE INDEX "native_booking_reminder_rules_event_position_idx" ON "native_booking_reminder_rules" USING btree ("event_id","position");--> statement-breakpoint
CREATE POLICY "native_booking_questions_event_access" ON "native_booking_questions" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_questions"."event_id"
      and public.native_booking_account_member(event.user_id)
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_questions"."event_id"
      and public.native_booking_account_member(event.user_id)
  ));--> statement-breakpoint
CREATE POLICY "native_booking_reminder_deliveries_account_access" ON "native_booking_reminder_deliveries" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (
        select 1
        from public.native_bookings as booking
        join public.native_booking_events as event on event.id = booking.event_id
        where booking.id = "native_booking_reminder_deliveries"."booking_id"
          and public.native_booking_account_member(event.user_id)
      )) WITH CHECK (exists (
        select 1
        from public.native_bookings as booking
        join public.native_booking_events as event on event.id = booking.event_id
        where booking.id = "native_booking_reminder_deliveries"."booking_id"
          and public.native_booking_account_member(event.user_id)
      ));--> statement-breakpoint
CREATE POLICY "native_booking_reminder_rules_event_access" ON "native_booking_reminder_rules" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_reminder_rules"."event_id"
      and public.native_booking_account_member(event.user_id)
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_reminder_rules"."event_id"
      and public.native_booking_account_member(event.user_id)
  ));