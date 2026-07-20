import { Store } from "lucide-react";

import { Button } from "@/components/ui/button";

// Additive-only nudge shown on Dashboard/Diagnostic/Agent when the business
// profile is too thin to be useful — does not change what those pages
// actually compute (Phase 1 of "Mon business"; see plan doc).
export function BusinessNudgeBanner() {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--radius-card)] border border-accent-border bg-accent-soft px-6 py-4 text-accent-text sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-border/40 text-accent-text">
          <Store className="size-4.5" />
        </span>
        <div>
          <p className="text-sm font-bold">
            Renseigne tes offres dans Mon business pour chiffrer ton manque à gagner
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <a href="/business">Compléter →</a>
      </Button>
    </div>
  );
}
