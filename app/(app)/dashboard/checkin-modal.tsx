"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Falco } from "@/components/falco/falco";
import { KpiNumberField, type KpiFieldSource } from "@/components/kpi-number-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";

import { submitWeeklyCheckin, type CheckinFeedback } from "./actions";

const SETTING_SOURCE: KpiFieldSource = {
  text: "Cette valeur vient de ta saisie journalière dans Setting. Modifie-la directement là-bas.",
  href: "/acquisition/setting",
  linkLabel: "Aller à Setting",
};
const CLOSING_SOURCE: KpiFieldSource = {
  text: "Cette valeur vient de ta saisie journalière dans Closing. Modifie-la directement là-bas.",
  href: "/ventes/closing",
  linkLabel: "Aller à Closing",
};

export function CheckinModal({
  open,
  onClose,
  year,
  month,
  initialData,
  settingSourced,
  closingSourced,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  initialData: MonthlyMetricsInput;
  settingSourced: boolean;
  closingSourced: boolean;
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

    const payload = stripDailySourcedFields(draft, { settingSourced, closingSourced });
    const result = await submitWeeklyCheckin(year, month, payload);
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
                <Falco
                  pose="happy"
                  size="md"
                  animate="enter"
                  withBubble
                  bubbleText={`De ${feedback.beforePercent}% à ${feedback.afterPercent}% sur ton ${feedback.label.toLowerCase()} ! Je savais que tu l'avais.`}
                  className="justify-center"
                />
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
                <KpiNumberField label="CA collecté (€)" value={draft.cashCollected} onChange={(v) => update({ cashCollected: v })} />
                <KpiNumberField label="CA contracté (€)" value={draft.cashContracted} onChange={(v) => update({ cashContracted: v })} />
                <KpiNumberField
                  label="Nouveaux abonnés"
                  value={draft.newFollowers}
                  onChange={(v) => update({ newFollowers: v })}
                  disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Premiers messages envoyés"
                  value={draft.firstMessages}
                  onChange={(v) => update({ firstMessages: v })}
                  disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Conversations démarrées"
                  value={draft.conversations}
                  onChange={(v) => update({ conversations: v })}
                  disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Appels proposés"
                  value={draft.callsProposed}
                  onChange={(v) => update({ callsProposed: v })}
                  disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Appels réservés"
                  value={draft.callsBooked}
                  onChange={(v) => update({ callsBooked: v })}
                  disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Appels pris"
                  value={draft.callsTaken}
                  onChange={(v) => update({ callsTaken: v })}
                  disabledReason={closingSourced ? CLOSING_SOURCE : undefined}
                />
                <KpiNumberField
                  label="Ventes conclues"
                  value={draft.salesClosed}
                  onChange={(v) => update({ salesClosed: v })}
                  disabledReason={closingSourced ? CLOSING_SOURCE : undefined}
                />
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
