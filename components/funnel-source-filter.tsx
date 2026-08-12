"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { trackClient } from "@/lib/analytics-client";
import type { FunnelSourceKey } from "@/lib/funnel-blocks/types";

export function FunnelSourceFilter({
  sources,
  availableSources,
  value,
  sourceHref,
  showUnavailableHelp = true,
}: {
  sources: FunnelSourceKey[];
  availableSources: FunnelSourceKey[];
  value: FunnelSourceKey | "total";
  sourceHref?: string;
  showUnavailableHelp?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("funnelBlocks.page");
  const tSource = useTranslations("funnelBlocks.sources");
  const available = new Set(availableSources);

  function href(source: FunnelSourceKey | "total"): string {
    const params = new URLSearchParams(searchParams.toString());
    if (source === "total") params.delete("source");
    else params.set("source", source);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function select(source: FunnelSourceKey | "total") {
    if (source !== "total") trackClient("source_filter_used", { source });
  }

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2" data-testid="funnel-source-filter" role="group" aria-label={t("sourceBreakdown")}>
      <Link
        href={href("total")}
        onClick={() => select("total")}
        aria-current={value === "total" ? "page" : undefined}
        className={value === "total" ? "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-accent bg-accent-soft px-4 py-2 text-xs font-bold text-accent-text" : "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-border-hover"}
      >
        {t("total")}
      </Link>
      {sources.map((source) => {
        const isAvailable = available.has(source);
        if (!isAvailable) {
          return (
            <span key={source} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground opacity-60">
              <button type="button" disabled title={t("sourceUnavailable")} className="cursor-not-allowed">{tSource(source)}</button>
              <Link href={sourceHref ?? "/acquisition"} className="underline opacity-100 hover:text-foreground">{t("sourceLink")}</Link>
            </span>
          );
        }
        return (
          <Link
            key={source}
            href={href(source)}
            onClick={() => select(source)}
            aria-current={value === source ? "page" : undefined}
            className={value === source ? "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-accent bg-accent-soft px-4 py-2 text-xs font-bold text-accent-text" : "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-border-hover"}
          >
            {tSource(source)}
          </Link>
        );
      })}
      {showUnavailableHelp && availableSources.length === 0 && <span className="text-xs text-muted-foreground">{t("sourceUnavailable")}</span>}
    </div>
  );
}
