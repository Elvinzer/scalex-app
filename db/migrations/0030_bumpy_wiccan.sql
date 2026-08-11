CREATE OR REPLACE FUNCTION public.native_booking_event_viewer(booking_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(event.user_id = auth.uid(), false)
    OR EXISTS (
      SELECT 1
      FROM public.team_members AS member
      WHERE member.account_id = event.user_id
        AND member.member_user_id = auth.uid()
        AND member.status::text = 'active'
    ) AND EXISTS (
      SELECT 1
      FROM public.native_booking_event_closers AS assignment
      WHERE assignment.event_id = event.id
        AND assignment.closer_user_id = auth.uid()
        AND assignment.is_active = true
    )
  FROM public.native_booking_events AS event
  WHERE event.id = booking_event_id;
$function$;

REVOKE ALL ON FUNCTION public.native_booking_event_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_booking_event_viewer(uuid) TO authenticated;

ALTER POLICY "native_booking_availability_event_access" ON "native_booking_availability" TO authenticated USING (public.native_booking_event_viewer("native_booking_availability"."event_id")) WITH CHECK (public.native_booking_event_viewer("native_booking_availability"."event_id"));--> statement-breakpoint
ALTER POLICY "native_booking_event_closers_event_access" ON "native_booking_event_closers" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_event_closers"."event_id"
      and public.native_booking_event_viewer(event.id)
      and (event.user_id = auth.uid() or "native_booking_event_closers"."closer_user_id" = auth.uid())
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_event_closers"."event_id"
      and public.native_booking_event_viewer(event.id)
      and (event.user_id = auth.uid() or "native_booking_event_closers"."closer_user_id" = auth.uid())
  ));--> statement-breakpoint
ALTER POLICY "native_booking_exceptions_event_access" ON "native_booking_exceptions" TO authenticated USING (public.native_booking_event_viewer("native_booking_exceptions"."event_id")) WITH CHECK (public.native_booking_event_viewer("native_booking_exceptions"."event_id"));--> statement-breakpoint
ALTER POLICY "native_booking_leads_account_access" ON "native_booking_leads" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_leads"."event_id"
      and event.user_id = "native_booking_leads"."user_id"
      and public.native_booking_event_viewer(event.id)
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_leads"."event_id"
      and event.user_id = "native_booking_leads"."user_id"
      and public.native_booking_event_viewer(event.id)
  ));--> statement-breakpoint
ALTER POLICY "native_booking_links_account_access" ON "native_booking_links" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_links"."event_id"
      and event.user_id = "native_booking_links"."user_id"
      and public.native_booking_event_viewer(event.id)
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_links"."event_id"
      and event.user_id = "native_booking_links"."user_id"
      and public.native_booking_event_viewer(event.id)
  ));--> statement-breakpoint
ALTER POLICY "native_booking_questions_event_access" ON "native_booking_questions" TO authenticated USING (public.native_booking_event_viewer("native_booking_questions"."event_id")) WITH CHECK (public.native_booking_event_viewer("native_booking_questions"."event_id"));--> statement-breakpoint
ALTER POLICY "native_booking_reminder_rules_event_access" ON "native_booking_reminder_rules" TO authenticated USING (public.native_booking_event_viewer("native_booking_reminder_rules"."event_id")) WITH CHECK (public.native_booking_event_viewer("native_booking_reminder_rules"."event_id"));--> statement-breakpoint
ALTER POLICY "native_bookings_account_access" ON "native_bookings" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_bookings"."event_id"
      and event.user_id = "native_bookings"."user_id"
      and public.native_booking_event_viewer(event.id)
      and (event.user_id = auth.uid() or "native_bookings"."closer_user_id" = auth.uid())
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_bookings"."event_id"
      and event.user_id = "native_bookings"."user_id"
      and public.native_booking_event_viewer(event.id)
      and (event.user_id = auth.uid() or "native_bookings"."closer_user_id" = auth.uid())
  ));
