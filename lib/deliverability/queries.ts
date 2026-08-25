import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  businessProfile,
  clientJourneyStageHistory,
  clientJourneys,
  clientMilestones,
  clientNotes,
  clientReminders,
  journeyColumns,
  testimonials,
} from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import type { Offer } from "@/lib/business/types";
import { getSales } from "@/lib/sales/queries";
import { isInstallmentPaymentSale, type SaleRow } from "@/lib/sales/types";
import { getSetters } from "@/lib/setters/queries";
import { createBookingAssetSignedUrl } from "@/lib/booking-page/storage";

import { computeDeliveryMetrics } from "./metrics";
import type { ClientJourneyColumnType, ClientJourneyStatus, TestimonialMediaType } from "./types";

const DEFAULT_COLUMNS: readonly { name: string; type: ClientJourneyColumnType }[] = [
  { name: "Onboarding", type: "entry" },
  { name: "En cours", type: "progression" },
  { name: "À risque", type: "risk" },
  { name: "Résultat atteint", type: "success" },
  { name: "Terminé", type: "end" },
];

export type DeliveryOffer = Pick<Offer, "id" | "name" | "price">;

export type DeliveryClientCard = {
  id: string;
  clientName: string;
  saleId: string | null;
  offerId: string | null;
  offerName: string | null;
  price: number | null;
  columnId: string;
  columnType: ClientJourneyColumnType;
  status: ClientJourneyStatus;
  enteredAt: string;
  columnUpdatedAt: string;
  lastActivityAt: string;
  notesCount: number;
  inactive: boolean;
};

export type DeliveryBoardColumn = {
  id: string;
  name: string;
  type: ClientJourneyColumnType;
  position: number;
  clients: DeliveryClientCard[];
};

export type UntrackedSale = {
  id: string;
  clientName: string;
  offerId: string | null;
  offerName: string | null;
  totalPrice: number;
  saleDate: string;
  closer: string | null;
};

export type DeliveryBoardData = {
  columns: DeliveryBoardColumn[];
  offers: DeliveryOffer[];
  untrackedSales: UntrackedSale[];
  stats: ReturnType<typeof computeDeliveryMetrics>;
};

export type JourneyNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type JourneyMilestone = {
  id: string;
  name: string;
  completedAt: string | null;
};

export type JourneyReminder = {
  id: string;
  remindAt: string;
  note: string;
  completed: boolean;
};

export type JourneyHistoryEntry = {
  id: string;
  fromColumnName: string | null;
  toColumnName: string;
  changedAt: string;
};

export type JourneyDetails = {
  client: DeliveryClientCard;
  sale: SaleRow | null;
  setterName: string | null;
  notes: JourneyNote[];
  milestones: JourneyMilestone[];
  reminders: JourneyReminder[];
  history: JourneyHistoryEntry[];
};

export type JourneyOption = {
  id: string;
  clientName: string;
  offerId: string | null;
  offerName: string | null;
};

export type TestimonialRecord = {
  id: string;
  mediaType: TestimonialMediaType;
  fileUrl: string | null;
  filePath: string | null;
  externalUrl: string | null;
  text: string | null;
  clientName: string;
  clientJourneyId: string | null;
  offerId: string | null;
  resultText: string | null;
  consent: boolean;
  tags: string[];
  date: string;
  createdAt: string;
};

export type TestimonialData = {
  testimonials: TestimonialRecord[];
  totalCount: number;
  consentedCount: number;
  thisMonthCount: number;
};

export type TestimonialProofStatus = "strong" | "partial" | "none";

export type TestimonialProof = {
  count: number;
  status: TestimonialProofStatus;
};

function dateValue(value: Date): string {
  return value.toISOString();
}

function offerFor(offers: readonly DeliveryOffer[], offerId: string | null): DeliveryOffer | null {
  return offers.find((offer) => offer.id === offerId) ?? null;
}

export const ensureJourneyColumns = cache(async (accountId: string) => {
  const existing = await db.select().from(journeyColumns).where(eq(journeyColumns.userId, accountId)).orderBy(asc(journeyColumns.position));
  if (existing.length > 0) return existing;

  try {
    await db.insert(journeyColumns).values(
      DEFAULT_COLUMNS.map((column, position) => ({
        userId: accountId,
        name: column.name,
        type: column.type,
        position,
      })),
    );
  } catch {
    // Two tabs can initialize the board at the same time. The unique position
    // index makes one insert win; the following read returns its columns.
  }
  return db.select().from(journeyColumns).where(eq(journeyColumns.userId, accountId)).orderBy(asc(journeyColumns.position));
});

