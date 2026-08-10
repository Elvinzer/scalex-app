import { cn } from "@/lib/utils";

const statusClasses: Record<string, string> = {
  soldé: "bg-positive-soft text-positive",
  payé: "bg-positive-soft text-positive",
  "échéance à venir": "bg-accent-2-soft text-accent-2-text",
  "à venir": "bg-accent-2-soft text-accent-2-text",
  "paiement échoué": "bg-state-critical-bg text-state-critical",
  impayé: "bg-state-critical-bg text-state-critical",
  remboursé: "bg-muted text-muted-foreground",
  "virement attendu": "bg-warning-soft text-warning-text",
  "à rattacher": "bg-warning-soft text-warning-text",
  "no-show": "bg-state-critical-bg text-state-critical",
  présent: "bg-positive-soft text-positive",
  annulé: "bg-muted text-muted-foreground",
  "en retard": "bg-state-critical-bg text-state-critical",
  "à reprogrammer": "bg-warning-soft text-warning-text",
  "appel aujourd'hui": "bg-accent-2-soft text-accent-2-text",
  stagnant: "bg-warning-soft text-warning-text",
  "à qualifier": "bg-muted text-muted-foreground",
  sold: "bg-positive-soft text-positive",
  paid: "bg-positive-soft text-positive",
  "upcoming payment": "bg-accent-2-soft text-accent-2-text",
  upcoming: "bg-accent-2-soft text-accent-2-text",
  "failed payment": "bg-state-critical-bg text-state-critical",
  unpaid: "bg-state-critical-bg text-state-critical",
  refunded: "bg-muted text-muted-foreground",
  "transfer expected": "bg-warning-soft text-warning-text",
  "to attach": "bg-warning-soft text-warning-text",
  showed: "bg-positive-soft text-positive",
  cancelled: "bg-muted text-muted-foreground",
  overdue: "bg-state-critical-bg text-state-critical",
  reschedule: "bg-warning-soft text-warning-text",
  "call today": "bg-accent-2-soft text-accent-2-text",
  qualify: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const normalized = status.trim().toLocaleLowerCase("fr-FR");
  const text = label ?? status;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", statusClasses[normalized] ?? "bg-muted text-muted-foreground", className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  );
}
