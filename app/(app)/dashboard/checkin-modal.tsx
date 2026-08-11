"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Falco } from "@/components/falco/falco";
import { KpiNumberField, type KpiFieldSource } from "@/components/kpi-number-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { AcquisitionFunnelStep } from "@/lib/acquisition-funnels/types";

import { submitWeeklyCheckin, type CheckinFeedback } from "./actions";

const SETTING_SOURCE: KpiFieldSource = {
  text: "Cette valeur vient de ta saisie journalière dans Pipeline. Modifie-la directement là-bas.",
  href: "/ventes/pipeline/funnel",
  linkLabel: "Aller à Pipeline",
};
const CLOSING_SOURCE: KpiFieldSource = {
  text: "Cette valeur vient de ta saisie journalière dans Suivi d'appel. Modifie-la directement là-bas.",
  href: "/ventes/appels/funnel",
  linkLabel: "Aller au suivi d'appel",
};

function callsSource(source: MonthlyCallSource): KpiFieldSource {
  return {
    text: `Cette valeur vient de Suivi d'appel : ${source.callsBooked} appel${source.callsBooked > 1 ? "s" : ""} réservé${source.callsBooked > 1 ? "s" : ""}, ${source.callsTaken} honoré${source.callsTaken > 1 ? "s" : ""} et ${source.salesClosed} vente${source.salesClosed > 1 ? "s" : ""} conclue${source.salesClosed > 1 ? "s" : ""}. Vérifie la source avant de la remplacer.`,
    href: "/ventes/appels",
    linkLabel: "Vérifier le suivi d'appel",
  };
}
export function CheckinModal({
  open,
  onClose,
  year,
  month,
  initialData,
  settingSourced,
  callsBookedSourced = false,
  closingSourced,
  callSource = null,
  activeMetricFields,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  initialData: MonthlyMetricsInput;
  settingSourced: boolean;
  callsBookedSourced?: boolean;
  closingSourced: boolean;
  callSource?: MonthlyCallSource | null;
  activeMetricFields: AcquisitionFunnelStep[];
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [draft, setDraft] = useState<MonthlyMetricsInput>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<CheckinFeedback | "none" | null>(null);
  const settingSource: KpiFieldSource = {
    text: t("checkin.settingSource"),
    href: "/ventes/pipeline/funnel",
    linkLabel: t("checkin.goToPipeline"),
  };
  const activeInputKeys = new Set(activeMetricFields.map((field) => field.inputMetricKey));
  const customMetricFields = Array.from(
    new Map(
      activeMetricFields
        .filter((field) => !["new_followers", "first_messages", "conversations", "calls_proposed", "calls_booked", "calls_attended", "sales_closed"].includes(field.inputMetricKey))
        .map((field) => [field.inputMetricKey, field] as const)
    ).values()
  );
  function update(patch: Partial<MonthlyMetricsInput>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const payload = stripDailySourcedFields(draft, { settingSourced, callsBookedSourced, closingSourced });
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
                <p className="font-bold">{t("checkinUpdated")}</p>
              </>
            ) : feedback.afterPercent > feedback.beforePercent ? (
              <>
                <Falco
                  pose="happy"
                  size="md"
                  animate="enter"
                  withBubble
                  bubbleText={t("improved", { before: feedback.beforePercent, after: feedback.afterPercent, label: feedback.label.toLowerCase() })}
                  className="justify-center"
                />
              </>
            ) : (
              <>
                <p className="text-2xl">🤔</p>
                <p className="font-bold">
                  {t("stillAt", { after: feedback.afterPercent, label: feedback.label.toLowerCase() })}
                </p>
                <Button asChild size="sm" variant="outline" className="self-center">
                  <Link href={`/diagnostic?open=${feedback.key}`} prefetch={true}>{t("resumeChat")}</Link>
                </Button>
              </>
            )}
            <Button onClick={handleClose} className="self-center">
              {t("close")}
            </Button>
          </div>
        ) : (
          <>
            <DialogTitle className="font-display text-lg font-bold">{t("checkinTitle")}</DialogTitle>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiNumberField label={t("checkin.cashCollected")} value={draft.cashCollected} onChange={(v) => update({ cashCollected: v })} />
                <KpiNumberField label={t("checkin.cashContracted")} value={draft.cashContracted} onChange={(v) => update({ cashContracted: v })} />
                {activeInputKeys.has("new_followers") && <KpiNumberField label={t("checkin.newFollowers")} value={draft.newFollowers} onChange={(v) => update({ newFollowers: v })} disabledReason={settingSourced ? settingSource : undefined} />}
                {activeInputKeys.has("first_messages") && <KpiNumberField label={t("checkin.firstMessages")} value={draft.firstMessages} onChange={(v) => update({ firstMessages: v })} disabledReason={settingSourced ? settingSource : undefined} />}
                {activeInputKeys.has("conversations") && <KpiNumberField label={t("checkin.conversations")} value={draft.conversations} onChange={(v) => update({ conversations: v })} disabledReason={settingSourced ? settingSource : undefined} />}
                {activeInputKeys.has("calls_proposed") && <KpiNumberField label={t("checkin.callsProposed")} value={draft.callsProposed} onChange={(v) => update({ callsProposed: v })} disabledReason={settingSourced ? settingSource : undefined} />}
                {activeInputKeys.has("calls_booked") && <KpiNumberField label={t("checkin.callsBooked")} value={draft.callsBooked} onChange={(v) => update({ callsBooked: v })} disabledReason={settingSourced || callsBookedSourced ? (callsBookedSourced && callSource ? callsSource(callSource) : SETTING_SOURCE) : undefined} />}
                {activeInputKeys.has("calls_attended") && <KpiNumberField label={t("checkin.callsTaken")} value={draft.callsTaken} onChange={(v) => update({ callsTaken: v })} disabledReason={closingSourced ? (callSource ? callsSource(callSource) : CLOSING_SOURCE) : undefined} />}
                {activeInputKeys.has("sales_closed") && <KpiNumberField label={t("checkin.salesClosed")} value={draft.salesClosed} onChange={(v) => update({ salesClosed: v })} disabledReason={closingSourced ? (callSource ? callsSource(callSource) : CLOSING_SOURCE) : undefined} />}
                {customMetricFields.map((field) => (
                  <KpiNumberField
                    key={field.inputMetricKey}
                    label={`${field.label} (${field.unit})`}
                    value={draft.acquisitionMetrics?.[field.inputMetricKey] ?? null}
                    onChange={(value) => update({ acquisitionMetrics: { ...(draft.acquisitionMetrics ?? {}), [field.inputMetricKey]: value } })}
                  />
                ))}
              </div>

              {error && <p className="text-sm text-state-critical">{error}</p>}

              <Button type="submit" disabled={isPending} className="self-start">
                {isPending ? t("saving") : t("validateCheckin")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
