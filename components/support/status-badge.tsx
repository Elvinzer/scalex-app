import { useTranslations } from "next-intl";

import type { SupportTicketPriority, SupportTicketStatus } from "@/lib/support/types";
import { cn } from "@/lib/utils";

export function SupportStatusBadge({ status }: { status: SupportTicketStatus }) {
  const t = useTranslations("support");
  const tone = {
    new: "bg-accent-2-soft text-accent-2-text",
    triage: "bg-state-caution/12 text-state-caution",
    in_progress: "bg-accent-soft text-accent-text",
    waiting_on_user: "bg-state-caution/12 text-state-caution",
    resolved: "bg-state-healthy/12 text-state-healthy",
    closed: "bg-muted text-muted-foreground",
    duplicate: "bg-muted text-muted-foreground",
    declined: "bg-state-critical/10 text-state-critical",
  }[status];
  return <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-bold", tone)}>{t(`status.${status}`)}</span>;
}

export function SupportPriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  const t = useTranslations("support");
  const tone = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-accent-2-soft text-accent-2-text",
    high: "bg-state-caution/12 text-state-caution",
    blocking: "bg-state-critical/10 text-state-critical",
  }[priority];
  return <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-bold", tone)}>{t(`priority.${priority}`)}</span>;
}
