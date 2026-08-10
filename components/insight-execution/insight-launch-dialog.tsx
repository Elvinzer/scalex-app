"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getInsightLaunchOptions, launchInsight, materializeInsight } from "@/lib/insight-execution/actions";
import type { InsightHistoryItem, InitiativeSummary } from "@/lib/insight-execution/types";

type Member = { id: string; name: string; roles: string[] };

type AdoptionDetails = {
  actionText: string;
  successCriterion: string;
  metricText: string;
  sourceLabel: string;
  sourceHref: string | null;
};

function snapshotText(insight: InsightHistoryItem, key: string): string | null {
  const value = insight.snapshot[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metaAdoptionDetails(insight: InsightHistoryItem, locale: string): AdoptionDetails | null {
  if (insight.sourceType !== "meta_ads") return null;

  const metricKey = snapshotText(insight, "metricKey") ?? (locale === "en" ? "Meta metric" : "métrique Meta");
  const currentValue = insight.snapshot.currentValue;
  const value = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? metricKey === "cash_per_lead" || metricKey === "retargeting_window_cpa"
      ? `${(currentValue / 100).toFixed(2)} €`
      : metricKey.endsWith("_rate") || metricKey === "profile_to_follow_rate" || metricKey === "instagram_engagement_per_follower"
        ? `${(currentValue * 100).toFixed(1)} %`
        : metricKey === "frequency"
          ? `${currentValue.toFixed(1)}×`
          : `${Math.round(currentValue)}`
    : "—";
  const sampleSize = typeof insight.snapshot.sampleSize === "number" ? Math.round(insight.snapshot.sampleSize) : null;
  const period = insight.periodStart && insight.periodEnd ? `${insight.periodStart} → ${insight.periodEnd}` : locale === "en" ? "Period unavailable" : "période indisponible";
  const campaignId = snapshotText(insight, "campaignId");
  const campaignName = snapshotText(insight, "campaignName") ?? (locale === "en" ? "campaign" : "campagne");
  const actionText = snapshotText(insight, "recommendedAction") ?? insight.insightText;
  const successCriterion = snapshotText(insight, "successCriterion") ?? (locale === "en" ? "Check this metric again over a comparable period after the action." : "Recontrôler cette métrique sur une période comparable après l’action.");
  const metricLabel = metricKey.replaceAll("_", " ");

  return {
    actionText,
    successCriterion,
    metricText: `${metricLabel} : ${value} · ${period}${sampleSize === null ? "" : ` · ${sampleSize} observation(s)`}`,
    sourceLabel: insight.sourceLabel ?? `Meta Ads · ${campaignName}`,
    sourceHref: campaignId ? `/acquisition/ads/meta/${encodeURIComponent(campaignId)}` : null,
  };
}

export function InsightLaunchDialog({
  insight,
  members,
  projects,
  canAssign,
  onLaunched,
  triggerLabel,
  triggerPrimary = false,
  adoptionDetails,
}: {
  insight: InsightHistoryItem;
  members: Member[];
  projects: { id: string; name: string }[];
  canAssign: boolean;
  onLaunched?: (insight: InsightHistoryItem) => void;
  triggerLabel?: string;
  triggerPrimary?: boolean;
  adoptionDetails?: AdoptionDetails | null;
}) {
  const locale = useLocale();
  const t = useTranslations("app.insights");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"todo" | "project">("todo");
  const [targetId, setTargetId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTeamMemberId, setAssignedTeamMemberId] = useState("");
  const [makeWeeklyFocus, setMakeWeeklyFocus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableMembers, setAvailableMembers] = useState(members);
  const [availableProjects, setAvailableProjects] = useState(projects);
  const [canAssignCurrent, setCanAssignCurrent] = useState(canAssign);
  const [isPending, startTransition] = useTransition();
  const details = adoptionDetails ?? metaAdoptionDetails(insight, locale);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next || availableProjects.length > 0 || availableMembers.length > 0) return;
    const options = await getInsightLaunchOptions();
    if (options.error) {
      setError(options.error);
      return;
    }
    setAvailableMembers(options.members ?? []);
    setAvailableProjects(options.projects ?? []);
    setCanAssignCurrent(options.canAssign ?? false);
  }

  function handleLaunch() {
    setError(null);
    startTransition(async () => {
      let insightId = insight.legacy ? undefined : insight.id;
      if (!insightId) {
        const materialized = await materializeInsight({ sourceType: insight.sourceType, sourceId: insight.sourceId });
        if (materialized.error || !materialized.insightId) {
          setError(materialized.error ?? "Impossible de conserver cet insight.");
          return;
        }
        insightId = materialized.insightId;
      }

      const result = await launchInsight({
        insightId,
        targetType,
        targetId: targetType === "project" ? targetId || null : targetId || null,
        dueDate: dueDate || null,
        assignedTeamMemberId: canAssignCurrent ? assignedTeamMemberId || null : null,
        makeWeeklyFocus,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.insight) onLaunched?.(result.insight);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void handleOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="min-h-11" variant={triggerPrimary ? "default" : "outline"}>
          {triggerLabel ?? t("launch")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[var(--radius-card)] max-sm:p-5 sm:max-h-[85vh]">
        <DialogTitle className="text-lg font-bold">{t("launchTitle")}</DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">{t("launchHelp")}</p>

        {details && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted p-4 text-sm">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("journalContent")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("exactAction")}</p>
                <p className="mt-1 leading-5">{details.actionText}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("successCriterion")}</p>
                <p className="mt-1 leading-5">{details.successCriterion}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("frozenMetric")}</p>
                <p className="mt-1 leading-5">{details.metricText}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("source")}</p>
                <p className="mt-1 leading-5">{details.sourceLabel}</p>
                {details.sourceHref && (
                  <a href={details.sourceHref} className="mt-1 inline-block font-bold underline-offset-4 hover:underline">
                    {t("openCampaign")}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("followWhere")}</span>
            <select
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value === "project" ? "project" : "todo");
                setTargetId("");
              }}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
            >
              <option value="todo">{t("shortTask")}</option>
              <option value="project">{t("existingProject")}</option>
            </select>
          </label>

          {targetType === "project" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("project")}</span>
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">{t("chooseProject")}</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              {availableProjects.length === 0 && <span className="text-xs text-muted-foreground">{t("createProjectFirst")}</span>}
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("dueOptional")}</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
            />
          </label>

          {canAssignCurrent && availableMembers.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("ownerOptional")}</span>
              <select
                value={assignedTeamMemberId}
                onChange={(event) => setAssignedTeamMemberId(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">{t("myself")}</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}{member.roles.length > 0 ? ` · ${member.roles.join(", ")}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          {(!canAssignCurrent || availableMembers.length === 0) && (
            <p className="text-sm text-muted-foreground">{t("ownerDefault")}</p>
          )}

          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" checked={makeWeeklyFocus} onChange={(event) => setMakeWeeklyFocus(event.target.checked)} className="mt-0.5 size-5" />
            <span><span className="font-bold">{t("weeklyFocus")}</span><span className="block text-xs text-muted-foreground">{t("oneActive")}</span></span>
          </label>

          {error && <p className="text-sm text-state-critical" role="alert">{error}</p>}
          <Button type="button" className="min-h-11" onClick={handleLaunch} disabled={isPending || (targetType === "project" && !targetId)}>
            {isPending ? t("launching") : t("launch")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExistingInitiativeLink({ initiative }: { initiative: InitiativeSummary }) {
  const t = useTranslations("app.insights");
  return (
    <a href={initiative.projectId || initiative.todoId ? "/journal" : "/diagnostic#insight-history"} className="text-xs font-bold text-muted-foreground hover:underline">
      {initiative.projectId || initiative.todoId ? t("openJournal") : t("viewAction")}
    </a>
  );
}
