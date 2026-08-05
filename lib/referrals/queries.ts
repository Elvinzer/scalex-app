import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  referralAttributions,
  referralCodes,
  referralCommissions,
  referralProgramSettings,
  subscriptions,
  users,
} from "@/db/schema";

import { DEFAULT_REFERRAL_SETTINGS_ID } from "./schema";

export type ReferralSettings = {
  isEnabled: boolean;
  defaultCommissionRateBps: number;
};

export type ReferralMoneyTotal = {
  currency: string;
  cents: number;
};

export type ReferralDashboard = {
  settings: ReferralSettings;
  code: {
    id: string;
    code: string;
    isActive: boolean;
    commissionRateBps: number | null;
    effectiveRateBps: number;
  } | null;
  totals: {
    earned: ReferralMoneyTotal[];
    available: ReferralMoneyTotal[];
    paid: ReferralMoneyTotal[];
  };
  referredAccounts: Array<{
    id: string;
    email: string;
    createdAt: Date;
    subscriptionStatus: string | null;
  }>;
  commissions: Array<{
    id: string;
    email: string;
    currency: string;
    commissionAmountCents: number;
    eligibleAmountCents: number;
    commissionRateBps: number;
    status: string;
    createdAt: Date;
  }>;
};

export type AdminReferralCode = {
  id: string;
  accountId: string;
  email: string;
  code: string;
  isActive: boolean;
  commissionRateBps: number | null;
  effectiveRateBps: number;
  referredCount: number;
  availableByCurrency: ReferralMoneyTotal[];
  paidByCurrency: ReferralMoneyTotal[];
};

export type AdminReferralPayoutGroup = {
  accountId: string;
  email: string;
  currency: string;
  amountCents: number;
};

function settingsFromRow(row: { isEnabled: boolean; defaultCommissionRateBps: number } | undefined): ReferralSettings {
  return {
    isEnabled: row?.isEnabled ?? false,
    defaultCommissionRateBps: row?.defaultCommissionRateBps ?? 0,
  };
}

function totalsByStatus(
  rows: Array<{ currency: string; status: string; cents: number }>,
  statuses: readonly string[]
): ReferralMoneyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!statuses.includes(row.status)) continue;
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(row.cents));
  }
  return [...totals.entries()].map(([currency, cents]) => ({ currency, cents }));
}

export async function getReferralProgramSettings(): Promise<ReferralSettings> {
  const [row] = await db
    .select({
      isEnabled: referralProgramSettings.isEnabled,
      defaultCommissionRateBps: referralProgramSettings.defaultCommissionRateBps,
    })
    .from(referralProgramSettings)
    .where(eq(referralProgramSettings.id, DEFAULT_REFERRAL_SETTINGS_ID))
    .limit(1);
  return settingsFromRow(row);
}

