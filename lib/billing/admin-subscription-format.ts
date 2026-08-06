import { formatUsdCents } from "@/lib/currency";

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai en cours",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  canceled: "Annulé",
  incomplete: "Paiement incomplet",
  incomplete_expired: "Paiement expiré",
  paused: "En pause",
};

export type SubscriptionStatusTone = "healthy" | "caution" | "critical" | "neutral";

export function formatSubscriptionStatus(status: string): string {
  return STATUS_LABELS[status] ?? "Statut inconnu";
}

export function getSubscriptionStatusTone(status: string): SubscriptionStatusTone {
  if (status === "active" || status === "trialing") return "healthy";
  if (status === "past_due" || status === "incomplete" || status === "paused") return "caution";
  if (status === "unpaid" || status === "canceled" || status === "incomplete_expired") return "critical";
  return "neutral";
}

export function getSubscriptionStatusClassName(status: string): string {
  const tone = getSubscriptionStatusTone(status);
  if (tone === "healthy") return "border-state-healthy/30 bg-state-healthy-bg text-state-healthy";
  if (tone === "caution") return "border-state-caution/30 bg-state-caution/10 text-state-caution";
  if (tone === "critical") return "border-state-critical/30 bg-state-critical-bg text-state-critical";
  return "border-border bg-muted text-muted-foreground";
}

export function formatSubscriptionAmount(cents: number | null): string {
  return cents === null || cents < 0 ? "À vérifier" : formatUsdCents(cents);
}

export function formatSubscriptionDate(date: Date | null): string {
  if (!date) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

export function formatSubscriptionDateTime(date: Date | null): string {
  if (!date) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
