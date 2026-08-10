"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addQualitativeResult,
  assignInitiative,
  measureInitiative,
  pauseInitiative,
  postponeInitiative,
  setWeeklyFocus,
  updateInitiativeStatus,
} from "@/lib/insight-execution/actions";
import type { InitiativeSummary } from "@/lib/insight-execution/types";

type Member = { id: string; name: string; roles: string[] };

export function InitiativeControls({
  initiative,
  members = [],
  canAssign = false,
}: {
  initiative: InitiativeSummary;
  members?: Member[];
  canAssign?: boolean;
}) {
  const t = useTranslations("app.insights");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(
    action: () => Promise<{ error: string | null }>,
    successMessage?: string,
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setMessage(result.error);
      else {
        setMessage(successMessage ?? null);
        router.refresh();
      }
    });
  }

  function handleMeasure() {
    setMessage(null);
    startTransition(async () => {
      const result = await measureInitiative(initiative.id);
      if (result.error) setMessage(result.error);
      else {
        setMessage(
          result.ready
            ? t("resultRecorded")
            : (result.reason ?? t("notEnoughData")),
        );
        router.refresh();
      }
    });
  }

  const canPause =
    initiative.status === "planned" || initiative.status === "in_progress";
  const canComplete =
    initiative.status === "planned" || initiative.status === "in_progress";
  const canMeasure =
    initiative.baseline !== null &&
    (initiative.status === "completed" ||
      initiative.status === "awaiting_measurement" ||
      initiative.status === "measured");
  const canResume = initiative.status === "paused";

  return (
    <div className="flex flex-col gap-2">
      {canAssign && members.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-bold">{t("assign")}</span>
          <select
            value={initiative.assignedMember?.id ?? ""}
            onChange={(event) =>
              run(
                () =>
                  assignInitiative({
                    initiativeId: initiative.id,
                    teamMemberId: event.target.value || null,
                  }),
                t("assignmentUpdated"),
              )
            }
            disabled={isPending}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs font-bold text-foreground outline-none focus-visible:border-accent"
          >
            <option value="">{t("myselfOption")}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.roles.length > 0 ? ` · ${member.roles.join(", ")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!initiative.isWeeklyFocus &&
          !["cancelled", "measured"].includes(initiative.status) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                run(
                  () => setWeeklyFocus({ initiativeId: initiative.id }),
                  t("priorityUpdated"),
                )
              }
            >
              {t("makePriority")}
            </Button>
          )}
        {canComplete && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  updateInitiativeStatus({
                    initiativeId: initiative.id,
                    status: "completed",
                  }),
                t("actionCompletedToast"),
              )
            }
          >
            {t("markCompleted")}
          </Button>
        )}
        {canMeasure && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleMeasure}
          >
            {initiative.status === "measured"
              ? t("refreshMeasurement")
              : t("measureResult")}
          </Button>
        )}
        {!canMeasure &&
          initiative.baseline === null &&
          (initiative.status === "completed" ||
            initiative.status === "awaiting_measurement") && (
            <QualitativeResultDialog initiativeId={initiative.id} />
          )}
        {canResume && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  updateInitiativeStatus({
                    initiativeId: initiative.id,
                    status: "in_progress",
                  }),
                t("actionResumed"),
              )
            }
          >
            {t("resume")}
          </Button>
        )}
        {canPause && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              run(() => pauseInitiative({ initiativeId: initiative.id }))
            }
          >
            {t("pause")}
          </Button>
        )}
        {(initiative.status === "planned" ||
          initiative.status === "in_progress" ||
          initiative.status === "awaiting_measurement") && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              run(
                () => postponeInitiative({ initiativeId: initiative.id }),
                t("postponed"),
              )
            }
          >
            {t("postpone")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {message ?? (initiative.status === "planned" ? "Planned" : initiative.status === "in_progress" ? t("statuses.inProgress") : initiative.status === "completed" ? t("statuses.completed") : initiative.status === "awaiting_measurement" ? "Awaiting measurement" : initiative.status === "measured" ? t("statuses.measured") : initiative.status === "paused" ? t("statuses.paused") : initiative.status === "cancelled" ? t("statuses.cancelled") : initiative.status)}
      </p>
    </div>
  );
}

function QualitativeResultDialog({ initiativeId }: { initiativeId: string }) {
  const t = useTranslations("app.insights");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await addQualitativeResult({ initiativeId, note });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          {t("addObservation")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">
          {t("whatChanged")}
        </DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("qualitativeHelp")}
        </p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ex. Les relances sont maintenant faites sous 24 h…"
          rows={4}
          className="mt-4 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
        />
        {error && (
          <p className="mt-2 text-sm text-state-critical" role="alert">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="mt-4"
          disabled={isPending || note.trim().length === 0}
          onClick={save}
        >
          {isPending ? t("saving") : t("saveObservation")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpControls({
  initiativeId,
  canPause = true,
}: {
  initiativeId: string;
  canPause?: boolean;
}) {
  const t = useTranslations("app.insights");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handle(
    action: () => Promise<{ error: string | null }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.error ?? success);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          handle(
            () => postponeInitiative({ initiativeId }),
            t("postponed"),
          )
        }
      >
        {t("postpone")}
      </Button>
      {canPause && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            handle(
              () => pauseInitiative({ initiativeId }),
              t("pause"),
            )
          }
        >
          {t("pause")}
        </Button>
      )}
      {message && (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  );
}
