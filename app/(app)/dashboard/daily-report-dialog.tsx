"use client";

import { FileText } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { saveClosingKpiEntry } from "@/app/(app)/ventes/closing/actions";
import { saveSettingKpiEntry } from "@/app/(app)/acquisition/setting/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const SETTING_FIELDS = [
  { name: "newSubscribers", label: "Nouveaux abonnés" },
  { name: "firstMessagesSent", label: "Premiers messages envoyés" },
  { name: "conversationsStarted", label: "Conversations démarrées" },
  { name: "callsProposed", label: "Appels proposés" },
  { name: "callsBooked", label: "Appels réservés" },
] as const;

const CLOSING_FIELDS = [
  { name: "callsAttended", label: "Appels pris" },
  { name: "salesClosed", label: "Ventes conclues" },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const STORAGE_PREFIX = "daily-report-shown-";

// One combined form covering both daily KPI tables (setting_kpi_entries +
// closing_kpi_entries) — reuses the exact same server actions as the
// dedicated Setting/Closing "Ajouter un jour" forms (both upsert on
// (userId, date), so re-submitting today twice just updates it), rather
// than duplicating the write logic here. Both actions already revalidate
// /dashboard, so the Dashboard picks up the new numbers immediately.
export function DailyReportDialog({ alreadyDoneToday }: { alreadyDoneToday: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-opens once per calendar day — never if today's entry is already
  // saved, and never twice the same day even if the user closes without
  // submitting (a popup on every single navigation would be worse than the
  // "not prominent enough" problem this is meant to fix). The localStorage
  // key is date-stamped, so it naturally resets tomorrow with no cleanup job.
  useEffect(() => {
    if (alreadyDoneToday) return;
    const key = `${STORAGE_PREFIX}${today()}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const [settingResult, closingResult] = await Promise.all([
        saveSettingKpiEntry(formData),
        saveClosingKpiEntry(formData),
      ]);
      const result = settingResult.error ? settingResult : closingResult;
      if (result.error) {
        setError(result.error);
        return;
      }
      setCounts({});
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Coral (default) variant instead of the previous outline button —
            this is meant to be the day's main call-to-action, not a subtle
            secondary link. The dot signals "not done yet" the same way the
            weekly check-in banner already does. */}
        <Button type="button" className="relative">
          <FileText className="size-4" />
          Rapport Daily
          {!alreadyDoneToday && (
            <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full bg-accent-2 ring-2 ring-card" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Rapport Daily</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Les chiffres de ton funnel pour une journée — setting et closing en un coup.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Date</span>
            <input
              type="date"
              name="date"
              required
              max={today()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Setting</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SETTING_FIELDS.map((field) => (
                <label key={field.name} className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">{field.label}</span>
                  <input
                    type="number"
                    name={field.name}
                    min={0}
                    max={100_000}
                    required
                    value={counts[field.name] ?? ""}
                    onChange={(event) => setCounts((prev) => ({ ...prev, [field.name]: event.target.value }))}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Closing</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {CLOSING_FIELDS.map((field) => (
                <label key={field.name} className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">{field.label}</span>
                  <input
                    type="number"
                    name={field.name}
                    min={0}
                    max={100_000}
                    required
                    value={counts[field.name] ?? ""}
                    onChange={(event) => setCounts((prev) => ({ ...prev, [field.name]: event.target.value }))}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : "Enregistrer ce jour"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
