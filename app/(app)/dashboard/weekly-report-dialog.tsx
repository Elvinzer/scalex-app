"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CheckinModal } from "./checkin-modal";
import { Falco } from "@/components/falco/falco";
import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import type { WeeklyReportRow } from "@/lib/dashboard/weekly-report";
import { recordWeeklyReportViewed } from "@/lib/dashboard/weekly-report-tracking";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import { cn } from "@/lib/utils";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

function weekLabel(weekStart: string): string {
  const from = new Date(`${weekStart}T00:00:00Z`);
  const to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `Semaine du ${DATE_FORMAT.format(from)} au ${DATE_FORMAT.format(to)}`;
}

// Deterministic, no AI call — same "reliability over cleverness" precedent
// as lib/diagnostic/lever-advice.ts's advice templates.
function synthesisSentence(report: WeeklyReportRow): string {
  if (report.scoreDelta !== null && report.scoreDelta > 0) {
    return `Bonne semaine : ton Scale Score a progressé de ${report.scoreDelta} point${report.scoreDelta > 1 ? "s" : ""}.`;
  }
  if (report.scoreDelta !== null && report.scoreDelta < 0) {
    return `Semaine plus dure : ton Scale Score a reculé de ${Math.abs(report.scoreDelta)} point${Math.abs(report.scoreDelta) > 1 ? "s" : ""}.`;
  }
  if (report.bottleneck) return `Ton point à travailler cette semaine : ${report.bottleneck.label}.`;
  return "Voici où en est ton business cette semaine.";
}

// Replaces the old Rapport Daily (a combined KPI-entry form with a streak) —
// this is purely a read-only weekly synthesis now. Daily entry still happens
// via the standalone Setting/Closing "Ajouter un jour" forms, unaffected.
export function WeeklyReportDialog({
  reports,
  checkInDoneThisWeek,
  checkinYear,
  checkinMonth,
  checkinInitialData,
  checkinSettingSourced,
  checkinClosingSourced,
}: {
  reports: WeeklyReportRow[];
  checkInDoneThisWeek: boolean;
  checkinYear: number;
  checkinMonth: number;
  checkinInitialData: MonthlyMetricsInput;
  checkinSettingSourced: boolean;
  checkinClosingSourced: boolean;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Honors ?report=1 — the Monday email's CTA deep link, via
  // /api/weekly-email-click — same pattern as CheckinTrigger's ?checkin=1.
  useEffect(() => {
    if (searchParams.get("report") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordWeeklyReportViewed();
  }

  const selected = reports[selectedIndex] ?? null;
  const bottleneckContext: ChatContext | null = selected?.bottleneck
    ? { topicType: "metric", topicKey: selected.bottleneck.metricKey, topicLabel: selected.bottleneck.label, sourcePage: "weekly_report" }
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary" className="relative">
            <FileText className="size-4" />
            Rapport Hebdo
            {!checkInDoneThisWeek && (
              <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full bg-state-caution ring-2 ring-card" />
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[720px]">
          <DialogClose
            aria-label="Fermer"
            className="absolute top-4 right-4 flex size-7 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </DialogClose>

          {!selected ? (
            <>
              <DialogTitle className="text-lg font-bold">Rapport Hebdo</DialogTitle>
              <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
                <Falco pose="neutral" size="md" />
                <p className="text-sm text-muted-foreground">Ton premier rapport arrive lundi prochain.</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Falco pose="neutral" size="sm" />
                <div>
                  <DialogTitle className="text-lg font-bold">{weekLabel(selected.weekStart)}</DialogTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{synthesisSentence(selected)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selected.statsSnapshot.map((card) => (
                  <div key={card.key} className="sticker-card flex flex-col p-3">
                    <p className="text-xs font-bold text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{card.valueLabel}</p>
                    {card.deltaLabel && (
                      <p
                        className={cn(
                          "mt-0.5 text-xs font-bold",
                          card.deltaDirection === "up" && "text-state-healthy",
                          card.deltaDirection === "down" && "text-state-critical",
                          card.deltaDirection === null && "text-muted-foreground"
                        )}
                      >
                        {card.deltaLabel}
                      </p>
                    )}
                  </div>
                ))}
                {selected.score !== null && (
                  <div className="sticker-card flex flex-col p-3">
                    <p className="text-xs font-bold text-muted-foreground">Scale Score</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{selected.score}/100</p>
                    {selected.scoreDelta !== null && (
                      <p
                        className={cn(
                          "mt-0.5 text-xs font-bold",
                          selected.scoreDelta > 0 && "text-state-healthy",
                          selected.scoreDelta < 0 && "text-state-critical",
                          selected.scoreDelta === 0 && "text-muted-foreground"
                        )}
                      >
                        {selected.scoreDelta > 0 ? "+" : ""}
                        {selected.scoreDelta} vs il y a 7 jours
                      </p>
                    )}
                  </div>
                )}
              </div>

              {selected.bottleneck && (
                <div className="sticker-card-dashed mt-4 flex flex-col gap-2 p-4">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Ton goulot de la semaine</p>
                  <p className="text-sm font-bold">
                    {selected.bottleneck.label} — {selected.bottleneck.currentRatePercent}% (benchmark{" "}
                    {selected.bottleneck.benchmarkRatePercent}%)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Manque à gagner estimé : {formatEur(selected.bottleneck.monthlyGain)}/mois.
                  </p>
                  <Button size="sm" variant="outline" className="self-start" onClick={() => setChatOpen(true)}>
                    Améliorer →
                  </Button>
                </div>
              )}

              {!checkInDoneThisWeek && (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-[var(--radius-card)] bg-accent-2-soft px-4 py-3">
                  <p className="text-sm font-bold text-accent-2-text">Check-in de cette semaine pas encore fait.</p>
                  <Button size="sm" variant="outline" onClick={() => setCheckinOpen(true)}>
                    Faire mon check-in
                  </Button>
                </div>
              )}

              {reports.length > 1 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="text-xs font-bold text-muted-foreground hover:underline"
                  >
                    {showHistory ? "Masquer" : "Voir"} les semaines précédentes
                  </button>
                  {showHistory && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {reports.map((report, index) => (
                        <li key={report.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedIndex(index)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm",
                              index === selectedIndex ? "bg-surface-sunken font-bold" : "hover:bg-muted"
                            )}
                          >
                            <span>{weekLabel(report.weekStart)}</span>
                            {report.score !== null && <span className="text-muted-foreground">{report.score}/100</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {bottleneckContext && (
        <Drawer open={chatOpen} onOpenChange={setChatOpen}>
          <DrawerContent>{chatOpen && <ImproveChat context={bottleneckContext} period="3-months" gapBadge={null} />}</DrawerContent>
        </Drawer>
      )}

      <CheckinModal
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        year={checkinYear}
        month={checkinMonth}
        initialData={checkinInitialData}
        settingSourced={checkinSettingSourced}
        closingSourced={checkinClosingSourced}
      />
    </>
  );
}
