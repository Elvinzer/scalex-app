"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getInsightLaunchOptions, launchInsight, materializeInsight } from "@/lib/insight-execution/actions";
import type { InsightHistoryItem, InitiativeSummary } from "@/lib/insight-execution/types";

type Member = { id: string; name: string; roles: string[] };

export function InsightLaunchDialog({
  insight,
  members,
  projects,
  canAssign,
  onLaunched,
  triggerLabel = "Je lance cette action",
  triggerPrimary = false,
}: {
  insight: InsightHistoryItem;
  members: Member[];
  projects: { id: string; name: string }[];
  canAssign: boolean;
  onLaunched?: (insight: InsightHistoryItem) => void;
  triggerLabel?: string;
  triggerPrimary?: boolean;
}) {
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
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[var(--radius-card)] max-sm:p-5 sm:max-h-[85vh]">
        <DialogTitle className="text-lg font-bold">Lancer cette action</DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">Je crée un point de départ dans ton Journal. Tu pourras le modifier ensuite.</p>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Où veux-tu la suivre ?</span>
            <select
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value === "project" ? "project" : "todo");
                setTargetId("");
              }}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
            >
              <option value="todo">Une tâche courte dans le Journal</option>
              <option value="project">Un projet existant</option>
            </select>
          </label>

          {targetType === "project" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Projet</span>
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">Choisir un projet</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              {availableProjects.length === 0 && <span className="text-xs text-muted-foreground">Crée d&apos;abord un projet depuis le Journal.</span>}
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Échéance (optionnel)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
            />
          </label>

          {canAssignCurrent && availableMembers.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Responsable (optionnel)</span>
              <select
                value={assignedTeamMemberId}
                onChange={(event) => setAssignedTeamMemberId(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">Moi-même</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}{member.roles.length > 0 ? ` · ${member.roles.join(", ")}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" checked={makeWeeklyFocus} onChange={(event) => setMakeWeeklyFocus(event.target.checked)} className="mt-0.5 size-5" />
            <span><span className="font-bold">En faire ma priorité de la semaine</span><span className="block text-xs text-muted-foreground">Une seule priorité reste active à la fois.</span></span>
          </label>

          {error && <p className="text-sm text-state-critical" role="alert">{error}</p>}
          <Button type="button" className="min-h-11" onClick={handleLaunch} disabled={isPending || (targetType === "project" && !targetId)}>
            {isPending ? "Lancement..." : "Lancer l’action"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExistingInitiativeLink({ initiative }: { initiative: InitiativeSummary }) {
  return (
    <a href={initiative.projectId || initiative.todoId ? "/journal" : "/diagnostic#insight-history"} className="text-xs font-bold text-muted-foreground hover:underline">
      {initiative.projectId || initiative.todoId ? "Ouvrir dans le Journal" : "Voir l’action"}
    </a>
  );
}
