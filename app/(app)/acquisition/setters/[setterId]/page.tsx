import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { getBusinessProfile } from "@/lib/business/queries";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { computeSetterCommissions, getSetter } from "@/lib/setters/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

function formatMonthLabel(month: string, locale: string): string {
  const [year, m] = month.split("-");
  return new Date(Date.UTC(Number(year), Number(m) - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function SetterDetailPage({ params }: { params: Promise<{ setterId: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("app.setters");
  const { setterId } = await params;
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:setters");

  const [setter, businessProfile] = await Promise.all([getSetter(accountId, setterId), getBusinessProfile(accountId)]);
  if (!setter) notFound();

  const commissions = await computeSetterCommissions(accountId, setterId, setter.defaultCommissionPct, businessProfile.sales.offers);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{setter.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("commissionDefault", { percent: Math.round(setter.defaultCommissionPct * 100) })}
            {setter.email ? ` · ${setter.email}` : ""}
            {!setter.active && ` · ${t("inactive")}`}
          </p>
        </div>
        <Link href="/acquisition/setters" className="text-sm font-bold text-muted-foreground hover:underline">
          ← {t("backToSetters")}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("salesSet")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{commissions.validatedSalesCount}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("revenueSet")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{formatEur(commissions.validatedRevenueEur, locale)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("paidCommission")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-state-healthy">
            {formatEur(commissions.commissionPaidEur, locale)}
          </p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("upcomingCommission")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-state-caution">
            {formatEur(commissions.commissionUpcomingEur, locale)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">{t("monthlyCommissions")}</h2>
        {commissions.monthly.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("noSalesSet")}</p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("month")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("paidCommission")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("upcomingCommission")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {commissions.monthly.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0">
                    <td className="p-3 font-bold">{formatMonthLabel(row.month, locale)}</td>
                    <td className="p-3 text-right tabular-nums text-state-healthy">{formatEur(row.paidEur, locale)}</td>
                    <td className="p-3 text-right tabular-nums text-state-caution">{formatEur(row.upcomingEur, locale)}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{formatEur(row.paidEur + row.upcomingEur, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">{t("salesDetail")}</h2>
        {commissions.sales.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("noSalesSet")}</p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("client")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("offer")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("date")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("amount")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("commission")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {commissions.sales.map((sale) => (
                  <tr key={sale.saleId} className="border-b border-border last:border-0">
                    <td className="p-3 font-bold">{sale.clientName}</td>
                    <td className="p-3 text-muted-foreground">{sale.offerName ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{sale.saleDate}</td>
                    <td className="p-3 text-right tabular-nums">{formatEur(sale.totalPrice, locale)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatEur(Math.round(sale.commissionAmount), locale)} ({Math.round(sale.commissionPct * 100)}%)
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          sale.paymentStatus === "payee"
                            ? "rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy"
                            : "rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution"
                        }
                      >
                        {sale.paymentStatus === "payee" ? t("paid") : t("upcoming")}
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
