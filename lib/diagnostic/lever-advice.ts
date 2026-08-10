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
function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 }).format(value);
}

export function adviceFor(key: string, statKey: string | undefined, rawCurrentPercent: number, rawBenchmarkPercent: number, agentName: string, locale = "fr"): string {
  const lookupKey = statKey ? `${key}:${statKey}` : key;
  const currentPercent = formatPercent(rawCurrentPercent, locale);
  const benchmarkPercent = formatPercent(rawBenchmarkPercent, locale);
  const isEnglish = locale === "en";

  switch (lookupKey) {
    case "email_marketing":
    case "email_marketing:openRate":
      return isEnglish
        ? `Your open rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). Try different subject lines or a different send time. ${agentName} can help rewrite the next sequence.`
        : `Ton taux d'ouverture est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Retravaille tes objets et l'heure d'envoi. ${agentName} peut te réécrire ta prochaine séquence.`;
    case "email_marketing:ctr":
      return isEnglish
        ? `Your click rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). The email body or call to action needs work. ${agentName} can help restructure the email.`
        : `Ton taux de clic est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le corps de l'email ou le call-to-action ne convertit pas assez. ${agentName} peut retravailler la structure de tes emails.`;
    case "newsletter":
    case "newsletter:ctr":
      return isEnglish
        ? `Your newsletter click rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). The content or call to action is losing readers. ${agentName} can help revise the next edition.`
        : `Ton taux de clic sur ta newsletter est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le contenu ou le call-to-action ne retient pas assez l'attention. ${agentName} peut retravailler ta prochaine édition.`;
    case "lead_magnet":
    case "lead_magnet:optinRate":
      return isEnglish
        ? `Your opt-in rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). The page or promise needs work. ${agentName} can help review the lead magnet offer.`
        : `Ton taux d'opt-in est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ta page ou ta promesse ne convainc pas assez. ${agentName} peut revoir ton offre de lead magnet.`;
    case "webinar":
    case "webinar:showUpRate":
      return isEnglish
        ? `Your webinar attendance rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). Test stronger reminders and a clearer reason to attend. ${agentName} can help revise the follow-up sequence.`
        : `Ton taux de présence aux webinaires est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Renforce tes rappels (J-1, H-1) et la valeur perçue de l'inscription. ${agentName} peut retravailler ta séquence de relance.`;
    case "upsell_ascension":
      return isEnglish
        ? `Your upsell take rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). Review the pitch and when you make the offer. ${agentName} can help revise the proposal.`
        : `Ton take-rate d'upsell est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le pitch ou le timing de l'offre complémentaire ne convertit pas assez. ${agentName} peut retravailler ta proposition.`;
    case "ads":
      return isEnglish
        ? `Your cost per result is above the market on this channel. ${agentName} can help review the targeting and creative.`
        : `Ton coût par résultat est au-dessus du marché sur ce canal. ${agentName} peut retravailler ton ciblage ou tes créas pour le faire baisser.`;
    case "content_click_rate":
      return isEnglish
        ? `Your content click rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). The hook is losing attention. ${agentName} can help revise your hooks.`
        : `Ton taux de clic sur ton contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Le hook ou l'accroche ne retient pas assez l'attention. ${agentName} peut retravailler tes accroches.`;
    case "content_lead_rate":
      return isEnglish
        ? `Your click-to-lead conversion rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). Review the landing page and lead magnet. ${agentName} can help revise this funnel.`
        : `Ton taux de conversion clic → lead est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ta landing page ou ton lead magnet ne convertit pas assez. ${agentName} peut retravailler ce tunnel.`;
    case "content_booking_rate":
      return isEnglish
        ? `Your booked-call rate from content is ${currentPercent}% (benchmark ${benchmarkPercent}%). Review the call to action and the offer at the end of the video. ${agentName} can help revise the closing section.`
        : `Ton taux de RDV bookés depuis ton contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ton call-to-action ou l'offre en fin de vidéo ne convertit pas assez de viewers en RDV. ${agentName} peut retravailler ta conclusion.`;
    case "content_close_rate":
      return isEnglish
        ? `Your closing rate for content-sourced calls is ${currentPercent}% (benchmark ${benchmarkPercent}%). These calls may be less qualified than calls from another channel. ${agentName} can help qualify them before the call.`
        : `Ton taux de closing des RDV issus du contenu est à ${currentPercent}% (benchmark ${benchmarkPercent}%). Ces RDV arrivent peut-être moins qualifiés qu'un autre canal. ${agentName} peut t'aider à mieux les pré-qualifier avant l'appel.`;
    default:
      return isEnglish
        ? `Your rate is ${currentPercent}% (benchmark ${benchmarkPercent}%). ${agentName} can help you decide what to fix.`
        : `Ton taux est à ${currentPercent}% (benchmark ${benchmarkPercent}%). ${agentName} peut t'aider à identifier quoi corriger.`;
  }
}
