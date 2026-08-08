"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { launchInsight, materializeInsight } from "@/lib/insight-execution/actions";
import type { InsightHistoryItem, InitiativeSummary } from "@/lib/insight-execution/types";

type Member = { id: string; name: string; roles: string[] };

export function InsightLaunchDialog({
  insight,
  members,
  projects,
  canAssign,
}: {
  insight: InsightHistoryItem;
  members: Member[];
  projects: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"todo" | "project">("todo");
  const [targetId, setTargetId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTeamMemberId, setAssignedTeamMemberId] = useState("");
  const [makeWeeklyFocus, setMakeWeeklyFocus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        assignedTeamMemberId: canAssign ? assignedTeamMemberId || null : null,
        makeWeeklyFocus,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Je lance cette action
        </Button>
      </DialogTrigger>
      <DialogContent>
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
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
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
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">Choisir un projet</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              {projects.length === 0 && <span className="text-xs text-muted-foreground">Crée d&apos;abord un projet depuis le Journal.</span>}
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Échéance (optionnel)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
            />
          </label>

          {canAssign && members.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Responsable (optionnel)</span>
              <select
                value={assignedTeamMemberId}
                onChange={(event) => setAssignedTeamMemberId(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent"
              >
                <option value="">Moi-même</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}{member.roles.length > 0 ? ` · ${member.roles.join(", ")}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={makeWeeklyFocus} onChange={(event) => setMakeWeeklyFocus(event.target.checked)} className="mt-0.5 size-4" />
            <span><span className="font-bold">En faire ma priorité de la semaine</span><span className="block text-xs text-muted-foreground">Une seule priorité reste active à la fois.</span></span>
          </label>

          {error && <p className="text-sm text-state-critical" role="alert">{error}</p>}
          <Button type="button" onClick={handleLaunch} disabled={isPending || (targetType === "project" && !targetId)}>
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
