import type { Metadata } from "next";
import { ArrowLeft, Percent, WalletCards } from "lucide-react";
import Link from "next/link";

import { formatReferralMoney } from "@/lib/referrals/format";
import { getAdminReferralData } from "@/lib/referrals/queries";

import { ReferralOverrideForm, ReferralPayoutForm, ReferralRateHint, ReferralSettingsForm } from "./referral-admin-forms";

export const metadata: Metadata = {
  title: "Parrainage — Admin Scale X",
  robots: { index: false, follow: false },
};

export default async function AdminReferralsPage() {
  const data = await getAdminReferralData();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard fondateurs</Link>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Programme de parrainage</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Définis le taux global, applique des overrides à certains comptes et enregistre les paiements mensuels manuels.</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text"><Percent className="size-5" /></div>
      </div>

      <section className="sticker-card p-6 sm:p-8" aria-labelledby="settings-title">
        <div className="mb-6 flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text"><Percent className="size-4" /></div><div><h2 id="settings-title" className="text-lg font-bold">Réglage global</h2><p className="mt-1 text-sm text-muted-foreground">Le taux est enregistré en centièmes de pourcentage pour éviter les arrondis de calcul.</p></div></div>
        <ReferralSettingsForm isEnabled={data.settings.isEnabled} defaultCommissionRateBps={data.settings.defaultCommissionRateBps} />
      </section>

      <section className="sticker-card p-0" aria-labelledby="codes-title">
        <div className="flex items-start gap-3 border-b border-border p-5 sm:p-6"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-accent-2-soft text-accent-2-text"><WalletCards className="size-4" /></div><div><h2 id="codes-title" className="text-lg font-bold">Comptes associés</h2><p className="mt-1 text-sm text-muted-foreground">Un champ vide fait hériter le taux global. Les nouveaux paiements utilisent le taux effectif du compte.</p></div></div>
        {data.codes.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Aucun compte n&apos;a encore créé de code.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-bold">Compte</th><th className="px-5 py-3 font-bold">Code</th><th className="px-5 py-3 font-bold">Filleuls</th><th className="px-5 py-3 font-bold">À verser</th><th className="px-5 py-3 font-bold">Déjà versé</th><th className="px-5 py-3 font-bold">Taux personnalisé</th></tr></thead><tbody>{data.codes.map((code) => <tr key={code.id} className="border-b border-border last:border-0"><td className="px-5 py-4"><p className="font-bold">{code.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{code.isActive ? "Lien actif" : "Lien désactivé"}</p></td><td className="px-5 py-4 font-mono text-xs">{code.code}<div className="mt-1"><ReferralRateHint rateBps={code.effectiveRateBps} /></div></td><td className="px-5 py-4 tabular-nums">{code.referredCount}</td><td className="px-5 py-4">{code.availableByCurrency.length === 0 ? <span className="text-muted-foreground">—</span> : <span className="flex flex-col gap-0.5">{code.availableByCurrency.map((total) => <span key={total.currency} className="font-bold tabular-nums">{formatReferralMoney(total.cents, total.currency)}</span>)}</span>}</td><td className="px-5 py-4">{code.paidByCurrency.length === 0 ? <span className="text-muted-foreground">—</span> : <span className="flex flex-col gap-0.5">{code.paidByCurrency.map((total) => <span key={total.currency} className="font-bold tabular-nums">{formatReferralMoney(total.cents, total.currency)}</span>)}</span>}</td><td className="px-5 py-4"><ReferralOverrideForm codeId={code.id} commissionRateBps={code.commissionRateBps} /></td></tr>)}</tbody></table></div>}
      </section>

      <section className="sticker-card p-0" aria-labelledby="payouts-title">
        <div className="flex items-start gap-3 border-b border-border p-5 sm:p-6"><div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-positive-soft text-state-healthy"><WalletCards className="size-4" /></div><div><h2 id="payouts-title" className="text-lg font-bold">Paiements mensuels à traiter</h2><p className="mt-1 text-sm text-muted-foreground">Effectue le virement hors plateforme, puis marque le lot comme payé avec sa référence.</p></div></div>
        {data.payouts.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Aucun paiement disponible pour le moment.</div> : <div className="divide-y divide-border">{data.payouts.map((payout) => <div key={`${payout.accountId}-${payout.currency}`} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{payout.email}</p><p className="mt-1 text-xs text-muted-foreground">Commission disponible à payer manuellement.</p></div><ReferralPayoutForm accountId={payout.accountId} currency={payout.currency} amountCents={Number(payout.amountCents)} /></div>)}</div>}
      </section>

      <p className="text-xs leading-5 text-muted-foreground">Les commissions déjà créées conservent leur taux et leur montant. Un changement de taux s&apos;applique aux prochaines factures payées.</p>
    </div>
  );
}
