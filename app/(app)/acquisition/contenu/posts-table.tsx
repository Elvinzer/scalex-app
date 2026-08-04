"use client";

import { ArrowDown, ArrowUp, Camera, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { InfoPopover } from "@/components/info-popover";
import { InstagramPostDetailDialog } from "@/components/instagram/instagram-post-detail-dialog";
import { computePostRates } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { computePostPerformanceComparisons, type PostPerformanceTier } from "@/lib/instagram/insights-comparison";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

type SortKey = "publishedAt" | "views" | "engagementRate";
type DateFilterKey = "7d" | "30d" | "3m" | "all";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const EXPLANATIONS = {
  topPosts:
    "Classement de tes posts, reels et carrousels par interactions totales (likes + commentaires + partages + enregistrements), depuis la connexion de ton compte Instagram. Les Stories ne sont pas incluses : leur seule mesure comparable, la portée, n'est pas sur la même échelle.",
  interactions:
    "Somme des likes, commentaires, partages et enregistrements sur ce post, remontée directement par Instagram. Le badge à côté compare ce post à la médiane de tes autres posts du même type (feed ou story) : au-dessus, dans la moyenne, ou en dessous.",
  engagement: "(Likes + commentaires + partages) / vues, en %.",
} as const;

const DATE_FILTERS: { key: DateFilterKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 jours", days: 7 },
  { key: "30d", label: "30 jours", days: 30 },
  { key: "3m", label: "3 mois", days: 90 },
  { key: "all", label: "Tout", days: null },
];

// Same token pattern as components/import/import-preview.tsx's
// CONFIDENCE_CLASS — semantic state tokens only, never a hex/raw Tailwind
// color (CLAUDE.md's DA rule).
const TIER_CLASS: Record<PostPerformanceTier, string> = {
  above: "bg-state-healthy-bg text-state-healthy",
  inline: "bg-muted text-muted-foreground",
  below: "bg-state-critical-bg text-state-critical",
};

// Small thumbnail for the title cell. thumbnailUrl is preferred whenever
// present — it's the resolved "cover" for anything that isn't a plain
// static image (VIDEO/REELS' cover frame, a CAROUSEL_ALBUM's first child,
// see lib/instagram/client.ts's fetchCarouselChildren) — falling back to
// mediaUrl (the raw file, only ever renderable as an <img> for IMAGE) only
// when there's no cover. Both are short-lived signed Instagram CDN URLs
// (see db/schema.ts's instagramPostInsights) — a broken/expired link falls
// back to a plain icon rather than a broken-image glyph.
function PostThumbnail({ insight }: { insight: InstagramPostInsightRow | undefined }) {
  const [broken, setBroken] = useState(false);
  const src = insight ? (insight.thumbnailUrl ?? insight.mediaUrl) : null;

  if (!src || broken) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-muted">
        <Camera className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, short-lived signed CDN URL, not a Next-optimizable asset
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-10 shrink-0 rounded-[var(--radius-control)] border border-border object-cover"
    />
  );
}

// All-time best regular posts by raw engagement (total_interactions) —
// deliberately excludes Stories: their only comparable metric is reach, a
// different scale entirely (ephemeral views vs. permanent-post engagement),
// and "my best posts" doesn't intuitively include stories for most
// creators anyway. Independent of the date filter below (this panel always
// means "ever", by design).
const TOP_POSTS_COUNT = 3;

function computeTopPosts(
  posts: ContentPostRow[],
  instagramInsights: Map<string, InstagramPostInsightRow> | undefined
): { post: ContentPostRow; insight: InstagramPostInsightRow }[] {
  if (!instagramInsights) return [];
  const withMetric = posts
    .map((post) => ({ post, insight: post.externalId ? instagramInsights.get(post.externalId) : undefined }))
    .filter(
      (entry): entry is { post: ContentPostRow; insight: InstagramPostInsightRow } =>
        entry.insight !== undefined && entry.insight.mediaType !== "STORY" && entry.insight.totalInteractions !== null
    );
  withMetric.sort((a, b) => b.insight.totalInteractions! - a.insight.totalInteractions!);
  return withMetric.slice(0, TOP_POSTS_COUNT);
}

