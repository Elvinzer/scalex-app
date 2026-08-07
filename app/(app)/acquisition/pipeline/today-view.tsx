import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { Offer } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, type LeadRow } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

type TodayTask = {
  lead: LeadRow;
  status: "En retard" | "À reprogrammer" | "Appel aujourd'hui" | "Stagnant" | "À qualifier";
  reason: string;
  action: string;
  priority: number;
  ageDays: number;
};

function daysSince(value: string): number {
  const elapsed = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

function buildTask(lead: LeadRow, today: string): TodayTask | null {
  const ageDays = daysSince(lead.createdAt);
  if (lead.reminderDate && !lead.reminderDone && lead.reminderDate < today) {
    return { lead, status: "En retard", reason: lead.reminderNote ?? "Relance promise non traitée", action: "Relancer", priority: 0, ageDays };
  }
  if (lead.isNoShow) {
    return { lead, status: "À reprogrammer", reason: "Le prospect ne s'est pas présenté", action: "Proposer un créneau", priority: 1, ageDays };
  }
  if (lead.stage === "rdv_fixe") {
    return { lead, status: "Appel aujourd'hui", reason: "Préparer le prochain appel de closing", action: "Préparer", priority: 2, ageDays };
  }
  if (lead.stage === "conversation" && daysSince(lead.updatedAt) >= 14) {
    return { lead, status: "Stagnant", reason: "Aucune activité depuis plus de 14 jours", action: "Relancer", priority: 3, ageDays };
  }
  if (lead.stage === "nouveau_lead") {
    return { lead, status: "À qualifier", reason: "Nouveau lead sans qualification", action: "Qualifier", priority: 4, ageDays };
  }
  return null;
}

export function TodayPipelineView({ leads, offers, setters }: { leads: LeadRow[]; offers: Offer[]; setters: SetterRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = leads
    .map((lead) => buildTask(lead, today))
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => a.priority - b.priority || b.lead.potentialValueEur - a.lead.potentialValueEur)
    .slice(0, 5);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="today-pipeline-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="today-pipeline-heading" className="text-lg font-bold">À faire aujourd&apos;hui</h2>
          <p className="mt-1 text-sm text-muted-foreground">Les actions qui débloquent le plus vite ton pipeline.</p>
        </div>
        <span className="text-sm font-bold text-muted-foreground">{tasks.length} action{tasks.length > 1 ? "s" : ""}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="sticker-card-dashed flex flex-col gap-2 p-6">
          <p className="font-bold">Rien d&apos;urgent aujourd&apos;hui.</p>
          <p className="text-sm text-muted-foreground">Ajoute un rappel ou passe en vue Stage pour continuer à piloter tes leads.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map(({ lead, status, reason, action, ageDays }) => {
            const offer = offers.find((item) => item.id === lead.offerId);
            const setter = setters.find((item) => item.id === lead.setterId);
            const isOverdue = status === "En retard";
            return (
              <article
                key={lead.id}
                className={cn(
                  "sticker-card flex flex-col gap-3 p-4 transition-colors md:grid md:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_auto_auto] md:items-center md:gap-4",
                  isOverdue && "border-accent/60 bg-accent-soft/30"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/acquisition/pipeline?lead=${lead.id}`} className="truncate font-bold hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <StatusBadge status={status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm md:block">
                  <div>
                    <p className="text-xs text-muted-foreground">Valeur</p>
                    <p className="font-bold tabular-nums">{formatEur(lead.potentialValueEur)}</p>
                  </div>
                  <div className="md:mt-2">
                    <p className="text-xs text-muted-foreground">Ancienneté</p>
                    <p className="font-bold">{ageDays} j</p>
                  </div>
                </div>
                <div className="text-sm md:min-w-32">
                  <p className="text-xs text-muted-foreground">Source · étape</p>
                  <p className="mt-0.5 font-bold">{LEAD_SOURCE_LABELS[lead.source]} · {LEAD_STAGE_LABELS[lead.stage]}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{offer?.name ?? setter?.name ?? "Sans attribution"}</p>
                </div>
                <Link
                  href={`/acquisition/pipeline?lead=${lead.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold text-muted-foreground transition-colors hover:border-border-hover hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {action} →
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
