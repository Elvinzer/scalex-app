import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { Falco } from "@/components/falco/falco";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";

import { DiscoveryConversation } from "./discovery-conversation";
import { DiscoveryOpportunityCard } from "./discovery-opportunity-card";
import { DiscoveryListView, type EditableLever } from "./discovery-list-view";

const PERIOD_MONTHS = 3;

export async function DiscoveryTab({ accountId }: { accountId: string }) {
  const [
    { businessProfile, catalog, remainingLevers, answered: resolvedCount, total, answeredByKey },
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
  ] = await Promise.all([
    getDiscoveryState(accountId),
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
  ]);

  if (remainingLevers.length > 0) {
    return <DiscoveryConversation levers={remainingLevers} initialTotal={total} initialAnswered={resolvedCount} />;
  }

  // Parcours terminé — cartes d'opportunité + vue liste éditable.
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months: lastCompletedMonths(PERIOD_MONTHS),
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });

  const { toImplement, toWatch } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: PERIOD_MONTHS,
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
          Parcours terminé. Voici ce que tu peux ajouter, et ce qui tourne déjà sous le radar.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-bold">À implémenter</h2>
        {toImplement.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
            Aucun levier absent détecté. Tout est déjà en place.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {toImplement.map((opportunity) => (
              <DiscoveryOpportunityCard
                key={opportunity.leverKey}
                leverKey={opportunity.leverKey}
                label={opportunity.label}
                category={opportunity.category}
                effort={opportunity.effort}
                impactAmountEur={opportunity.impactAmountEur}
                impactExplanation={opportunity.impactExplanation}
                ctaLabel="Mettre en place"
                sourcePage="optimisation_a_implementer"
              />
            ))}
          </div>
        )}
      </div>

      {toWatch.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Actifs à surveiller</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {toWatch.map((item) => (
              <DiscoveryOpportunityCard
                key={item.leverKey}
                leverKey={item.leverKey}
                label={item.label}
                category={item.category}
                effort="faible"
                impactAmountEur={item.impactAmountEur}
                impactExplanation={`${Math.round(item.statValue * 100)}% vs ${Math.round(item.benchmarkValue * 100)}% de benchmark. ${item.impactExplanation}`}
                ctaLabel="Améliorer"
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
