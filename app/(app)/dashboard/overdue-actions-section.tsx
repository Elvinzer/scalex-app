import { KeyRound, Phone, RefreshCw, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OverdueAction, OverdueActionIcon } from "@/lib/dashboard/overdue-actions";

const ICONS: Record<OverdueActionIcon, typeof Phone> = {
  call: Phone,
  lead: UserRound,
  key: KeyRound,
  sync: RefreshCw,
};

// Same sticker-card + colour-dot list pattern as ventes/appels' "Décisions en
// attente" (PendingDecisions) — but every row here is already overdue, so
// the badge and rows use state-critical throughout instead of a neutral
// count + per-row urgency tone.
export function OverdueActionsSection({ actions }: { actions: OverdueAction[] }) {
  const t = useTranslations("dashboard");
  if (actions.length === 0) return null;

  return (
    <div className="sticker-card animate-rise p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold">{t("overdueTitle")}</p>
        <span className="rounded-full bg-state-critical/15 px-2 py-0.5 text-xs font-bold text-state-critical">
          {actions.length}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {actions.map((action) => {
          const Icon = ICONS[action.icon];
          return (
            <li key={action.id}>
              <a
                href={action.href}
                className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-state-critical/10 text-state-critical">
                  <Icon className="size-3.5" />
                </span>
                <span className="w-32 shrink-0 text-xs font-bold text-state-critical">{action.urgencyLabel}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-bold">{action.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{action.detail}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">{t("openArrow")}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
