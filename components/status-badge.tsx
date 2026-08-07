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
