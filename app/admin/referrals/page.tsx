import type { Metadata } from "next";
import { ArrowLeft, Percent, WalletCards } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { formatReferralMoney } from "@/lib/referrals/format";
import { getAdminReferralData } from "@/lib/referrals/queries";
import { requireAdmin } from "@/lib/admin";

import { ReferralOverrideForm, ReferralPayoutForm, ReferralRateHint, ReferralSettingsForm, type ReferralFormCopy } from "./referral-admin-forms";

export const metadata: Metadata = {
  title: "Parrainage — Admin Minaly",
  robots: { index: false, follow: false },
};

export default async function AdminReferralsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/support");
  }
  const data = await getAdminReferralData();
  const t = await getTranslations("app.admin");
  const formCopy: ReferralFormCopy = {
    settings: {
      programLabel: t("referrals.programLabel"),
      defaultRate: t("referrals.defaultRate"),
      defaultRateHelp: t("referrals.defaultRateHelp"),
      save: t("referrals.save"),
      saving: t("referrals.saving"),
      saved: t("referrals.settingsSaved"),
      invalidRate: t("referrals.invalidRate"),
      saveError: t("referrals.saveError"),
    },
    override: {
      label: t("referrals.overrideLabel"),
      placeholder: t("referrals.overridePlaceholder"),
      save: t("referrals.saveOverride"),
      saving: t("referrals.savingShort"),
      saved: t("referrals.overrideSaved"),
      invalidRate: t("referrals.invalidRate"),
      saveError: t("referrals.saveError"),
    },
    payout: {
      referenceLabel: t("referrals.transferReferenceLabel"),
      referencePlaceholder: t("referrals.referencePlaceholder"),
      markPaid: t("referrals.markPaid"),
      saving: t("referrals.savingShort"),
      saved: t("referrals.payoutSaved"),
      saveError: t("referrals.payoutError"),
      confirm: t("referrals.payoutConfirm", { amount: "{amount}" }),
      note: t("referrals.payoutNote"),
    },
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t("referrals.backToDashboard")}</Link>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("referrals.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("referrals.description")}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text"><Percent className="size-5" /></div>
      </div>

      <section className="sticker-card p-6 sm:p-8" aria-labelledby="settings-title">
        <div className="mb-6 flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text"><Percent className="size-4" /></div><div><h2 id="settings-title" className="text-lg font-bold">{t("referrals.globalTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("referrals.globalHelp")}</p></div></div>
        <ReferralSettingsForm isEnabled={data.settings.isEnabled} defaultCommissionRateBps={data.settings.defaultCommissionRateBps} copy={formCopy.settings} />
      </section>

      <section className={`rounded-[var(--radius-card)] border p-5 sm:p-6 ${data.settings.isEnabled ? "border-state-healthy/30 bg-state-healthy-bg" : "border-border bg-muted/40"}`} role="status" aria-live="polite">
        <h2 className="text-base font-bold">{data.settings.isEnabled ? t("referrals.enabledStatus") : t("referrals.disabledStatus")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{data.settings.isEnabled ? t("referrals.enabledHelp") : t("referrals.disabledHelp")}</p>
      </section>

      <aside className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm" role="note">
        <p className="font-bold">{t("referrals.dataLegendTitle")}</p>
        <p className="mt-1 leading-6 text-muted-foreground">{t("referrals.dataLegend")}</p>
      </aside>

      <section className="sticker-card p-0" aria-labelledby="codes-title">
        <div className="flex items-start gap-3 border-b border-border p-5 sm:p-6"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-accent-2-soft text-accent-2-text"><WalletCards className="size-4" /></div><div><h2 id="codes-title" className="text-lg font-bold">{t("referrals.accountsTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("referrals.accountsHelp")}</p></div></div>
        {data.codes.length === 0 ? <div className="p-6 text-sm text-muted-foreground">{t("referrals.noAccounts")}</div> : <div className="overflow-x-auto" role="region" aria-label={t("referrals.tableRegion")} tabIndex={0}><p className="px-5 pt-4 text-xs text-muted-foreground">{t("referrals.scrollHint")}</p><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="px-5 py-3 font-bold">{t("referrals.account")}</th><th scope="col" className="px-5 py-3 font-bold">{t("referrals.code")}</th><th scope="col" className="px-5 py-3 font-bold">{t("referrals.referred")}</th><th scope="col" className="px-5 py-3 font-bold">{t("referrals.available")}</th><th scope="col" className="px-5 py-3 font-bold">{t("referrals.paid")}</th><th scope="col" className="px-5 py-3 font-bold">{t("referrals.customRate")}</th></tr></thead><tbody>{data.codes.map((code) => <tr key={code.id} className="border-b border-border last:border-0"><td className="px-5 py-4"><p className="font-bold">{code.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{code.isActive ? t("referrals.linkActive") : t("referrals.linkDisabled")}</p></td><td className="px-5 py-4 font-mono text-xs">{code.code}<div className="mt-1"><ReferralRateHint rateBps={code.effectiveRateBps} /></div></td><td className="px-5 py-4 tabular-nums">{code.referredCount}</td><td className="px-5 py-4">{code.availableByCurrency.length === 0 ? <span aria-label={t("referrals.noAmount")} className="text-muted-foreground">—</span> : <span className="flex flex-col gap-0.5">{code.availableByCurrency.map((total) => <span key={total.currency} className="font-bold tabular-nums">{formatReferralMoney(total.cents, total.currency)}</span>)}</span>}</td><td className="px-5 py-4">{code.paidByCurrency.length === 0 ? <span aria-label={t("referrals.noPayout")} className="text-muted-foreground">—</span> : <span className="flex flex-col gap-0.5">{code.paidByCurrency.map((total) => <span key={total.currency} className="font-bold tabular-nums">{formatReferralMoney(total.cents, total.currency)}</span>)}</span>}</td><td className="px-5 py-4"><ReferralOverrideForm codeId={code.id} commissionRateBps={code.commissionRateBps} copy={formCopy.override} /></td></tr>)}</tbody></table></div>}
      </section>

      <section className="sticker-card p-0" aria-labelledby="payouts-title">
        <div className="flex items-start gap-3 border-b border-border p-5 sm:p-6"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-positive-soft text-state-healthy"><WalletCards className="size-4" /></div><div><h2 id="payouts-title" className="text-lg font-bold">{t("referrals.payoutsTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("referrals.payoutsHelp")}</p></div></div>
        {data.payouts.length === 0 ? <div className="p-6 text-sm text-muted-foreground">{t("referrals.noPayouts")}</div> : <div className="divide-y divide-border">{data.payouts.map((payout) => <div key={`${payout.accountId}-${payout.currency}`} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{payout.email}</p><p className="mt-1 text-xs text-muted-foreground">{t("referrals.availableCommission")}</p></div><ReferralPayoutForm accountId={payout.accountId} currency={payout.currency} amountCents={Number(payout.amountCents)} copy={formCopy.payout} /></div>)}</div>}
      </section>

      <p className="text-xs leading-5 text-muted-foreground">{t("referrals.footerHelp")}</p>
    </div>
  );
}
