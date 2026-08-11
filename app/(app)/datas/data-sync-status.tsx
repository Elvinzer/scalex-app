import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { DataQualitySource, DataQualitySummary } from "@/lib/diagnostic/data-quality";

const SOURCE_KEYS: DataQualitySource["key"][] = ["monthly", "calls", "sales", "pipeline", "content", "email", "meta", "bookings", "delivery"];

function SourceIcon({ state }: { state: DataQualitySource["state"] }) {
  if (state === "active") return <CircleCheck className="size-4 text-state-healthy" aria-hidden="true" />;
  if (state === "not_tracked") return <CircleAlert className="size-4 text-state-caution" aria-hidden="true" />;
  return <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />;
}

export async function DataSyncStatus({ summary }: { summary: DataQualitySummary }) {
  const t = await getTranslations("data.sync");

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-5" aria-labelledby="data-sync-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="data-sync-title" className="text-base font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
        </div>
        <p className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          {t("active", { active: summary.activeSources, total: summary.totalSources })}
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCE_KEYS.map((key) => {
          const source = summary.sources.find((item) => item.key === key);
          if (!source) return null;
          return (
            <div key={source.key} className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5">
              <SourceIcon state={source.state} />
              <div className="min-w-0">
                <p className="text-sm font-bold">{t(`sources.${source.key}.label`)}</p>
                <p className="text-xs text-muted-foreground">
                  {source.state === "active" ? t("records", { count: source.records }) : t(`sources.${source.key}.${source.state}`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