export async function getDeliveryBoard(accountId: string): Promise<DeliveryBoardData> {
  const [columns, profile, sales, journeys, noteCounts] = await Promise.all([
    ensureJourneyColumns(accountId),
    getBusinessProfile(accountId),
    getSales(accountId),
    db.select().from(clientJourneys).where(eq(clientJourneys.userId, accountId)),
    db
      .select({ journeyId: clientNotes.clientJourneyId, count: sql<number>`count(*)` })
      .from(clientNotes)
      .where(eq(clientNotes.userId, accountId))
      .groupBy(clientNotes.clientJourneyId),
  ]);
  const offers = profile.sales.offers.map(({ id, name, price }) => ({ id, name, price }));
  const noteCountByJourney = new Map(noteCounts.map((row) => [row.journeyId, Number(row.count)]));
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const now = new Date();
  const clientRows: DeliveryClientCard[] = journeys.flatMap((journey) => {
    const column = columnById.get(journey.columnId);
    if (!column) return [];
    const offer = offerFor(offers, journey.offerId);
    return [{
      id: journey.id,
      clientName: journey.clientName,
      saleId: journey.saleId,
      offerId: journey.offerId,
      offerName: offer?.name ?? null,
      price: offer?.price ?? sales.find((sale) => sale.id === journey.saleId)?.totalPrice ?? null,
      columnId: column.id,
      columnType: column.type,
      status: journey.status,
      enteredAt: dateValue(journey.enteredAt),
      columnUpdatedAt: dateValue(journey.columnUpdatedAt),
      lastActivityAt: dateValue(journey.lastActivityAt),
      notesCount: noteCountByJourney.get(journey.id) ?? 0,
      inactive: journey.status === "abandoned" || now.getTime() - journey.lastActivityAt.getTime() > 14 * 24 * 60 * 60 * 1000,
    }];
  });
  const metricRows = clientRows.map((client) => ({
    status: client.status,
    columnType: client.columnType,
    enteredAt: client.enteredAt,
    lastActivityAt: client.lastActivityAt,
  }));
  const trackedSaleIds = new Set(journeys.flatMap((journey) => (journey.saleId ? [journey.saleId] : [])));
  const untrackedSales = sales
    .filter((sale) => !sale.isOrphan && !isInstallmentPaymentSale(sale) && !trackedSaleIds.has(sale.id))
    .slice(0, 10)
    .map((sale) => ({
      id: sale.id,
      clientName: sale.clientName,
      offerId: sale.offerId,
      offerName: offerFor(offers, sale.offerId)?.name ?? null,
      totalPrice: sale.totalPrice,
      saleDate: sale.saleDate,
      closer: sale.closer,
    }));

  return {
    columns: columns.map((column) => ({
      id: column.id,
      name: column.name,
      type: column.type,
      position: column.position,
      clients: clientRows.filter((client) => client.columnId === column.id),
    })),
    offers,
    untrackedSales,
    stats: computeDeliveryMetrics(metricRows),
  };
}

export async function getJourneyDetails(accountId: string, journeyId: string): Promise<JourneyDetails | null> {
  const [profile, [journeyRow], notes, milestones, reminders, historyRows, columns, sales, setters] = await Promise.all([
    getBusinessProfile(accountId),
    db
      .select({ journey: clientJourneys, column: journeyColumns })
      .from(clientJourneys)
      .innerJoin(journeyColumns, eq(clientJourneys.columnId, journeyColumns.id))
      .where(and(eq(clientJourneys.id, journeyId), eq(clientJourneys.userId, accountId)))
      .limit(1),
    db.select().from(clientNotes).where(and(eq(clientNotes.clientJourneyId, journeyId), eq(clientNotes.userId, accountId))).orderBy(desc(clientNotes.createdAt)),
    db.select().from(clientMilestones).where(and(eq(clientMilestones.clientJourneyId, journeyId), eq(clientMilestones.userId, accountId))).orderBy(asc(clientMilestones.position), asc(clientMilestones.createdAt)),
    db.select().from(clientReminders).where(and(eq(clientReminders.clientJourneyId, journeyId), eq(clientReminders.userId, accountId))).orderBy(asc(clientReminders.remindAt)),
    db.select().from(clientJourneyStageHistory).where(and(eq(clientJourneyStageHistory.clientJourneyId, journeyId), eq(clientJourneyStageHistory.userId, accountId))).orderBy(desc(clientJourneyStageHistory.changedAt)),
    db.select().from(journeyColumns).where(eq(journeyColumns.userId, accountId)),
    getSales(accountId),
    getSetters(accountId),
  ]);
  if (!journeyRow) return null;

  const offers = profile.sales.offers.map(({ id, name, price }) => ({ id, name, price }));
  const offer = offerFor(offers, journeyRow.journey.offerId);
  const now = new Date();
  const client: DeliveryClientCard = {
    id: journeyRow.journey.id,
    clientName: journeyRow.journey.clientName,
    saleId: journeyRow.journey.saleId,
    offerId: journeyRow.journey.offerId,
    offerName: offer?.name ?? null,
    price: offer?.price ?? sales.find((sale) => sale.id === journeyRow.journey.saleId)?.totalPrice ?? null,
    columnId: journeyRow.column.id,
    columnType: journeyRow.column.type,
    status: journeyRow.journey.status,
    enteredAt: dateValue(journeyRow.journey.enteredAt),
    columnUpdatedAt: dateValue(journeyRow.journey.columnUpdatedAt),
    lastActivityAt: dateValue(journeyRow.journey.lastActivityAt),
    notesCount: notes.length,
    inactive: journeyRow.journey.status === "abandoned" || now.getTime() - journeyRow.journey.lastActivityAt.getTime() > 14 * 24 * 60 * 60 * 1000,
  };
  const columnById = new Map(columns.map((column) => [column.id, column.name]));
  const sale = sales.find((item) => item.id === journeyRow.journey.saleId) ?? null;
  const setterName = sale?.setterId ? setters.find((setter) => setter.id === sale.setterId)?.name ?? null : null;

  return {
    client,
    sale,
    setterName,
    notes: notes.map((note) => ({ id: note.id, body: note.body, createdAt: dateValue(note.createdAt), updatedAt: dateValue(note.updatedAt) })),
    milestones: milestones.map((milestone) => ({ id: milestone.id, name: milestone.name, completedAt: milestone.completedAt ? dateValue(milestone.completedAt) : null })),
    reminders: reminders.map((reminder) => ({ id: reminder.id, remindAt: dateValue(reminder.remindAt), note: reminder.note, completed: reminder.completed })),
    history: historyRows.map((entry) => ({
      id: entry.id,
      fromColumnName: entry.fromColumnId ? columnById.get(entry.fromColumnId) ?? null : null,
      toColumnName: columnById.get(entry.toColumnId) ?? "",
      changedAt: dateValue(entry.changedAt),
    })),
  };
}

