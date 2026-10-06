"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CrmMessageAbTestView } from "@/lib/crm/message-ab-tests";
import type { CrmMessageAbTestAction } from "@/lib/crm/message-ab-test-rules";

type Props = { test: CrmMessageAbTestView; canManage: boolean; locale: string };

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatRate(rate: number | null, locale: string, notMeasured: string) {
  return rate === null ? notMeasured : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rate)}%`;
}

export function CrmMessageTestDetail({ test, canManage, locale }: Props) {
  const t = useTranslations("crm.messageTests");
  const router = useRouter();
  const [dialogAction, setDialogAction] = useState<"pause" | "end" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ended = test.status === "ended";
  const status = test.status === "active" ? t("status.active") : test.status === "paused" ? t("status.paused") : t("status.ended");

  async function changeStatus(action: CrmMessageAbTestAction) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/message-tests/${test.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const code = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "";
        if (code === "active_test_exists") setError(t("errors.channelOccupied"));
        else if (response.status === 404) setError(t("errors.notFound"));
        else if (response.status === 403) setError(t("errors.access"));
        else setError(t("errors.network"));
        return;
      }
      setDialogAction(null);
      router.refresh();
    } catch {
      setError(t("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  const variants = (["A", "B"] as const).map((variant) => ({
    variant,
    message: variant === "A" ? test.variantAMessage : test.variantBMessage,
    metrics: test.results[variant],
  }));

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={t("detail.testNavigation")} className="flex gap-2 overflow-x-auto">
        <Button asChild variant="outline" className="min-h-11"><Link href="/crm/tests">{t("detail.allTests")}</Link></Button>
        <span className="inline-flex min-h-11 items-center rounded-full border border-accent bg-accent/5 px-4 text-sm font-bold">{test.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{test.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{test.channel === "instagram" ? t("form.instagram") : t("form.linkedin")}</span>
            <span aria-hidden="true">·</span>
            <span>{t("detail.started", { date: formatDate(test.startedAt, locale) })}</span>
            <span aria-hidden="true">·</span>
            <span>{t("detail.split")}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground">{status}</span>
          </div>
        </div>
        {canManage && !ended && (
          <div className="flex flex-wrap gap-3">
            {test.status === "active" ? (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialogAction("pause")}>{t("actions.pause")}</Button>
            ) : (
              <Button type="button" className="min-h-11" onClick={() => void changeStatus("resume")}>{t("actions.resume")}</Button>
            )}
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => setDialogAction("end")}>{t("actions.end")}</Button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-[var(--radius-control)] bg-state-danger/10 px-4 py-3 text-sm font-bold text-state-danger">{error}</p>}
      {test.results.insufficientData && <section className="rounded-[var(--radius-control)] border border-state-caution/25 bg-state-caution/10 p-4" aria-labelledby="message-test-volume-warning">
        <h2 id="message-test-volume-warning" className="font-bold text-state-caution">{t("warning.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("warning.body")}</p>
      </section>}
      {ended && (test.results.A.inObservation > 0 || test.results.B.inObservation > 0) && <section className="rounded-[var(--radius-control)] border border-border bg-muted/40 p-4" aria-labelledby="message-test-collecting-title">
        <h2 id="message-test-collecting-title" className="font-bold">{t("detail.collecting")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("detail.collectingBody")}</p>
      </section>}

      <div className="grid gap-4 md:grid-cols-2">
        {variants.map(({ variant, message, metrics }) => (
          <section key={variant} className="sticker-card flex min-w-0 flex-col gap-4 p-4" aria-labelledby={`message-test-variant-${variant}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id={`message-test-variant-${variant}`} className="rounded-full bg-accent-2/10 px-3 py-1 text-sm font-bold text-accent-2">{t("detail.variant", { variant })}</h2>
              <p className="text-3xl font-bold text-accent-2">{formatRate(metrics.responseRate, locale, t("detail.notMeasured"))}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("detail.responseCount", { responses: metrics.responses, completed: metrics.completedWindows })}</p>
            <dl className="grid gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("detail.assigned")}</dt><dd className="font-bold tabular-nums">{metrics.assigned}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("detail.confirmedSent")}</dt><dd className="font-bold tabular-nums">{metrics.confirmedSent}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("detail.completedWindows")}</dt><dd className="font-bold tabular-nums">{metrics.completedWindows}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("detail.inObservation")}</dt><dd className="font-bold tabular-nums">{metrics.inObservation}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("detail.appointments")}</dt><dd className="font-bold tabular-nums">{metrics.appointments}</dd></div>
            </dl>
            <details className="rounded-[var(--radius-control)] border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("detail.messagePreview")}</summary>
              <p className="whitespace-pre-wrap border-t border-border bg-muted/30 p-3 text-sm">{message}</p>
            </details>
          </section>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t("detail.copyDoesNotCount")}</p>
      <p className="text-sm text-muted-foreground">{t("detail.noWinner")}</p>

      <Dialog open={dialogAction !== null} onOpenChange={(open) => { if (!open && !saving) setDialogAction(null); }}>
        <DialogContent aria-describedby="message-test-action-description">
          <DialogTitle className="text-lg font-bold">{dialogAction === "pause" ? t("actions.pauseTitle") : t("actions.endTitle")}</DialogTitle>
          <p id="message-test-action-description" className="mt-2 text-sm text-muted-foreground">{dialogAction === "pause" ? t("actions.pauseBody") : t("actions.endBody")}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => setDialogAction(null)}>{t("actions.cancel")}</Button>
            <Button type="button" variant={dialogAction === "end" ? "destructive" : "default"} className="min-h-11" disabled={saving} onClick={() => { if (dialogAction) void changeStatus(dialogAction); }}>{saving ? t("form.saving") : dialogAction === "pause" ? t("actions.confirmPause") : t("actions.confirmEnd")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
