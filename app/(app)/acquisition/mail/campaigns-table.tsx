"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { computeCampaignScore, computeEmailCampaignMetrics } from "@/lib/email-campaigns/metrics";
import type { EmailCampaignRow } from "@/lib/email-campaigns/types";
import { formatEur } from "@/lib/currency";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { removeEmailCampaign } from "./actions";
import { CampaignFormDialog } from "./campaign-form-dialog";

type SortKey = "sentAt" | "sends" | "openRate" | "ctr" | "revenueAttributed" | "score";

const TIER_CLASS: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "bg-state-critical-bg text-state-critical",
  ambre: "bg-state-caution-bg text-state-caution",
  vert: "bg-state-healthy-bg text-state-healthy",
};

// "Top" badge = best CTR among this month's sends — a light nudge, not a
// score; ties or a single campaign this month just don't get a badge race.
function bestCtrIdThisMonth(campaigns: EmailCampaignRow[]): string | null {
  const currentMonth = new Date().toISOString().slice(0, 7);
  let bestId: string | null = null;
  let bestCtr = -1;
  for (const campaign of campaigns) {
    if (!campaign.sentAt.startsWith(currentMonth)) continue;
    const ctr = computeEmailCampaignMetrics(campaign).ctr;
    if (ctr !== null && ctr > bestCtr) {
      bestCtr = ctr;
      bestId = campaign.id;
    }
  }
  return bestId;
}

export function CampaignsTable({ campaigns }: { campaigns: EmailCampaignRow[] }) {
  const [, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDesc, setSortDesc] = useState(true);
  const topId = bestCtrIdThisMonth(campaigns);

  const sorted = useMemo(() => {
    const withMetrics = campaigns.map((campaign) => ({
      campaign,
      metrics: computeEmailCampaignMetrics(campaign),
      score: computeCampaignScore(campaign),
    }));

    withMetrics.sort((a, b) => {
      const valueOf = (entry: (typeof withMetrics)[number]) =>
        sortKey === "sentAt" || sortKey === "sends" || sortKey === "revenueAttributed"
          ? (entry.campaign[sortKey] ?? -1)
          : sortKey === "score"
            ? (entry.score ?? -1)
            : (entry.metrics[sortKey] ?? -1);
      const diff = (valueOf(a) as number) < (valueOf(b) as number) ? -1 : (valueOf(a) as number) > (valueOf(b) as number) ? 1 : 0;
      return sortDesc ? -diff : diff;
    });

    return withMetrics;
  }, [campaigns, sortKey, sortDesc]);

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

  function handleDelete(id: string) {
    startTransition(async () => {
      await removeEmailCampaign(id);
    });
  }

  if (campaigns.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucun envoi enregistré pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Ajoute ton premier envoi ci-dessus.</p>
      </div>
    );
  }

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-3 text-left"><SortHeader label="Envoi" sortKeyValue="sentAt" /></th>
            <th className="p-3 text-right"><SortHeader label="Envois" sortKeyValue="sends" /></th>
            <th className="p-3 text-right"><SortHeader label="Ouverture" sortKeyValue="openRate" /></th>
            <th className="p-3 text-right"><SortHeader label="Clic" sortKeyValue="ctr" /></th>
            <th className="p-3 text-right"><SortHeader label="CA attribué" sortKeyValue="revenueAttributed" /></th>
            <th className="p-3 text-right"><SortHeader label="Score" sortKeyValue="score" /></th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ campaign, metrics, score }) => (
            <tr key={campaign.id} className="border-b border-border last:border-0">
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{campaign.name}</p>
                  {campaign.id === topId && (
                    <span className="rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy">
                      Top
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{campaign.sentAt}</p>
              </td>
              <td className="p-3 text-right tabular-nums">{campaign.sends}</td>
              <td className="p-3 text-right tabular-nums">
                {metrics.openRate === null ? "—" : formatPercent(metrics.openRate)}
              </td>
              <td className="p-3 text-right tabular-nums">{metrics.ctr === null ? "—" : formatPercent(metrics.ctr)}</td>
              <td className="p-3 text-right tabular-nums">
                {campaign.revenueAttributed === null ? "—" : formatEur(campaign.revenueAttributed)}
              </td>
              <td className="p-3 text-right">
                {score === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", TIER_CLASS[getHealthTier(score).tier])}>
                    {score}
                  </span>
                )}
              </td>
              <td className="p-3">
                <div className="flex justify-end gap-1">
                  <CampaignFormDialog
                    campaign={campaign}
                    trigger={
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Modifier">
                        <Pencil className="size-3.5" />
                      </Button>
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer"
                    onClick={() => handleDelete(campaign.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
