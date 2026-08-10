import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import {
  getActiveNudge,
  getFollowUpCandidate,
} from "@/lib/insight-execution/follow-up";
import { getExecutionProgress } from "@/lib/insight-execution/queries";
import type { ExecutionProgress } from "@/lib/insight-execution/types";

import { FollowUpControls } from "./initiative-controls";

function statusLabel(progress: ExecutionProgress, t: (key: string) => string): string {
  if (!progress.focus) return t("statuses.none");
  if (progress.focus.status === "measured") return t("statuses.measured");
  if (
    progress.focus.status === "completed" ||
    progress.focus.status === "awaiting_measurement"
  )
    return t("statuses.completed");
  if (progress.focus.status === "cancelled") return t("statuses.cancelled");
  return progress.focus.status === "paused" ? t("statuses.paused") : t("statuses.inProgress");
}

export async function ExecutionMomentumCard({
  accountId,
  viewerUserId,
  compact = false,
  canOpenDiagnostic = false,
}: {
  accountId: string;
  viewerUserId?: string;
  compact?: boolean;
  canOpenDiagnostic?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations("app.insights");
  const [progress, activeNudge, candidate] = await Promise.all([
    getExecutionProgress(accountId, viewerUserId),
    getActiveNudge(accountId, viewerUserId),
    getFollowUpCandidate(accountId, viewerUserId),
  ]);
  const nudge = activeNudge ?? candidate;
  const followUpHref = (initiativeId: string) =>
    canOpenDiagnostic
      ? `/diagnostic#insight-${initiativeId}`
      : "/journal#execution-momentum";
  const completedPreviousWeeks = progress.previousWeeks.reduce(
    (total, week) => total + week.completed,
    0,
  );
  const previousWeekCompleted = progress.previousWeeks[0]?.completed ?? 0;
  const milestoneMessage =
    progress.milestone === "measured"
      ? t("milestoneMeasured")
      : progress.milestone === "completed"
        ? t("milestoneCompleted")
        : progress.milestone === "launched"
          ? t("milestoneLaunched")
          : null;

  return (
    <section
      id="execution-momentum"
      className="sticker-card flex flex-col gap-4 p-5"
      aria-labelledby="execution-momentum-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("thisWeek")}
          </p>
          <h2
            id="execution-momentum-title"
            className="mt-1 text-base font-bold"
          >
            {t("momentumTitle")}
          </h2>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">
          {progress.completedThisWeek} {progress.completedThisWeek > 1 ? t("completedPlural") : t("completed")}
        </span>
      </div>

      {progress.focus ? (
        <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/40 p-4">
          <p className="text-xs font-bold text-accent-text">
            {t("activePriority", { status: statusLabel(progress, t) })}
          </p>
          <p className="mt-1 font-bold">{progress.focus.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.focus.assignedMember
              ? t("owner", { name: progress.focus.assignedMember.name })
              : t("you")}
          </p>
          <Link
            href={followUpHref(progress.focus.id)}
            className="mt-3 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            {t("openFollowUp")}
          </Link>
        </div>
      ) : (
        <div className="rounded-[var(--radius-control)] border border-dashed border-border p-4">
          <p className="text-sm font-bold">
            {t("chooseAction")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("onePriority")}
          </p>
          <Link
            href="/diagnostic#insight-history"
            className="mt-3 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            {t("viewInsights")}
          </Link>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <div>
            <p className="text-lg font-bold tabular-nums">
              {progress.launchedThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {progress.launchedThisWeek > 1 ? t("launchedPlural") : t("launched")}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">
              {progress.completedThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {progress.completedThisWeek > 1 ? t("completedPlural") : t("completed")}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">
              {progress.measuredThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {progress.measuredThisWeek > 1 ? t("measuredPlural") : t("measured")}
            </p>
          </div>
        </div>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {t("pace", { completed: completedPreviousWeeks, previous: previousWeekCompleted })}
      </p>

      {milestoneMessage && (
        <p
          className="rounded-[var(--radius-control)] bg-state-healthy-bg px-3 py-2 text-xs font-bold text-state-healthy"
          role="status"
        >
          {milestoneMessage}
        </p>
      )}

      {nudge && (
        <div className="border-t border-border pt-3">
          <p className="text-sm font-bold">{t("falcoReminder", { title: nudge.title })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{nudge.reason}</p>
          {nudge.dueDate && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dueDate", { date: new Date(`${nudge.dueDate}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) })}
            </p>
          )}
          <Link
            href={followUpHref(nudge.initiativeId)}
            className="mt-2 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            {t("openFollowUp")}
          </Link>
          <FollowUpControls
            initiativeId={nudge.initiativeId}
            canPause={nudge.status !== "awaiting_measurement"}
          />
        </div>
      )}
    </section>
  );
}
