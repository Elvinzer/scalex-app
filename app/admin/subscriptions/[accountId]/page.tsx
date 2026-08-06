import { AlertTriangle, ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { getAdminSubscriptionDetail } from "@/lib/billing/admin-subscriptions";
import {
  formatSubscriptionAmount,
  formatSubscriptionDate,
  formatSubscriptionDateTime,
} from "@/lib/billing/admin-subscription-format";
import { getPlatformStripeDashboardUrl } from "@/lib/stripe/platform-client";

import { SubscriptionActions } from "../subscription-actions";
import { SubscriptionStatusBadge } from "../subscription-status-badge";

export const dynamic = "force-dynamic";

type AdminSubscriptionDetailPageProps = {
  params: Promise<{ accountId: string }>;
};

function safeDashboardUrl(resource: "customers" | "subscriptions", id: string): string | null {
  try {
    return getPlatformStripeDashboardUrl(resource, id);
  } catch {
    return null;
  }
}

function usageLabel(value: number, limit: number | null | undefined): string {
  if (limit === null || limit === undefined) return `${value} / illimité`;
  return `${value} / ${limit}`;
}

export default async function AdminSubscriptionDetailPage({ params }: AdminSubscriptionDetailPageProps) {
  await requireAdmin();
  const { accountId } = await params;
  const parsedAccountId = z.string().uuid().safeParse(accountId);
  if (!parsedAccountId.success) notFound();

  const detail = await getAdminSubscriptionDetail(parsedAccountId.data);
  if (!detail) notFound();

  const subscription = detail.subscription;
  const stripeCustomerUrl = detail.stripeCustomerId
    ? safeDashboardUrl("customers", detail.stripeCustomerId)
    : null;
  const stripeSubscriptionUrl = subscription?.stripeSubscriptionId
    ? safeDashboardUrl("subscriptions", subscription.stripeSubscriptionId)
    : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <Button asChild variant="ghost" className="min-h-11 -ml-2">
          <Link href="/admin/subscriptions"><ArrowLeft className="size-4" /> Retour aux abonnements</Link>
        </Button>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Compte client</p>
            <h1 className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{detail.displayName || detail.email}</h1>
            {detail.displayName && <p className="mt-1 text-sm text-muted-foreground">{detail.email}</p>}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-state-healthy/30 bg-state-healthy-bg px-3 py-1.5 text-xs font-bold text-state-healthy">
            <ShieldCheck className="size-4" aria-hidden="true" /> Session fondateur vérifiée
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <div className="flex flex-col gap-4">
          <section className="sticker-card p-5 sm:p-6" aria-labelledby="subscription-summary-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Abonnement</p>
                <h2 id="subscription-summary-title" className="mt-1 text-lg font-bold">État de la facturation</h2>
              </div>
              {subscription && <SubscriptionStatusBadge status={subscription.status} />}
            </div>

            {subscription ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Plan catalogue</p>
                  <p className="mt-1 text-lg font-bold">{detail.plan?.name ?? "Plan introuvable"}</p>
                  {detail.plan && <p className="mt-0.5 text-xs text-muted-foreground">Clé : {detail.plan.key}</p>}
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Price souscrit</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{formatSubscriptionAmount(subscription.priceMonthlyCents)}{subscription.priceMonthlyCents !== null && <span className="text-sm font-normal text-muted-foreground"> / mois</span>}</p>
                  {subscription.stripePriceId && <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{subscription.stripePriceId}</p>}
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Période actuelle</p>
                  <p className="mt-1 text-sm font-bold">{formatSubscriptionDate(subscription.currentPeriodEnd)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{subscription.cancelAtPeriodEnd ? "Résiliation programmée à cette date" : "Renouvellement prévu à cette date"}</p>
                </div>
              <div>
                  <p className="text-xs font-bold text-muted-foreground">Dernière projection locale</p>
                  <p className="mt-1 text-sm font-bold">{formatSubscriptionDateTime(subscription.updatedAt)}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{subscription.stripeSubscriptionId ?? "ID Stripe absent"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-muted-foreground">Client Stripe</p>
                  <p className="mt-1 break-all font-mono text-xs">{subscription.stripeCustomerId}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[var(--radius-control)] border border-dashed border-border p-5">
                <p className="font-bold">Aucune projection d’abonnement</p>
                <p className="mt-1 text-sm text-muted-foreground">Ce compte n’a pas encore d’abonnement Stripe enregistré côté Scale X.</p>
              </div>
            )}

            {subscription?.priceMonthlyCents === null && (
              <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 p-4 text-sm text-state-caution" role="status">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p><strong>Montant historique à vérifier.</strong> Le Price exact n’est pas encore projeté localement ; ne pas déduire ce montant du prix catalogue actuel.</p>
              </div>
            )}
            {subscription?.cancelAtPeriodEnd && (
              <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 p-4 text-sm text-state-caution" role="status">
                Résiliation programmée : l’accès reste actif jusqu’au {formatSubscriptionDate(subscription.currentPeriodEnd)}.
              </div>
            )}
          </section>

          <section className="sticker-card p-5 sm:p-6" aria-labelledby="entitlements-title">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Capacités observées</p>
            <h2 id="entitlements-title" className="mt-1 text-lg font-bold">Équipe et rendez-vous</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-control)] border border-border bg-muted/30 p-4">
                <p className="text-xs font-bold text-muted-foreground">Membres d’équipe</p>
                <p className="mt-2 text-xl font-bold tabular-nums">{usageLabel(detail.teamMemberCount, detail.planFeatures.teamMembersEnabled ? detail.planFeatures.maxTeamMembers : 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail.planFeatures.teamMembersEnabled ? "Selon le plan projeté" : "Fonctionnalité non incluse"}</p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-border bg-muted/30 p-4">
                <p className="text-xs font-bold text-muted-foreground">Événements de réservation</p>
                <p className="mt-2 text-xl font-bold tabular-nums">{usageLabel(detail.bookingUsage, detail.planFeatures.nativeBookingEnabled ? detail.planFeatures.maxBookingEvents : 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail.planFeatures.nativeBookingEnabled ? "Événements non archivés" : "Fonctionnalité non incluse"}</p>
              </div>
            </div>
          </section>

          <section className="sticker-card p-5 sm:p-6" aria-labelledby="account-metadata-title">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Métadonnées</p>
            <h2 id="account-metadata-title" className="mt-1 text-lg font-bold">Identité du compte</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-bold text-muted-foreground">Email</dt><dd className="mt-1 break-all font-bold">{detail.email}</dd></div>
              <div><dt className="text-xs font-bold text-muted-foreground">Créé le</dt><dd className="mt-1 font-bold">{formatSubscriptionDateTime(detail.accountCreatedAt)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-bold text-muted-foreground">Account ID</dt><dd className="mt-1 break-all font-mono text-xs">{detail.accountId}</dd></div>
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="sticker-card p-5 sm:p-6" aria-labelledby="admin-actions-title">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Opérations contrôlées</p>
            <h2 id="admin-actions-title" className="mt-1 text-lg font-bold">Actions Stripe</h2>
            <p className="mt-2 text-sm text-muted-foreground">Les changements financiers restent exécutés dans Stripe. Scale X ne fait ici que consulter ou réconcilier.</p>
            <div className="mt-5">
              <SubscriptionActions accountId={detail.accountId} hasStripeSubscription={Boolean(subscription?.stripeSubscriptionId)} hasStripeCustomer={Boolean(detail.stripeCustomerId)} />
            </div>
          </section>

          <section className="sticker-card p-5 sm:p-6" aria-labelledby="stripe-links-title">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Contexte externe</p>
            <h2 id="stripe-links-title" className="mt-1 text-lg font-bold">Ouvrir dans Stripe</h2>
            <div className="mt-4 flex flex-col gap-2">
              {stripeCustomerUrl ? (
                <Button asChild variant="outline" className="min-h-11 justify-between"><a href={stripeCustomerUrl} target="_blank" rel="noreferrer">Client Stripe <ExternalLink className="size-4" /></a></Button>
              ) : <p className="text-sm text-muted-foreground">Client Stripe indisponible.</p>}
              {stripeSubscriptionUrl ? (
                <Button asChild variant="outline" className="min-h-11 justify-between"><a href={stripeSubscriptionUrl} target="_blank" rel="noreferrer">Abonnement Stripe <ExternalLink className="size-4" /></a></Button>
              ) : <p className="text-sm text-muted-foreground">Abonnement Stripe indisponible.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
