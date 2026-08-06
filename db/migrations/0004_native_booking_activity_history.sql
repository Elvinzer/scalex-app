CREATE TYPE "public"."native_booking_activity_kind" AS ENUM('booked', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "native_booking_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "native_booking_activity_kind" NOT NULL,
	"from_start_at" timestamp with time zone,
	"from_end_at" timestamp with time zone,
	"to_start_at" timestamp with time zone,
	"to_end_at" timestamp with time zone,
	"from_closer_user_id" uuid,
	"from_closer_name" text,
	"to_closer_user_id" uuid,
	"to_closer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "native_booking_activities" ADD CONSTRAINT "native_booking_activities_booking_id_native_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."native_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_activities" ADD CONSTRAINT "native_booking_activities_from_closer_user_id_users_id_fk" FOREIGN KEY ("from_closer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_activities" ADD CONSTRAINT "native_booking_activities_to_closer_user_id_users_id_fk" FOREIGN KEY ("to_closer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "native_booking_activities_booking_created_idx" ON "native_booking_activities" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE POLICY "native_booking_activities_account_read" ON "native_booking_activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
    select 1
    from public.native_bookings as booking
    join public.native_booking_events as event on event.id = booking.event_id
    where booking.id = "native_booking_activities"."booking_id"
      and public.native_booking_account_member(event.user_id)
  ));--> statement-breakpoint
CREATE POLICY "native_booking_activities_account_insert" ON "native_booking_activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
    select 1
    from public.native_bookings as booking
    join public.native_booking_events as event on event.id = booking.event_id
    where booking.id = "native_booking_activities"."booking_id"
      and public.native_booking_account_member(event.user_id)
  ));
