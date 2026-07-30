"use client";

import { Button } from "@/components/ui/button";
import type { SalesCallRow } from "@/lib/iclosed/calls";
import { cn } from "@/lib/utils";

import { CallOutcomeDialog } from "./call-outcome-dialog";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Badge = { label: string; className: string };

function statusBadge(call: SalesCallRow): Badge {
  if (call.attendance === "cancelled") return { label: "Annulé", className: "bg-state-unknown-bg text-state-unknown" };
  if (call.attendance === "no_show") return { label: "No-show", className: "bg-state-caution/15 text-state-caution" };
  if (call.outcome === "closed") return { label: "Closé", className: "bg-state-healthy-bg text-state-healthy" };
  if (call.outcome === "not_closed") return { label: "Non closé", className: "bg-state-unknown-bg text-state-unknown" };
  // Still awaiting a disposition.
  const isPast = new Date(call.scheduledAt).getTime() < Date.now();
  return isPast
    ? { label: "À traiter", className: "bg-state-caution/15 text-state-caution" }
    : { label: "À venir", className: "bg-muted text-muted-foreground" };
}

export function CallsTable({ calls }: { calls: SalesCallRow[] }) {
  if (calls.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucun appel pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Les réservations iClosed apparaîtront ici automatiquement.
        </p>
      </div>
    );
  }

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Invité</th>
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Closer</th>
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Contracté</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Collecté</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => {
            const badge = statusBadge(call);
            const done = call.outcomeSetAt !== null;
            return (
              <tr key={call.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {DATE_FORMAT.format(new Date(call.scheduledAt))}
                </td>
                <td className="p-3">
                  <p className="font-bold">{call.inviteeName ?? "—"}</p>
                  {call.inviteeEmail && <p className="text-xs text-muted-foreground">{call.inviteeEmail}</p>}
                  <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                    {call.source === "calendly" ? "Calendly" : "iClosed"}
                  </p>
                </td>
                <td className="p-3 text-muted-foreground">{call.closer ?? "—"}</td>
                <td className="p-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", badge.className)}>
                    {badge.label}
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums">
                  {call.contracted !== null ? `${NUMBER_FORMAT.format(call.contracted)} €` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {call.collected !== null ? `${NUMBER_FORMAT.format(call.collected)} €` : "—"}
                </td>
                <td className="p-3 text-right">
                  {call.attendance !== "cancelled" && (
                    <CallOutcomeDialog
                      call={call}
                      trigger={
                        <Button type="button" variant={done ? "ghost" : "outline"} size="sm">
                          {done ? "Modifier" : "Marquer l'issue"}
                        </Button>
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
