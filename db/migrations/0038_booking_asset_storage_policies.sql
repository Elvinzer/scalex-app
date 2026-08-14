DROP POLICY IF EXISTS "booking_assets_owner_insert" ON storage.objects;
CREATE POLICY "booking_assets_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_select" ON storage.objects;
CREATE POLICY "booking_assets_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_update" ON storage.objects;
CREATE POLICY "booking_assets_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
--> statement-breakpoint
DROP POLICY IF EXISTS "booking_assets_owner_delete" ON storage.objects;
CREATE POLICY "booking_assets_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'booking-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
