// Deterministic, template-based advice for a lever/content point shown in
// Diagnostic's "Points à améliorer" (app/(app)/diagnostic/page.tsx) —
// mirrors lib/diagnostic/cascade.ts's own explanationFor() for the 5
// cascade metrics, which already need no equivalent here (their existing
// `explanation` field is reused as-is, already factual). Never generated
// by the AI — reliability over cleverness, same rule as explanationFor.
// Always cites the real rate, the benchmark, and names the agent that can
// help, per the brief's explicit ban on vague advice ("améliore ton
// copywriting").
//
// Keyed by `${key}` or `${key}:${statKey}` (statKey only exists for a
// lever with more than one stat checked — e.g. email_marketing's CTR
// alongside its openRate, see lib/levers/opportunities.ts).
// Percents arrive already scaled (54, or 0.09 for the sub-1% content
// rates) — formatted here so a decimal reads "0,09" and not JS's "0.09" in
// French copy.
const PERCENT_FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function adviceFor(key: string, statKey: string | undefined, rawCurrentPercent: number, rawBenchmarkPercent: number, agentName: string): string {
  const lookupKey = statKey ? `${key}:${statKey}` : key;
  const currentPercent = PERCENT_FORMAT.format(rawCurrentPercent);
  const benchmarkPercent = PERCENT_FORMAT.format(rawBenchmarkPercent);

  switch (lookupKey) {
    case "email_marketing":
    case "email_marketing:openRate":
      return `Ton taux d'ouverture est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Retravaille tes objets et l'heure d'envoi. ${agentName} peut te réécrire ta prochaine séquence.`;
    case "email_marketing:ctr":
      return `Ton taux de clic est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le corps de l'email ou le call-to-action ne convertit pas assez. ${agentName} peut retravailler la structure de tes emails.`;
    case "newsletter":
    case "newsletter:ctr":
      return `Ton taux de clic sur ta newsletter est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le contenu ou le call-to-action ne retient pas assez l'attention. ${agentName} peut retravailler ta prochaine édition.`;
    case "lead_magnet":
    case "lead_magnet:optinRate":
      return `Ton taux d'opt-in est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ta page ou ta promesse ne convainc pas assez. ${agentName} peut revoir ton offre de lead magnet.`;
    case "webinar":
    case "webinar:showUpRate":
      return `Ton taux de présence aux webinaires est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Renforce tes rappels (J-1, H-1) et la valeur perçue de l'inscription. ${agentName} peut retravailler ta séquence de relance.`;
    case "upsell_ascension":
      return `Ton take-rate d'upsell est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le pitch ou le timing de l'offre complémentaire ne convertit pas assez. ${agentName} peut retravailler ta proposition.`;
    case "ads":
      return `Ton coût par résultat est au-dessus du marché sur ce canal. ${agentName} peut retravailler ton ciblage ou tes créas pour le faire baisser.`;
    case "content_click_rate":
      return `Ton taux de clic sur ton contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le hook ou l'accroche ne retient pas assez l'attention. ${agentName} peut retravailler tes accroches.`;
    case "content_lead_rate":
      return `Ton taux de conversion clic → lead est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ta landing page ou ton lead magnet ne convertit pas assez. ${agentName} peut retravailler ce tunnel.`;
    case "content_booking_rate":
      return `Ton taux de RDV bookés depuis ton contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ton call-to-action ou l'offre en fin de vidéo ne convertit pas assez de viewers en RDV. ${agentName} peut retravailler ta conclusion.`;
    case "content_close_rate":
      return `Ton taux de closing des RDV issus du contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ces RDV arrivent peut-être moins qualifiés qu'un autre canal. ${agentName} peut t'aider à mieux les pré-qualifier avant l'appel.`;
    default:
      return `Ton taux est à ${currentPercent}% (benchmark ${benchmarkPercent}%). ${agentName} peut t'aider à identifier quoi corriger.`;
  }
}
