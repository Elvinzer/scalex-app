-- Private delivery assets remain account-scoped. Active team members may
-- manage an owner's objects through the same account-membership function as
-- the application tables, while arbitrary/non-UUID object prefixes remain
-- inaccessible.
DROP POLICY IF EXISTS "booking_assets_owner_insert" ON storage.objects;
CREATE POLICY "booking_assets_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.native_booking_account_member(((storage.foldername(name))[1])::uuid)
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_select" ON storage.objects;
CREATE POLICY "booking_assets_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.native_booking_account_member(((storage.foldername(name))[1])::uuid)
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_update" ON storage.objects;
CREATE POLICY "booking_assets_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.native_booking_account_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.native_booking_account_member(((storage.foldername(name))[1])::uuid)
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_delete" ON storage.objects;
CREATE POLICY "booking_assets_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.native_booking_account_member(((storage.foldername(name))[1])::uuid)
);
