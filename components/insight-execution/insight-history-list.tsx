"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  decideInsight,
  materializeInsight,
} from "@/lib/insight-execution/actions";
import type {
  InsightHistoryItem,
  InitiativeSummary,
} from "@/lib/insight-execution/types";
import { measurementEvidenceLabel } from "@/lib/insight-execution/measurement";
import { formatEur } from "@/lib/currency";

import {
  ExistingInitiativeLink,
  InsightLaunchDialog,
} from "./insight-launch-dialog";
import { InitiativeControls } from "./initiative-controls";

type Member = { id: string; name: string; roles: string[] };
type Project = { id: string; name: string };

const DECISION_CLASS: Record<InsightHistoryItem["decision"], string> = {
  todo: "bg-state-caution-bg text-state-caution",
  launched: "bg-accent-soft text-accent-text",
  later: "bg-muted text-muted-foreground",
  dismissed: "bg-muted text-muted-foreground",
  completed: "bg-state-healthy-bg text-state-healthy",
};

function decisionLabel(decision: InsightHistoryItem["decision"], locale: string): string {
  if (locale === "en") {
    return decision === "todo" ? "To do" : decision === "launched" ? "Launched" : decision === "later" ? "Later" : decision === "dismissed" ? "Dismissed" : "Completed";
  }
  return decision === "todo" ? "À traiter" : decision === "launched" ? "Lancé" : decision === "later" ? "Plus tard" : decision === "dismissed" ? "Écarté" : "Terminé";
}

function sourceLabel(source: string, locale: string): string {
  const labels = locale === "en"
    ? { diagnostic_metric: "Diagnostic · metric", diagnostic_lever: "Diagnostic · lever", funnel_stage: "Funnel", content_recommendation: "Content", copilote: "Copilot", meta_ads: "Meta Ads" }
    : { diagnostic_metric: "Diagnostic · métrique", diagnostic_lever: "Diagnostic · levier", funnel_stage: "Funnel", content_recommendation: "Contenu", copilote: "Copilote", meta_ads: "Meta Ads" };
  return labels[source as keyof typeof labels] ?? source.replaceAll("_", " ");
}

function initiativeStatusLabel(status: InitiativeSummary["status"], locale: string): string {
  if (locale === "en") {
    return status === "planned" ? "Planned" : status === "in_progress" ? "In progress" : status === "paused" ? "Paused" : status === "completed" ? "Completed" : status === "awaiting_measurement" ? "Awaiting measurement" : status === "measured" ? "Result measured" : "Dismissed";
  }
  return status === "planned" ? "Planifiée" : status === "in_progress" ? "En cours" : status === "paused" ? "En pause" : status === "completed" ? "Terminée" : status === "awaiting_measurement" ? "En attente de mesure" : status === "measured" ? "Résultat mesuré" : "Écartée";
}

function numberFromSnapshot(
  item: InsightHistoryItem,
  key: string,
): number | null {
  const value = item.snapshot[key];
  return typeof value === "number" ? value : null;
}

