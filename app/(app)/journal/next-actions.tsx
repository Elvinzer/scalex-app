import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatEur } from "@/lib/currency";

// Bloc 2 du brief — "Les prochaines actions". White cards, deliberately
// quieter than the dark Action du jour above: same engine, lower priority.
// Capped at 4 so the page stays readable in three minutes (the brief's own
// success criterion) rather than becoming a backlog.
export type NextAction = {
  key: string;
  title: string;
  originLabel: string;
  effortLabel: string;
  monthlyGainEur: number | null;
  href: string;
};

const MAX_NEXT_ACTIONS = 4;

export function NextActions({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="next-actions-title">
      <h2 id="next-actions-title" className="text-base font-bold">
        Les prochaines actions
      </h2>
      <ul className="flex flex-col gap-2">
        {actions.slice(0, MAX_NEXT_ACTIONS).map((action) => (
          <li key={action.key}>
            <Link
              href={action.href}
              className="sticker-card flex items-center gap-4 p-4 transition-colors hover:border-border-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{action.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.originLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">Effort : {action.effortLabel}</p>
              </div>
              {action.monthlyGainEur !== null && (
                <p className="shrink-0 text-sm font-bold tabular-nums text-accent-text">
                  ≈{formatEur(action.monthlyGainEur)}/mois
                </p>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
