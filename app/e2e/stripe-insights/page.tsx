import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { StripeInsightsSection } from "@/app/(app)/ventes/suivi/stripe-insights-section";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";
import { resolvePeriod } from "@/lib/period";
import {
  buildStripeInsightSnapshot,
  buildStripeTrend,
  listStripeCurrencies,
  type StripeInsightRefund,
  type StripeInsightTransaction,
} from "@/lib/stripe/transaction-insights";

const transactions: StripeInsightTransaction[] = [
  { id: "ch_fixture_001", stripeAccountId: "acct_fixture", amountCents: 18_000, amountRefundedCents: 0, currency: "eur", status: "succeeded", paymentType: "subscription", customerId: "cus_fixture_repeat", customerName: "Lydia Martin", occurredAt: "2026-08-01T09:00:00Z" },
  { id: "ch_fixture_002", stripeAccountId: "acct_fixture", amountCents: 12_000, amountRefundedCents: 0, currency: "eur", status: "succeeded", paymentType: "one_shot", customerId: "cus_fixture_other", customerName: "Atelier Nova", occurredAt: "2026-07-28T09:00:00Z" },
  { id: "ch_fixture_003", stripeAccountId: "acct_fixture", amountCents: 18_000, amountRefundedCents: 0, currency: "eur", status: "succeeded", paymentType: "subscription", customerId: "cus_fixture_repeat", customerName: "Lydia Martin", occurredAt: "2026-07-18T09:00:00Z" },
  { id: "ch_fixture_004", stripeAccountId: "acct_fixture", amountCents: 9_000, amountRefundedCents: 0, currency: "eur", status: "failed", paymentType: "one_shot", customerId: "cus_fixture_failed", customerName: null, occurredAt: "2026-07-15T09:00:00Z" },
  { id: "ch_fixture_005", stripeAccountId: "acct_fixture", amountCents: 8_000, amountRefundedCents: 0, currency: "eur", status: "succeeded", paymentType: "one_shot", customerId: "cus_fixture_other", customerName: "Atelier Nova", occurredAt: "2026-07-10T09:00:00Z" },
  { id: "ch_fixture_006", stripeAccountId: "acct_fixture", amountCents: 7_000, amountRefundedCents: 0, currency: "eur", status: "succeeded", paymentType: "one_shot", customerId: null, customerName: null, occurredAt: "2026-07-05T09:00:00Z" },
];

const refunds: StripeInsightRefund[] = [
  { id: "re_fixture_001", stripeAccountId: "acct_fixture", stripeChargeId: "ch_fixture_002", amountCents: 2_000, currency: "eur", status: "succeeded", occurredAt: "2026-08-03T09:00:00Z" },
];

export default async function StripeInsightsE2EFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state } = await searchParams;
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "sales"]);
  const isEmpty = state === "empty";
  const period = resolvePeriod("last_30d");
  const fixtureTransactions = isEmpty ? [] : transactions;
  const fixtureRefunds = isEmpty ? [] : refunds;
  const snapshot = isEmpty ? null : buildStripeInsightSnapshot(fixtureTransactions, fixtureRefunds, period, "eur");
  const trend = isEmpty ? [] : buildStripeTrend(fixtureTransactions, fixtureRefunds, period, "eur");

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement</p>
            <h1 className="mt-1 text-3xl font-bold">Stripe Insights — {isEmpty ? "empty" : "fixture"}</h1>
          </div>
          <StripeInsightsSection
            connected
            connection={{
              initialSyncStatus: isEmpty ? "pending" : "completed",
              lastSyncStartedAt: "2026-08-07T08:00:00.000Z",
              lastSyncCompletedAt: isEmpty ? null : "2026-08-07T08:02:00.000Z",
              lastSyncError: null,
            }}
            availableCurrencies={listStripeCurrencies(fixtureTransactions, fixtureRefunds)}
            activeCurrency={isEmpty ? null : "eur"}
            snapshot={snapshot}
            trend={trend}
          />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
