-- Native booking scheduler: nullable MVP contact fields and account-scoped RLS.
-- This migration is additive and safe to replay in the development database.

ALTER TABLE public.native_booking_leads
  ALTER COLUMN first_name DROP NOT NULL,
  ALTER COLUMN last_name DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_normalized DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN phone_normalized DROP NOT NULL;

ALTER TABLE public.native_bookings
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_normalized DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.native_booking_account_member(account_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(account_owner_id = auth.uid(), false)
    OR EXISTS (
      SELECT 1
      FROM public.team_members AS member
      WHERE member.account_id = account_owner_id
        AND member.member_user_id = auth.uid()
        AND member.status::text = 'active'
    );
$function$;

REVOKE ALL ON FUNCTION public.native_booking_account_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_booking_account_member(uuid) TO authenticated;

ALTER TABLE public.native_booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_booking_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_booking_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_booking_event_closers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_booking_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS native_booking_events_account_access ON public.native_booking_events;
CREATE POLICY native_booking_events_account_access
  ON public.native_booking_events
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.native_booking_account_member(user_id))
  WITH CHECK (public.native_booking_account_member(user_id));

DROP POLICY IF EXISTS native_booking_availability_event_access ON public.native_booking_availability;
CREATE POLICY native_booking_availability_event_access
  ON public.native_booking_availability
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
    )
  );

DROP POLICY IF EXISTS native_booking_exceptions_event_access ON public.native_booking_exceptions;
CREATE POLICY native_booking_exceptions_event_access
  ON public.native_booking_exceptions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
    )
  );

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
    )
    AND public.native_booking_account_member(closer_user_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND public.native_booking_account_member(event.user_id)
    )
    AND public.native_booking_account_member(closer_user_id)
  );

DROP POLICY IF EXISTS native_calendar_connections_account_access ON public.native_calendar_connections;
CREATE POLICY native_calendar_connections_account_access
  ON public.native_calendar_connections
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.native_booking_account_member(user_id)
    AND public.native_booking_account_member(closer_user_id)
  )
  WITH CHECK (
    public.native_booking_account_member(user_id)
    AND public.native_booking_account_member(closer_user_id)
  );

DROP POLICY IF EXISTS native_booking_links_account_access ON public.native_booking_links;
CREATE POLICY native_booking_links_account_access
  ON public.native_booking_links
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_booking_links.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_booking_links.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  );

DROP POLICY IF EXISTS native_booking_leads_account_access ON public.native_booking_leads;
CREATE POLICY native_booking_leads_account_access
  ON public.native_booking_leads
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_booking_leads.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_booking_leads.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  );

DROP POLICY IF EXISTS native_bookings_account_access ON public.native_bookings;
CREATE POLICY native_bookings_account_access
  ON public.native_bookings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_bookings.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_booking_events AS event
      WHERE event.id = event_id
        AND event.user_id = native_bookings.user_id
        AND public.native_booking_account_member(event.user_id)
    )
  );
