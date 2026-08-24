import { ArrowUpRight, Eye, MousePointerClick, Play, UserPlus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { MetaCampaignsTable } from "@/components/meta-ads/meta-campaigns-table";
import { MetaDataQuality } from "@/components/meta-ads/meta-data-quality";
import { MetaPeriodFilter } from "@/components/meta-ads/meta-period-filter";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { safeRatio as ratio } from "@/lib/meta-ads/derived-metrics";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { DEFAULT_META_PERIOD_SELECTION, serializeMetaPeriodSelection, type MetaPeriodSelection } from "@/lib/meta-ads/protocol";
import { formatPercent } from "@/lib/setting/funnel";
import { metricValue, rawMetaMetricValue, type MetaAdsDashboard, type MetaCampaignDashboardRow, type MetaMetricKey, type MetaMetricTotals } from "@/lib/meta-ads/queries";

function number(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function Kpi({ label, value, detail, comparison, icon }: { label: string; value: string; detail: string; comparison: string; icon: React.ReactNode }) {
  return (
    <div className="sticker-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <p className="mt-2 text-xs font-bold text-muted-foreground">{comparison}</p>
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

function aggregateCampaignTotals(campaigns: MetaCampaignDashboardRow[]): MetaMetricTotals {
  const available = {} as Record<MetaMetricKey, boolean>;
  const sum = (key: MetaMetricKey): number => {
    const values = campaigns.map((campaign) => metricValue(campaign.metrics, key));
    const complete = values.length > 0 && values.every((value): value is number => value !== null);
    available[key] = complete;
    return complete ? values.reduce((total, value) => total + value, 0) : 0;
  };

  return {
    spendCents: sum("spendCents"),
    impressions: sum("impressions"),
    reach: sum("reach"),
    clicks: sum("clicks"),
    linkClicks: sum("linkClicks"),
    leads: sum("leads"),
    landingPageViews: sum("landingPageViews"),
    video3sViews: sum("video3sViews"),
    videoThruplay: sum("videoThruplay"),
    profileVisits: sum("profileVisits"),
    follows: sum("follows"),
    registrations: sum("registrations"),
    purchases: sum("purchases"),
    purchaseValueCents: sum("purchaseValueCents"),
    messages: sum("messages"),
    metaProvided: {
      ctr: null,
      cpcCents: null,
      cpmCents: null,
      rowCount: 0,
      availableRows: { ctr: 0, cpcCents: 0, cpmCents: 0 },
    },
    available,
  };
}

function sumNullable(values: Array<number | null>): number | null {
  return values.length > 0 && values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

async function FunnelCard({ totals, campaignType, campaignFollowers, campaignSales, customerAcquisitionCostBenchmarkCents, frequencySaturationThreshold }: { totals: MetaMetricTotals; campaignType: NonNullable<MetaCampaignDashboardRow["campaignType"]>; campaignFollowers: number | null; campaignSales: number | null; customerAcquisitionCostBenchmarkCents: number | null; frequencySaturationThreshold: number }) {
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
  const impressions = metricValue(totals, "impressions");
  const linkClicks = metricValue(totals, "linkClicks");
  const video3sViews = metricValue(totals, "video3sViews");
  const videoThruplay = metricValue(totals, "videoThruplay");
  const leads = metricValue(totals, "leads");
  const registrations = metricValue(totals, "registrations");
  const profileVisits = metricValue(totals, "profileVisits");
  const spendCents = metricValue(totals, "spendCents");
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
    const followerCost = spendCents !== null && campaignFollowers !== null && campaignFollowers > 0
      ? spendCents / campaignFollowers / 100
      : null;
    const customerAcquisitionCost = spendCents !== null && campaignSales !== null && campaignSales > 0
      ? spendCents / campaignSales / 100
      : null;
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
          <FunnelStep locale={locale} label={t("campaignFollowers")} value={campaignFollowers} base={profileVisits ?? 0} tone="accent" unavailableReason={t("campaignFollowersMissing")} />
          <p className="text-xs text-muted-foreground">
            {t("campaignFollowerCost", { cost: followerCost === null ? "—" : formatEur(followerCost, locale) })} · {customerAcquisitionCost === null
              ? t("customerAcquisitionCostMissing")
              : customerAcquisitionCostBenchmarkCents !== null
                ? t("customerAcquisitionCostBenchmark", { cost: formatEur(customerAcquisitionCost, locale), benchmark: formatEur(customerAcquisitionCostBenchmarkCents / 100, locale) })
                : t("customerAcquisitionCostValue", { cost: formatEur(customerAcquisitionCost, locale) })}
          </p>
          <FunnelTable locale={locale} labels={tableLabels} rows={[
            { label: t("impressions"), value: impressions, base: impressions },
            { label: t("profileVisits"), value: profileVisits, base: impressions },
            { label: t("campaignFollowers"), value: campaignFollowers, base: profileVisits, unavailableReason: t("campaignFollowersMissing") },
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

export async function MetaAdsDashboard({
  data,
  canManageCampaigns = false,
  periodSelection = DEFAULT_META_PERIOD_SELECTION,
  activeFunnel = [],
}: {
  data: MetaAdsDashboard;
  canManageCampaigns?: boolean;
  periodSelection?: MetaPeriodSelection;
  activeFunnel?: Array<{ blockKey: string; label: string; metricLabels: string[] }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("app.ads.dashboard");
  const spendCents = metricValue(data.totals, "spendCents");
  const comparisonSpendCents = metricValue(data.comparisonTotals, "spendCents");
  const impressions = metricValue(data.totals, "impressions");
  const comparisonImpressions = metricValue(data.comparisonTotals, "impressions");
  const linkClicks = metricValue(data.totals, "linkClicks");
  const comparisonLinkClicks = metricValue(data.comparisonTotals, "linkClicks");
  const leads = metricValue(data.totals, "leads");
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
  const campaignTypes = [...new Set(data.campaigns.map((campaign) => campaign.campaignType).filter((type): type is NonNullable<typeof type> => type !== null))];
  const funnelGroups = campaignTypes.map((campaignType) => {
    const campaigns = data.campaigns.filter((campaign) => campaign.campaignType === campaignType);
    const campaignFollowers = sumNullable(campaigns.map((campaign) => campaign.targets?.attributedFollowers ?? null));
    const campaignSales = sumNullable(campaigns.map((campaign) => campaign.cash?.available ? campaign.cash.sales : null));
    const benchmarkValues = Array.from(new Set(campaigns.map((campaign) => campaign.targets?.targetCpaCents ?? null).filter((value): value is number => value !== null)));
    return {
      campaignType,
      totals: aggregateCampaignTotals(campaigns),
      campaignFollowers,
      campaignSales,
      customerAcquisitionCostBenchmarkCents: benchmarkValues.length === 1 ? benchmarkValues[0]! : null,
    };
  });
  const coverageValues = data.campaigns.map((campaign) => campaign.metricCoverageRate).filter((value): value is number => value !== null && value !== undefined);
  const minimumCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : null;
  const periodQuery = serializeMetaPeriodSelection(periodSelection);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meta-ads-dashboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">{t("source", { account: data.account.name })}</p>
          <h2 id="meta-ads-dashboard-title" className="mt-1 text-xl font-bold">{t("performance", { days: data.period.days })}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("comparison", { start: data.comparisonPeriod.start, end: data.comparisonPeriod.end })}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {data.period.consolidatedThrough
              ? t("consolidated", { date: new Intl.DateTimeFormat(locale).format(new Date(`${data.period.consolidatedThrough}T12:00:00Z`)) })
              : t("consolidating")}
          </p>
          {data.missingMetricDates.length > 0 && (
            <p className="mt-1 text-xs font-bold text-state-caution" role="status">
              {t("missingDates", { dates: data.missingMetricDates.slice(0, 8).join(", "), count: data.missingMetricDates.length - 8 })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetaPeriodFilter selection={periodSelection} period={data.period} />
          <Button variant="outline" asChild>
            <Link href="/integrations#meta-ads" prefetch={true}>{t("manageConnection")} <ArrowUpRight className="size-4" /></Link>
          </Button>
        </div>
      </div>
      <MetaDataQuality
        coverageRate={minimumCoverage}
        missingDates={data.missingMetricDates}
        consolidatedThrough={data.period.consolidatedThrough}
        initialSyncStatus={data.connection.initialSyncStatus}
      />

      {activeFunnel.length > 0 && (
        <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/45 px-4 py-3" aria-label={t("businessFunnel")}>
          <p className="text-xs font-bold tracking-wide text-accent-text uppercase">{t("businessFunnel")}</p>
          <p className="mt-1 text-sm font-bold">{activeFunnel.map((block) => block.label).join(" → ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("businessFunnelHelp")}</p>
          {activeFunnel.some((block) => block.metricLabels.length > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("businessFunnelMetrics", { metrics: activeFunnel.flatMap((block) => block.metricLabels).join(" · ") })}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("spend")} value={spendCents === null ? "—" : formatEur(spendCents / 100, locale)} detail={`${impressions === null ? "—" : number(impressions, locale)} ${t("impressions")}`} comparison={trendLabel(spendCents, comparisonSpendCents, locale)} icon={<Eye className="size-4" />} />
        <Kpi label={t("linkCtr")} value={ctr === null ? "—" : formatPercent(ctr, locale)} detail={`${linkClicks === null ? "—" : number(linkClicks, locale)} ${t("linkClicks")}`} comparison={trendLabel(ctr, comparisonCtr, locale)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label={t("linkCpc")} value={cpc === null ? "—" : formatEur(cpc, locale)} detail={t("outboundCost")} comparison={trendLabel(cpc, comparisonCpc, locale)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label={t("leads")} value={leads === null ? "—" : number(leads, locale)} detail={t("leadsMeasuredShort")} comparison={trendLabel(leads, metricValue(data.comparisonTotals, "leads"), locale)} icon={<UserPlus className="size-4" />} />
      </div>

      {data.connection.initialSyncStatus !== "completed" && (
        <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-4 py-3 text-sm text-state-caution">
          {t("preparing", { status: data.connection.initialSyncStatus ?? "—" })}
        </div>
      )}

      {funnelGroups.map((group) => (
        <FunnelCard
          key={group.campaignType}
          totals={group.totals}
          campaignType={group.campaignType}
          campaignFollowers={group.campaignFollowers}
          campaignSales={group.campaignSales}
          customerAcquisitionCostBenchmarkCents={group.customerAcquisitionCostBenchmarkCents}
          frequencySaturationThreshold={data.frequencySaturationThreshold}
        />
      ))}

      <div className="sticker-card overflow-x-auto" tabIndex={0} role="region" aria-label={t("campaignTableAria")}>
        <MetaCampaignsTable
          campaigns={data.campaigns}
          periodQuery={periodQuery}
          canManageCampaigns={canManageCampaigns}
          followerCopy={{
            help: t("campaignFollowerCostHelp"),
            manual: t("campaignFollowerCostManual"),
            missing: t("campaignFollowerCostMissing"),
            measured: t("campaignFollowerCostMeasured"),
            notApplicable: t("notApplicable"),
          }}
        />
      </div>
    </section>
  );
}
