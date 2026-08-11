import { getLocale, getTranslations } from "next-intl/server";

import { Falco } from "@/components/falco/falco";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { localizeLeverCategory, localizeLeverLabel } from "@/lib/levers/locale";

import { DiscoveryConversation } from "./discovery-conversation";
import { DiscoveryOpportunityCard } from "./discovery-opportunity-card";
import { DiscoveryListView, type EditableLever } from "./discovery-list-view";

const PERIOD_MONTHS = 3;

export async function DiscoveryTab({ accountId }: { accountId: string }) {
  const t = await getTranslations("diagnostic.discovery");
  const tDiagnostic = await getTranslations("diagnostic");
  const locale = await getLocale();
  const [{ businessProfile, catalog, remainingLevers, answered: resolvedCount, total, answeredByKey }, rawData] = await Promise.all([
    getDiscoveryState(accountId),
    getDiagnosticKpiRawData(accountId),
  ]);

  if (remainingLevers.length > 0) {
    return <DiscoveryConversation levers={remainingLevers} initialTotal={total} initialAnswered={resolvedCount} />;
  }

  // Parcours terminé — cartes d'opportunité + vue liste éditable.
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months: lastCompletedMonths(PERIOD_MONTHS),
    allMonthlyRows: rawData.allMonthlyRows,
    allSettingEntries: rawData.allSettingEntries,
    allClosingEntries: rawData.allClosingEntries,
    callSourcesByMonth: rawData.allCallSourcesByMonth,
    allSales: rawData.allSales,
    allLeads: rawData.allLeads,
    allLeadStageHistory: rawData.allLeadStageHistory,
    allEmailCampaigns: rawData.allEmailCampaigns,
    allMetaMetrics: rawData.allMetaMetrics,
    allNativeBookingLeads: rawData.allNativeBookingLeads,
  });

  const { toImplement, toWatch } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: PERIOD_MONTHS,
    months: lastCompletedMonths(PERIOD_MONTHS),
  });

  const editableLevers: EditableLever[] = catalog
    .filter((lever) => !lever.readsFromProfile)
    .map((lever) => {
      const row = answeredByKey.get(lever.leverKey);
      return row ? { catalog: lever, status: row.status as "active" | "absent", stats: row.stats } : null;
    })
    .filter((entry): entry is EditableLever => entry !== null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Falco pose="happy" size="sm" animate="enter" />
        <p className="text-sm font-bold text-muted-foreground">
          {t("completedHelp")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-bold">{t("toImplement")}</h2>
        {toImplement.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noneMissing")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {toImplement.map((opportunity) => (
              <DiscoveryOpportunityCard
                key={opportunity.leverKey}
                leverKey={opportunity.leverKey}
                label={localizeLeverLabel(opportunity.leverKey, opportunity.label, locale, tDiagnostic)}
                category={localizeLeverCategory(opportunity.category, opportunity.category, locale, tDiagnostic)}
                effort={opportunity.effort}
                impactAmountEur={opportunity.impactAmountEur}
                impactRangeEur={opportunity.impactRangeEur}
                impactExplanation={opportunity.impactExplanation}
                contextSentence={opportunity.contextSentence}
                warning={opportunity.warning}
                ctaLabel={t("discover")}
                sourcePage="optimisation_a_implementer"
              />
            ))}
          </div>
        )}
      </div>

      {toWatch.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-bold">{t("toWatch")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {toWatch.map((item) => (
              <DiscoveryOpportunityCard
                key={item.leverKey}
                leverKey={item.leverKey}
                label={localizeLeverLabel(item.leverKey, item.label, locale, tDiagnostic)}
                category={localizeLeverCategory(item.category, item.category, locale, tDiagnostic)}
                effort="faible"
                impactAmountEur={item.impactAmountEur}
                impactExplanation={`${Math.round(item.statValue * 100)}% vs ${Math.round(item.benchmarkValue * 100)}% de benchmark. ${item.impactExplanation}`}
                ctaLabel={t("improve")}
                currentValue={item.statValue}
                sourcePage="optimisation_a_surveiller"
              />
            ))}
          </div>
        </div>
      )}

      <DiscoveryListView levers={editableLevers} />
    </div>
  );
}
