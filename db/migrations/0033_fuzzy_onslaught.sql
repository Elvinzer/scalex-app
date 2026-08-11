ALTER POLICY "native_booking_calendar_conflicts_account_access" ON "native_booking_calendar_conflicts" TO authenticated USING (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and ("native_booking_calendar_conflicts"."user_id" = auth.uid() or "native_booking_calendar_conflicts"."closer_user_id" = auth.uid()) and ("native_booking_calendar_conflicts"."connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_conflicts"."connection_id"
      and connection.user_id = "native_booking_calendar_conflicts"."user_id"
      and connection.closer_user_id = "native_booking_calendar_conflicts"."closer_user_id"
  ))) WITH CHECK (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and ("native_booking_calendar_conflicts"."user_id" = auth.uid() or "native_booking_calendar_conflicts"."closer_user_id" = auth.uid()) and ("native_booking_calendar_conflicts"."connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_conflicts"."connection_id"
      and connection.user_id = "native_booking_calendar_conflicts"."user_id"
      and connection.closer_user_id = "native_booking_calendar_conflicts"."closer_user_id"
  )));--> statement-breakpoint
ALTER POLICY "native_booking_calendar_settings_account_access" ON "native_booking_calendar_settings" TO authenticated USING (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and ("native_booking_calendar_settings"."user_id" = auth.uid() or "native_booking_calendar_settings"."closer_user_id" = auth.uid()) and ("native_booking_calendar_settings"."invitation_connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_settings"."invitation_connection_id"
      and connection.user_id = "native_booking_calendar_settings"."user_id"
      and connection.closer_user_id = "native_booking_calendar_settings"."closer_user_id"
  ))) WITH CHECK (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and ("native_booking_calendar_settings"."user_id" = auth.uid() or "native_booking_calendar_settings"."closer_user_id" = auth.uid()) and ("native_booking_calendar_settings"."invitation_connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_settings"."invitation_connection_id"
      and connection.user_id = "native_booking_calendar_settings"."user_id"
      and connection.closer_user_id = "native_booking_calendar_settings"."closer_user_id"
  )));