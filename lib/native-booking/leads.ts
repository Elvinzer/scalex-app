import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookingLeads, nativeBookingLinks } from "@/db/schema";

import { normalizeEmail, normalizePhone, sanitizeUtm, type PublicContactInput } from "./validation";

export type NativeBookingLeadStep =
  | "contact_submitted"
  | "slots_revealed"
  | "slot_selected"
  | "booking_failed"
  | "converted";

type PublicLeadMetadata = {
  sessionKey?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  linkId?: string | null;
  utm?: Record<string, string>;
};

type PublicLeadEvent = Pick<typeof nativeBookingEvents.$inferSelect, "id" | "userId" | "timeZone">;

function leadValues(
  event: PublicLeadEvent,
  contact: PublicContactInput,
  metadata: PublicLeadMetadata,
  link: typeof nativeBookingLinks.$inferSelect | undefined,
  sessionKey: string,
  step: NativeBookingLeadStep,
  selectedStartAt: Date | null,
  selectedEndAt: Date | null
) {
  const safeUtm = sanitizeUtm(metadata.utm);
  return {
    userId: event.userId,
    eventId: event.id,
    sessionKey,
    status: "open" as const,
    lastStep: step,
    firstName: contact.firstName.trim(),
    lastName: contact.lastName.trim(),
    email: contact.email.trim(),
    emailNormalized: normalizeEmail(contact.email),
    phone: contact.phone.trim(),
    phoneNormalized: normalizePhone(contact.phone),
    guestTimeZone: contact.guestTimeZone,
    eventTimeZone: event.timeZone,
    selectedStartAt,
    selectedEndAt,
    contactConsentAt: new Date(),
    landingPage: metadata.landingPage ?? null,
    referrer: metadata.referrer ?? null,
    linkId: link?.id ?? null,
    utmSource: safeUtm.utm_source ?? link?.utmSource ?? null,
    utmMedium: safeUtm.utm_medium ?? link?.utmMedium ?? null,
    utmCampaign: safeUtm.utm_campaign ?? link?.utmCampaign ?? null,
    utmContent: safeUtm.utm_content ?? link?.utmContent ?? null,
    utmTerm: safeUtm.utm_term ?? link?.utmTerm ?? null,
    utmMetadata: safeUtm,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
}

async function findActiveLink(eventId: string, linkId: string | null | undefined) {
  if (!linkId) return undefined;
  const [link] = await db
    .select()
    .from(nativeBookingLinks)
    .where(and(eq(nativeBookingLinks.id, linkId), eq(nativeBookingLinks.eventId, eventId), eq(nativeBookingLinks.isActive, true)))
    .limit(1);
  return link;
}

export async function upsertPublicBookingLead(params: {
  event: PublicLeadEvent;
  contact: PublicContactInput;
  metadata: PublicLeadMetadata;
  step: NativeBookingLeadStep;
  selectedStartAt?: Date | null;
  selectedEndAt?: Date | null;
}) {
  const sessionKey = params.metadata.sessionKey ?? randomUUID();
  const link = await findActiveLink(params.event.id, params.metadata.linkId);
  const values = leadValues(
    params.event,
    params.contact,
    params.metadata,
    link,
    sessionKey,
    params.step,
    params.selectedStartAt ?? null,
    params.selectedEndAt ?? null
  );

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: nativeBookingLeads.id,
        status: nativeBookingLeads.status,
        contactConsentAt: nativeBookingLeads.contactConsentAt,
        landingPage: nativeBookingLeads.landingPage,
        referrer: nativeBookingLeads.referrer,
        linkId: nativeBookingLeads.linkId,
        utmSource: nativeBookingLeads.utmSource,
        utmMedium: nativeBookingLeads.utmMedium,
        utmCampaign: nativeBookingLeads.utmCampaign,
        utmContent: nativeBookingLeads.utmContent,
        utmTerm: nativeBookingLeads.utmTerm,
        utmMetadata: nativeBookingLeads.utmMetadata,
      })
      .from(nativeBookingLeads)
      .where(and(eq(nativeBookingLeads.eventId, params.event.id), eq(nativeBookingLeads.sessionKey, sessionKey)))
      .limit(1);

    if (existing) {
      if (existing.status === "converted") return existing.id;
      const nextStatus = existing.status === "dismissed" ? "open" : existing.status;
      await tx
        .update(nativeBookingLeads)
        .set({
          ...values,
          status: nextStatus,
          contactConsentAt: existing.contactConsentAt,
          landingPage: existing.landingPage ?? values.landingPage,
          referrer: existing.referrer ?? values.referrer,
          linkId: existing.linkId ?? values.linkId,
          utmSource: existing.utmSource ?? values.utmSource,
          utmMedium: existing.utmMedium ?? values.utmMedium,
          utmCampaign: existing.utmCampaign ?? values.utmCampaign,
          utmContent: existing.utmContent ?? values.utmContent,
          utmTerm: existing.utmTerm ?? values.utmTerm,
          utmMetadata: existing.utmMetadata,
          dismissedAt: null,
        })
        .where(eq(nativeBookingLeads.id, existing.id));
      return existing.id;
    }

    const [created] = await tx.insert(nativeBookingLeads).values(values).returning({ id: nativeBookingLeads.id });
    return created?.id ?? null;
  });
}

export async function touchPublicBookingLead(params: {
  slug: string;
  leadId: string;
  contact: PublicContactInput;
  step: Exclude<NativeBookingLeadStep, "contact_submitted" | "converted">;
  selectedStartAt?: Date | null;
  selectedEndAt?: Date | null;
}) {
  const [lead] = await db
    .select({ lead: nativeBookingLeads, event: nativeBookingEvents })
    .from(nativeBookingLeads)
    .innerJoin(nativeBookingEvents, eq(nativeBookingLeads.eventId, nativeBookingEvents.id))
    .where(
      and(
        eq(nativeBookingLeads.id, params.leadId),
        eq(nativeBookingLeads.emailNormalized, normalizeEmail(params.contact.email)),
        eq(nativeBookingEvents.slug, params.slug),
        eq(nativeBookingEvents.status, "active")
      )
    )
    .limit(1);

  if (!lead || lead.lead.status === "converted") return false;

  await db
    .update(nativeBookingLeads)
    .set({
      firstName: params.contact.firstName.trim(),
      lastName: params.contact.lastName.trim(),
      email: params.contact.email.trim(),
      phone: params.contact.phone.trim(),
      phoneNormalized: normalizePhone(params.contact.phone),
      guestTimeZone: params.contact.guestTimeZone,
      lastStep: params.step,
      selectedStartAt: params.selectedStartAt ?? lead.lead.selectedStartAt,
      selectedEndAt: params.selectedEndAt ?? lead.lead.selectedEndAt,
      status: lead.lead.status === "dismissed" ? "open" : lead.lead.status,
      dismissedAt: null,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(nativeBookingLeads.id, lead.lead.id));

  return true;
}

export async function listNativeBookingLeads(accountId: string) {
  const rows = await db
    .select({ lead: nativeBookingLeads, event: nativeBookingEvents })
    .from(nativeBookingLeads)
    .innerJoin(nativeBookingEvents, eq(nativeBookingLeads.eventId, nativeBookingEvents.id))
    .where(and(eq(nativeBookingLeads.userId, accountId), inArray(nativeBookingLeads.status, ["open", "contacted"])))
    .orderBy(desc(nativeBookingLeads.lastSeenAt))
    .limit(100);

  return rows;
}
