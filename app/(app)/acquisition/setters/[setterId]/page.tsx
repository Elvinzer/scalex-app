import { notFound } from "next/navigation";
import Link from "next/link";

import { getBusinessProfile } from "@/lib/business/queries";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { MONTH_LABELS } from "@/lib/monthly-metrics/types";
import { computeSetterCommissions, getSetter } from "@/lib/setters/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${year}`;
}

export default async function SetterDetailPage({ params }: { params: Promise<{ setterId: string }> }) {
  const { setterId } = await params;
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:setters");

  const setter = await getSetter(accountId, setterId);
  if (!setter) notFound();

  const businessProfile = await getBusinessProfile(accountId);
  const commissions = await computeSetterCommissions(accountId, setterId, businessProfile.sales.offers);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{setter.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {Math.round(setter.defaultCommissionPct * 100)}% de commission par défaut
            {setter.email ? ` · ${setter.email}` : ""}
            {!setter.active && " · Inactif"}
          </p>
        </div>
        <Link href="/acquisition/setters" className="text-sm font-bold text-muted-foreground hover:underline">
          ← Retour aux setters
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Ventes settées</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{commissions.validatedSalesCount}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CA setté</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{formatEur(commissions.validatedRevenueEur)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Commission payée</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-state-healthy">
            {formatEur(commissions.commissionPaidEur)}
          </p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Commission à venir</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-state-caution">
            {formatEur(commissions.commissionUpcomingEur)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Commissions par mois</h2>
        {commissions.monthly.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucune vente settée pour l&apos;instant.</p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Mois</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Commission payée</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Commission à venir</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {commissions.monthly.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0">
                    <td className="p-3 font-bold">{formatMonthLabel(row.month)}</td>
                    <td className="p-3 text-right tabular-nums text-state-healthy">{formatEur(row.paidEur)}</td>
                    <td className="p-3 text-right tabular-nums text-state-caution">{formatEur(row.upcomingEur)}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{formatEur(row.paidEur + row.upcomingEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Détail des ventes</h2>
        {commissions.sales.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucune vente settée pour l&apos;instant.</p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Offre</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Montant</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Commission</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
                </tr>
              </thead>
              <tbody>
                {commissions.sales.map((sale) => (
                  <tr key={sale.saleId} className="border-b border-border last:border-0">
                    <td className="p-3 font-bold">{sale.clientName}</td>
                    <td className="p-3 text-muted-foreground">{sale.offerName ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{sale.saleDate}</td>
                    <td className="p-3 text-right tabular-nums">{formatEur(sale.totalPrice)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatEur(Math.round(sale.commissionAmount))} ({Math.round(sale.commissionPct * 100)}%)
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          sale.paymentStatus === "payee"
                            ? "rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy"
                            : "rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution"
                        }
                      >
                        {sale.paymentStatus === "payee" ? "Payée" : "À venir"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
