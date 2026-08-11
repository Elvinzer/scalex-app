import { NextResponse, type NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookings, users } from "@/db/schema";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { createNativeBooking, createNativeBookingHold } from "@/lib/native-booking/booking";
import { cancelNativeBookingByToken, getPublicNativeBookingRescheduleSlots, rescheduleNativeBookingByToken } from "@/lib/native-booking/mutations";
import { getPublicNativeBookingEvent, getPublicNativeBookingSlots, hasFutureNativeBooking } from "@/lib/native-booking/queries";
import { touchPublicBookingLead, upsertPublicBookingLead } from "@/lib/native-booking/leads";
import { validateNativeBookingAnswers } from "@/lib/native-booking/questions";
import { hashBookingManagementToken } from "@/lib/native-booking/tokens";
import { normalizePhone, publicBookingCancelSchema, publicBookingRequestSchema, publicBookingRescheduleSchema, publicBookingRescheduleSlotsSchema, publicBookingRouteSchema, publicQualificationSchema, publicLeadCaptureSchema, publicLeadTouchSchema, publicPhoneStageSchema, sanitizeUtm } from "@/lib/native-booking/validation";
import { revalidateBusinessData } from "@/lib/revalidate-data";

type RouteContext = { params: Promise<{ handle: string; slug: string }> };

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { handle, slug } = await context.params;
  const rescheduleToken = request.nextUrl.searchParams.get("manage")?.trim() ?? "";
  const cancellationToken = request.nextUrl.searchParams.get("cancel")?.trim() ?? "";
  if (!rescheduleToken && !cancellationToken) return jsonError("Lien de gestion invalide.", 400, "invalid_token");
  const rescheduleHash = rescheduleToken ? hashBookingManagementToken(rescheduleToken) : null;
  const cancellationHash = cancellationToken ? hashBookingManagementToken(cancellationToken) : null;
  const tokenFilter = rescheduleHash && cancellationHash
    ? and(eq(nativeBookings.rescheduleTokenHash, rescheduleHash), eq(nativeBookings.cancellationTokenHash, cancellationHash))
    : rescheduleHash
      ? eq(nativeBookings.rescheduleTokenHash, rescheduleHash)
      : eq(nativeBookings.cancellationTokenHash, cancellationHash ?? "");
  const owner = alias(users, "owner");
  const [booking] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .innerJoin(owner, eq(owner.id, nativeBookingEvents.userId))
    .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
    .where(
      and(
        eq(owner.bookingHandle, handle),
        eq(nativeBookingEvents.slug, slug),
        tokenFilter,
        or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"))
      )
    )
    .limit(1);
  if (!booking) return jsonError("Ce lien de gestion n’est plus valide.", 404, "not_found");
  return NextResponse.json({
    booking: {
      startAt: booking.booking.startAt.toISOString(),
      endAt: booking.booking.endAt.toISOString(),
      firstName: booking.booking.firstName,
      lastName: booking.booking.lastName,
      email: booking.booking.email,
      closerName: booking.closer?.displayName || booking.closer?.email || "ton closer",
      meetingUrl: booking.event.meetingUrl,
      cancellationToken: cancellationToken || null,
      rescheduleToken: rescheduleToken || null,
    },
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { handle, slug } = await context.params;
  const ip = getClientIp(request);
  if (isRateLimited(`native-booking:${ip}:${handle}:${slug}`, 30, 60_000)) {
    return jsonError("Trop de demandes. Réessaie dans un instant.", 429, "rate_limited");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Requête invalide.");
  }

  if (!body || typeof body !== "object") return jsonError("Requête invalide.");
  const parsedRoute = publicBookingRouteSchema.safeParse(body);
  if (!parsedRoute.success) return jsonError("Requête de réservation invalide.", 422, "invalid_request");
  const mode = parsedRoute.data.mode;

  if (mode === "validate-phone") {
    const parsed = publicPhoneStageSchema.safeParse(parsedRoute.data);
    if (!parsed.success) return jsonError("Vérifie ton numéro de téléphone.", 422, "invalid_phone");
    return NextResponse.json({ phone: normalizePhone(parsed.data.phone) });
  }

  if (mode === "capture") {
    const parsed = publicLeadCaptureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Impossible d’enregistrer cette information.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const event = await getPublicNativeBookingEvent(handle, slug);
    if (!event) return jsonError("Cette page de réservation n’est plus disponible.", 404, "not_found");

    const leadId = await upsertPublicBookingLead({
      event,
      contact: parsed.data,
      metadata: {
        sessionKey: parsed.data.leadSessionKey,
        landingPage: parsed.data.landingPage,
        referrer: parsed.data.referrer,
        linkId: parsed.data.linkId,
        metaTouchpointToken: parsed.data.metaTouchpointToken,
        metaCampaignExternalId: parsed.data.metaCampaignExternalId,
        metaAdSetExternalId: parsed.data.metaAdSetExternalId,
        metaAdExternalId: parsed.data.metaAdExternalId,
        utm: parsed.data.utm,
      },
      step: "contact_submitted",
    });
    if (!leadId) return jsonError("Impossible d’enregistrer cette information. Réessaie dans un instant.", 500, "lead_capture_failed");
    revalidateBusinessData();

    return NextResponse.json({ leadId });
  }

  if (mode === "unlock") {
    const parsed = publicQualificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Vérifie les informations saisies.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const slots = await getPublicNativeBookingSlots(handle, slug, { days: 14 });
    if (!slots) return jsonError("Cette page de réservation n’est plus disponible.", 404, "not_found");

    const answerValidation = validateNativeBookingAnswers(slots.event.questions, parsed.data.answers);
    if (!answerValidation.ok) {
      return NextResponse.json(
        { error: "Réponds aux questions obligatoires avant de voir les créneaux.", fieldErrors: answerValidation.fieldErrors },
        { status: 422 }
      );
    }

    const existing = await hasFutureNativeBooking(slots.event.userId, normalizePhone(parsed.data.phone));
    if (existing) {
      return jsonError(
        "Tu as déjà un rendez-vous à venir. Pour éviter un doublon, celui-ci doit être honoré ou annulé avant d’en réserver un autre.",
        409,
        "existing_booking"
      );
    }

    const leadId = await upsertPublicBookingLead({
      event: slots.event,
      contact: parsed.data,
      metadata: {
        sessionKey: parsed.data.leadSessionKey,
        landingPage: parsed.data.landingPage,
        referrer: parsed.data.referrer,
        linkId: parsed.data.linkId,
        metaTouchpointToken: parsed.data.metaTouchpointToken,
        metaCampaignExternalId: parsed.data.metaCampaignExternalId,
        metaAdSetExternalId: parsed.data.metaAdSetExternalId,
        metaAdExternalId: parsed.data.metaAdExternalId,
        utm: parsed.data.utm,
      },
      step: "slots_revealed",
      answers: answerValidation.snapshot,
    });
    if (!leadId) return jsonError("Impossible d’enregistrer ta demande. Réessaie dans un instant.", 500, "lead_capture_failed");
    revalidateBusinessData();

    return NextResponse.json({
      leadId,
      event: {
        timeZone: slots.event.timeZone,
        durationMinutes: slots.event.durationMinutes,
      },
      slots: slots.slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })),
      utm: sanitizeUtm(parsed.data.utm),
    });
  }

  if (mode === "touch") {
    const parsed = publicLeadTouchSchema.safeParse(body);
    if (!parsed.success) return jsonError("Impossible d’enregistrer cette étape.", 422, "invalid_lead_touch");

    const event = await getPublicNativeBookingEvent(handle, slug);
    if (!event) return jsonError("Cette page de réservation n’est plus disponible.", 404, "not_found");

    const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : null;
    const endAt = startAt ? new Date(startAt.getTime() + event.durationMinutes * 60_000) : null;
    await touchPublicBookingLead({
      slug,
      leadId: parsed.data.leadId,
      contact: parsed.data,
      step: parsed.data.lastStep,
      selectedStartAt: startAt,
      selectedEndAt: endAt,
    });
    revalidateBusinessData();
    return NextResponse.json({ ok: true });
  }

  if (mode === "cancel") {
    const parsed = publicBookingCancelSchema.safeParse(body);
    if (!parsed.success) return jsonError("Lien de gestion invalide.", 422, "invalid_token");
    const result = await cancelNativeBookingByToken(handle, slug, parsed.data.token);
    if ("error" in result) return jsonError("Ce lien de gestion n’est plus valide.", 404, "not_found");
    revalidateBusinessData();
    return NextResponse.json({ ok: true, calendarSyncWarning: result.calendarSyncWarning ?? false });
  }

  if (mode === "reschedule-slots") {
    const parsed = publicBookingRescheduleSlotsSchema.safeParse(body);
    if (!parsed.success) return jsonError("Lien de gestion invalide.", 422, "invalid_token");
    const result = await getPublicNativeBookingRescheduleSlots(handle, slug, parsed.data.token);
    if (!result) return jsonError("Ce lien de gestion n’est plus valide.", 404, "not_found");
    return NextResponse.json({ slots: result.slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })) });
  }

  if (mode === "reschedule") {
    const parsed = publicBookingRescheduleSchema.safeParse(body);
    if (!parsed.success) return jsonError("Nouvel horaire invalide.", 422, "invalid_reschedule");
    const result = await rescheduleNativeBookingByToken(handle, slug, parsed.data.token, new Date(parsed.data.startAt));
    if ("error" in result) {
      if (result.error === "not_found") return jsonError("Ce lien de gestion n’est plus valide.", 404, "not_found");
      if (result.error === "slot_unavailable") return jsonError("Ce créneau n’est plus disponible.", 409, "slot_unavailable");
      return jsonError("Le rendez-vous n’a pas pu être déplacé.", 500, "reschedule_failed");
    }
    revalidateBusinessData();
    return NextResponse.json({ booking: { ...result, startAt: result.startAt.toISOString(), endAt: result.endAt.toISOString() } });
  }

  if (mode === "hold" || mode === "book") {
    const parsed = publicBookingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Impossible de confirmer avec ces informations.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const result = mode === "hold" ? await createNativeBookingHold(handle, slug, parsed.data) : await createNativeBooking(handle, slug, parsed.data);
    if ("error" in result) {
      if (result.error === "not_found") return jsonError("Cette page de réservation n’est plus disponible.", 404, "not_found");
      if (result.error === "existing_booking") {
        return jsonError("Tu as déjà un rendez-vous à venir. Tu ne peux pas en réserver un second pour le moment.", 409, "existing_booking");
      }
      if (result.error === "slot_unavailable") return jsonError("Ce créneau vient d’être pris. Choisis-en un autre.", 409, "slot_unavailable");
      return jsonError("La réservation n’a pas pu être confirmée. Réessaie.", 500, "booking_failed");
    }
    if (mode === "hold") {
      if (!("expiresAt" in result)) return jsonError("Le créneau n’a pas pu être réservé temporairement. Réessaie.", 500, "hold_failed");
      return NextResponse.json({
        hold: {
          ...result,
          startAt: result.startAt.toISOString(),
          endAt: result.endAt.toISOString(),
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    }
    revalidateBusinessData();
    return NextResponse.json({ booking: { ...result, startAt: result.startAt.toISOString(), endAt: result.endAt.toISOString() } });
  }

  return jsonError("Mode de réservation inconnu.");
}
