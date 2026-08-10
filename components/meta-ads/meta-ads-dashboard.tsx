import { ArrowUpRight, BarChart3, Eye, MousePointerClick, Play, UserPlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { MetaCampaignsTable } from "@/components/meta-ads/meta-campaigns-table";
import { MetaDataQuality } from "@/components/meta-ads/meta-data-quality";
import { MetaPeriodFilter } from "@/components/meta-ads/meta-period-filter";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { safeRatio as ratio } from "@/lib/meta-ads/derived-metrics";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { DEFAULT_META_PERIOD_SELECTION, formatMetaPeriodRange, metaPeriodSelectionLabel, serializeMetaPeriodSelection, type MetaPeriodSelection } from "@/lib/meta-ads/protocol";
import { formatPercent } from "@/lib/setting/funnel";
import { metricValue, rawMetaMetricValue, type MetaAdsDashboard, type MetaCampaignDashboardRow, type MetaInstagramObservation, type MetaMetricTotals } from "@/lib/meta-ads/queries";
import { campaignTypeNeedsConversionGoal } from "@/lib/meta-ads/types";

function number(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function metricProvenance(calculation: "brute" | "dérivée", available: boolean, locale: string): string {
  const isEnglish = locale === "en";
  const readableCalculation = calculation === "brute" ? (isEnglish ? "raw" : "brute") : (isEnglish ? "derived" : "dérivée");
  return `Meta · ${readableCalculation} · ${available ? (isEnglish ? "direct" : "directe") : (isEnglish ? "unavailable" : "indisponible")}`;
}

<<<<<<< HEAD
=======
function typeLabel(value: MetaCampaignDashboardRow["campaignType"], locale: string): string {
  const isEnglish = locale === "en";
  if (value === "vsl") return "VSL";
  if (value === "webinar") return isEnglish ? "Webinar" : "Webinaire";
  if (value === "instagram_profile_growth") return isEnglish ? "Instagram traffic" : "Trafic Instagram";
  if (value === "retargeting") return "Retargeting";
  return isEnglish ? "To define" : "À définir";
}

function conversionGoalLabel(value: MetaCampaignDashboardRow["conversionGoal"], locale: string): string | null {
  if (value === "call") return locale === "en" ? "Call" : "Appel";
  if (value === "sale") return locale === "en" ? "Sale" : "Vente";
  return null;
}

function statusLabel(status: string | null, locale: string): string {
  if (!status) return locale === "en" ? "Unknown status" : "Statut inconnu";
  if (status === "ACTIVE") return "Active";
  if (status === "PAUSED") return locale === "en" ? "Paused" : "En pause";
  return status.toLowerCase().replaceAll("_", " ");
}

>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
function Kpi({ label, value, detail, comparison, provenance, icon }: { label: string; value: string; detail: string; comparison: string; provenance: string; icon: React.ReactNode }) {
  return (
    <div className="sticker-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <p className="mt-2 text-xs font-bold text-muted-foreground">{comparison}</p>
      <p className="mt-2 text-[11px] font-bold text-muted-foreground">{provenance}</p>
    </div>
  );
}

function FunnelStep({ label, value, base, tone = "accent2", unavailableReason, locale }: { label: string; value: number | null; base: number; tone?: "accent" | "accent2"; unavailableReason?: string; locale: string }) {
  const percentage = value === null ? null : ratio(value, base);
  const width = percentage === null ? 0 : Math.min(100, Math.max(3, percentage * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{label}</div>
      <div className="h-2 flex-1 rounded-full bg-muted">
        {percentage !== null && <div className={`h-2 rounded-full ${tone === "accent" ? "bg-accent" : "bg-accent-2"}`} style={{ width: `${width}%` }} />}
      </div>
      <div className="w-36 shrink-0 text-right text-xs font-bold tabular-nums">
        <span>{value === null ? "—" : `${number(value, locale)} · ${percentage === null ? "—" : formatPercent(percentage, locale)}`}</span>
        {value === null && <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">{unavailableReason ?? (locale === "en" ? "Unavailable for this period" : "Indisponible sur la période")}</span>}
      </div>
    </div>
  );
}

type FunnelTableRow = {
  label: string;
  value: number | null;
  base: number | null;
  unavailableReason?: string;
};

function FunnelTable({ rows, locale, labels }: { rows: FunnelTableRow[]; locale: string; labels: { aria: string; caption: string; step: string; value: string; rate: string; availability: string; unavailable: string; measured: string } }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label={labels.aria}>
      <table className="w-full min-w-[34rem] text-xs">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-border text-left font-bold text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2">{labels.step}</th>
            <th className="px-3 py-2 text-right">{labels.value}</th>
            <th className="px-3 py-2 text-right">{labels.rate}</th>
            <th className="px-3 py-2">{labels.availability}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = ratio(row.value, row.base);
            return (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-bold">{row.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{row.value === null ? "—" : number(row.value, locale)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rate === null ? "—" : formatPercent(rate, locale)}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.unavailableReason ?? (row.value === null ? labels.unavailable : labels.measured)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

<<<<<<< HEAD
function FunnelCard({ totals, campaignType, instagramObservation, frequencySaturationThreshold }: { totals: MetaMetricTotals; campaignType: MetaCampaignDashboardRow["campaignType"]; instagramObservation: MetaInstagramObservation; frequencySaturationThreshold: number }) {
=======
function TableMetric({ value, provenance, detail }: { value: string; provenance: string; detail?: string }) {
  return (
    <div>
      <span>{value}</span>
      <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">{provenance}</span>
      {detail && <span className="block text-[10px] font-normal leading-4 text-muted-foreground">{detail}</span>}
    </div>
  );
}

async function FunnelCard({ totals, campaignType, instagramObservation, frequencySaturationThreshold }: { totals: MetaMetricTotals; campaignType: MetaCampaignDashboardRow["campaignType"]; instagramObservation: MetaInstagramObservation; frequencySaturationThreshold: number }) {
  const locale = await getLocale();
  const t = await getTranslations("app.ads.dashboard");
  const tableLabels = {
    aria: t("funnelTableAria"),
    caption: t("funnelTableCaption"),
    step: t("step"),
    value: t("value"),
    rate: t("ratePrevious"),
    availability: t("availability"),
    unavailable: t("unavailablePeriod"),
    measured: t("measured"),
  };
>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
  const impressions = metricValue(totals, "impressions");
  const linkClicks = metricValue(totals, "linkClicks");
  const video3sViews = metricValue(totals, "video3sViews");
  const videoThruplay = metricValue(totals, "videoThruplay");
  const leads = metricValue(totals, "leads");
  const registrations = metricValue(totals, "registrations");
  const profileVisits = metricValue(totals, "profileVisits");
  const observedFollows = instagramObservation.current.follows;
  const spendCents = metricValue(totals, "spendCents");
  if (campaignType === null) {
    return (
      <div className="sticker-card-dashed p-6">
        <p className="font-bold">{t("funnelPendingTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("funnelPendingHelp")}</p>
      </div>
    );
  }
  if (campaignType === "vsl") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{t("vslJourney")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("vslHelp")}</p>
          </div>
          <Play className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep locale={locale} label={t("impressions")} value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep locale={locale} label={t("threeSecondViews")} value={video3sViews} base={impressions ?? 0} unavailableReason={t("videoUnavailable")} />
          <FunnelStep locale={locale} label={t("thruplay")} value={videoThruplay} base={video3sViews ?? 0} unavailableReason={t("videoUnavailable")} />
          <FunnelStep locale={locale} label={t("leads")} value={leads} base={videoThruplay ?? impressions ?? 0} tone="accent" unavailableReason={t("leadsUnavailable")} />
          <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs text-state-caution">{t("vslUnavailable")}</p>
          <FunnelTable locale={locale} labels={tableLabels} rows={[
            { label: t("impressions"), value: impressions, base: impressions },
            { label: t("threeSecondViews"), value: video3sViews, base: impressions },
            { label: t("thruplay"), value: videoThruplay, base: video3sViews },
            { label: "VSL playback", value: null, base: null, unavailableReason: t("vslEventMissing") },
            { label: "Watch depth", value: null, base: null, unavailableReason: t("vslProgressMissing") },
            { label: t("leads"), value: leads, base: videoThruplay ?? impressions },
          ]} />
          <p className="text-[11px] text-muted-foreground">{t("vslProvenance")}</p>
        </div>
      </div>
    );
  }
  if (campaignType === "webinar") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{t("webinarJourney")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("webinarHelp")}</p>
          </div>
          <Eye className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep locale={locale} label={t("clicks")} value={linkClicks} base={impressions ?? 0} tone="accent" />
          <FunnelStep locale={locale} label={t("registrations")} value={registrations} base={linkClicks ?? 0} unavailableReason={t("registrationsUnavailable")} />
          <FunnelStep locale={locale} label={t("attendees")} value={null} base={registrations ?? 0} unavailableReason={t("webinarAttendanceMissing")} />
          <FunnelStep locale={locale} label={t("metaSales")} value={metricValue(totals, "purchases")} base={registrations ?? 0} tone="accent" unavailableReason={t("purchasesUnavailable")} />
          <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs text-state-caution">{t("webinarUnavailable")}</p>
          <FunnelTable locale={locale} labels={tableLabels} rows={[
            { label: t("clicks"), value: linkClicks, base: impressions },
            { label: t("registrations"), value: registrations, base: linkClicks },
            { label: "Live attendance", value: null, base: registrations, unavailableReason: t("webinarAttendanceMissing") },
            { label: "Attendance through pitch", value: null, base: registrations, unavailableReason: t("webinarProgressMissing") },
            { label: t("metaSales"), value: metricValue(totals, "purchases"), base: registrations },
          ]} />
          <p className="text-[11px] text-muted-foreground">{t("webinarProvenance")}</p>
        </div>
      </div>
    );
  }
  if (campaignType === "instagram_profile_growth") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{t("instagramJourney")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("instagramHelp")}</p>
          </div>
          <UserPlus className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep locale={locale} label={t("impressions")} value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep locale={locale} label={t("profileVisits")} value={profileVisits} base={impressions ?? 0} unavailableReason={t("profileVisitsUnavailable")} />
          <FunnelStep locale={locale} label={t("observedFollows")} value={observedFollows} base={profileVisits ?? 0} tone="accent" unavailableReason={instagramObservation.connected ? t("instagramObservationUnavailable") : t("instagramMissing")} />
          <p className="text-xs text-muted-foreground">
            {t("observedFollowerCost", { cost: spendCents !== null && observedFollows !== null && observedFollows > 0 ? formatEur(spendCents / observedFollows / 100, locale) : "—" })} {instagramObservation.connected ? t("followsObserved") : t("connectInstagram")}
          </p>
          <FunnelTable locale={locale} labels={tableLabels} rows={[
            { label: t("impressions"), value: impressions, base: impressions },
            { label: t("profileVisits"), value: profileVisits, base: impressions },
            { label: t("observedFollows"), value: observedFollows, base: profileVisits, unavailableReason: instagramObservation.connected ? undefined : t("instagramMissing") },
          ]} />
          <p className="text-[11px] text-muted-foreground">{t("instagramProvenance")}</p>
        </div>
      </div>
    );
  }
  if (campaignType === "retargeting") {
    const frequency = ratio(impressions, metricValue(totals, "reach"));
    const ctr = ratio(linkClicks, impressions);
    const leads = metricValue(totals, "leads");
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{t("retargetingJourney")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("retargetingHelp")}</p>
          </div>
          <MousePointerClick className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep locale={locale} label={t("impressions")} value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep locale={locale} label={t("linkClicks")} value={linkClicks} base={impressions ?? 0} unavailableReason={t("linkClicksUnavailable")} />
          <FunnelStep locale={locale} label={t("leads")} value={leads} base={linkClicks ?? 0} tone="accent" unavailableReason={t("leadsUnavailable")} />
          <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("frequency", { value: frequency === null ? "—" : frequency.toFixed(1), threshold: frequencySaturationThreshold })} {frequency !== null && frequency > frequencySaturationThreshold ? t("saturationSignal") : t("noSaturation")} {t("reachNotDeduped")}
          </p>
          <p className="text-xs text-muted-foreground">{t("audienceUnavailable")}</p>
          <p className="text-xs font-bold text-muted-foreground">{t("currentCtr", { value: ctr === null ? "—" : formatPercent(ctr, locale) })}</p>
          <FunnelTable locale={locale} labels={tableLabels} rows={[
            { label: t("impressions"), value: impressions, base: impressions },
            { label: t("linkClicks"), value: linkClicks, base: impressions },
            { label: t("leads"), value: leads, base: linkClicks },
          ]} />
          <p className="text-[11px] text-muted-foreground">{t("retargetingProvenance")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sticker-card p-6">
      <p className="font-bold">{t("campaignReading")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("campaignReadingHelp")}</p>
      <div className="mt-5 space-y-3">
        <FunnelStep locale={locale} label={t("impressions")} value={impressions} base={impressions ?? 0} tone="accent" />
        <FunnelStep locale={locale} label={t("clicks")} value={linkClicks} base={impressions ?? 0} unavailableReason={t("genericClicksUnavailable")} />
        <FunnelStep locale={locale} label={t("leads")} value={leads} base={linkClicks ?? 0} tone="accent" unavailableReason={t("leadsUnavailable")} />
        <FunnelTable locale={locale} labels={tableLabels} rows={[
          { label: t("impressions"), value: impressions, base: impressions },
          { label: t("clicks"), value: linkClicks, base: impressions },
          { label: t("leads"), value: leads, base: linkClicks },
        ]} />
        <p className="text-[11px] text-muted-foreground">{t("genericProvenance")}</p>
      </div>
    </div>
  );
}

<<<<<<< HEAD
export function MetaAdsDashboard({ data, canManageCampaigns = false, periodSelection = DEFAULT_META_PERIOD_SELECTION }: { data: MetaAdsDashboard; canManageCampaigns?: boolean; periodSelection?: MetaPeriodSelection }) {
=======
export async function MetaAdsDashboard({ data }: { data: MetaAdsDashboard }) {
  const locale = await getLocale();
  const t = await getTranslations("app.ads.dashboard");
>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
  const spendCents = metricValue(data.totals, "spendCents");
  const comparisonSpendCents = metricValue(data.comparisonTotals, "spendCents");
  const impressions = metricValue(data.totals, "impressions");
  const comparisonImpressions = metricValue(data.comparisonTotals, "impressions");
  const linkClicks = metricValue(data.totals, "linkClicks");
  const comparisonLinkClicks = metricValue(data.comparisonTotals, "linkClicks");
  const leads = metricValue(data.totals, "leads");
  const comparisonLeads = metricValue(data.comparisonTotals, "leads");
  const rawCtr = rawMetaMetricValue(data.totals, "ctr");
  const rawComparisonCtr = rawMetaMetricValue(data.comparisonTotals, "ctr");
  const ctr = rawCtr ?? (impressions !== null && linkClicks !== null ? ratio(linkClicks, impressions) : null);
  const comparisonCtr = rawComparisonCtr ?? (comparisonImpressions !== null && comparisonLinkClicks !== null ? ratio(comparisonLinkClicks, comparisonImpressions) : null);
  const rawCpcCents = rawMetaMetricValue(data.totals, "cpcCents");
  const rawComparisonCpcCents = rawMetaMetricValue(data.comparisonTotals, "cpcCents");
  const cpc = rawCpcCents !== null
    ? rawCpcCents / 100
    : linkClicks !== null && linkClicks > 0 && spendCents !== null
      ? spendCents / linkClicks / 100
      : null;
  const comparisonCpc = rawComparisonCpcCents !== null
    ? rawComparisonCpcCents / 100
    : comparisonLinkClicks !== null && comparisonLinkClicks > 0 && comparisonSpendCents !== null
      ? comparisonSpendCents / comparisonLinkClicks / 100
      : null;
  const cpl = leads !== null && leads > 0 && spendCents !== null ? spendCents / leads / 100 : null;
  const comparisonCpl = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLeads / 100 : null;
  const rawCpmCents = rawMetaMetricValue(data.totals, "cpmCents");
  const rawComparisonCpmCents = rawMetaMetricValue(data.comparisonTotals, "cpmCents");
  const cpm = rawCpmCents !== null
    ? rawCpmCents / 100
    : impressions !== null && impressions > 0 && spendCents !== null
      ? (spendCents / impressions) * 1000 / 100
      : null;
  const comparisonCpm = rawComparisonCpmCents !== null
    ? rawComparisonCpmCents / 100
    : comparisonImpressions !== null && comparisonImpressions > 0 && comparisonSpendCents !== null
      ? (comparisonSpendCents / comparisonImpressions) * 1000 / 100
      : null;
  const campaignTypes = [...new Set(data.campaigns.map((campaign) => campaign.campaignType).filter((type): type is NonNullable<typeof type> => type !== null))];
  const allCampaignsConfigured = data.campaigns.length > 0 && data.campaigns.every((campaign) => campaign.campaignType !== null && (!campaignTypeNeedsConversionGoal(campaign.campaignType) || campaign.conversionGoal !== null));
  const primaryType = allCampaignsConfigured && campaignTypes.length === 1 ? campaignTypes[0]! : null;
  const coverageValues = data.campaigns.map((campaign) => campaign.metricCoverageRate).filter((value): value is number => value !== null && value !== undefined);
  const minimumCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : null;
  const periodQuery = serializeMetaPeriodSelection(periodSelection);
  const cplTargetCount = data.campaigns.filter((campaign) => campaign.campaignType !== "instagram_profile_growth" && campaign.targets?.targetCpaCents !== null && campaign.targets?.targetCpaCents !== undefined).length;
  const cplApplicable = primaryType !== "instagram_profile_growth";
  const cplDetail = primaryType === "instagram_profile_growth"
    ? t("notApplicableFollower")
    : leads === null
      ? t("leadsUnavailable")
      : leads === 0
        ? locale === "en" ? "No leads measured" : "Aucun lead mesuré sur la période"
        : spendCents === null
          ? `${number(leads, locale)} lead(s) · ${locale === "en" ? "spend unavailable" : "dépenses Meta indisponibles"}`
          : `${number(leads, locale)} ${locale === "en" ? "lead(s) measured" : "lead(s) mesuré(s)"}`;

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meta-ads-dashboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
<<<<<<< HEAD
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">Meta Ads · {data.account.name}</p>
          <h2 id="meta-ads-dashboard-title" className="mt-1 text-xl font-bold">Performance</h2>
          <p className="mt-1 text-sm text-muted-foreground">{metaPeriodSelectionLabel(periodSelection)} · {formatMetaPeriodRange(data.period)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetaPeriodFilter selection={periodSelection} period={data.period} />
          <Button variant="outline" asChild>
            <a href="/integrations#meta-ads">Connexion <ArrowUpRight className="size-4" /></a>
=======
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">{t("source", { account: data.account.name })}</p>
          <h2 id="meta-ads-dashboard-title" className="mt-1 text-xl font-bold">{t("performance", { days: data.period.days })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("insightsUpdated", { start: data.period.start, end: data.period.end })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("comparison", { start: data.comparisonPeriod.start, end: data.comparisonPeriod.end })}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {data.period.consolidatedThrough
              ? t("consolidated", { date: new Intl.DateTimeFormat(locale).format(new Date(`${data.period.consolidatedThrough}T12:00:00Z`)) })
              : t("consolidating")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("minimumCoverage", { value: minimumCoverage === null ? "—" : formatPercent(minimumCoverage, locale) })}
          </p>
          {data.missingMetricDates.length > 0 && (
            <p className="mt-1 text-xs font-bold text-state-caution" role="status">
              {t("missingDates", { dates: data.missingMetricDates.slice(0, 8).join(", "), count: data.missingMetricDates.length - 8 })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-card p-1" aria-label={t("periodAria")}>
            {META_PERIOD_OPTIONS.map((days) => (
              <a key={days} href={`/acquisition/ads?meta_days=${days}`} aria-current={data.period.days === days ? "page" : undefined} className={`rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-bold ${data.period.days === days ? "bg-accent-2-soft text-accent-2-text" : "text-muted-foreground hover:bg-muted"}`}>
                {days} {t("days")}
              </a>
            ))}
          </nav>
          <Button variant="outline" asChild>
            <a href="/integrations#meta-ads">{t("manageConnection")} <ArrowUpRight className="size-4" /></a>
>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
          </Button>
        </div>
      </div>
      <MetaDataQuality
        coverageRate={minimumCoverage}
        missingDates={data.missingMetricDates}
        consolidatedThrough={data.period.consolidatedThrough}
        initialSyncStatus={data.connection.initialSyncStatus}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t("spend")} value={spendCents === null ? "—" : formatEur(spendCents / 100, locale)} detail={`${impressions === null ? "—" : number(impressions, locale)} ${t("impressions")}`} comparison={trendLabel(spendCents, comparisonSpendCents, locale)} provenance={metricProvenance("brute", spendCents !== null, locale)} icon={<Eye className="size-4" />} />
        <Kpi label={t("linkCtr")} value={ctr === null ? "—" : formatPercent(ctr, locale)} detail={`${linkClicks === null ? "—" : number(linkClicks, locale)} ${t("linkClicks")}`} comparison={trendLabel(ctr, comparisonCtr, locale)} provenance={metricProvenance(rawCtr !== null ? "brute" : "dérivée", ctr !== null, locale)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label={t("linkCpc")} value={cpc === null ? "—" : formatEur(cpc, locale)} detail={t("outboundCost")} comparison={trendLabel(cpc, comparisonCpc, locale)} provenance={metricProvenance(rawCpcCents !== null ? "brute" : "dérivée", cpc !== null, locale)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label={t("costPerLead")} value={!cplApplicable || cpl === null ? "—" : formatEur(cpl, locale)} detail={[cplDetail, cplTargetCount > 0 ? t("targetCount", { count: number(cplTargetCount, locale) }) : null].filter(Boolean).join(" · ")} comparison={cplApplicable ? trendLabel(cpl, comparisonCpl, locale) : t("notApplicable")} provenance={metricProvenance("dérivée", cplApplicable && cpl !== null, locale)} icon={<UserPlus className="size-4" />} />
        <Kpi label={t("cpm")} value={cpm === null ? "—" : formatEur(cpm, locale)} detail={t("cpmDetail")} comparison={trendLabel(cpm, comparisonCpm, locale)} provenance={metricProvenance(rawCpmCents !== null ? "brute" : "dérivée", cpm !== null, locale)} icon={<BarChart3 className="size-4" />} />
      </div>

<<<<<<< HEAD
      <FunnelCard totals={data.totals} campaignType={primaryType} instagramObservation={data.instagramObservation} frequencySaturationThreshold={data.frequencySaturationThreshold} />

      <div className="sticker-card overflow-x-auto" tabIndex={0} role="region" aria-label="Tableau des campagnes Meta">
        <MetaCampaignsTable
          campaigns={data.campaigns}
          periodQuery={periodQuery}
          canManageCampaigns={canManageCampaigns}
          instagramFollowerCount={data.instagramFollowerCount}
          instagramFollowerCountUpdatedAt={data.instagramFollowerCountUpdatedAt}
        />
=======
      {data.connection.initialSyncStatus !== "completed" && (
        <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-4 py-3 text-sm text-state-caution">
          {t("preparing", { status: data.connection.initialSyncStatus ?? "—" })}
        </div>
      )}

      <FunnelCard totals={data.totals} campaignType={primaryType} instagramObservation={data.instagramObservation} frequencySaturationThreshold={data.frequencySaturationThreshold} />

      <div className="sticker-card overflow-x-auto" tabIndex={0} role="region" aria-label={t("campaignTableAria")}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-bold">{t("campaigns")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("campaignsHelp")}</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{t("campaignCount", { count: number(data.campaigns.length, locale) })}</span>
        </div>
        {data.campaigns.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("noCampaigns")}</p>
        ) : (
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">{t("campaign")}</th>
                <th className="px-5 py-3">{t("type")}</th>
                <th className="px-5 py-3 text-right">{t("spend")}</th>
                <th className="px-5 py-3 text-right">{t("linkCtr")}</th>
                <th className="px-5 py-3 text-right">{t("leads")}</th>
                <th className="px-5 py-3 text-right">CPL / target</th>
                <th className="px-5 py-3 text-right">ROAS / target</th>
                <th className="px-5 py-3 text-right">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((campaign) => {
                const campaignImpressions = metricValue(campaign.metrics, "impressions");
                const campaignLinkClicks = metricValue(campaign.metrics, "linkClicks");
                const campaignCtr = campaignImpressions !== null && campaignLinkClicks !== null ? ratio(campaignLinkClicks, campaignImpressions) : null;
                const campaignSpend = metricValue(campaign.metrics, "spendCents");
                const campaignLeads = metricValue(campaign.metrics, "leads");
                const campaignCpl = campaignSpend !== null && campaignLeads !== null && campaignLeads > 0 ? campaignSpend / campaignLeads / 100 : null;
                const campaignPurchaseValue = metricValue(campaign.metrics, "purchaseValueCents");
                const instagramGrowth = campaign.campaignType === "instagram_profile_growth";
                const campaignRoas = !instagramGrowth && campaignPurchaseValue !== null && campaignSpend !== null && campaignSpend > 0 ? campaignPurchaseValue / campaignSpend : null;
                const targetCpaEuros = campaign.targets?.targetCpaCents === null || campaign.targets?.targetCpaCents === undefined ? null : campaign.targets.targetCpaCents / 100;
                const targetCpaGap = targetVarianceLabel(campaignCpl, targetCpaEuros);
                const targetRoas = campaign.targets?.targetRoas ?? null;
                const targetRoasGap = targetVarianceLabel(campaignRoas, targetRoas);
                const conversionGoal = conversionGoalLabel(campaign.conversionGoal, locale);
                return (
                  <tr key={campaign.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-5 py-4">
                        <a href={`/acquisition/ads/meta/${campaign.id}?meta_days=${data.period.days}`} className="font-bold underline-offset-4 hover:underline">
                        {campaign.name}
                      </a>
                        <p className="mt-1 text-xs text-muted-foreground">{campaign.latestDate ? t("latestDay", { date: campaign.latestDate }) : t("noMetric")}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{typeLabel(campaign.campaignType, locale)}</span>
                      {conversionGoal && (campaign.campaignType === "vsl" || campaign.campaignType === "webinar") && <span className="mt-1 block text-xs text-muted-foreground">{t("objective", { value: conversionGoal })}</span>}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <TableMetric value={campaignSpend === null ? "—" : formatEur(campaignSpend / 100, locale)} provenance={metricProvenance("brute", campaignSpend !== null, locale)} />
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <TableMetric value={campaignCtr === null ? "—" : formatPercent(campaignCtr, locale)} provenance={metricProvenance("dérivée", campaignCtr !== null, locale)} />
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <TableMetric value={campaignLeads === null ? "—" : number(campaignLeads, locale)} provenance={metricProvenance("brute", campaignLeads !== null, locale)} />
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <TableMetric
                        value={instagramGrowth || campaignCpl === null ? "—" : formatEur(campaignCpl, locale)}
                        provenance={metricProvenance("dérivée", !instagramGrowth && campaignCpl !== null, locale)}
                        detail={instagramGrowth ? t("notApplicableFollower") : undefined}
                      />
                      {!instagramGrowth && targetCpaEuros !== null && <span className="block text-xs text-muted-foreground">{t("target", { value: formatEur(targetCpaEuros, locale), gap: targetCpaGap ?? t("gapUnavailable") })}</span>}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <TableMetric
                        value={instagramGrowth || campaignRoas === null ? "—" : campaignRoas.toFixed(2) + "×"}
                        provenance={metricProvenance("dérivée", !instagramGrowth && campaignRoas !== null, locale)}
                        detail={instagramGrowth ? t("notApplicableProfile") : undefined}
                      />
                      {!instagramGrowth && targetRoas !== null && <span className="block text-xs text-muted-foreground">{t("target", { value: `${targetRoas.toFixed(2)}×`, gap: targetRoasGap ?? t("gapUnavailable") })}</span>}
                    </td>
                    <td className="px-5 py-4 text-right text-xs font-bold text-muted-foreground">{statusLabel(campaign.effectiveStatus, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
      </div>
    </section>
  );
}