function textFromSnapshot(item: InsightHistoryItem, key: string): string | null {
  const value = item.snapshot[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function ResultLine({ initiative }: { initiative: InitiativeSummary }) {
  const locale = useLocale();
  const t = useTranslations("app.insights");
  const measurement = initiative.latestMeasurement;
  if (!measurement) return null;
  const measuredAt = measurement.measuredAt
    ? new Date(measurement.measuredAt).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const versionLabel = measurement.version ? ` · v${measurement.version}` : "";
  const measurementMeta = measuredAt
      ? ` · ${t("measuredOn", { date: measuredAt })}${versionLabel}`
    : "";
  const cashVariation =
    measurement.cashImpactEur !== null
      ? ` · ${locale === "en" ? "observed revenue change" : "variation de CA observée"}: ${measurement.cashImpactEur >= 0 ? "+" : ""}${formatEur(measurement.cashImpactEur, locale)}`
      : "";
  if (measurement.evidence === "qualitative")
    return (
      <p className="text-xs text-muted-foreground">
        {measurementEvidenceLabel(measurement.evidence, locale)} : {measurement.note}
        {measurementMeta}
      </p>
    );
  if (
    measurement.beforeValue !== null &&
    measurement.afterValue !== null &&
    measurement.unit === "fraction"
  ) {
    const before = Math.round(measurement.beforeValue * 100);
    const after = Math.round(measurement.afterValue * 100);
    const delta = Math.round((measurement.deltaValue ?? 0) * 100);
    const resultLabel = `${measurementEvidenceLabel(measurement.evidence, locale)} · ${locale === "en" ? "before" : "avant"} ${before}% · ${locale === "en" ? "after" : "après"} ${after}% · ${delta >= 0 ? "+" : ""}${delta} ${locale === "en" ? "point(s)" : "point(s)"} · ${measurement.beforePeriodStart} → ${measurement.afterPeriodEnd}${cashVariation}${measurementMeta}`;
    return <p className="text-xs text-muted-foreground">{resultLabel}</p>;
  }
  if (
    measurement.beforeValue !== null &&
    measurement.afterValue !== null &&
    measurement.unit === "eur"
  ) {
    const resultLabel = `${measurementEvidenceLabel(measurement.evidence, locale)} · ${locale === "en" ? "before" : "avant"} ${formatEur(measurement.beforeValue, locale)} · ${locale === "en" ? "after" : "après"} ${formatEur(measurement.afterValue, locale)} · ${measurement.beforePeriodStart} → ${measurement.afterPeriodEnd}${cashVariation}${measurementMeta}`;
    return <p className="text-xs text-muted-foreground">{resultLabel}</p>;
  }
  if (measurement.cashImpactEur !== null) {
    return (
      <p className="text-xs text-muted-foreground">
        {measurementEvidenceLabel(measurement.evidence, locale)} :{" "}
        {measurement.cashImpactEur >= 0 ? "+" : ""}
        {formatEur(measurement.cashImpactEur, locale)}
        {measurementMeta}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {measurementEvidenceLabel(measurement.evidence, locale)} · {t("noAmount")}
    </p>
  );
}

function BaselineLine({ initiative }: { initiative: InitiativeSummary }) {
  const locale = useLocale();
  const t = useTranslations("app.insights");
  const baseline = initiative.baseline;
  if (!baseline)
    return (
      <p className="text-xs text-muted-foreground">
        {t("measurementUnavailable")}
      </p>
    );
  const value =
    baseline.unit === "fraction"
      ? `${Math.round(baseline.value * 100)}%`
      : baseline.unit === "eur"
        ? formatEur(baseline.value, locale)
        : `${baseline.value}`;
  return (
    <p className="text-xs text-muted-foreground">
      {t("baseline", { value, start: baseline.periodStart, end: baseline.periodEnd })}
    </p>
  );
}

function DecisionButtons({ insight }: { insight: InsightHistoryItem }) {
  const t = useTranslations("app.insights");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(decision: "todo" | "later" | "dismissed") {
    setError(null);
    startTransition(async () => {
      let insightId = insight.id;
      if (insight.legacy) {
        const materialized = await materializeInsight({
          sourceType: insight.sourceType,
          sourceId: insight.sourceId,
        });
        if (materialized.error || !materialized.insightId) {
          setError(
            materialized.error ?? t("actionFailed"),
          );
          return;
        }
        insightId = materialized.insightId;
      }
      const result = await decideInsight({ insightId, decision });
      if (result.error) setError(result.error);
      else window.location.reload();
    });
  }

  if (insight.decision === "completed") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {insight.decision === "dismissed" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => update("todo")}
        >
          {t("reactivate")}
        </Button>
      )}
      {insight.decision !== "dismissed" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => update("later")}
        >
          {t("later")}
        </Button>
      )}
      {insight.decision !== "dismissed" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => update("dismissed")}
        >
          {t("dismiss")}
        </Button>
      )}
      {error && (
        <span className="text-xs text-state-critical" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function HistoryCard({
  insight,
  members,
  projects,
  canAssign,
  onLaunched,
}: {
  insight: InsightHistoryItem;
  members: Member[];
  projects: Project[];
  canAssign: boolean;
  onLaunched: (insight: InsightHistoryItem) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("app.insights");
  const metricCurrent = numberFromSnapshot(insight, "currentRatePercent");
  const metricBenchmark = numberFromSnapshot(insight, "benchmarkRatePercent");
  const metaAction = insight.sourceType === "meta_ads" ? textFromSnapshot(insight, "recommendedAction") : null;
  const metaCriterion = insight.sourceType === "meta_ads" ? textFromSnapshot(insight, "successCriterion") : null;
  const metaCampaignId = insight.sourceType === "meta_ads" ? textFromSnapshot(insight, "campaignId") : null;
  return (
    <article
      id={insight.initiative ? `insight-${insight.initiative.id}` : undefined}
      className="scroll-mt-6 sticker-card flex flex-col gap-3 p-5"
      data-testid="insight-history-item"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {insight.sourceLabel ?? sourceLabel(insight.sourceType, locale)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${DECISION_CLASS[insight.decision]}`}
            >
              {decisionLabel(insight.decision, locale)}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold">{insight.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <time
            className="text-xs text-muted-foreground"
            dateTime={insight.generatedAt}
          >
            {new Date(insight.generatedAt).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
          {insight.resumeAt && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("resumeOn", { date: new Date(`${insight.resumeAt}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) })}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{insight.insightText}</p>

      {insight.sourceType === "meta_ads" && (
        <div className="grid gap-3 rounded-[var(--radius-control)] border border-border bg-muted p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("exactAction")}</p>
            <p className="mt-1">{metaAction ?? insight.insightText}</p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("successCriterion")}</p>
            <p className="mt-1">{metaCriterion ?? t("recheckMetric")}</p>
          </div>
          {metaCampaignId && (
            <a href={`/acquisition/ads/meta/${encodeURIComponent(metaCampaignId)}`} className="font-bold underline-offset-4 hover:underline">
              {t("openCampaign")}
            </a>
          )}
        </div>
      )}

      {(metricCurrent !== null ||
        (insight.impactProjection?.amountEur !== null &&
          insight.impactProjection?.amountEur !== undefined)) && (
        <div className="flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
          {metricCurrent !== null && metricBenchmark !== null && (
            <span className="rounded-full bg-muted px-2.5 py-1">
              {t("currentVsBenchmark", { current: metricCurrent, benchmark: metricBenchmark })}
            </span>
          )}
          {insight.impactProjection?.amountEur !== null &&
            insight.impactProjection?.amountEur !== undefined && (
              <span className="rounded-full bg-muted px-2.5 py-1">
                {t("takeover", { value: formatEur(insight.impactProjection.amountEur, locale) })}
              </span>
            )}
        </div>
      )}

      {insight.initiative ? (
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              {initiativeStatusLabel(insight.initiative.status, locale)}
            </p>
            {insight.initiative.isWeeklyFocus && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text">
                {t("weeklyPriority")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {insight.initiative.assignedMember
              ? t("owner", { name: insight.initiative.assignedMember.name })
              : t("you")}
            {insight.initiative.dueDate
              ? ` · ${t("dueDate", { date: new Date(`${insight.initiative.dueDate}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) })}`
              : ""}
          </p>
          <ResultLine initiative={insight.initiative} />
          <BaselineLine initiative={insight.initiative} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ExistingInitiativeLink initiative={insight.initiative} />
            <InitiativeControls
              initiative={insight.initiative}
              members={members}
              canAssign={canAssign}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {insight.decision !== "dismissed" &&
            insight.decision !== "completed" && (
            <InsightLaunchDialog
              insight={insight}
              members={members}
              projects={projects}
              canAssign={canAssign}
              onLaunched={onLaunched}
            />
          )}
          <DecisionButtons insight={insight} />
        </div>
      )}
    </article>
  );
}

export function InsightHistoryList({
  items,
  members,
  projects,
  canAssign,
}: {
  items: InsightHistoryItem[];
  members: Member[];
  projects: Project[];
  canAssign: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("app.insights");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  function handleLaunched(updatedInsight: InsightHistoryItem) {
    setLocalItems((currentItems) => {
      const exactIndex = currentItems.findIndex(
        (item) => item.id === updatedInsight.id,
      );
      if (exactIndex >= 0) {
        return currentItems.map((item, index) =>
          index === exactIndex ? updatedInsight : item,
        );
      }

      // Legacy funnel insights get a new normalized id during materialization.
      // Replace the visible legacy card by its normalized server projection.
      const legacyIndex = currentItems.findIndex(
        (item) =>
          item.legacy &&
          item.sourceType === updatedInsight.sourceType &&
          item.sourceId === updatedInsight.sourceId,
      );
      if (legacyIndex < 0) return currentItems;
      return currentItems.map((item, index) =>
        index === legacyIndex ? updatedInsight : item,
      );
    });
  }

  const sources = useMemo(
    () => [...new Set(localItems.map((item) => item.sourceType))],
    [localItems],
  );
  const filtered = localItems.filter(
    (item) =>
      (decisionFilter === "all" || item.decision === decisionFilter) &&
      (sourceFilter === "all" || item.sourceType === sourceFilter),
  );
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <div id="insight-history" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="insight-history-heading" className="text-lg font-bold">
            {locale === "en" ? "Your tracked insights" : "Tes insights suivis"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("historyHelp")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="insight-decision-filter">
            {locale === "en" ? "Filter by status" : "Filtrer par statut"}
          </label>
          <select
            id="insight-decision-filter"
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-xs font-bold outline-none focus-visible:border-accent"
          >
            <option value="all">{t("filterAll")}</option>
            <option value="todo">{t("filterTodo")}</option>
            <option value="launched">{t("filterLaunched")}</option>
            <option value="later">{t("filterLater")}</option>
            <option value="completed">{t("filterCompleted")}</option>
            <option value="dismissed">{t("filterDismissed")}</option>
          </select>
          <label className="sr-only" htmlFor="insight-source-filter">
            {locale === "en" ? "Filter by source" : "Filtrer par source"}
          </label>
          <select
            id="insight-source-filter"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-xs font-bold outline-none focus-visible:border-accent"
          >
            <option value="all">{locale === "en" ? "All sources" : "Toutes les sources"}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {sourceLabel(source, locale)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noFilterMatches")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => (
            <HistoryCard
              key={`${item.sourceType}:${item.sourceId}:${item.id}`}
              insight={item}
              members={members}
              projects={projects}
              canAssign={canAssign}
              onLaunched={handleLaunched}
            />
          ))}
        </div>
      )}

      {filtered.length > 6 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowAll((value) => !value)}
          className="self-start"
        >
          {showAll ? t("showFewer") : t("otherInsights", { count: filtered.length - 6 })}
        </Button>
      )}
    </div>
  );
}
