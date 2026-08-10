"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { SaveIndicator } from "@/app/(app)/business/save-indicator";
import { useDebouncedSave } from "@/app/(app)/business/use-debounced-save";
import { Falco } from "@/components/falco/falco";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { JournalDay } from "@/lib/journal/queries";

import { saveJournalNote } from "./actions";

const EVENT_ICON: Record<string, string> = {
  insight_implemented: "💡",
  initiative_launched: "→",
  initiative_completed: "✓",
  initiative_measured: "↗",
  project_milestone_completed: "🎯",
  todo_business_improvement: "✅",
  checkin_rate_improved: "📈",
  lever_activated: "🔧",
  copilote_started: "💬",
};

function formatFullDate(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function DayDrawer({ day, onClose }: { day: JournalDay | null; onClose: () => void }) {
  const locale = useLocale();
  const t = useTranslations("journal.dayDrawer");
  const [note, setNote] = useState(day?.note ?? "");
  const { schedule, status } = useDebouncedSave((content: string) => saveJournalNote(day?.date ?? "", content));

  useEffect(() => {
    setNote(day?.note ?? "");
  }, [day?.date, day?.note]);

  if (!day) return null;

  const hasImprovement = day.events.length > 0;

  return (
    <Drawer open={day !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent>
        <div className="flex-1 overflow-y-auto p-6">
          <DrawerTitle className="font-display text-lg font-bold capitalize">{formatFullDate(day.date, locale)}</DrawerTitle>

          <div className="mt-6">
            <p className="text-sm font-bold">{t("stats")}</p>
            {day.hasActivity ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-[10px] border border-border p-3">
                  <p className="text-[11px] font-bold text-muted-foreground">{t("messages")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{day.totals.firstMessagesSent}</p>
                </div>
                <div className="rounded-[10px] border border-border p-3">
                  <p className="text-[11px] font-bold text-muted-foreground">{t("calls")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{day.totals.callsAttended}</p>
                </div>
                <div className="rounded-[10px] border border-border p-3">
                  <p className="text-[11px] font-bold text-muted-foreground">{t("sales")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{day.totals.salesClosed}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("weeklyStats")} {" "}
                <Link href="/dashboard" prefetch={true} className="font-bold text-foreground hover:underline">
                  {t("checkin")}
                </Link>
                .
              </p>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-bold">{t("improvements")}</p>
            {hasImprovement ? (
              <div className="mt-3 flex flex-col gap-2.5">
                {day.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden>{EVENT_ICON[event.type] ?? "✦"}</span>
                    <div className="flex-1">
                      <p className="font-bold">{event.label}</p>
                      <p className="text-[11px] text-muted-foreground">{formatTime(event.createdAt, locale)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("noImprovements")}</p>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-bold">{t("note")}</p>
              <SaveIndicator status={status} error={null} />
            </div>
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                schedule(event.target.value);
              }}
              rows={4}
              placeholder={t("placeholder")}
              className="w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </div>
        </div>

        <div className="mt-auto border-t border-border p-4">
          <Falco
            pose={hasImprovement ? "happy" : "neutral"}
            size="sm"
            withBubble
            bubbleText={hasImprovement ? t("usefulDay") : t("nothingNoted")}
            bubbleSide="right"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
