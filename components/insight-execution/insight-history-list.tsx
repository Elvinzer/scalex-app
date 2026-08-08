"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  decideInsight,
  materializeInsight,
} from "@/lib/insight-execution/actions";
import { INITIATIVE_STATUS_LABELS } from "@/lib/insight-execution/state";
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

const DECISION_LABELS: Record<InsightHistoryItem["decision"], string> = {
  todo: "À traiter",
  launched: "Lancé",
  later: "Plus tard",
  dismissed: "Écarté",
  completed: "Terminé",
};

const DECISION_CLASS: Record<InsightHistoryItem["decision"], string> = {
  todo: "bg-state-caution-bg text-state-caution",
  launched: "bg-accent-soft text-accent-text",
  later: "bg-muted text-muted-foreground",
  dismissed: "bg-muted text-muted-foreground",
  completed: "bg-state-healthy-bg text-state-healthy",
};

const SOURCE_LABELS: Record<string, string> = {
  diagnostic_metric: "Diagnostic · métrique",
  diagnostic_lever: "Diagnostic · levier",
  funnel_stage: "Funnel",
  content_recommendation: "Contenu",
  copilote: "Copilote",
  meta_ads: "Meta Ads",
};

function numberFromSnapshot(
  item: InsightHistoryItem,
  key: string,
): number | null {
  const value = item.snapshot[key];
  return typeof value === "number" ? value : null;
}

function ResultLine({ initiative }: { initiative: InitiativeSummary }) {
  const measurement = initiative.latestMeasurement;
  if (!measurement) return null;
  const measuredAt = measurement.measuredAt
    ? new Date(measurement.measuredAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const versionLabel = measurement.version ? ` · v${measurement.version}` : "";
  const measurementMeta = measuredAt
    ? ` · mesuré le ${measuredAt}${versionLabel}`
    : "";
  const cashVariation =
    measurement.cashImpactEur !== null
      ? ` · variation de CA observée : ${measurement.cashImpactEur >= 0 ? "+" : ""}${formatEur(measurement.cashImpactEur)}`
      : "";
  if (measurement.evidence === "qualitative")
    return (
      <p className="text-xs text-muted-foreground">
        {measurementEvidenceLabel(measurement.evidence)} : {measurement.note}
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
    const resultLabel = `${measurementEvidenceLabel(measurement.evidence)} · avant ${before}% · après ${after}% · ${delta >= 0 ? "+" : ""}${delta} point${Math.abs(delta) > 1 ? "s" : ""} · ${measurement.beforePeriodStart} → ${measurement.afterPeriodEnd}${cashVariation}${measurementMeta}`;
    return <p className="text-xs text-muted-foreground">{resultLabel}</p>;
  }
  if (
    measurement.beforeValue !== null &&
    measurement.afterValue !== null &&
    measurement.unit === "eur"
  ) {
    const resultLabel = `${measurementEvidenceLabel(measurement.evidence)} · avant ${formatEur(measurement.beforeValue)} · après ${formatEur(measurement.afterValue)} · ${measurement.beforePeriodStart} → ${measurement.afterPeriodEnd}${cashVariation}${measurementMeta}`;
    return <p className="text-xs text-muted-foreground">{resultLabel}</p>;
  }
  if (measurement.cashImpactEur !== null) {
    return (
      <p className="text-xs text-muted-foreground">
        {measurementEvidenceLabel(measurement.evidence)} :{" "}
        {measurement.cashImpactEur >= 0 ? "+" : ""}
        {formatEur(measurement.cashImpactEur)}
        {measurementMeta}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {measurementEvidenceLabel(measurement.evidence)} · résultat sans montant
      attribuable.
    </p>
  );
}

function BaselineLine({ initiative }: { initiative: InitiativeSummary }) {
  const baseline = initiative.baseline;
  if (!baseline)
    return (
      <p className="text-xs text-muted-foreground">
        Baseline : aucune métrique comparable au lancement.
      </p>
    );
  const value =
    baseline.unit === "fraction"
      ? `${Math.round(baseline.value * 100)}%`
      : baseline.unit === "eur"
        ? formatEur(baseline.value)
        : `${baseline.value}`;
  return (
    <p className="text-xs text-muted-foreground">
      Baseline : {value} · {baseline.periodStart} → {baseline.periodEnd}
    </p>
  );
}

function DecisionButtons({ insight }: { insight: InsightHistoryItem }) {
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
            materialized.error ?? "Impossible de retrouver cet insight.",
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
          Réactiver
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
          Plus tard
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
          Écarter
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
  const metricCurrent = numberFromSnapshot(insight, "currentRatePercent");
  const metricBenchmark = numberFromSnapshot(insight, "benchmarkRatePercent");
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
              {insight.sourceLabel ??
                SOURCE_LABELS[insight.sourceType] ??
                insight.sourceType}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${DECISION_CLASS[insight.decision]}`}
            >
              {DECISION_LABELS[insight.decision]}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold">{insight.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <time
            className="text-xs text-muted-foreground"
            dateTime={insight.generatedAt}
          >
            {new Date(insight.generatedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
          {insight.resumeAt && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Reprise le{" "}
              {new Date(`${insight.resumeAt}T00:00:00Z`).toLocaleDateString(
                "fr-FR",
                { day: "numeric", month: "short", timeZone: "UTC" },
              )}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{insight.insightText}</p>

      {(metricCurrent !== null ||
        (insight.impactProjection?.amountEur !== null &&
          insight.impactProjection?.amountEur !== undefined)) && (
        <div className="flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
          {metricCurrent !== null && metricBenchmark !== null && (
            <span className="rounded-full bg-muted px-2.5 py-1">
              {metricCurrent}% actuellement · benchmark {metricBenchmark}%
            </span>
          )}
          {insight.impactProjection?.amountEur !== null &&
            insight.impactProjection?.amountEur !== undefined && (
              <span className="rounded-full bg-muted px-2.5 py-1">
                Projection {formatEur(insight.impactProjection.amountEur)}
              </span>
            )}
        </div>
      )}

      {insight.initiative ? (
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              {INITIATIVE_STATUS_LABELS[insight.initiative.status]}
            </p>
            {insight.initiative.isWeeklyFocus && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text">
                Priorité de la semaine
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {insight.initiative.assignedMember
              ? `Responsable : ${insight.initiative.assignedMember.name}`
              : "Responsable : toi"}
            {insight.initiative.dueDate
              ? ` · échéance ${new Date(`${insight.initiative.dueDate}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}`
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
            Tes insights suivis
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Garde la mémoire de tes décisions et reprends une action sans
            repartir de zéro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="insight-decision-filter">
            Filtrer par statut
          </label>
          <select
            id="insight-decision-filter"
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-xs font-bold outline-none focus-visible:border-accent"
          >
            <option value="all">Tous les statuts</option>
            <option value="todo">À traiter</option>
            <option value="launched">Lancé</option>
            <option value="later">Plus tard</option>
            <option value="completed">Terminé</option>
            <option value="dismissed">Écarté</option>
          </select>
          <label className="sr-only" htmlFor="insight-source-filter">
            Filtrer par source
          </label>
          <select
            id="insight-source-filter"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-xs font-bold outline-none focus-visible:border-accent"
          >
            <option value="all">Toutes les sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source] ?? source.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun insight dans ce filtre pour l&apos;instant.
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
          {showAll
            ? "Réduire"
            : `Voir les ${filtered.length - 6} autres insights`}
        </Button>
      )}
    </div>
  );
}
