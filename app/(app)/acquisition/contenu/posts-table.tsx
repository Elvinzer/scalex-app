"use client";

import { ArrowDown, ArrowUp, Camera, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { InfoPopover } from "@/components/info-popover";
import { formatWatchTime, InstagramPostDetailDialog } from "@/components/instagram/instagram-post-detail-dialog";
import { computePostRates } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { comparisonMetric, computePostPerformanceComparisons, type PostPerformanceTier } from "@/lib/instagram/insights-comparison";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { Pager } from "./pager";

type SortKey = "publishedAt" | "views" | "interactionRate";

const PAGE_SIZE = 10;
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const EXPLANATIONS = {
  topPosts:
    "Classement de tes posts, reels et carrousels par interactions totales (likes + commentaires + partages + enregistrements), depuis la connexion de ton compte Instagram. Les Stories ne sont pas incluses : leur seule mesure comparable, la portée, n'est pas sur la même échelle.",
  interactionRate:
    "Interactions (likes + commentaires + partages + enregistrements) divisées par la portée du post — le vrai indicateur de performance, indépendant du nombre de personnes touchées. La couleur compare ce post à la médiane de tes autres posts du même type (feed ou story) : vert au-dessus, gris dans la moyenne, rouge en dessous. Vide pour les Stories, qui n'ont pas de métrique d'interactions.",
  partages: "Partages divisés par la portée du post — Instagram donne 3 à 5 fois plus de poids algorithmique à un partage qu'à un like.",
  watchTime:
    "Temps de visionnage moyen par vue, pour les Reels/vidéos uniquement. Instagram ne fournit pas la durée totale de la vidéo via son API, donc un vrai taux de rétention (temps regardé / durée totale) n'est pas calculable — ce chiffre est le temps brut, pas un pourcentage.",
  abonnes: "Nombre de nouveaux abonnés générés directement par ce post, remonté par Instagram.",
} as const;

// Colors the number itself (not a pill) for a fast column-wide scan of
// "what's working" — same principle already used for the big percentage in
// app/(app)/acquisition/pipeline/pipeline-stats-banner.tsx's
// BenchmarkedTile (TIER_TEXT_CLASS there). Semantic state tokens only,
// never a hex/raw Tailwind color (CLAUDE.md's DA rule).
const TIER_TEXT_CLASS: Record<PostPerformanceTier, string> = {
  above: "text-state-healthy",
  inline: "text-foreground",
  below: "text-state-critical",
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
  period,
  instagramInsights,
}: {
  posts: ContentPostRow[];
  period: DateFilterKey;
  instagramInsights?: Map<string, InstagramPostInsightRow>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  // Independent of the date filter — "ever" means ever, not "in the
  // selected window". Computed from the full, unfiltered `posts`.
  const topPosts = useMemo(() => computeTopPosts(posts, instagramInsights), [posts, instagramInsights]);

  const filteredPosts = useMemo(() => posts.filter((post) => isWithinPeriod(post.publishedAt, period)), [posts, period]);

  // Best post *within the selected period*, by view-to-lead rate — reruns
  // whenever `period` changes so the "Top" badge tracks the same window as
  // the KPI cards above, instead of a fixed "this month" the badge used to
  // be pinned to.
  const topPostId = useMemo(() => {
    const best = filteredPosts
      .map((post) => ({ post, rates: computePostRates(post) }))
      .filter((entry) => entry.rates.viewToLeadRate !== null)
      .sort((a, b) => (b.rates.viewToLeadRate ?? 0) - (a.rates.viewToLeadRate ?? 0))[0]?.post;
    return best?.id ?? null;
  }, [filteredPosts]);

  useEffect(() => setPage(1), [period]);

  const comparisons = useMemo(
    () => computePostPerformanceComparisons(Array.from(instagramInsights?.values() ?? [])),
    [instagramInsights]
  );

  // Feed-only interaction rate (see insights-comparison.ts's comparisonMetric)
  // — Stories have no interactions metric, never sortable/colored by it.
  function interactionRateOf(post: ContentPostRow): number | null {
    const insight = post.externalId ? instagramInsights?.get(post.externalId) : undefined;
    return insight && insight.mediaType !== "STORY" ? comparisonMetric(insight) : null;
  }

  const sorted = useMemo(() => {
    const arr = [...filteredPosts];
    arr.sort((a, b) => {
      const valueOf = (post: ContentPostRow) => (sortKey === "publishedAt" || sortKey === "views" ? post[sortKey] : (interactionRateOf(post) ?? -1));
      const diff = (valueOf(a) as number) < (valueOf(b) as number) ? -1 : (valueOf(a) as number) > (valueOf(b) as number) ? 1 : 0;
      return sortDesc ? -diff : diff;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interactionRateOf closes over instagramInsights, already a dep
  }, [filteredPosts, sortKey, sortDesc, instagramInsights]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [sorted, safePage]);

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

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">Tous les posts</h2>
        <p className="text-sm text-muted-foreground">{sorted.length} post{sorted.length > 1 ? "s" : ""} sur la période sélectionnée</p>
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
                    <SortHeader label="Taux d'interaction" sortKeyValue="interactionRate" />
                    <InfoPopover text={EXPLANATIONS.interactionRate} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Partages</span>
                    <InfoPopover text={EXPLANATIONS.partages} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Visionnage</span>
                    <InfoPopover text={EXPLANATIONS.watchTime} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Abonnés</span>
                    <InfoPopover text={EXPLANATIONS.abonnes} />
                  </div>
                </th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {paged.map((post) => {
                const insight = post.externalId ? instagramInsights?.get(post.externalId) : undefined;
                const isStory = insight?.mediaType === "STORY";
                const rate = insight && !isStory ? comparisonMetric(insight) : null;
                const tier = insight ? comparisons.get(insight.mediaId)?.tier : undefined;
                const sharesRate = insight?.sharesCount != null && insight?.reach ? insight.sharesCount / insight.reach : null;

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
                    <td className="p-3 text-right">
                      {rate === null ? (
                        <span className="tabular-nums text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span
                            className={cn("font-bold tabular-nums", tier ? TIER_TEXT_CLASS[tier] : "text-foreground")}
                            title={
                              tier
                                ? `${tier === "above" ? "Au-dessus" : tier === "below" ? "En dessous" : "Dans la moyenne"} de tes ${comparisons.get(insight!.mediaId)?.cohortSize} posts comparables`
                                : undefined
                            }
                          >
                            {formatPercent(rate)}
                          </span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {NUMBER_FORMAT.format(insight!.totalInteractions!)} interactions
                          </span>
                        </div>
                      )}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", sharesRate === null && "text-muted-foreground")}>
                      {sharesRate === null ? "—" : formatPercent(sharesRate)}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", insight?.avgWatchTimeMs == null && "text-muted-foreground")}>
                      {formatWatchTime(insight?.avgWatchTimeMs ?? null)}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", insight?.follows == null && "text-muted-foreground")}>
                      {insight?.follows == null ? "—" : `+${NUMBER_FORMAT.format(insight.follows)}`}
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

      <Pager page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
