"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { InsightLaunchDialog } from "@/components/insight-execution/insight-launch-dialog";
import type { InsightDecision, InsightHistoryItem, InsightSnapshot } from "@/lib/insight-execution/types";

type Props = {
  id: string;
  title: string;
  insightText: string;
  decision: InsightDecision;
  snapshot: InsightSnapshot;
};

export function MetaInsightCard({ id, title, insightText, decision, snapshot }: Props) {
  const t = useTranslations("app.ads.detail");
  const [launched, setLaunched] = useState(decision === "launched" || decision === "completed");
  const dismissed = decision === "dismissed";
  const provenance = snapshot.provenance;
  const snapshotText = (key: string): string | null => {
    const value = snapshot[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  const priority = snapshotText("priority");
  const evidence = snapshotText("evidence");
  const diagnosis = snapshotText("diagnosis");
  const recommendedAction = snapshotText("recommendedAction");
  const expectedImpact = snapshotText("expectedImpact");
  const successCriterion = snapshotText("successCriterion") ?? t("successCriterionDefault");
  const confidence = snapshotText("confidence");
  const sourceCoverage = snapshotText("sourceCoverage");
  const metricKey = snapshotText("metricKey") ?? t("metaMetric");
  const currentValue = snapshot.currentValue;
  const metricValue = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? metricKey === "cash_per_lead" || metricKey === "retargeting_window_cpa" || metricKey === "webinar_cost_per_participant"
      ? `${(currentValue / 100).toFixed(2)} €`
      : metricKey.endsWith("_rate") || metricKey === "profile_to_follow_rate" || metricKey === "instagram_engagement_per_follower"
        ? `${(currentValue * 100).toFixed(1)} %`
        : metricKey === "frequency"
          ? `${currentValue.toFixed(1)}×`
          : `${Math.round(currentValue)}`
    : "—";
  const metricPeriod = snapshotText("periodStart") && snapshotText("periodEnd")
    ? `${snapshotText("periodStart")} → ${snapshotText("periodEnd")}`
    : t("periodUnavailable");
  const sampleSize = typeof snapshot.sampleSize === "number" ? ` · ${t("observations", { count: Math.round(snapshot.sampleSize) })}` : "";
  const readableCalculation = (value: string): string => value === "derivee" ? t("derived") : value === "brute" ? t("raw") : value;
  const readableAttribution = (value: string): string => {
    if (value === "directe") return t("direct");
    if (value === "jointe") return t("joined");
    if (value === "estimee") return t("estimated");
    if (value === "non_rattachee") return t("unattached");
    if (value === "indisponible") return t("unavailable");
    return value;
  };
  const provenanceText = (() => {
    if (typeof provenance !== "object" || provenance === null || !("attribution" in provenance) || typeof provenance.attribution !== "string") {
      return t("derivedInsight");
    }
    const source = "source" in provenance && typeof provenance.source === "string" ? provenance.source : "meta";
    const calculation = "calculation" in provenance && typeof provenance.calculation === "string" ? provenance.calculation : "derivee";
    return t("provenance", { source, calculation: readableCalculation(calculation), attribution: readableAttribution(provenance.attribution) });
  })();

  const historyInsight: InsightHistoryItem = {
    id,
    sourceType: "meta_ads",
    sourceId: `${snapshotText("campaignId") ?? id}:${snapshotText("ruleKey") ?? id}`,
    title,
    insightText,
    sourceLabel: snapshotText("campaignName") ? `Meta Ads · ${snapshotText("campaignName")}` : "Meta Ads",
    decision,
    generatedAt: new Date().toISOString(),
    resumeAt: null,
    periodStart: snapshotText("periodStart"),
    periodEnd: snapshotText("periodEnd"),
    snapshot,
    impactProjection: null,
    initiative: null,
    legacy: false,
  };

  return (
    <article className="sticker-card p-5">
      <div className="flex items-start gap-3">
        {launched ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-state-healthy" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-accent-2" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-bold">{title}</h3>
            {launched && <span className="rounded-full bg-state-healthy-bg px-2.5 py-1 text-xs font-bold text-state-healthy">{t("inJournal")}</span>}
            {dismissed && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{t("dismissed")}</span>}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{insightText}</p>
          <div className="mt-4 grid gap-3 rounded-[var(--radius-control)] border border-border bg-muted p-4 text-sm sm:grid-cols-2">
            {evidence && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("evidence")}</p><p className="mt-1">{evidence}</p></div>}
            {diagnosis && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("diagnosis")}</p><p className="mt-1">{diagnosis}</p></div>}
            {recommendedAction && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("recommendedAction")}</p><p className="mt-1">{recommendedAction}</p></div>}
            <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("successCriterion")}</p><p className="mt-1">{successCriterion}</p></div>
            {expectedImpact && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("expectedImpact")}</p><p className="mt-1">{expectedImpact}</p></div>}
          </div>
          <p className="mt-3 text-xs font-bold text-muted-foreground">{t("baselineMetric", { metric: metricKey.replaceAll("_", " "), value: metricValue, period: metricPeriod, sample: sampleSize })}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
            {priority && <span>{t("priority")}: {priority === "high" ? t("high") : priority === "medium" ? t("medium") : t("low")}</span>}
            {confidence && <span>{t("confidence")}: {confidence === "high" ? t("high") : confidence === "medium" ? t("medium") : t("low")}</span>}
            {sourceCoverage && <span>{t("sources")}: {sourceCoverage}</span>}
          </div>
          <p className="mt-3 text-xs font-bold text-muted-foreground">{provenanceText}</p>
          {dismissed && <p className="mt-4 text-xs font-bold text-muted-foreground">{t("dismissedHelp")}</p>}
          {!launched && !dismissed && (
            <div className="mt-4">
              <InsightLaunchDialog
                insight={historyInsight}
                members={[]}
                projects={[]}
                canAssign={false}
                triggerLabel={t("addToJournal")}
                onLaunched={() => setLaunched(true)}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
