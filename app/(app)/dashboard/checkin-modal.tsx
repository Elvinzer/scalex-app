"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";

import { submitWeeklyCheckin, type CheckinFeedback } from "./actions";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold">{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

export function CheckinModal({
  open,
  onClose,
  year,
  month,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  initialData: MonthlyMetricsInput;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<MonthlyMetricsInput>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<CheckinFeedback | "none" | null>(null);

  function update(patch: Partial<MonthlyMetricsInput>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await submitWeeklyCheckin(year, month, draft);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    setFeedback(result.feedback ?? "none");
    router.refresh();
  }

  function handleClose() {
    setFeedback(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        {feedback ? (
          <div className="flex flex-col gap-4 text-center">
            {feedback === "none" ? (
              <>
                <p className="text-2xl">✅</p>
                <p className="font-bold">Chiffres mis à jour</p>
              </>
            ) : feedback.afterPercent > feedback.beforePercent ? (
              <>
                <p className="text-2xl">📈</p>
                <p className="font-bold">
                  Ton {feedback.label.toLowerCase()} est passé de {feedback.beforePercent}% à{" "}
                  {feedback.afterPercent}% depuis ta dernière session
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl">🤔</p>
                <p className="font-bold">
                  Toujours à {feedback.afterPercent}% sur ton {feedback.label.toLowerCase()} — on regarde pourquoi ?
                </p>
                <Button asChild size="sm" variant="outline" className="self-center">
                  <a href={`/diagnostic?open=${feedback.key}`}>Reprendre le chat →</a>
                </Button>
              </>
            )}
            <Button onClick={handleClose} className="self-center">
              Fermer
            </Button>
          </div>
        ) : (
          <>
            <DialogTitle className="font-display text-lg font-bold">Ton check-in de la semaine</DialogTitle>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="CA collecté (€)" value={draft.cashCollected} onChange={(v) => update({ cashCollected: v })} />
                <NumberField label="CA contracté (€)" value={draft.cashContracted} onChange={(v) => update({ cashContracted: v })} />
                <NumberField label="Nouveaux abonnés" value={draft.newFollowers} onChange={(v) => update({ newFollowers: v })} />
                <NumberField label="Premiers messages envoyés" value={draft.firstMessages} onChange={(v) => update({ firstMessages: v })} />
                <NumberField label="Conversations démarrées" value={draft.conversations} onChange={(v) => update({ conversations: v })} />
                <NumberField label="Appels proposés" value={draft.callsProposed} onChange={(v) => update({ callsProposed: v })} />
                <NumberField label="Appels réservés" value={draft.callsBooked} onChange={(v) => update({ callsBooked: v })} />
                <NumberField label="Appels pris" value={draft.callsTaken} onChange={(v) => update({ callsTaken: v })} />
                <NumberField label="Ventes conclues" value={draft.salesClosed} onChange={(v) => update({ salesClosed: v })} />
              </div>

              {error && <p className="text-sm text-state-critical">{error}</p>}

              <Button type="submit" disabled={isPending} className="self-start">
                {isPending ? "Enregistrement..." : "Valider mon check-in"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
