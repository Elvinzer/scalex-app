import { eventType, Inngest, staticSchema } from "inngest";

type StripeAccountConnected = {
  userId: string;
};

export const stripeAccountConnected = eventType("stripe/account.connected", {
  schema: staticSchema<StripeAccountConnected>(),
});

type StripeSyncRequested = {
  userId: string;
};

export const stripeSyncRequested = eventType("stripe/sync.requested", {
  schema: staticSchema<StripeSyncRequested>(),
});

type IclosedAccountConnected = {
  userId: string;
};

export const iclosedAccountConnected = eventType("iclosed/account.connected", {
  schema: staticSchema<IclosedAccountConnected>(),
});

type CalendlyAccountConnected = {
  userId: string;
};

export const calendlyAccountConnected = eventType("calendly/account.connected", {
  schema: staticSchema<CalendlyAccountConnected>(),
});

type InstagramAccountConnected = {
  userId: string;
};

export const instagramAccountConnected = eventType("instagram/account.connected", {
  schema: staticSchema<InstagramAccountConnected>(),
});

type InstagramBackfillContinue = {
  userId: string;
};

// Self-chained follow-up when backfillInstagramPosts stops early because it
// hit its time budget (see lib/instagram/protocol.ts's
// INSTAGRAM_BACKFILL_TIME_BUDGET_MS) — a large never-synced backlog can
// need several of these before fully catching up. Deliberately a distinct
// event from instagramAccountConnected: that one also flips
// initialSyncStatus through its own pending/completed/failed lifecycle,
// which a mid-backlog continuation has no business touching.
export const instagramBackfillContinue = eventType("instagram/backfill.continue", {
  schema: staticSchema<InstagramBackfillContinue>(),
});

type MetaAdsAccountConnected = {
  userId: string;
};

export const metaAdsAccountConnected = eventType("meta-ads/account.connected", {
  schema: staticSchema<MetaAdsAccountConnected>(),
});

type MetaAdsSyncRequested = {
  userId: string;
};

export const metaAdsSyncRequested = eventType("meta-ads/sync.requested", {
  schema: staticSchema<MetaAdsSyncRequested>(),
});

type YoutubeAccountConnected = {
  userId: string;
};

export const youtubeAccountConnected = eventType("youtube/account.connected", {
  schema: staticSchema<YoutubeAccountConnected>(),
});

type YoutubeBackfillContinue = {
  userId: string;
};

// Self-chained follow-up when backfillYoutubeVideos stops early because it
// hit its time budget (see lib/youtube/protocol.ts's
// YOUTUBE_BACKFILL_TIME_BUDGET_MS) — mirrors instagramBackfillContinue.
export const youtubeBackfillContinue = eventType("youtube/backfill.continue", {
  schema: staticSchema<YoutubeBackfillContinue>(),
});

type NativeBookingCalendarSyncRequested = {
  bookingId: string;
};

export const nativeBookingCalendarSyncRequested = eventType("native-booking/calendar.sync-requested", {
  schema: staticSchema<NativeBookingCalendarSyncRequested>(),
});

type NativeBookingNotificationRequested = {
  bookingId: string;
  kind: "confirmation" | "cancellation" | "reschedule";
};

export const nativeBookingNotificationRequested = eventType("native-booking/notification.requested", {
  schema: staticSchema<NativeBookingNotificationRequested>(),
});

type NativeBookingReminderRequested = {
  deliveryId: string;
};

export const nativeBookingReminderRequested = eventType("native-booking/reminder.requested", {
  schema: staticSchema<NativeBookingReminderRequested>(),
});

export const inngest = new Inngest({ id: "scale-x" });
