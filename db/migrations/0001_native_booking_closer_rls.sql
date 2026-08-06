-- Custom SQL migration file, put your code below! --
-- Allow account owners and active team members to assign/manage a closer
-- without treating the closer's own account membership as the access check.
CREATE OR REPLACE FUNCTION public.native_booking_account_user_member(account_owner_id uuid, candidate_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT account_owner_id = candidate_user_id
    OR EXISTS (
      SELECT 1
      FROM public.team_members AS member
      WHERE member.account_id = account_owner_id
        AND member.member_user_id = candidate_user_id
        AND member.status::text = 'active'
    );
$function$;

REVOKE ALL ON FUNCTION public.native_booking_account_user_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_booking_account_user_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS native_booking_event_closers_event_access ON public.native_booking_event_closers;
CREATE POLICY native_booking_event_closers_event_access
  ON public.native_booking_event_closers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
        AND public.native_booking_account_user_member(event.user_id, closer_user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
        AND public.native_booking_account_user_member(event.user_id, closer_user_id)
    )
  );

DROP POLICY IF EXISTS native_calendar_connections_account_access ON public.native_calendar_connections;
CREATE POLICY native_calendar_connections_account_access
  ON public.native_calendar_connections
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.native_booking_account_member(user_id)
    AND public.native_booking_account_user_member(user_id, closer_user_id)
  )
  WITH CHECK (
    public.native_booking_account_member(user_id)
    AND public.native_booking_account_user_member(user_id, closer_user_id)
  );
