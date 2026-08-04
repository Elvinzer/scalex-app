"use client";

import { ArrowDown, ArrowUp, Camera, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ItemScoreButton } from "@/components/item-score-button";
import { InstagramPostDetailDialog } from "@/components/instagram/instagram-post-detail-dialog";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import type { ContentMetricKey } from "@/lib/diagnostic/content-metrics";
import { computePostRates, computePostScore } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

type SortKey = "publishedAt" | "views" | "engagementRate" | "clickRate" | "viewToLeadRate" | "score";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

// Small thumbnail for the title cell — mediaUrl is the raw file (the video
// itself for VIDEO/REELS, not renderable as an <img>), so VIDEO prefers
// thumbnailUrl instead. Both are short-lived signed Instagram CDN URLs (see
// db/schema.ts's instagramPostInsights) — a broken/expired link falls back
// to a plain icon rather than a broken-image glyph.
function PostThumbnail({ insight }: { insight: InstagramPostInsightRow | undefined }) {
  const [broken, setBroken] = useState(false);
  const src = insight ? (insight.mediaType === "VIDEO" ? insight.thumbnailUrl : insight.mediaUrl) : null;

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

export function PostsTable({
  posts,
  topPostId,
  contentBenchmarks,
  falcoSkin,
  instagramInsights,
}: {
  posts: ContentPostRow[];
  topPostId: string | null;
  contentBenchmarks: Record<ContentMetricKey, number>;
  falcoSkin?: FalcoSkinKey | null;
  instagramInsights?: Map<string, InstagramPostInsightRow>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const withRates = posts.map((post) => ({
      post,
      rates: computePostRates(post),
      score: computePostScore(post, contentBenchmarks),
    }));

    withRates.sort((a, b) => {
      const valueOf = (entry: (typeof withRates)[number]) =>
        sortKey === "publishedAt" || sortKey === "views"
          ? entry.post[sortKey]
          : sortKey === "score"
            ? (entry.score ?? -1)
            : (entry.rates[sortKey] ?? -1);
      const diff = (valueOf(a) as number) < (valueOf(b) as number) ? -1 : (valueOf(a) as number) > (valueOf(b) as number) ? 1 : 0;
      return sortDesc ? -diff : diff;
    });

    return withRates;
  }, [posts, sortKey, sortDesc, contentBenchmarks]);

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
    <div className="sticker-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-3 text-left"><SortHeader label="Date" sortKeyValue="publishedAt" /></th>
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Titre</th>
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Plateforme</th>
            <th className="p-3 text-right"><SortHeader label="Vues" sortKeyValue="views" /></th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Interactions</th>
            <th className="p-3 text-right"><SortHeader label="Engagement" sortKeyValue="engagementRate" /></th>
            <th className="p-3 text-right"><SortHeader label="Clics" sortKeyValue="clickRate" /></th>
            <th className="p-3 text-right"><SortHeader label="Leads" sortKeyValue="viewToLeadRate" /></th>
            <th className="p-3 text-right"><SortHeader label="Score" sortKeyValue="score" /></th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ post, rates, score }) => {
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
                  {insight?.totalInteractions == null ? "—" : NUMBER_FORMAT.format(insight.totalInteractions)}
                </td>
                <td className={cn("p-3 text-right tabular-nums", rates.engagementRate === null && "text-muted-foreground")}>
                  {rates.engagementRate === null ? "—" : formatPercent(rates.engagementRate)}
                </td>
                <td className={cn("p-3 text-right tabular-nums", rates.clickRate === null && "text-muted-foreground")}>
                  {rates.clickRate === null ? "—" : formatPercent(rates.clickRate)}
                </td>
                <td className={cn("p-3 text-right tabular-nums", rates.viewToLeadRate === null && "text-muted-foreground")}>
                  {rates.viewToLeadRate === null ? "—" : formatPercent(rates.viewToLeadRate)}
                </td>
                <td className="p-3 text-right">
                  {score === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ItemScoreButton
                      score={score}
                      chatContext={
                        { topicType: "lever", topicKey: "content", topicLabel: "Contenu", sourcePage: "acquisition_contenu_score" } satisfies ChatContext
                      }
                      seedQuestion={`Pourquoi mon post "${post.title}" a un score de ${score}/100 ? Comment je peux l'améliorer ?`}
                      falcoSkin={falcoSkin}
                    />
                  )}
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
  );
}
