export type NativeBookingCalendarStatus = "not_required" | "pending" | "synced" | "failed";

export type NativeBookingNotificationStatus = "pending" | "sent" | "failed" | "blocked";

export type NativeBookingSideEffectStatus = {
  calendar: NativeBookingCalendarStatus;
  notification: NativeBookingNotificationStatus;
};
