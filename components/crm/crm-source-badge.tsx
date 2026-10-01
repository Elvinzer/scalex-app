import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  BriefcaseBusiness,
  CirclePlay,
  Globe2,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Music2,
  UsersRound,
  X,
} from "lucide-react";

import { CRM_LEAD_SOURCES, type CrmLeadSource } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

type CrmSourceMeta = {
  Icon: LucideIcon;
  className: string;
};

const CRM_SOURCE_META: Record<CrmLeadSource, CrmSourceMeta> = {
  instagram: { Icon: Aperture, className: "border-accent-border bg-accent-soft text-accent-text" },
  tiktok: { Icon: Music2, className: "border-surface-dark bg-surface-dark text-text-on-dark" },
  youtube: { Icon: CirclePlay, className: "border-state-critical/30 bg-state-critical-bg text-state-critical" },
  linkedin: { Icon: BriefcaseBusiness, className: "border-accent-2-border bg-accent-2-soft text-accent-2-text" },
  x: { Icon: X, className: "border-surface-dark bg-surface-dark text-text-on-dark" },
  facebook: { Icon: UsersRound, className: "border-accent-2-border bg-accent-2-soft text-accent-2-text" },
  whatsapp: { Icon: MessageCircle, className: "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" },
  email_newsletter: { Icon: Mail, className: "border-state-caution/30 bg-state-caution-bg text-state-caution" },
  ads: { Icon: Megaphone, className: "border-accent-border bg-accent-soft text-accent-text" },
  bouche_a_oreille: { Icon: MessagesSquare, className: "border-state-caution/30 bg-state-caution-bg text-state-caution" },
  autre: { Icon: Globe2, className: "border-border bg-muted text-muted-foreground" },
};

function normalizeSource(source: string): CrmLeadSource {
  return CRM_LEAD_SOURCES.find((candidate) => candidate === source) ?? "autre";
}

export function CrmSourceBadge({ source, label, className }: { source: string; label: string; className?: string }) {
  const normalizedSource = normalizeSource(source);
  const { Icon, className: sourceClassName } = CRM_SOURCE_META[normalizedSource];

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold", sourceClassName, className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </span>
  );
}
