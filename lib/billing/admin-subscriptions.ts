import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { subscriptionPlans, subscriptions, teamMembers, users } from "@/db/schema";
import { getNativeBookingUsage } from "@/lib/billing/plan-gate";
import { parsePlanFeatures, type PlanFeatures } from "@/lib/billing/plan-schema";

const subscriptionStatuses = [
  "all",
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
  "none",
] as const;

const cancellationFilters = ["all", "scheduled", "not_scheduled"] as const;
const sortFilters = ["created", "period", "email"] as const;

const searchParamsSchema = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(subscriptionStatuses).default("all"),
  plan: z.string().uuid().optional().catch(undefined),
  cancel: z.enum(cancellationFilters).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  sort: z.enum(sortFilters).default("created"),
});

export type AdminSubscriptionFilters = z.infer<typeof searchParamsSchema>;

export type AdminSubscriptionListRow = {
  accountId: string;
  email: string;
  displayName: string | null;
  accountCreatedAt: Date;
  subscription: typeof subscriptions.$inferSelect | null;
  plan: typeof subscriptionPlans.$inferSelect | null;
};

export type AdminSubscriptionSummary = {
  accountCount: number;
  activeCount: number;
  pastDueCount: number;
  noSubscriptionCount: number;
  projectedMrrCents: number;
  unknownAmountCount: number;
};

export type AdminSubscriptionDetail = AdminSubscriptionListRow & {
  stripeCustomerId: string | null;
  teamMemberCount: number;
  bookingUsage: number;
  planFeatures: PlanFeatures;
};

export const ADMIN_SUBSCRIPTIONS_PAGE_SIZE = 20;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAdminSubscriptionFilters(
  raw: Record<string, string | string[] | undefined>
): AdminSubscriptionFilters {
  const parsed = searchParamsSchema.safeParse({
    q: firstParam(raw.q),
    status: firstParam(raw.status),
    plan: firstParam(raw.plan),
    cancel: firstParam(raw.cancel),
    page: firstParam(raw.page),
    sort: firstParam(raw.sort),
  });

  return parsed.success
    ? parsed.data
    : {
        q: "",
        status: "all",
        plan: undefined,
        cancel: "all",
        page: 1,
        sort: "created",
      };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function ownerAccountCondition() {
  return notExists(
    db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.memberUserId, users.id), ne(teamMembers.status, "removed")))
  );
}

function buildListConditions(filters: AdminSubscriptionFilters) {
  const conditions = [ownerAccountCondition()];

  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    const searchCondition = or(
      ilike(users.email, pattern),
      ilike(users.displayName, pattern),
      ilike(users.stripeCustomerId, pattern),
      ilike(subscriptions.stripeCustomerId, pattern),
      ilike(subscriptions.stripeSubscriptionId, pattern)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (filters.status === "none") {
    conditions.push(isNull(subscriptions.id));
  } else if (filters.status !== "all") {
    conditions.push(eq(subscriptions.status, filters.status));
  }

  if (filters.plan) {
    conditions.push(eq(subscriptions.planId, filters.plan));
  }

  if (filters.cancel === "scheduled") {
    conditions.push(eq(subscriptions.cancelAtPeriodEnd, true));
  } else if (filters.cancel === "not_scheduled") {
    conditions.push(eq(subscriptions.cancelAtPeriodEnd, false));
  }

  return and(...conditions);
}

function listOrder(filters: AdminSubscriptionFilters) {
  if (filters.sort === "email") return [asc(users.email), desc(users.createdAt)];
  if (filters.sort === "period") {
    return [sql`${subscriptions.currentPeriodEnd} desc nulls last`, asc(users.email)];
  }
  return [desc(users.createdAt), asc(users.email)];
}

export async function getAdminSubscriptionPlans() {
  return db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.priceMonthlyCents));
}

export async function getAdminSubscriptionList(filters: AdminSubscriptionFilters) {
  const where = buildListConditions(filters);
  const [countRow] = await db
    .select({ value: count() })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(where);

  const total = Number(countRow?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_SUBSCRIPTIONS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const rows = await db
    .select({
      owner: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
        stripeCustomerId: users.stripeCustomerId,
      },
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(where)
    .orderBy(...listOrder(filters))
    .limit(ADMIN_SUBSCRIPTIONS_PAGE_SIZE)
    .offset((page - 1) * ADMIN_SUBSCRIPTIONS_PAGE_SIZE);

  return {
    rows: rows.map((row): AdminSubscriptionListRow => ({
      accountId: row.owner.id,
      email: row.owner.email,
      displayName: row.owner.displayName,
      accountCreatedAt: row.owner.createdAt,
      subscription: row.subscription,
      plan: row.plan,
    })),
    total,
    page,
    totalPages,
  };
}

export async function getAdminSubscriptionSummary(): Promise<AdminSubscriptionSummary> {
  const rows = await db
    .select({ subscription: subscriptions })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(ownerAccountCondition());

  let activeCount = 0;
  let pastDueCount = 0;
  let noSubscriptionCount = 0;
  let projectedMrrCents = 0;
  let unknownAmountCount = 0;

  for (const row of rows) {
    const subscription = row.subscription;
    if (!subscription) {
      noSubscriptionCount += 1;
      continue;
    }

    if (subscription.status === "active" || subscription.status === "trialing") {
      activeCount += 1;
      if (subscription.priceMonthlyCents === null) unknownAmountCount += 1;
      else projectedMrrCents += subscription.priceMonthlyCents;
    }

    if (subscription.status === "past_due" || subscription.status === "unpaid") pastDueCount += 1;
  }

  return {
    accountCount: rows.length,
    activeCount,
    pastDueCount,
    noSubscriptionCount,
    projectedMrrCents,
    unknownAmountCount,
  };
}

export async function getAdminSubscriptionDetail(accountId: string): Promise<AdminSubscriptionDetail | null> {
  const [row] = await db
    .select({
      owner: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
        stripeCustomerId: users.stripeCustomerId,
      },
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(users.id, accountId), ownerAccountCondition()))
    .limit(1);

  if (!row) return null;

  const [teamCountRow, bookingUsage] = await Promise.all([
    db
      .select({ value: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.accountId, accountId), ne(teamMembers.status, "removed"))),
    getNativeBookingUsage(accountId),
  ]);

  return {
    accountId: row.owner.id,
    email: row.owner.email,
    displayName: row.owner.displayName,
    accountCreatedAt: row.owner.createdAt,
    subscription: row.subscription,
    plan: row.plan,
    stripeCustomerId: row.owner.stripeCustomerId,
    teamMemberCount: Number(teamCountRow[0]?.value ?? 0),
    bookingUsage,
    planFeatures: parsePlanFeatures(row.plan?.features),
  };
}
