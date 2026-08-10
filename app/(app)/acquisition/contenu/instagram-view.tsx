"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { InfoPopover } from "@/components/info-popover";
import { computePostRates } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";

import { PeriodPills } from "./period-pills";
import { PostsTable } from "./posts-table";

// The data panel for Instagram. The parent shell owns the period so switching
// platforms does not reset the user's selected window.
export function InstagramView({
  posts,
  instagramInsights,
  period,
  onPeriodChange,
}: {
  posts: ContentPostRow[];
  instagramInsights: Map<string, InstagramPostInsightRow>;
  period: DateFilterKey;
  onPeriodChange: (period: DateFilterKey) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("content");
  const filtered = useMemo(() => posts.filter((post) => isWithinPeriod(post.publishedAt, period)), [posts, period]);
  const totalViews = filtered.reduce((sum, post) => sum + post.views, 0);
  const clickRates = filtered.map((post) => computePostRates(post).clickRate).filter((rate): rate is number => rate !== null);
  const avgClickRate = clickRates.length > 0 ? clickRates.reduce((sum, rate) => sum + rate, 0) / clickRates.length : null;
  const totalLeads = filtered.reduce((sum, post) => sum + (post.leads ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PeriodPills period={period} onChange={onPeriodChange} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("instagramViews")}</p>
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat(locale).format(totalViews)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">{t("instagramCtr")}</p>
            <InfoPopover text={t("instagramCtrHelp")} />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{avgClickRate === null ? "—" : formatPercent(avgClickRate, locale)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">{t("instagramLeads")}</p>
            <InfoPopover text={t("instagramLeadsHelp")} />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat(locale).format(totalLeads)}</p>
        </div>
      </div>

      <PostsTable posts={posts} period={period} instagramInsights={instagramInsights} />
    </div>
  );
}
