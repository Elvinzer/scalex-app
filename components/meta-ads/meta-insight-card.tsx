"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
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
  const [launched, setLaunched] = useState(decision === "launched" || decision === "completed");
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
  const successCriterion = snapshotText("successCriterion") ?? "Recontrôler cette métrique sur une période comparable après l’action.";
  const confidence = snapshotText("confidence");
  const sourceCoverage = snapshotText("sourceCoverage");
  const metricKey = snapshotText("metricKey") ?? "métrique Meta";
  const currentValue = snapshot.currentValue;
  const metricValue = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? metricKey === "cash_per_lead" || metricKey === "retargeting_window_cpa"
      ? `${(currentValue / 100).toFixed(2)} €`
      : metricKey.endsWith("_rate") || metricKey === "profile_to_follow_rate" || metricKey === "instagram_engagement_per_follower"
        ? `${(currentValue * 100).toFixed(1)} %`
        : metricKey === "frequency"
          ? `${currentValue.toFixed(1)}×`
          : `${Math.round(currentValue)}`
    : "—";
  const metricPeriod = snapshotText("periodStart") && snapshotText("periodEnd")
    ? `${snapshotText("periodStart")} → ${snapshotText("periodEnd")}`
    : "période indisponible";
  const sampleSize = typeof snapshot.sampleSize === "number" ? ` · ${Math.round(snapshot.sampleSize)} observation(s)` : "";
  const readableCalculation = (value: string): string => value === "derivee" ? "dérivée" : value === "brute" ? "brute" : value;
  const readableAttribution = (value: string): string => {
    if (value === "directe") return "directe";
    if (value === "jointe") return "jointe";
    if (value === "estimee") return "estimée";
    if (value === "non_rattachee") return "non rattachée";
    if (value === "indisponible") return "indisponible";
    return value;
  };
  const provenanceText = (() => {
    if (typeof provenance !== "object" || provenance === null || !("attribution" in provenance) || typeof provenance.attribution !== "string") {
      return "Meta Ads · insight dérivé";
    }
    const source = "source" in provenance && typeof provenance.source === "string" ? provenance.source : "meta";
    const calculation = "calculation" in provenance && typeof provenance.calculation === "string" ? provenance.calculation : "derivee";
    return `Source ${source} · calcul ${readableCalculation(calculation)} · attribution ${readableAttribution(provenance.attribution)}`;
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
            {launched && <span className="rounded-full bg-state-healthy-bg px-2.5 py-1 text-xs font-bold text-state-healthy">Dans le Journal</span>}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{insightText}</p>
          <div className="mt-4 grid gap-3 rounded-[var(--radius-control)] border border-border bg-muted p-4 text-sm sm:grid-cols-2">
            {evidence && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Preuve</p><p className="mt-1">{evidence}</p></div>}
            {diagnosis && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Diagnostic probable</p><p className="mt-1">{diagnosis}</p></div>}
            {recommendedAction && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Action recommandée</p><p className="mt-1">{recommendedAction}</p></div>}
            <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Critère de réussite</p><p className="mt-1">{successCriterion}</p></div>
            {expectedImpact && <div><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Impact attendu</p><p className="mt-1">{expectedImpact}</p></div>}
          </div>
          <p className="mt-3 text-xs font-bold text-muted-foreground">Métrique de départ : {metricKey.replaceAll("_", " ")} = {metricValue} · {metricPeriod}{sampleSize}. Elle sera figée dans le Journal à l’adoption.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
            {priority && <span>Priorité : {priority === "high" ? "haute" : priority === "medium" ? "moyenne" : "basse"}</span>}
            {confidence && <span>Confiance : {confidence === "high" ? "haute" : confidence === "medium" ? "moyenne" : "basse"}</span>}
            {sourceCoverage && <span>Sources : {sourceCoverage}</span>}
          </div>
          <p className="mt-3 text-xs font-bold text-muted-foreground">{provenanceText}</p>
          {!launched && (
            <div className="mt-4">
              <InsightLaunchDialog
                insight={historyInsight}
                members={[]}
                projects={[]}
                canAssign={false}
                triggerLabel="Ajouter au Journal"
                onLaunched={() => setLaunched(true)}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
