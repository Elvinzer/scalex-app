import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { bookingPageSettings, businessProfile, users } from "@/db/schema";

import {
  DEFAULT_BOOKING_PAGE_SETTINGS,
  getSafeBookingEmbedUrl,
  normalizeBookingPageSettings,
  type BookingPageSettingsData,
  type BookingPageSettingsView,
} from "./config";
import { createBookingAssetSignedUrl } from "./storage";

async function fetchBookingPageSettingsView(accountId: string): Promise<BookingPageSettingsView> {
  const [[settingsRow], [userRow], [profileRow]] = await Promise.all([
    db.select().from(bookingPageSettings).where(eq(bookingPageSettings.userId, accountId)).limit(1),
    db.select({ displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, accountId)).limit(1),
    db.select({ identity: businessProfile.identity }).from(businessProfile).where(eq(businessProfile.userId, accountId)).limit(1),
  ]);

  const settings = normalizeBookingPageSettings(settingsRow ?? DEFAULT_BOOKING_PAGE_SETTINGS);
  const [backgroundAssetUrl, logoAssetUrl, sideMediaAssetUrl] = await Promise.all([
    settings.backgroundType === "upload" ? createBookingAssetSignedUrl(settings.backgroundUrl, accountId) : Promise.resolve(null),
    createBookingAssetSignedUrl(settings.logoUrl, accountId),
    settings.sideMediaType === "embed"
      ? Promise.resolve(getSafeBookingEmbedUrl(settings.sideMediaUrl))
      : createBookingAssetSignedUrl(settings.sideMediaUrl, accountId),
  ]);

  const businessName = profileRow?.identity.businessName?.trim() || userRow?.displayName?.trim() || "Minaly";
  return {
    ...settings,
    backgroundAssetUrl,
    logoAssetUrl,
    sideMediaAssetUrl,
    companyName: businessName,
    ownerName: userRow?.displayName?.trim() || null,
  };
}

export const getBookingPageSettingsView = cache(async (accountId: string) => fetchBookingPageSettingsView(accountId));

export function getStoredBookingPageSettings(view: BookingPageSettingsView): BookingPageSettingsData {
  return {
    theme: view.theme,
    accentColor: view.accentColor,
    backgroundType: view.backgroundType,
    backgroundKey: view.backgroundKey,
    backgroundUrl: view.backgroundUrl,
    overlayOpacity: view.overlayOpacity,
    backgroundPosition: view.backgroundPosition,
    logoUrl: view.logoUrl,
    showCompanyName: view.showCompanyName,
    sideMediaType: view.sideMediaType,
    sideMediaUrl: view.sideMediaUrl,
    sideMediaCaption: view.sideMediaCaption,
    title: view.title,
    subtitle: view.subtitle,
    emoji: view.emoji,
    confirmationMessage: view.confirmationMessage,
  };
}
