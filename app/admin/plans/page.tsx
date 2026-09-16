import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { formatUsdCents } from "@/lib/currency";
import { requireAdmin } from "@/lib/admin";

import { PlanActiveToggle, type PlanToggleCopy } from "./plan-active-toggle";
import { PlanFormDialog } from "./plan-form-dialog";

type PlanFeatures = {
  teamMembersEnabled?: boolean;
  maxTeamMembers?: number | null;
  nativeBookingEnabled?: boolean;
  maxBookingEvents?: number | null;
};

function featureSummary(enabled: boolean | undefined, limit: number | null | undefined, included: string, notIncluded: string, unlimited: string, max: (value: number) => string): string {
  if (!enabled) return notIncluded;
  return limit ? `${included} · ${max(limit)}` : `${included} · ${unlimited}`;
}

export default async function AdminPlansPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/support");
  }
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.priceMonthlyCents);
  const t = await getTranslations("app.admin");
  const toggleCopy: PlanToggleCopy = {
    active: t("plans.active"),
    inactive: t("plans.inactive"),
    activeAria: t("plans.activeAria"),
    inactiveAria: t("plans.inactiveAria"),
    deactivateConfirm: t("plans.deactivateConfirm"),
    activateConfirm: t("plans.activateConfirm"),
    updated: t("plans.updated"),
    updateError: t("plans.updateError"),
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("plans.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("plans.description")}</p>
        </div>
        <PlanFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" aria-hidden="true" /> {t("plans.newPlan")}
            </Button>
          }
        />
      </div>

      {plans.length === 0 ? (
        <section className="sticker-card flex flex-col items-center gap-3 p-8 text-center" aria-live="polite">
          <h2 className="text-lg font-bold">{t("plans.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("plans.emptyDescription")}</p>
          <PlanFormDialog trigger={<Button type="button" variant="outline" className="min-h-11">{t("plans.createFirst")}</Button>} />
        </section>
      ) : (
        <>
          <div className="sticker-card hidden overflow-x-auto p-0 md:block" role="region" aria-label={t("plans.tableRegion")} tabIndex={0}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-bold">{t("plans.plan")}</th>
              <th scope="col" className="px-4 py-3 font-bold">{t("plans.key")}</th>
              <th scope="col" className="px-4 py-3 font-bold">{t("plans.price")}</th>
              <th scope="col" className="px-4 py-3 font-bold">{t("plans.features")}</th>
              <th scope="col" className="px-4 py-3 font-bold">{t("plans.status")}</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">{t("plans.actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const features = plan.features as {
                teamMembersEnabled?: boolean;
                maxTeamMembers?: number | null;
                nativeBookingEnabled?: boolean;
                maxBookingEvents?: number | null;
              };
              return (
                <tr key={plan.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-bold">{plan.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{plan.key}</td>
                  <td className="px-4 py-3 tabular-nums">{formatUsdCents(plan.priceMonthlyCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>
                      <span className="font-semibold">{t("plans.team")}:</span>{" "}{featureSummary(
                        features.teamMembersEnabled,
                        features.maxTeamMembers,
                        t("plans.included"),
                        t("plans.notIncluded"),
                        t("plans.unlimited"),
                        (value) => t("plans.max", { count: value })
                      )}
                    </div>
                    <div className="mt-1 text-xs">
                      <span className="font-semibold">{t("plans.booking")}:</span>{" "}{featureSummary(
                        features.nativeBookingEnabled,
                        features.maxBookingEvents,
                        t("plans.included"),
                        t("plans.notIncluded"),
                        t("plans.unlimited"),
                        (value) => t("plans.max", { count: value })
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanActiveToggle id={plan.id} isActive={plan.isActive} planName={plan.name} copy={toggleCopy} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PlanFormDialog
                      plan={plan}
                      trigger={
                        <Button type="button" variant="outline" size="sm" aria-label={t("plans.editNamed", { name: plan.name })}>
                          {t("plans.edit")}
                        </Button>
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
          <div className="grid gap-3 md:hidden" role="region" aria-label={t("plans.mobileRegion")}>
            {plans.map((plan) => {
              const features = plan.features as PlanFeatures;
              return (
                <article key={plan.id} className="sticker-card min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-bold">{plan.name}</h2>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{plan.key}</p>
                    </div>
                    <PlanActiveToggle id={plan.id} isActive={plan.isActive} planName={plan.name} copy={toggleCopy} />
                  </div>
                  <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs font-bold text-muted-foreground">{t("plans.price")}</dt>
                      <dd className="mt-1 font-bold tabular-nums">{formatUsdCents(plan.priceMonthlyCents)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-bold text-muted-foreground">{t("plans.status")}</dt>
                      <dd className="mt-1 font-bold">{plan.isActive ? t("plans.active") : t("plans.inactive")}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-bold text-muted-foreground">{t("plans.team")}</dt>
                      <dd className="mt-1 break-words">{featureSummary(features.teamMembersEnabled, features.maxTeamMembers, t("plans.included"), t("plans.notIncluded"), t("plans.unlimited"), (value) => t("plans.max", { count: value }))}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-bold text-muted-foreground">{t("plans.booking")}</dt>
                      <dd className="mt-1 break-words">{featureSummary(features.nativeBookingEnabled, features.maxBookingEvents, t("plans.included"), t("plans.notIncluded"), t("plans.unlimited"), (value) => t("plans.max", { count: value }))}</dd>
                    </div>
                  </dl>
                  <PlanFormDialog plan={plan} trigger={<Button type="button" variant="outline" aria-label={t("plans.editNamed", { name: plan.name })} className="mt-4 min-h-11 w-full">{t("plans.edit")}</Button>} />
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
