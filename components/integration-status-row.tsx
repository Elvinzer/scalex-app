import { CheckCircle2, CircleAlert, CircleDashed, LoaderCircle, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type IntegrationStatus = "connected" | "syncing" | "plan_limited" | "error" | "not_connected";

const statusCopy: Record<IntegrationStatus, { tone: string; Icon: typeof CheckCircle2 }> = {
  connected: { tone: "text-state-healthy", Icon: CheckCircle2 },
  syncing: { tone: "text-muted-foreground", Icon: LoaderCircle },
  plan_limited: { tone: "text-state-caution", Icon: LockKeyhole },
  error: { tone: "text-state-critical", Icon: CircleAlert },
  not_connected: { tone: "text-state-caution", Icon: CircleDashed },
};

export function IntegrationStatusRow({
  name,
  status,
  detail,
  action,
  showStatusLabel = true,
  className,
}: {
  name: string;
  status: IntegrationStatus;
  detail: string;
  action?: React.ReactNode;
  showStatusLabel?: boolean;
  className?: string;
}) {
  const t = useTranslations("common");
  const copy = statusCopy[status];
  const Icon = copy.Icon;

  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 sm:px-4", className)}>
      <Icon className={cn("size-4 shrink-0", copy.tone, status === "syncing" && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{showStatusLabel ? `${name} · ${t(`integration.${status}`)}` : name}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
