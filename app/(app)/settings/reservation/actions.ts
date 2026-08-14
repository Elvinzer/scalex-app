"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { db } from "@/db";
import { bookingPageSettings } from "@/db/schema";
import { track } from "@/lib/analytics";
import { DEFAULT_BOOKING_PAGE_SETTINGS, normalizeBookingPageSettings, type BookingPageSettingsData } from "@/lib/booking-page/config";
import { bookingPageSettingsInputSchema, type BookingPageSettingsInput } from "@/lib/booking-page/schema";
import { deleteBookingAsset, isOwnedBookingAssetPath } from "@/lib/booking-page/storage";
import { requireUserId } from "@/lib/current-user";
import { requireOwner } from "@/lib/team/context";

type ActionResult = { error: string | null };

function storagePaths(value: BookingPageSettingsData, accountId: string): string[] {
  return [value.backgroundUrl, value.logoUrl, value.sideMediaUrl].filter(
    (path): path is string => isOwnedBookingAssetPath(path, accountId),
  );
}

function changedFields(previous: BookingPageSettingsData, next: BookingPageSettingsData): string[] {
  const keys: Array<keyof BookingPageSettingsData> = [
    "theme",
    "accentColor",
    "backgroundType",
    "backgroundKey",
    "backgroundUrl",
    "overlayOpacity",
    "backgroundPosition",
    "logoUrl",
    "showCompanyName",
    "sideMediaType",
    "sideMediaUrl",
    "sideMediaCaption",
    "title",
    "subtitle",
    "emoji",
    "confirmationMessage",
  ];
  return keys.filter((key) => previous[key] !== next[key]);
}

function settingsData(value: BookingPageSettingsInput): BookingPageSettingsData {
  return normalizeBookingPageSettings(value);
}

export async function saveBookingPageSettings(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire du compte peut personnaliser cette page." };

  const parsed = bookingPageSettingsInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Paramètres invalides." };

  const next = settingsData(parsed.data);
  if (next.backgroundType === "upload" && !isOwnedBookingAssetPath(next.backgroundUrl, access.accountId)) {
    return { error: "L’image de fond doit être envoyée depuis ce compte." };
  }
  if (next.logoUrl && !isOwnedBookingAssetPath(next.logoUrl, access.accountId)) {
    return { error: "Le logo doit être envoyé depuis ce compte." };
  }
  if ((next.sideMediaType === "image" || next.sideMediaType === "video") && !isOwnedBookingAssetPath(next.sideMediaUrl, access.accountId)) {
    return { error: "Le média doit être envoyé depuis ce compte." };
  }

  const [previousRow] = await db.select().from(bookingPageSettings).where(eq(bookingPageSettings.userId, access.accountId)).limit(1);
  const previous = normalizeBookingPageSettings(previousRow ?? DEFAULT_BOOKING_PAGE_SETTINGS);
  const updatedAt = new Date();

  await db
    .insert(bookingPageSettings)
    .values({
      userId: access.accountId,
      ...next,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: bookingPageSettings.userId,
      set: { ...next, updatedAt },
    });

  const nextPaths = new Set(storagePaths(next, access.accountId));
  await Promise.all(
    storagePaths(previous, access.accountId)
      .filter((path) => !nextPaths.has(path))
      .map((path) => deleteBookingAsset(path, access.accountId)),
  );
  revalidatePath("/settings/reservation");
  revalidatePath("/reglages/reservation");
  revalidatePath("/book", "layout");

  const fieldsChanged = changedFields(previous, next);
  after(() => track("booking_page_customized", access.accountId, { fields_changed: fieldsChanged }));
  if (next.backgroundType === "preset" && next.backgroundKey && previous.backgroundKey !== next.backgroundKey) {
    after(() => track("booking_page_preset_background_used", access.accountId, { preset: next.backgroundKey }));
  }

  return { error: null };
}

export async function resetBookingPageSettings(): Promise<ActionResult> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire du compte peut réinitialiser cette page." };

  const [previousRow] = await db.select().from(bookingPageSettings).where(eq(bookingPageSettings.userId, access.accountId)).limit(1);
  await db.delete(bookingPageSettings).where(eq(bookingPageSettings.userId, access.accountId));
  await Promise.all(storagePaths(normalizeBookingPageSettings(previousRow ?? DEFAULT_BOOKING_PAGE_SETTINGS), access.accountId).map((path) => deleteBookingAsset(path, access.accountId)));
  revalidatePath("/settings/reservation");
  revalidatePath("/reglages/reservation");
  revalidatePath("/book", "layout");

  after(() => track("booking_page_customized", access.accountId, { fields_changed: ["reset"] }));
  return { error: null };
}
