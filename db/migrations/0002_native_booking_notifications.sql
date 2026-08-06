-- Native booking notifications and public confirmation personalization.
-- This migration is additive: no existing booking, iClosed or Calendly row is
-- rewritten or removed.

DO $$
BEGIN
  CREATE TYPE public.native_booking_notification_kind AS ENUM ('confirmation', 'cancellation', 'reschedule');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.native_booking_notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.native_booking_events
  ADD COLUMN IF NOT EXISTS confirmation_title text NOT NULL DEFAULT 'Rendez-vous confirmé',
  ADD COLUMN IF NOT EXISTS confirmation_message text NOT NULL DEFAULT 'Ton closer te recontactera pour la suite.',
  ADD COLUMN IF NOT EXISTS booking_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notify_closer_on_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_closer_on_cancellation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_closer_on_reschedule boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.native_booking_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.native_bookings(id) ON DELETE CASCADE,
  kind public.native_booking_notification_kind NOT NULL,
  status public.native_booking_notification_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS native_booking_notifications_booking_kind_idx
  ON public.native_booking_notifications (booking_id, kind);
CREATE INDEX IF NOT EXISTS native_booking_notifications_status_idx
  ON public.native_booking_notifications (status, updated_at);

ALTER TABLE public.native_booking_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS native_booking_notifications_account_access ON public.native_booking_notifications;
CREATE POLICY native_booking_notifications_account_access
  ON public.native_booking_notifications
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.native_bookings AS booking
      JOIN public.native_booking_events AS event ON event.id = booking.event_id
      WHERE booking.id = native_booking_notifications.booking_id
        AND public.native_booking_account_member(event.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.native_bookings AS booking
      JOIN public.native_booking_events AS event ON event.id = booking.event_id
      WHERE booking.id = native_booking_notifications.booking_id
        AND public.native_booking_account_member(event.user_id)
    )
  );
