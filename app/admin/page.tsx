import {
  getActivationFunnel,
  getMedianActivationMinutes,
  getNorthStarCount,
  getNorthStarTrend,
  getTwoWeekRetentionRate,
} from "@/lib/posthog-query";
import { ArrowUpRight, CreditCard, Layers3 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("Admin dashboard query failed", error);
    return null;
  }
}

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/support");
  }
  const [northStarCount, northStarTrend, funnel, medianMinutes, retentionRate] = await Promise.all([
    safe(getNorthStarCount),
    safe(getNorthStarTrend),
    safe(getActivationFunnel),
    safe(getMedianActivationMinutes),
    safe(getTwoWeekRetentionRate),
  ]);
  const t = await getTranslations("app.admin");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("dashboard.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link href="/admin/support">{t("dashboard.primaryAction")}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/admin/subscriptions"><CreditCard className="size-4" /> {t("dashboard.subscriptions")}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/admin/plans"><Layers3 className="size-4" /> {t("dashboard.plans")}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/admin/referrals"><ArrowUpRight className="size-4" /> {t("dashboard.referrals")}</Link>
            </Button>
          </div>
        </div>
      </div>

      <aside className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm sm:p-5" role="note">
        <p className="font-bold">{t("dashboard.dataLegendTitle")}</p>
        <p className="mt-1 leading-6 text-muted-foreground">{t("dashboard.dataLegend")}</p>
      </aside>

      <div className="sticker-card p-6">
        <p className="text-sm font-bold text-muted-foreground">
          {t("dashboard.northStar")}
        </p>
        <p className="mt-2 font-display text-3xl font-bold tabular-nums">
          {northStarCount === null ? t("dashboard.unavailable") : northStarCount}
        </p>
        {northStarTrend && northStarTrend.length > 0 && (
          <div className="mt-4 flex items-end gap-1.5">
            {northStarTrend.map((week) => (
              <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-accent/70"
                  style={{ height: `${Math.max(week.count * 8, 4)}px` }}
                  title={`${week.weekStart}: ${week.count}`}
                />
                <span className="text-[10px] text-muted-foreground">{week.count}</span>
              </div>
            ))}
          </div>
        )}
        {northStarTrend === null && <p className="mt-3 text-xs text-muted-foreground">{t("dashboard.trendUnavailable")}</p>}
        {northStarTrend !== null && northStarTrend.length === 0 && <p className="mt-3 text-xs text-muted-foreground">{t("dashboard.trendEmpty")}</p>}
      </div>

      <div className="sticker-card p-6">
        <p className="text-sm font-bold text-muted-foreground">
          {t("dashboard.funnelTitle")}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {funnel === null ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.unavailable")}</p>
          ) : funnel.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.funnelEmpty")}</p>
          ) : (
            funnel.map((step, index) => {
              const previous = index > 0 ? funnel[index - 1].count : null;
              const percent = previous && previous > 0 ? Math.round((step.count / previous) * 100) : null;
              return (
                <div key={step.step} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-bold">{step.step}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-bold tabular-nums">{step.count}</span>
                    {percent !== null && <span className="text-xs text-muted-foreground">{t("dashboard.previousStep", { percent })}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card p-6">
          <p className="text-sm font-bold text-muted-foreground">{t("dashboard.medianActivation")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {medianMinutes === null ? t("dashboard.unavailable") : `${Math.round(medianMinutes)} min`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.medianGoal")}</p>
        </div>

        <div className="sticker-card p-6">
          <p className="text-sm font-bold text-muted-foreground">{t("dashboard.retention")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {retentionRate === null ? t("dashboard.unavailable") : `${retentionRate}%`}
          </p>
        </div>
      </div>
    </div>
  );
}
