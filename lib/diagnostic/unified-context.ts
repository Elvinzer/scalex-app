import type { AcquisitionSourceTotals } from "./acquisition-sources";
import type { ContentRetentionSummary } from "./content-retention";
import type { PipelinePeriodTotals } from "./aggregate";

export function formatUnifiedSourceContext({
  settingTotals,
  closingTotals,
  cashContractedTotal,
  pipelineTotals,
  acquisitionTotals,
  retention,
  periodLabel,
}: {
  settingTotals: { newSubscribers: number; firstMessagesSent: number; conversationsStarted: number; callsProposed: number; callsBooked: number };
  closingTotals: { callsAttended: number; salesClosed: number };
  cashContractedTotal: number;
  pipelineTotals: PipelinePeriodTotals;
  acquisitionTotals: AcquisitionSourceTotals;
  retention?: ContentRetentionSummary | null;
  periodLabel: string;
}): string {
  const retentionText = retention?.currentRate === null || retention?.currentRate === undefined
    ? "non mesurée"
    : `${Math.round(retention.currentRate * 100)}% (benchmark ${Math.round(retention.benchmarkRate * 100)}%)`;

  return [
    `Période: ${periodLabel}`,
    `Setting canonique: nouveaux abonnés=${settingTotals.newSubscribers}, premiers messages=${settingTotals.firstMessagesSent}, conversations=${settingTotals.conversationsStarted}, appels proposés=${settingTotals.callsProposed}, appels réservés=${settingTotals.callsBooked}.`,
    `Closing canonique: appels honorés=${closingTotals.callsAttended}, ventes conclues=${closingTotals.salesClosed}.`,
    `Ventes canoniques: CA contracté=${cashContractedTotal}€ (ventes non orphelines, sans double comptage).`,
    `Pipeline: leads créés=${pipelineTotals.leads}, leads travaillés=${pipelineTotals.worked}, leads closés=${pipelineTotals.closed}, conversations=${pipelineTotals.conversations}, RDV fixés=${pipelineTotals.callsBooked}, RDV honorés=${pipelineTotals.callsTaken}.`,
    `Attribution Email: envois=${acquisitionTotals.email.sends}, ouvertures=${acquisitionTotals.email.opens}, clics=${acquisitionTotals.email.clicks}, RDV=${acquisitionTotals.email.bookings}, ventes=${acquisitionTotals.email.dealsClosed}, CA attribué=${acquisitionTotals.email.revenueAttributed}€.`,
    `Attribution Meta: dépenses=${acquisitionTotals.meta.spendCents / 100}€, impressions=${acquisitionTotals.meta.impressions}, clics=${acquisitionTotals.meta.linkClicks}, leads=${acquisitionTotals.meta.leads}, achats=${acquisitionTotals.meta.purchases}, valeur achats=${acquisitionTotals.meta.purchaseValueCents / 100}€.`,
    `Réservations natives: prospects=${acquisitionTotals.native.leads}, convertis=${acquisitionTotals.native.convertedLeads}.`,
    `Rétention contenu: ${retentionText}.`,
    "Ces sources sont des faits calculés côté serveur. Ne complète jamais un chiffre manquant par une estimation.",
  ].join("\n");
}
