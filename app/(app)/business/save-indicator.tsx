import type { SaveStatus } from "./use-debounced-save";

export function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "idle") return null;

  if (status === "saving") {
    return <span className="text-xs font-medium text-muted-foreground">Enregistrement...</span>;
  }

  if (status === "error") {
    return <span className="text-xs font-medium text-state-critical">{error ?? "Erreur"}</span>;
  }

  return <span className="text-xs font-medium text-state-healthy">Enregistré ✓</span>;
}

export function CompletionBadge({ answered, total }: { answered: number; total: number }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
      {answered}/{total} renseigné{answered > 1 ? "s" : ""}
    </span>
  );
}
