import type { Metadata } from "next";
import { ArrowUpRight, Gift, Info, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";

import { formatReferralDate, formatReferralMoney, maskReferralEmail } from "@/lib/referrals/format";
import { formatRateBps } from "@/lib/referrals/schema";
import { getReferralDashboard } from "@/lib/referrals/queries";
import { getAppUrl } from "@/lib/utils";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

import { CopyReferralLinkButton } from "./copy-referral-link-button";
import { ReferralCodeForm } from "./referral-code-form";

export const metadata: Metadata = {
  title: "Parrainage — Scale X",
  description: "Gère ton lien de parrainage Scale X et suis tes commissions récurrentes.",
};

const STATUS_LABELS: Record<string, string> = {
  available: "À verser",
  paid: "Versée",
  reversed: "Annulée",
};

function MoneyTotals({ totals }: { totals: Array<{ currency: string; cents: number }> }) {
  if (totals.length === 0) return <span>{formatReferralMoney(0, "usd")}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {totals.map((total) => (
        <span key={total.currency}>{formatReferralMoney(total.cents, total.currency)}</span>
      ))}
    </span>
  );
}

export default async function ParrainagePage() {
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);
  const { user } = await getCurrentUser();
  const dashboard = await getReferralDashboard(access.accountId);
  const shareUrl = dashboard.code ? `${getAppUrl()}/r/${dashboard.code.code}` : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent-2-text">Programme ambassadeur</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Fais grandir Scale X avec ton réseau.</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Chaque compte que tu nous apportes peut te rapporter une commission récurrente, aussi longtemps que son abonnement reste actif.
          </p>
        </div>
        <span className="rounded-full border border-accent-2-border bg-accent-2-soft px-3 py-1 text-xs font-bold text-accent-2-text">
          Commission à vie
        </span>
      </div>

      {!dashboard.settings.isEnabled && (
        <div className="flex gap-3 rounded-[var(--radius-card)] border border-state-caution/30 bg-state-caution-bg p-4 text-sm text-state-caution" role="status">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>Le programme est en préparation. Tu peux créer ton code dès maintenant ; les commissions seront activées par l&apos;équipe Scale X.</p>
        </div>
      )}

      <div className="sticker-spotlight flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-text-on-dark-muted">À verser</p>
            <p className="mt-2 figure-hero text-text-on-dark">
              <MoneyTotals totals={dashboard.totals.available} />
            </p>
            <p className="mt-2 text-sm text-text-on-dark-muted">Paiements regroupés manuellement chaque mois.</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-text-on-dark/10 text-accent-2">
            <WalletCards className="size-5" />
          </div>
        </div>
        <div className="grid gap-3 border-t border-text-on-dark/10 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-text-on-dark-muted">Gagné à ce jour</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark"><MoneyTotals totals={dashboard.totals.earned} /></p>
          </div>
          <div>
            <p className="text-xs text-text-on-dark-muted">Déjà versé</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark"><MoneyTotals totals={dashboard.totals.paid} /></p>
          </div>
          <div>
            <p className="text-xs text-text-on-dark-muted">Filleuls</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-on-dark">{dashboard.referredAccounts.length}</p>
          </div>
        </div>
      </div>

      {dashboard.code && shareUrl ? (
        <section className="sticker-card flex flex-col gap-5 p-6 sm:p-8" aria-labelledby="referral-link-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="referral-link-title" className="text-lg font-bold">Ton lien de parrainage</h2>
              <p className="mt-1 text-sm text-muted-foreground">Le taux appliqué actuellement est de {formatRateBps(dashboard.code.effectiveRateBps)}.</p>
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
            <p className="text-xs text-accent-2-text">Ce taux est un override défini par l&apos;équipe Scale X pour ton compte.</p>
          )}
        </section>
      ) : (
        <section className="sticker-card grid gap-6 p-6 sm:grid-cols-[1fr_0.9fr] sm:p-8" aria-labelledby="create-referral-title">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold text-accent-2-text">Étape 1</p>
            <h2 id="create-referral-title" className="mt-1 text-xl font-bold">Crée ton lien unique.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choisis un code facile à retenir. Il sera associé à ton compte et ne pourra pas être repris par quelqu&apos;un d&apos;autre.</p>
          </div>
          <ReferralCodeForm />
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-accent-2-text"><UsersRound className="size-4" /><p className="text-sm font-bold">Tes filleuls</p></div>
          <p className="text-sm text-muted-foreground">Leur email reste partiellement masqué pour protéger leur confidentialité.</p>
          <p className="font-display text-3xl font-bold tabular-nums">{dashboard.referredAccounts.length}</p>
        </div>
        <div className="sticker-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-accent-text"><WalletCards className="size-4" /><p className="text-sm font-bold">Règle de calcul</p></div>
          <p className="text-sm text-muted-foreground">Commission sur le montant HT payé, sans déduire les frais Stripe.</p>
          <Link href="/settings/facturation" className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-accent-text hover:underline">
            Voir ma facturation <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <section className="sticker-card p-0" aria-labelledby="referrals-title">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <h2 id="referrals-title" className="text-lg font-bold">Comptes parrainés</h2>
            <p className="mt-1 text-sm text-muted-foreground">Attribution définitive au premier compte créé depuis ton lien.</p>
          </div>
        </div>
        {dashboard.referredAccounts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Ton premier filleul apparaîtra ici dès qu&apos;il aura créé son compte.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-bold">Compte</th><th className="px-5 py-3 font-bold">Inscrit le</th><th className="px-5 py-3 font-bold">Abonnement</th></tr></thead>
              <tbody>{dashboard.referredAccounts.map((referral) => <tr key={referral.id} className="border-b border-border last:border-0"><td className="px-5 py-3 font-bold">{maskReferralEmail(referral.email)}</td><td className="px-5 py-3 text-muted-foreground">{formatReferralDate(referral.createdAt)}</td><td className="px-5 py-3">{referral.subscriptionStatus ? <span className="rounded-full bg-positive-soft px-2 py-1 text-xs font-bold text-state-healthy">{referral.subscriptionStatus === "active" || referral.subscriptionStatus === "trialing" ? "Actif" : referral.subscriptionStatus}</span> : <span className="text-muted-foreground">Pas encore abonné</span>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sticker-card p-0" aria-labelledby="commissions-title">
        <div className="border-b border-border p-5 sm:p-6"><h2 id="commissions-title" className="text-lg font-bold">Historique des commissions</h2><p className="mt-1 text-sm text-muted-foreground">Chaque ligne correspond à une facture Stripe payée.</p></div>
        {dashboard.commissions.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Aucune commission pour le moment.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-bold">Filleul</th><th className="px-5 py-3 font-bold">Base HT</th><th className="px-5 py-3 font-bold">Taux</th><th className="px-5 py-3 font-bold">Commission</th><th className="px-5 py-3 font-bold">Statut</th></tr></thead><tbody>{dashboard.commissions.map((commission) => <tr key={commission.id} className="border-b border-border last:border-0"><td className="px-5 py-3"><p className="font-bold">{maskReferralEmail(commission.email)}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatReferralDate(commission.createdAt)}</p></td><td className="px-5 py-3 tabular-nums">{formatReferralMoney(commission.eligibleAmountCents, commission.currency)}</td><td className="px-5 py-3 tabular-nums">{formatRateBps(commission.commissionRateBps)}</td><td className="px-5 py-3 font-bold tabular-nums">{formatReferralMoney(commission.commissionAmountCents, commission.currency)}</td><td className="px-5 py-3"><span className={commission.status === "reversed" ? "rounded-full bg-state-critical-bg px-2 py-1 text-xs font-bold text-state-critical" : commission.status === "paid" ? "rounded-full bg-positive-soft px-2 py-1 text-xs font-bold text-state-healthy" : "rounded-full bg-state-caution-bg px-2 py-1 text-xs font-bold text-state-caution"}>{STATUS_LABELS[commission.status] ?? commission.status}</span></td></tr>)}</tbody></table></div>}
      </section>

      {user?.email && <p className="text-center text-xs text-muted-foreground">Les paiements sont préparés sur l&apos;adresse du compte {user.email} et traités manuellement par Scale X.</p>}
    </div>
  );
}
