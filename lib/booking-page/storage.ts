import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { BOOKING_ASSET_BUCKET } from "./config";

type BookingStorageClient = ReturnType<typeof getSupabaseAdminClient>;

async function getBookingStorageClient(): Promise<BookingStorageClient> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return getSupabaseAdminClient();
  }
  return createSupabaseServerClient();
}

export function isOwnedBookingAssetPath(path: string | null | undefined, accountId: string): path is string {
  if (typeof path !== "string") return false;
  return path.startsWith(`${accountId}/`) && !path.includes("..") && !path.includes("\\");
}

export async function deleteBookingAsset(path: string | null | undefined, accountId: string): Promise<void> {
  if (!isOwnedBookingAssetPath(path, accountId)) return;
  try {
    const storage = await getBookingStorageClient();
    await storage.storage.from(BOOKING_ASSET_BUCKET).remove([path]);
  } catch {
    // Asset cleanup is best effort. A missing or unavailable object must not
    // make a valid settings update fail.
  }
}

export async function createBookingAssetSignedUrl(path: string | null, accountId: string): Promise<string | null> {
  if (!isOwnedBookingAssetPath(path, accountId)) return null;
  try {
    const storage = await getBookingStorageClient();
    const { data } = await storage.storage.from(BOOKING_ASSET_BUCKET).createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function uploadBookingAsset(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ error: { message: string } | null }> {
  const storage = await getBookingStorageClient();
  return storage.storage.from(BOOKING_ASSET_BUCKET).upload(path, body, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
}
