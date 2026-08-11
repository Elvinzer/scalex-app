CREATE OR REPLACE FUNCTION public.native_booking_event_viewer(booking_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(event.user_id = auth.uid(), false)
    OR (
      EXISTS (
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
    )
  FROM public.native_booking_events AS event
  WHERE event.id = booking_event_id;
$function$;

REVOKE ALL ON FUNCTION public.native_booking_event_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_booking_event_viewer(uuid) TO authenticated;
