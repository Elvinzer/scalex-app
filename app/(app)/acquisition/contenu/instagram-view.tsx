"use client";

import { useMemo, useState } from "react";

import { InfoPopover } from "@/components/info-popover";
import { computePostRates } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";

import { PeriodPills } from "./period-pills";
import { PostsTable } from "./posts-table";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

// The interactive half of /acquisition/contenu/instagram — period state has
// to live client-side because it drives both the KPI tiles and the table.
// The connection card is deliberately NOT rendered here: once the account is
// synced it belongs to /integrations only (see the page's own comment).
export function InstagramView({
  posts,
  instagramInsights,
}: {
  posts: ContentPostRow[];
  instagramInsights: Map<string, InstagramPostInsightRow>;
}) {
  const [period, setPeriod] = useState<DateFilterKey>("all");

  const filtered = useMemo(() => posts.filter((post) => isWithinPeriod(post.publishedAt, period)), [posts, period]);
  const totalViews = filtered.reduce((sum, post) => sum + post.views, 0);
  const clickRates = filtered.map((post) => computePostRates(post).clickRate).filter((rate): rate is number => rate !== null);
  const avgClickRate = clickRates.length > 0 ? clickRates.reduce((sum, rate) => sum + rate, 0) / clickRates.length : null;
  const totalLeads = filtered.reduce((sum, post) => sum + (post.leads ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PeriodPills period={period} onChange={setPeriod} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Vues sur la période</p>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(totalViews)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">Taux de clic moyen</p>
            <InfoPopover text="Instagram ne fournit aucune donnée de clics sortants pour un post organique — ce chiffre reste vide par nature, ce n'est pas un bug." />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{avgClickRate === null ? "—" : formatPercent(avgClickRate)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">Leads attribués</p>
            <InfoPopover text="Un lead attribué à un post nécessite un rattachement manuel, qui n'existe plus depuis que le contenu vient uniquement d'Instagram — ce chiffre reste à 0 pour l'instant." />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(totalLeads)}</p>
        </div>
      </div>

      <PostsTable posts={posts} period={period} instagramInsights={instagramInsights} />
    </div>
  );
}
