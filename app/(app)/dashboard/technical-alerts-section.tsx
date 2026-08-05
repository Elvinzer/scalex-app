import { KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";

import type { TechnicalAlert, TechnicalAlertIcon } from "@/lib/dashboard/technical-alerts";

const ICONS: Record<TechnicalAlertIcon, typeof KeyRound> = {
  key: KeyRound,
  sync: RefreshCw,
};

export function TechnicalAlertsSection({ alerts }: { alerts: TechnicalAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="sticker-card p-4" aria-labelledby="technical-alerts-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="technical-alerts-title" className="text-sm font-bold">
            Problèmes techniques
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">À traiter pour garder les données et l’agent à jour.</p>
        </div>
        <span className="rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution">
          {alerts.length}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {alerts.map((alert) => {
          const Icon = ICONS[alert.icon];
          return (
            <li key={alert.id}>
              <Link
                href={alert.href}
                className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-border px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-state-caution-bg text-state-caution" aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{alert.title}</span>
                  <span className="block text-xs text-muted-foreground">{alert.detail}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">Ouvrir →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
