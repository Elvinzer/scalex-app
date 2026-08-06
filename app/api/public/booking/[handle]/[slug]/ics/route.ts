import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookings, users } from "@/db/schema";
import { createNativeBookingIcs } from "@/lib/native-booking/ics";
import { hashBookingManagementToken } from "@/lib/native-booking/tokens";

type RouteContext = { params: Promise<{ handle: string; slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { handle, slug } = await context.params;
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ error: "Lien de calendrier invalide." }, { status: 400 });

  const tokenHash = hashBookingManagementToken(token);
  const owner = alias(users, "owner");
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .innerJoin(owner, eq(owner.id, nativeBookingEvents.userId))
    .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
    .where(
      and(
        eq(owner.bookingHandle, handle),
        eq(nativeBookingEvents.slug, slug),
        or(eq(nativeBookings.cancellationTokenHash, tokenHash), eq(nativeBookings.rescheduleTokenHash, tokenHash)),
        or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"))
      )
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "Ce lien de calendrier n’est plus valide." }, { status: 404 });

  const ics = createNativeBookingIcs({
    uid: `native-booking-${row.booking.id}@scalex.app`,
    startAt: row.booking.startAt,
    endAt: row.booking.endAt,
    title: row.event.meetingLabel,
    timeZone: row.booking.eventTimeZone,
    closerName: row.closer?.displayName || row.closer?.email || "Closer",
    instructions: row.event.bookingInstructions,
    meetingUrl: row.event.meetingUrl,
  });
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="scale-x-rendez-vous.ics"',
      "cache-control": "private, no-store",
    },
  });
}
