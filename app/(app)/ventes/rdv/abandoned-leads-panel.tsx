"use client";

import { ArchiveX, CheckCheck, Clock3, Phone, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { updateNativeBookingLeadStatusAction } from "./actions";

type LeadView = {
  id: string;
  status: "open" | "contacted";
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  eventName: string;
  eventTimeZone: string;
  lastStep: "contact_submitted" | "slots_revealed" | "slot_selected" | "booking_failed" | "converted";
  lastSeenAt: string;
  selectedStartAt: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
};

const STEP_LABELS: Record<LeadView["lastStep"], string> = {
  contact_submitted: "Coordonnées saisies",
  slots_revealed: "Créneaux consultés",
  slot_selected: "Créneau sélectionné",
  booking_failed: "Confirmation interrompue",
  converted: "Rendez-vous confirmé",
};

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sourceLabel(lead: LeadView) {
  return [lead.utmSource, lead.utmCampaign, lead.utmContent].filter(Boolean).join(" · ") || "Source directe";
}

export function AbandonedLeadsPanel({ leads, targetLeadId }: { leads: LeadView[]; targetLeadId: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetLeadId) return;
    const target = leads.find((lead) => lead.id === targetLeadId);
    if (!target) return;
    setFocusedLeadId(target.id);
    requestAnimationFrame(() => {
      const element = document.getElementById(`native-booking-lead-${target.id}`);
      element?.scrollIntoView({ block: "nearest" });
      element?.focus();
    });
  }, [leads, targetLeadId]);

  function updateLead(leadId: string, status: "open" | "contacted" | "dismissed") {
    setError(null);
    startTransition(async () => {
      const result = await updateNativeBookingLeadStatusAction({ leadId, status });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="abandoned-leads-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id="abandoned-leads-title" className="text-lg font-bold">À relancer</h3>
            {leads.length > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{leads.length}</span>}
          </div>
          <p className="text-sm text-muted-foreground">Les prospects qui ont commencé une réservation sans la confirmer.</p>
        </div>
        <p className="text-xs text-muted-foreground">Les rendez-vous confirmés sortent automatiquement de cette liste.</p>
      </div>

      {error && <p className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm font-bold text-state-critical" role="alert">{error}</p>}

      {leads.length === 0 ? (
        <div className="sticker-card-dashed flex flex-col items-center gap-2 p-7 text-center">
          <CheckCheck className="size-7 text-state-healthy" />
          <p className="font-bold">Aucune relance en attente</p>
          <p className="max-w-md text-sm text-muted-foreground">Les coordonnées apparaîtront ici dès qu’un prospect aura déverrouillé les créneaux.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {leads.map((lead) => (
            <article
              key={lead.id}
              id={`native-booking-lead-${lead.id}`}
              tabIndex={-1}
              data-revenue-target={lead.id === focusedLeadId ? "true" : undefined}
              className={`sticker-card flex flex-col gap-4 p-5 outline-none focus-visible:ring-3 focus-visible:ring-accent/25 ${lead.id === focusedLeadId ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Prospect sans nom"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{lead.eventName}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${lead.status === "contacted" ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : "border-state-caution/30 bg-state-caution/10 text-state-caution"}`}>
                  {lead.status === "contacted" ? "Contacté" : "Nouveau"}
                </span>
              </div>

              <div className="grid gap-2 text-sm">
                {lead.phone ? (
                  <a href={`tel:${lead.phone}`} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-muted/60 px-3 font-bold hover:bg-muted">
                    <Phone className="size-4 shrink-0 text-accent" />
                    <span className="truncate">{lead.phone}</span>
                  </a>
                ) : (
                  <span className="flex min-h-11 items-center rounded-[var(--radius-control)] bg-muted/60 px-3 text-muted-foreground">Téléphone non renseigné</span>
                )}
              </div>

              <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Dernière étape</dt>
                  <dd className="mt-1 font-bold">{STEP_LABELS[lead.lastStep]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Dernière activité</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-bold"><Clock3 className="size-3.5 text-muted-foreground" />{formatDate(lead.lastSeenAt, lead.eventTimeZone)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Créneau visé</dt>
                  <dd className="mt-1 font-bold">{lead.selectedStartAt ? formatDate(lead.selectedStartAt, lead.eventTimeZone) : "Pas encore sélectionné"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source</dt>
                  <dd className="mt-1 truncate font-bold" title={sourceLabel(lead)}>{sourceLabel(lead)}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {lead.status === "open" ? (
                  <button type="button" disabled={isPending} onClick={() => updateLead(lead.id, "contacted")} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] bg-accent px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
                    <CheckCheck className="size-4" /> Marquer contacté
                  </button>
                ) : (
                  <button type="button" disabled={isPending} onClick={() => updateLead(lead.id, "open")} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                    <RotateCcw className="size-4" /> Réouvrir
                  </button>
                )}
                <button type="button" disabled={isPending} onClick={() => updateLead(lead.id, "dismissed")} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                  <ArchiveX className="size-4" /> Ignorer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
