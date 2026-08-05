import { nativeBookingAvailability, nativeBookingEvents, nativeBookingExceptions, type NativeBookingWindow } from "@/db/schema";

type NativeBookingEvent = typeof nativeBookingEvents.$inferSelect;
type NativeBookingAvailability = typeof nativeBookingAvailability.$inferSelect;
type NativeBookingException = typeof nativeBookingExceptions.$inferSelect;

import {
  addLocalDays,
  localDateTimeToUtc,
  localDateStringFromDate,
  minutesFromTime,
  weekdayForDate,
} from "./time";

type ExistingBooking = { startAt: Date; endAt: Date; status: string; holdExpiresAt: Date | null };

export type GeneratedBookingSlot = {
  startAt: Date;
  endAt: Date;
  eventTimeZone: string;
};

function isBlockingBooking(booking: ExistingBooking, now: Date): boolean {
  if (booking.status === "confirmed" || booking.status === "sync_failed") return true;
  return booking.status === "pending" && Boolean(booking.holdExpiresAt && booking.holdExpiresAt > now);
}

function overlaps(startAt: Date, endAt: Date, booking: ExistingBooking, bufferBefore: number, bufferAfter: number): boolean {
  const bufferedStart = new Date(booking.startAt.getTime() - bufferBefore * 60_000);
  const bufferedEnd = new Date(booking.endAt.getTime() + bufferAfter * 60_000);
  return startAt < bufferedEnd && endAt > bufferedStart;
}

function windowsForDate(
  date: string,
  event: NativeBookingEvent,
  availability: NativeBookingAvailability[],
  exceptions: NativeBookingException[]
): NativeBookingWindow[] {
  const exception = exceptions.find((item) => item.date === date);
  if (exception?.type === "closed") return [];
  if (exception?.type === "custom") return exception.windows;

  const weekday = weekdayForDate(date);
  return availability
    .filter((item) => item.weekday === weekday)
    .map((item) => ({ startTime: item.startTime, endTime: item.endTime }));
}

export function generateBookingSlots({
  event,
  availability,
  exceptions,
  bookings,
  now = new Date(),
  fromDate,
  days = 14,
}: {
  event: NativeBookingEvent;
  availability: NativeBookingAvailability[];
  exceptions: NativeBookingException[];
  bookings: ExistingBooking[];
  now?: Date;
  fromDate?: string;
  days?: number;
}): GeneratedBookingSlot[] {
  const firstDate = fromDate ?? localDateStringFromDate(now, event.timeZone);
  const maxDays = Math.min(days, event.bookingHorizonDays);
  const horizonEnd = new Date(now.getTime() + event.bookingHorizonDays * 86_400_000);
  const minimumStart = new Date(now.getTime() + event.minNoticeMinutes * 60_000);
  const results: GeneratedBookingSlot[] = [];

  for (let offset = 0; offset < maxDays; offset += 1) {
    const date = addLocalDays(firstDate, offset);
    const windows = windowsForDate(date, event, availability, exceptions);

    for (const window of windows) {
      const startMinutes = minutesFromTime(window.startTime);
      const endMinutes = minutesFromTime(window.endTime);
      for (
        let cursor = startMinutes;
        cursor + event.durationMinutes <= endMinutes;
        cursor += event.durationMinutes
      ) {
        const startTime = `${Math.floor(cursor / 60).toString().padStart(2, "0")}:${(cursor % 60)
          .toString()
          .padStart(2, "0")}`;
        const endCursor = cursor + event.durationMinutes;
        const endTime = `${Math.floor(endCursor / 60).toString().padStart(2, "0")}:${(endCursor % 60)
          .toString()
          .padStart(2, "0")}`;
        const startAt = localDateTimeToUtc(date, startTime, event.timeZone);
        const endAt = localDateTimeToUtc(date, endTime, event.timeZone);

        if (startAt < minimumStart || endAt > horizonEnd) continue;
        if (bookings.some((booking) => isBlockingBooking(booking, now) && overlaps(startAt, endAt, booking, event.bufferBeforeMinutes, event.bufferAfterMinutes))) {
          continue;
        }
        results.push({ startAt, endAt, eventTimeZone: event.timeZone });
      }
    }
  }

  return results;
}
