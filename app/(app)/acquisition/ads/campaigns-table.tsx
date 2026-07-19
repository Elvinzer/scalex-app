"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { computeCampaignMetrics } from "@/lib/ad-campaigns/metrics";
import type { AdCampaignRow } from "@/lib/ad-campaigns/types";
import { formatEur } from "@/lib/currency";
import { formatPercent } from "@/lib/setting/funnel";

import { removeAdCampaign } from "./actions";
import { CampaignFormDialog } from "./campaign-form-dialog";

export function CampaignsTable({ campaigns }: { campaigns: AdCampaignRow[] }) {
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await removeAdCampaign(id);
    });
  }

  if (campaigns.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-medium">Aucune campagne enregistrée pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Ajoute ta première campagne ci-dessus.</p>
      </div>
    );
  }

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Campagne</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Plateforme</th>
            <th className="p-3 text-right text-xs font-medium text-muted-foreground">Dépensé</th>
            <th className="p-3 text-right text-xs font-medium text-muted-foreground">CTR</th>
            <th className="p-3 text-right text-xs font-medium text-muted-foreground">Coût / lead</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const metrics = computeCampaignMetrics(campaign);
            return (
              <tr key={campaign.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">{campaign.startDate}</p>
                </td>
                <td className="p-3 text-muted-foreground">{campaign.platform}</td>
                <td className="p-3 text-right tabular-nums">
                  {campaign.spend === null ? "—" : formatEur(campaign.spend)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {metrics.ctr === null ? "—" : formatPercent(metrics.ctr)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {metrics.costPerLead === null ? "—" : formatEur(metrics.costPerLead)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
