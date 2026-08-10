import type { Metadata } from "next";
import { ArrowUpRight, Gift, Info, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { formatReferralDate, formatReferralMoney, maskReferralEmail } from "@/lib/referrals/format";
import { formatRateBps } from "@/lib/referrals/schema";
import { getReferralDashboard } from "@/lib/referrals/queries";
import { getAppUrl } from "@/lib/utils";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

import { CopyReferralLinkButton } from "./copy-referral-link-button";
import { ReferralCodeForm } from "./referral-code-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("referral");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

function MoneyTotals({ totals, locale }: { totals: Array<{ currency: string; cents: number }>; locale: string }) {
  if (totals.length === 0) return <span>{formatReferralMoney(0, "usd", locale)}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {totals.map((total) => (
        <span key={total.currency}>{formatReferralMoney(total.cents, total.currency, locale)}</span>
      ))}
    </span>
  );
}

export default async function ParrainagePage() {
  const locale = await getLocale();
  const t = await getTranslations("referral");
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);
  const { user } = await getCurrentUser();
  const dashboard = await getReferralDashboard(access.accountId);
  const shareUrl = dashboard.code ? `${getAppUrl()}/r/${dashboard.code.code}` : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent-2-text">{t("programLabel")}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <span className="rounded-full border border-accent-2-border bg-accent-2-soft px-3 py-1 text-xs font-bold text-accent-2-text">
          {t("lifetimeCommission")}
        </span>
      </div>

      {!dashboard.settings.isEnabled && (
        <div className="flex gap-3 rounded-[var(--radius-card)] border border-state-caution/30 bg-state-caution-bg p-4 text-sm text-state-caution" role="status">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>{t("programPreparing")}</p>
        </div>
      )}

      <div className="sticker-spotlight flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-text-on-dark-muted">{t("available")}</p>
            <p className="mt-2 figure-hero text-text-on-dark">
              <MoneyTotals totals={dashboard.totals.available} locale={locale} />
            </p>
            <p className="mt-2 text-sm text-text-on-dark-muted">{t("manualPayments")}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-text-on-dark/10 text-accent-2">
            <WalletCards className="size-5" />
          </div>
        </div>
        <div className="grid gap-3 border-t border-text-on-dark/10 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-text-on-dark-muted">{t("earned")}</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark"><MoneyTotals totals={dashboard.totals.earned} locale={locale} /></p>
          </div>
          <div>
            <p className="text-xs text-text-on-dark-muted">{t("paid")}</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark"><MoneyTotals totals={dashboard.totals.paid} locale={locale} /></p>
          </div>
          <div>
            <p className="text-xs text-text-on-dark-muted">{t("referred")}</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark">{dashboard.referredAccounts.length}</p>
          </div>
        </div>
      </div>

      {dashboard.code && shareUrl ? (
        <section className="sticker-card flex flex-col gap-5 p-6 sm:p-8" aria-labelledby="referral-link-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="referral-link-title" className="text-lg font-bold">{t("referralLink")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("currentRate", { rate: formatRateBps(dashboard.code.effectiveRateBps) })}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <Gift className="size-5" />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-h-11 min-w-0 flex-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2.5 text-sm text-foreground">
              {shareUrl}
            </code>
            <CopyReferralLinkButton href={shareUrl} />
          </div>
          {dashboard.code.commissionRateBps !== null && (
            <p className="text-xs text-accent-2-text">{t("copyOverride")}</p>
          )}
        </section>
      ) : (
        <section className="sticker-card grid gap-6 p-6 sm:grid-cols-[1fr_0.9fr] sm:p-8" aria-labelledby="create-referral-title">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold text-accent-2-text">{t("stepOne")}</p>
            <h2 id="create-referral-title" className="mt-1 text-xl font-bold">{t("createTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("createHelp")}</p>
          </div>
          <ReferralCodeForm />
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-accent-2-text"><UsersRound className="size-4" /><p className="text-sm font-bold">{t("referredTitle")}</p></div>
          <p className="text-sm text-muted-foreground">{t("referredHelp")}</p>
          <p className="font-display text-3xl font-bold tabular-nums">{dashboard.referredAccounts.length}</p>
        </div>
        <div className="sticker-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-accent-text"><WalletCards className="size-4" /><p className="text-sm font-bold">{t("calculationTitle")}</p></div>
          <p className="text-sm text-muted-foreground">{t("calculationHelp")}</p>
          <Link href="/settings/facturation" className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-accent-text hover:underline">
            {t("viewBilling")} <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <section className="sticker-card p-0" aria-labelledby="referrals-title">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <h2 id="referrals-title" className="text-lg font-bold">{t("accountsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("accountsHelp")}</p>
          </div>
        </div>
        {dashboard.referredAccounts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">{t("firstReferral")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-bold">{t("account")}</th><th className="px-5 py-3 font-bold">{t("registeredAt")}</th><th className="px-5 py-3 font-bold">{t("subscription")}</th></tr></thead>
              <tbody>{dashboard.referredAccounts.map((referral) => <tr key={referral.id} className="border-b border-border last:border-0"><td className="px-5 py-3 font-bold">{maskReferralEmail(referral.email)}</td><td className="px-5 py-3 text-muted-foreground">{formatReferralDate(referral.createdAt, locale)}</td><td className="px-5 py-3">{referral.subscriptionStatus ? <span className="rounded-full bg-positive-soft px-2 py-1 text-xs font-bold text-state-healthy">{referral.subscriptionStatus === "active" || referral.subscriptionStatus === "trialing" ? t("active") : referral.subscriptionStatus}</span> : <span className="text-muted-foreground">{t("notSubscribed")}</span>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sticker-card p-0" aria-labelledby="commissions-title">
        <div className="border-b border-border p-5 sm:p-6"><h2 id="commissions-title" className="text-lg font-bold">{t("commissionsTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("commissionsHelp")}</p></div>
        {dashboard.commissions.length === 0 ? <div className="p-6 text-sm text-muted-foreground">{t("noCommissions")}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-bold">{t("referral")}</th><th className="px-5 py-3 font-bold">{t("netBase")}</th><th className="px-5 py-3 font-bold">{t("rate")}</th><th className="px-5 py-3 font-bold">{t("commission")}</th><th className="px-5 py-3 font-bold">{t("status")}</th></tr></thead><tbody>{dashboard.commissions.map((commission) => <tr key={commission.id} className="border-b border-border last:border-0"><td className="px-5 py-3"><p className="font-bold">{maskReferralEmail(commission.email)}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatReferralDate(commission.createdAt, locale)}</p></td><td className="px-5 py-3 tabular-nums">{formatReferralMoney(commission.eligibleAmountCents, commission.currency, locale)}</td><td className="px-5 py-3 tabular-nums">{formatRateBps(commission.commissionRateBps)}</td><td className="px-5 py-3 font-bold tabular-nums">{formatReferralMoney(commission.commissionAmountCents, commission.currency, locale)}</td><td className="px-5 py-3"><span className={commission.status === "reversed" ? "rounded-full bg-state-critical-bg px-2 py-1 text-xs font-bold text-state-critical" : commission.status === "paid" ? "rounded-full bg-positive-soft px-2 py-1 text-xs font-bold text-state-healthy" : "rounded-full bg-state-caution-bg px-2 py-1 text-xs font-bold text-state-caution"}>{t(`status${commission.status === "available" ? "Available" : commission.status === "paid" ? "Paid" : "Reversed"}`)}</span></td></tr>)}</tbody></table></div>}
      </section>

      {user?.email && <p className="text-center text-xs text-muted-foreground">{t("paymentNote", { email: user.email })}</p>}
    </div>
  );
}
