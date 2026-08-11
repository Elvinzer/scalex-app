CREATE TABLE "native_booking_calendar_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"closer_user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "native_booking_calendar_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"closer_user_id" uuid NOT NULL,
	"invitation_connection_id" uuid,
	"invitation_calendar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "native_calendar_connections_closer_provider_idx";--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "calendar_id" text;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "native_calendar_connections" ADD COLUMN "provider_account_subject" text;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ADD CONSTRAINT "native_booking_calendar_conflicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ADD CONSTRAINT "native_booking_calendar_conflicts_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ADD CONSTRAINT "native_booking_calendar_conflicts_connection_id_native_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."native_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ADD CONSTRAINT "native_booking_calendar_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ADD CONSTRAINT "native_booking_calendar_settings_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ADD CONSTRAINT "native_booking_calendar_settings_invitation_connection_id_native_calendar_connections_id_fk" FOREIGN KEY ("invitation_connection_id") REFERENCES "public"."native_calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_calendar_conflicts_unique_idx" ON "native_booking_calendar_conflicts" USING btree ("closer_user_id","connection_id","calendar_id");--> statement-breakpoint
CREATE INDEX "native_booking_calendar_conflicts_user_idx" ON "native_booking_calendar_conflicts" USING btree ("user_id","closer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_calendar_settings_closer_idx" ON "native_booking_calendar_settings" USING btree ("closer_user_id");--> statement-breakpoint
CREATE INDEX "native_booking_calendar_settings_user_idx" ON "native_booking_calendar_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "native_calendar_connections_closer_provider_subject_idx" ON "native_calendar_connections" USING btree ("closer_user_id","provider","provider_account_subject");--> statement-breakpoint
CREATE POLICY "native_booking_calendar_conflicts_account_access" ON "native_booking_calendar_conflicts" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and public.native_booking_account_user_member("native_booking_calendar_conflicts"."user_id", "native_booking_calendar_conflicts"."closer_user_id")) WITH CHECK (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and public.native_booking_account_user_member("native_booking_calendar_conflicts"."user_id", "native_booking_calendar_conflicts"."closer_user_id"));--> statement-breakpoint
CREATE POLICY "native_booking_calendar_settings_account_access" ON "native_booking_calendar_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and public.native_booking_account_user_member("native_booking_calendar_settings"."user_id", "native_booking_calendar_settings"."closer_user_id")) WITH CHECK (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and public.native_booking_account_user_member("native_booking_calendar_settings"."user_id", "native_booking_calendar_settings"."closer_user_id"));--> statement-breakpoint
-- Preserve the legacy single-calendar setup as an initial booking
-- configuration. The application still validates write access before using it.
INSERT INTO public.native_booking_calendar_settings (user_id, closer_user_id, invitation_connection_id, invitation_calendar_id)
SELECT DISTINCT ON (connection.closer_user_id)
  connection.user_id,
  connection.closer_user_id,
  connection.id,
  COALESCE(connection.selected_calendar_ids ->> 0, 'primary')
FROM public.native_calendar_connections AS connection
WHERE connection.provider::text = 'google'
  AND connection.status::text <> 'revoked'
ORDER BY connection.closer_user_id, connection.updated_at DESC
ON CONFLICT (closer_user_id) DO NOTHING;--> statement-breakpoint

INSERT INTO public.native_booking_calendar_conflicts (user_id, closer_user_id, connection_id, calendar_id)
SELECT
  connection.user_id,
  connection.closer_user_id,
  connection.id,
  selected_calendar.value
FROM public.native_calendar_connections AS connection
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_array_length(connection.selected_calendar_ids) > 0 THEN connection.selected_calendar_ids
    ELSE '["primary"]'::jsonb
  END
) AS selected_calendar(value)
WHERE connection.provider::text = 'google'
  AND connection.status::text <> 'revoked'
ON CONFLICT (closer_user_id, connection_id, calendar_id) DO NOTHING;