export async function getTestimonials(accountId: string): Promise<TestimonialData> {
  const rows = await db.select().from(testimonials).where(eq(testimonials.userId, accountId)).orderBy(desc(testimonials.testimonialDate), desc(testimonials.createdAt));
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const mapped = await Promise.all(rows.map(async (row) => {
    const signedUrl = row.fileUrl ? await createBookingAssetSignedUrl(row.fileUrl, accountId) : null;
    return {
      id: row.id,
      mediaType: row.mediaType,
      fileUrl: signedUrl,
      filePath: row.fileUrl,
      externalUrl: row.externalUrl,
      text: row.text,
      clientName: row.clientName,
      clientJourneyId: row.clientJourneyId,
      offerId: row.offerId,
      resultText: row.resultText,
      consent: row.consent,
      tags: row.tags,
      date: row.testimonialDate,
      createdAt: dateValue(row.createdAt),
    } satisfies TestimonialRecord;
  }));
  return {
    testimonials: mapped,
    totalCount: rows.length,
    consentedCount: rows.filter((row) => row.consent).length,
    thisMonthCount: rows.filter((row) => row.createdAt.toISOString().slice(0, 7) === thisMonthKey).length,
  };
}

export async function getJourneyOptions(accountId: string): Promise<{ journeys: JourneyOption[]; offers: DeliveryOffer[] }> {
  const [profile, rows] = await Promise.all([
    getBusinessProfile(accountId),
    db
      .select({ id: clientJourneys.id, clientName: clientJourneys.clientName, offerId: clientJourneys.offerId })
      .from(clientJourneys)
      .where(eq(clientJourneys.userId, accountId))
      .orderBy(asc(clientJourneys.clientName)),
  ]);
  const offers = profile.sales.offers.map(({ id, name, price }) => ({ id, name, price }));
  return {
    offers,
    journeys: rows.map((row) => ({ id: row.id, clientName: row.clientName, offerId: row.offerId, offerName: offerFor(offers, row.offerId)?.name ?? null })),
  };
}

export async function syncTestimonialCount(accountId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(testimonials)
    .where(and(eq(testimonials.userId, accountId), eq(testimonials.consent, true)));
  const countValue = Number(count);
  const [profile] = await db.select({ delivery: businessProfile.delivery }).from(businessProfile).where(eq(businessProfile.userId, accountId)).limit(1);
  if (profile) {
    await db.update(businessProfile).set({
      delivery: { ...profile.delivery, testimonials: { ...profile.delivery.testimonials, count: countValue } },
      updatedAt: new Date(),
    }).where(eq(businessProfile.userId, accountId));
  }
  return countValue;
}

export async function getTestimonialProof(accountId: string): Promise<TestimonialProof> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(testimonials)
    .where(and(eq(testimonials.userId, accountId), eq(testimonials.consent, true)));
  const countValue = Number(count);
  return {
    count: countValue,
    status: countValue >= 5 ? "strong" : countValue > 0 ? "partial" : "none",
  };
}
