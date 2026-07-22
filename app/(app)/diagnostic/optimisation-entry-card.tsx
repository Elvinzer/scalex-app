import Link from "next/link";

import { Button } from "@/components/ui/button";

// In-flow entry point to the optimisation questionnaire — replaces the old
// top-right "Optimisation" tab, which read as a peer view of the overview
// rather than the actionable task it is. Placed right before the opportunities
// it unlocks ("Et si tu ajoutais ça ?") so the "why answer" is obvious.
export function OptimisationEntryCard({
  answered,
  total,
  remaining,
}: {
  answered: number;
  total: number;
  remaining: number;
}) {
  if (remaining <= 0) {
    return (
      <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="text-lg">✅</span>
          <div>
            <p className="font-bold">Questionnaire d&apos;optimisation terminé</p>
            <p className="text-sm text-muted-foreground">Tu as passé en revue tes {total} leviers.</p>
          </div>
        </div>
        <Link href="/diagnostic?tab=discovery" className="text-sm font-bold text-accent-text hover:underline">
          Voir mes optimisations →
        </Link>
      </div>
    );
  }

  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="sticker-card animate-rise flex flex-col gap-4 border-accent/40 bg-linear-to-br from-accent-soft to-transparent p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔓</span>
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Optimisation</p>
            <p className="mt-0.5 font-bold">Débloque tes leviers d&apos;optimisation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Réponds à {remaining} question{remaining > 1 ? "s" : ""} sur tes leviers pour révéler ce que tu peux
              ajouter ou améliorer dans ton business.
            </p>
          </div>
        </div>
        <Button size="lg" asChild className="shrink-0">
          <Link href="/diagnostic?tab=discovery">Répondre aux questions →</Link>
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          {answered}/{total}
        </span>
      </div>
    </div>
  );
}