// #1 reuses the same accent-soft highlight already used for the "Top"
// badge in the table below (posts-table.tsx's monthly best-post badge) —
// consistent visual language for "this one stands out" across the page.
// #2/#3 stay on neutral muted tokens so #1 reads as the standout, per the
// DA rule against repeating an accent treatment across equivalent items.
function TopPostsPanel({ entries }: { entries: { post: ContentPostRow; insight: InstagramPostInsightRow }[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="sticker-card p-6">
      <div className="flex items-center gap-1.5">
        <h2 className="text-base font-bold">Tes 3 meilleurs posts</h2>
        <InfoPopover text={EXPLANATIONS.topPosts} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Classés par interactions, tous posts confondus depuis ta connexion.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {entries.map(({ post, insight }, index) => (
          <a
            key={post.id}
            href={post.url ?? undefined}
            target={post.url ? "_blank" : undefined}
            rel={post.url ? "noreferrer" : undefined}
            className={cn(
              "flex flex-col gap-3 rounded-[var(--radius-control)] border p-4 transition-colors",
              index === 0 ? "border-accent-border bg-accent-soft" : "border-border hover:border-border-hover"
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  index === 0 ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <PostThumbnail insight={insight} />
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-bold", index === 0 && "text-accent-text")}>{post.title}</p>
                <p className="text-xs text-muted-foreground">{DATE_FORMAT.format(new Date(post.publishedAt))}</p>
              </div>
            </div>
            <p className="font-display text-2xl font-bold tabular-nums">
              {NUMBER_FORMAT.format(insight.totalInteractions!)}
              <span className="ml-1.5 font-sans text-xs font-bold text-muted-foreground">interactions</span>
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

export function PostsTable({
  posts,
  topPostId,
  instagramInsights,
}: {
  posts: ContentPostRow[];
  topPostId: string | null;
  instagramInsights?: Map<string, InstagramPostInsightRow>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");

  // Independent of the date filter — "ever" means ever, not "in the
  // selected window". Computed from the full, unfiltered `posts`.
  const topPosts = useMemo(() => computeTopPosts(posts, instagramInsights), [posts, instagramInsights]);

  const filteredPosts = useMemo(() => {
    const days = DATE_FILTERS.find((f) => f.key === dateFilter)?.days ?? null;
    if (days === null) return posts;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return posts.filter((post) => post.publishedAt >= cutoffStr);
  }, [posts, dateFilter]);

  const sorted = useMemo(() => {
    const withRates = filteredPosts.map((post) => ({ post, rates: computePostRates(post) }));

    withRates.sort((a, b) => {
      const valueOf = (entry: (typeof withRates)[number]) =>
        sortKey === "publishedAt" || sortKey === "views" ? entry.post[sortKey] : (entry.rates[sortKey] ?? -1);
      const diff = (valueOf(a) as number) < (valueOf(b) as number) ? -1 : (valueOf(a) as number) > (valueOf(b) as number) ? 1 : 0;
      return sortDesc ? -diff : diff;
    });

    return withRates;
  }, [filteredPosts, sortKey, sortDesc]);

  const comparisons = useMemo(
    () => computePostPerformanceComparisons(Array.from(instagramInsights?.values() ?? [])),
    [instagramInsights]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyValue)}
        className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        {label}
        {active ? sortDesc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucun post synchronisé pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Connecte ton compte Instagram ci-dessus pour voir tes posts.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TopPostsPanel entries={topPosts} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">Période :</span>
        {DATE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setDateFilter(filter.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
              dateFilter === filter.key
                ? "border-accent-border bg-accent-soft text-accent-text"
                : "border-border text-muted-foreground hover:border-border-hover"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucun post sur cette période</p>
          <p className="mt-1 text-sm text-muted-foreground">Choisis &laquo;&nbsp;Tout&nbsp;&raquo; pour voir l&apos;historique complet.</p>
        </div>
      ) : (
        <div className="sticker-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left"><SortHeader label="Date" sortKeyValue="publishedAt" /></th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Titre</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Plateforme</th>
                <th className="p-3 text-right"><SortHeader label="Vues" sortKeyValue="views" /></th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Interactions</span>
                    <InfoPopover text={EXPLANATIONS.interactions} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SortHeader label="Engagement" sortKeyValue="engagementRate" />
                    <InfoPopover text={EXPLANATIONS.engagement} />
                  </div>
                </th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ post, rates }) => {
                const insight = post.externalId ? instagramInsights?.get(post.externalId) : undefined;
                return (
                  <tr key={post.id} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{post.publishedAt}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <PostThumbnail insight={insight} />
                        <div className="flex items-center gap-2">
                          {post.url ? (
                            <a href={post.url} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                              {post.title}
                            </a>
                          ) : (
                            <span className="font-bold">{post.title}</span>
                          )}
                          {post.id === topPostId && (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-text uppercase">
                              Top
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {post.source === "instagram" && <Camera className="size-3.5 shrink-0" aria-label="Synchronisé depuis Instagram" />}
                        {post.platform}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{NUMBER_FORMAT.format(post.views)}</td>
                    <td className={cn("p-3 text-right tabular-nums", insight?.totalInteractions == null && "text-muted-foreground")}>
                      {insight?.totalInteractions == null ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {NUMBER_FORMAT.format(insight.totalInteractions)}
                          {(() => {
                            const comparison = comparisons.get(insight.mediaId);
                            if (!comparison) return null;
                            const pct = Math.round((comparison.ratio - 1) * 100);
                            return (
                              <span
                                className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", TIER_CLASS[comparison.tier])}
                                title={`${
                                  comparison.tier === "above" ? "Au-dessus" : comparison.tier === "below" ? "En dessous" : "Dans la moyenne"
                                } de tes ${comparison.cohortSize} posts comparables`}
                              >
                                {comparison.tier === "inline" ? "≈" : `${pct > 0 ? "+" : ""}${pct}%`}
                              </span>
                            );
                          })()}
                        </span>
                      )}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", rates.engagementRate === null && "text-muted-foreground")}>
                      {rates.engagementRate === null ? "—" : formatPercent(rates.engagementRate)}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {insight && (
                          <InstagramPostDetailDialog
                            insight={insight}
                            trigger={
                              <Button type="button" variant="ghost" size="icon-sm" aria-label="Voir le détail">
                                <Camera className="size-3.5" />
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
