import { CheckCircle2, CircleAlert, CircleDashed, LoaderCircle, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

export type IntegrationStatus = "connected" | "syncing" | "plan_limited" | "error" | "not_connected";

const statusCopy: Record<IntegrationStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: "Connecté", tone: "text-state-healthy", Icon: CheckCircle2 },
  syncing: { label: "Synchronisation en cours", tone: "text-muted-foreground", Icon: LoaderCircle },
  plan_limited: { label: "Accès limité par le plan", tone: "text-state-caution", Icon: LockKeyhole },
  error: { label: "Synchronisation échouée", tone: "text-state-critical", Icon: CircleAlert },
  not_connected: { label: "Non lié", tone: "text-state-caution", Icon: CircleDashed },
};

export function IntegrationStatusRow({
  name,
  status,
  detail,
  action,
  className,
}: {
  name: string;
  status: IntegrationStatus;
  detail: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const copy = statusCopy[status];
  const Icon = copy.Icon;

  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 sm:px-4", className)}>
      <Icon className={cn("size-4 shrink-0", copy.tone, status === "syncing" && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name} · {copy.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
