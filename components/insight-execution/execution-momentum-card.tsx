import Link from "next/link";

import {
  getActiveNudge,
  getFollowUpCandidate,
} from "@/lib/insight-execution/follow-up";
import { getExecutionProgress } from "@/lib/insight-execution/queries";
import type { ExecutionProgress } from "@/lib/insight-execution/types";

import { FollowUpControls } from "./initiative-controls";

function statusLabel(progress: ExecutionProgress): string {
  if (!progress.focus) return "Aucune priorité choisie";
  if (progress.focus.status === "measured") return "Résultat mesuré";
  if (
    progress.focus.status === "completed" ||
    progress.focus.status === "awaiting_measurement"
  )
    return "Action terminée";
  if (progress.focus.status === "cancelled") return "Écartée";
  return progress.focus.status === "paused" ? "En pause" : "En cours";
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
      ? "Résultat mesuré. Tu as maintenant un repère pour la suite."
      : progress.milestone === "completed"
        ? "Action terminée. Tu peux maintenant vérifier ce qui a changé."
        : progress.milestone === "launched"
          ? "Action lancée. Elle est maintenant suivie dans ton Journal."
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
            Cette semaine
          </p>
          <h2
            id="execution-momentum-title"
            className="mt-1 text-base font-bold"
          >
            Élan de la semaine
          </h2>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">
          {progress.completedThisWeek} terminée
          {progress.completedThisWeek > 1 ? "s" : ""}
        </span>
      </div>

      {progress.focus ? (
        <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/40 p-4">
          <p className="text-xs font-bold text-accent-text">
            Priorité active · {statusLabel(progress)}
          </p>
          <p className="mt-1 font-bold">{progress.focus.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.focus.assignedMember
              ? `Responsable : ${progress.focus.assignedMember.name}`
              : "Responsable : toi"}
          </p>
          <Link
            href={followUpHref(progress.focus.id)}
            className="mt-3 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            Ouvrir le suivi
          </Link>
        </div>
      ) : (
        <div className="rounded-[var(--radius-control)] border border-dashed border-border p-4">
          <p className="text-sm font-bold">
            Choisis une action à faire avancer.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Une seule priorité active, le reste peut attendre.
          </p>
          <Link
            href="/diagnostic#insight-history"
            className="mt-3 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            Voir tes insights
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
              lancée{progress.launchedThisWeek > 1 ? "s" : ""}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">
              {progress.completedThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">
              terminée{progress.completedThisWeek > 1 ? "s" : ""}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">
              {progress.measuredThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground">
              mesurée{progress.measuredThisWeek > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Ton rythme : {completedPreviousWeeks} action
        {completedPreviousWeeks > 1 ? "s" : ""} terminée
        {completedPreviousWeeks > 1 ? "s" : ""} sur les 4 semaines précédentes,
        contre {previousWeekCompleted} la semaine dernière.
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
          <p className="text-sm font-bold">Falco te rappelle : {nudge.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{nudge.reason}</p>
          {nudge.dueDate && (
            <p className="mt-1 text-xs text-muted-foreground">
              Échéance : {new Date(`${nudge.dueDate}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            </p>
          )}
          <Link
            href={followUpHref(nudge.initiativeId)}
            className="mt-2 inline-flex text-xs font-bold text-accent-text hover:underline"
          >
            Ouvrir le suivi
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
