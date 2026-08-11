import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { StatusBadge } from "@/components/status-badge";
import type { Offer } from "@/lib/business/types";
import type { LeadRow } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

type TodayTask = {
  lead: LeadRow;
  status: "overdue" | "reschedule" | "callToday" | "stagnant" | "qualify";
  reasonKey: "overdueReason" | "noShowReason" | "prepareCallReason" | "stagnantReason" | "qualifyReason";
  actionKey: "followUp" | "offerSlot" | "prepare" | "qualify";
  priority: number;
  ageDays: number;
};

function daysSince(value: string): number {
  const elapsed = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

function buildTask(lead: LeadRow, today: string): TodayTask | null {
  const ageDays = daysSince(lead.createdAt);
  if (lead.reminderDate && !lead.reminderDone && lead.reminderDate < today) {
    return { lead, status: "overdue", reasonKey: lead.reminderNote ? "overdueReason" : "overdueReason", actionKey: "followUp", priority: 0, ageDays };
  }
  if (lead.isNoShow) {
    return { lead, status: "reschedule", reasonKey: "noShowReason", actionKey: "offerSlot", priority: 1, ageDays };
  }
  if (lead.stage === "rdv_fixe") {
    return { lead, status: "callToday", reasonKey: "prepareCallReason", actionKey: "prepare", priority: 2, ageDays };
  }
  if (lead.stage === "conversation" && daysSince(lead.updatedAt) >= 14) {
    return { lead, status: "stagnant", reasonKey: "stagnantReason", actionKey: "followUp", priority: 3, ageDays };
  }
  if (lead.stage === "nouveau_lead") {
    return { lead, status: "qualify", reasonKey: "qualifyReason", actionKey: "qualify", priority: 4, ageDays };
  }
  return null;
}

export function TodayPipelineView({ leads, offers, setters }: { leads: LeadRow[]; offers: Offer[]; setters: SetterRow[] }) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  const today = new Date().toISOString().slice(0, 10);
  const tasks = leads
    .map((lead) => buildTask(lead, today))
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => a.priority - b.priority || b.lead.potentialValueEur - a.lead.potentialValueEur)
    .slice(0, 5);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="today-pipeline-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="today-pipeline-heading" className="text-lg font-bold">{t("todayTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("todayHelp")}</p>
        </div>
        <span className="text-sm font-bold text-muted-foreground">{t("actionCount", { count: tasks.length, plural: tasks.length > 1 ? "s" : "" })}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="sticker-card-dashed flex flex-col gap-2 p-6">
          <p className="font-bold">{t("nothingUrgent")}</p>
          <p className="text-sm text-muted-foreground">{t("nothingUrgentHelp")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map(({ lead, status, reasonKey, actionKey, ageDays }) => {
            const offer = offers.find((item) => item.id === lead.offerId);
            const setter = setters.find((item) => item.id === lead.setterId);
            const isOverdue = status === "overdue";
            return (
              <article
                key={lead.id}
                className={cn(
                  "sticker-card flex flex-col gap-3 p-4 transition-colors md:grid md:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_auto_auto] md:items-center md:gap-4",
                  isOverdue && "border-accent/60 bg-accent-soft/30"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/ventes/pipeline?lead=${lead.id}`} className="truncate font-bold hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <StatusBadge status={t(`todayStatus.${status}`)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t(`todayReason.${reasonKey}`)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm md:block">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("value")}</p>
                    <p className="font-bold tabular-nums">{new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(lead.potentialValueEur)}</p>
                  </div>
                  <div className="md:mt-2">
                    <p className="text-xs text-muted-foreground">{t("age")}</p>
                    <p className="font-bold">{ageDays} {t("daysShort")}</p>
                  </div>
                </div>
                <div className="text-sm md:min-w-32">
                  <p className="text-xs text-muted-foreground">{t("sourceStage")}</p>
                  <p className="mt-0.5 font-bold">{t(`source.${lead.source}`)} · {t(`stage.${lead.stage}`)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{offer?.name ?? setter?.name ?? t("unassigned")}</p>
                </div>
                <Link
                  href={`/ventes/pipeline?lead=${lead.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold text-muted-foreground transition-colors hover:border-border-hover hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t(`todayAction.${actionKey}`)} →
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