export async function getReferralCodeByCode(code: string) {
  const [row] = await db
    .select({ id: referralCodes.id, accountId: referralCodes.accountId, code: referralCodes.code })
    .from(referralCodes)
    .where(and(eq(referralCodes.code, code), eq(referralCodes.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function getReferralDashboard(accountId: string): Promise<ReferralDashboard> {
  const [settings, [code], referredAccounts, commissions, totals] = await Promise.all([
    getReferralProgramSettings(),
    db
      .select({
        id: referralCodes.id,
        code: referralCodes.code,
        isActive: referralCodes.isActive,
        commissionRateBps: referralCodes.commissionRateBps,
      })
      .from(referralCodes)
      .where(eq(referralCodes.accountId, accountId))
      .limit(1),
    db
      .select({
        id: referralAttributions.referredAccountId,
        email: users.email,
        createdAt: referralAttributions.createdAt,
        subscriptionStatus: subscriptions.status,
      })
      .from(referralAttributions)
      .innerJoin(users, eq(referralAttributions.referredAccountId, users.id))
      .leftJoin(subscriptions, eq(referralAttributions.referredAccountId, subscriptions.userId))
      .where(eq(referralAttributions.referrerAccountId, accountId))
      .orderBy(desc(referralAttributions.createdAt)),
    db
      .select({
        id: referralCommissions.id,
        email: users.email,
        currency: referralCommissions.currency,
        commissionAmountCents: referralCommissions.commissionAmountCents,
        eligibleAmountCents: referralCommissions.eligibleAmountCents,
        commissionRateBps: referralCommissions.commissionRateBps,
        status: referralCommissions.status,
        createdAt: referralCommissions.createdAt,
      })
      .from(referralCommissions)
      .innerJoin(users, eq(referralCommissions.referredAccountId, users.id))
      .where(eq(referralCommissions.referrerAccountId, accountId))
      .orderBy(desc(referralCommissions.createdAt))
      .limit(100),
    db
      .select({
        currency: referralCommissions.currency,
        status: referralCommissions.status,
        cents: sql<number>`coalesce(sum(${referralCommissions.commissionAmountCents}), 0)::int`,
      })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerAccountId, accountId))
      .groupBy(referralCommissions.currency, referralCommissions.status),
  ]);

  const effectiveRateBps = code?.commissionRateBps ?? settings.defaultCommissionRateBps;
  return {
    settings,
    code: code
      ? {
          ...code,
          effectiveRateBps,
        }
      : null,
    totals: {
      earned: totalsByStatus(totals, ["available", "paid"]),
      available: totalsByStatus(totals, ["available"]),
      paid: totalsByStatus(totals, ["paid"]),
    },
    referredAccounts,
    commissions,
  };
}

export async function getAdminReferralData(): Promise<{
  settings: ReferralSettings;
  codes: AdminReferralCode[];
  payouts: AdminReferralPayoutGroup[];
}> {
  const [settings, codeRows, attributionCounts, commissionRows, payouts] = await Promise.all([
    getReferralProgramSettings(),
    db
      .select({
        id: referralCodes.id,
        accountId: referralCodes.accountId,
        email: users.email,
        code: referralCodes.code,
        isActive: referralCodes.isActive,
        commissionRateBps: referralCodes.commissionRateBps,
      })
      .from(referralCodes)
      .innerJoin(users, eq(referralCodes.accountId, users.id))
      .orderBy(desc(referralCodes.createdAt)),
    db
      .select({
        accountId: referralAttributions.referrerAccountId,
        referredCount: sql<number>`count(*)::int`,
      })
      .from(referralAttributions)
      .groupBy(referralAttributions.referrerAccountId),
    db
      .select({
        accountId: referralCommissions.referrerAccountId,
        currency: referralCommissions.currency,
        status: referralCommissions.status,
        cents: sql<number>`coalesce(sum(${referralCommissions.commissionAmountCents}), 0)::int`,
      })
      .from(referralCommissions)
      .groupBy(referralCommissions.referrerAccountId, referralCommissions.currency, referralCommissions.status),
    db
      .select({
        accountId: referralCommissions.referrerAccountId,
        email: users.email,
        currency: referralCommissions.currency,
        amountCents: sql<number>`coalesce(sum(${referralCommissions.commissionAmountCents}), 0)::int`,
      })
      .from(referralCommissions)
      .innerJoin(users, eq(referralCommissions.referrerAccountId, users.id))
      .where(eq(referralCommissions.status, "available"))
      .groupBy(referralCommissions.referrerAccountId, users.email, referralCommissions.currency),
  ]);

  const counts = new Map(attributionCounts.map((row) => [row.accountId, Number(row.referredCount)]));
  const codeStats = new Map<string, Array<{ currency: string; status: string; cents: number }>>();
  for (const row of commissionRows) {
    const current = codeStats.get(row.accountId) ?? [];
    current.push({ currency: row.currency, status: row.status, cents: Number(row.cents) });
    codeStats.set(row.accountId, current);
  }

  return {
    settings,
    codes: codeRows.map((code) => {
      const stats = codeStats.get(code.accountId) ?? [];
      return {
        ...code,
        effectiveRateBps: code.commissionRateBps ?? settings.defaultCommissionRateBps,
        referredCount: counts.get(code.accountId) ?? 0,
        availableByCurrency: totalsByStatus(stats, ["available"]),
        paidByCurrency: totalsByStatus(stats, ["paid"]),
      };
    }),
    payouts: payouts.map((row) => ({ ...row, amountCents: Number(row.amountCents) })),
  };
}
