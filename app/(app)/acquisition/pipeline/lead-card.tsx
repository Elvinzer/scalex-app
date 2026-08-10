"use client";

import { useDraggable } from "@dnd-kit/core";
import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { LeadRow } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Visual pastille only — no push/email, see lib/leads/types.ts's comment.
// Shown within a small look-ahead window so a rappel isn't a surprise the
// morning it's due.
function isReminderDue(reminderDate: string | null, reminderDone: boolean): boolean {
  if (!reminderDate || reminderDone) return false;
  const due = new Date(`${reminderDate}T00:00:00Z`);
  const lookahead = new Date();
  lookahead.setUTCDate(lookahead.getUTCDate() + 2);
  return due <= lookahead;
}

export function LeadCard({
  lead,
  offerName,
  setter,
  commentCount,
  isTargeted = false,
  onClick,
}: {
  lead: LeadRow;
  offerName: string | null;
  setter: SetterRow | null;
  commentCount: number;
  isTargeted?: boolean;
  onClick: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      id={`pipeline-lead-${lead.id}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={t("openLead", { name: `${lead.firstName} ${lead.lastName}` })}
      className={cn(
        "sticker-card flex cursor-grab flex-col gap-2 p-3 text-sm outline-none active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-accent/25",
        isTargeted && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">
          {lead.firstName} {lead.lastName}
        </p>
        {lead.stage === "rdv_fixe" && lead.isNoShow && (
          <span className="shrink-0 rounded-full bg-state-critical-bg px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-state-critical">
            {t("noShow")}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t(`source.${lead.source}`)}</p>
      {offerName && <p className="text-xs text-muted-foreground">{offerName}</p>}

      <p className="font-display text-base font-bold tabular-nums">{new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(lead.potentialValueEur)}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {setter && (
            <span
              title={`${t("setter")} : ${setter.name}`}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-accent-2-soft text-[10px] font-bold text-accent-2-text"
            >
              {initials(setter.name)}
            </span>
          )}
          {lead.closer && (
            <span
              title={`${t("closer")} : ${lead.closer}`}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-accent-soft text-[10px] font-bold text-accent-text"
            >
              {initials(lead.closer)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isReminderDue(lead.reminderDate, lead.reminderDone) && (
            <span title={lead.reminderNote ?? t("reminder")} className="size-2 rounded-full bg-state-critical" />
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageCircle className="size-3" />
              {commentCount}
            </span>
          )}
          <span>{daysSince(lead.updatedAt)}j</span>
        </div>
      </div>
    </div>
  );
}
