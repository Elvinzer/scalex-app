import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingNotifications, nativeBookingReminderDeliveries, nativeBookings } from "@/db/schema";
import { getBusinessEntitlement } from "@/lib/businesses/entitlements";
import { inngest, nativeBookingCalendarSyncRequested, nativeBookingNotificationRequested, nativeBookingReminderRequested } from "./client";

const RECOVERY_BATCH_SIZE = 100;

// Pending records are the durable outbox. Repeating recovery sends the same
// event IDs, and consumers also recheck persisted delivery/sync state.
export async function resumeBusinessOperations(businessId: string): Promise<void> {
  if (!(await getBusinessEntitlement(businessId)).active) return;
  let cursor: string | null = null;
  for (;;) {
    const rows = await db.select({ id: nativeBookingNotifications.id, bookingId: nativeBookingNotifications.bookingId, kind: nativeBookingNotifications.kind, updatedAt: nativeBookingNotifications.updatedAt })
      .from(nativeBookingNotifications).innerJoin(nativeBookings, eq(nativeBookings.id, nativeBookingNotifications.bookingId))
      .where(and(eq(nativeBookings.userId, businessId), inArray(nativeBookingNotifications.status, ["pending", "failed"]), gt(nativeBookings.startAt, new Date()), cursor ? gt(nativeBookingNotifications.id, cursor) : undefined))
      .orderBy(asc(nativeBookingNotifications.id)).limit(RECOVERY_BATCH_SIZE);
    if (!rows.length || !(await getBusinessEntitlement(businessId)).active) break;
    await inngest.send(rows.map((row) => ({ ...nativeBookingNotificationRequested.create({ bookingId: row.bookingId, kind: row.kind }), id: `business-recovery:notification:${row.id}:${row.updatedAt.getTime()}` })));
    cursor = rows[rows.length - 1].id;
  }

  cursor = null;
  for (;;) {
    const rows = await db.select({ id: nativeBookingReminderDeliveries.id, updatedAt: nativeBookingReminderDeliveries.updatedAt })
      .from(nativeBookingReminderDeliveries).innerJoin(nativeBookings, eq(nativeBookings.id, nativeBookingReminderDeliveries.bookingId))
      .where(and(eq(nativeBookings.userId, businessId), inArray(nativeBookingReminderDeliveries.status, ["pending", "failed"]), gt(nativeBookings.startAt, new Date()), cursor ? gt(nativeBookingReminderDeliveries.id, cursor) : undefined))
      .orderBy(asc(nativeBookingReminderDeliveries.id)).limit(RECOVERY_BATCH_SIZE);
    if (!rows.length || !(await getBusinessEntitlement(businessId)).active) break;
    await inngest.send(rows.map((row) => ({ ...nativeBookingReminderRequested.create({ deliveryId: row.id }), id: `business-recovery:reminder:${row.id}:${row.updatedAt.getTime()}` })));
    cursor = rows[rows.length - 1].id;
  }

  cursor = null;
  for (;;) {
    const rows = await db.select({ id: nativeBookings.id, updatedAt: nativeBookings.updatedAt })
      .from(nativeBookings).where(and(eq(nativeBookings.userId, businessId), inArray(nativeBookings.syncStatus, ["pending", "failed"]), cursor ? gt(nativeBookings.id, cursor) : undefined))
      .orderBy(asc(nativeBookings.id)).limit(RECOVERY_BATCH_SIZE);
    if (!rows.length || !(await getBusinessEntitlement(businessId)).active) break;
    await inngest.send(rows.map((row) => ({ ...nativeBookingCalendarSyncRequested.create({ bookingId: row.id }), id: `business-recovery:calendar:${row.id}:${row.updatedAt.getTime()}` })));
    cursor = rows[rows.length - 1].id;
  }
}
