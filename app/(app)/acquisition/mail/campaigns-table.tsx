"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { computeEmailCampaignMetrics } from "@/lib/email-campaigns/metrics";
import type { EmailCampaignRow } from "@/lib/email-campaigns/types";
import { formatEur } from "@/lib/currency";
import { formatPercent } from "@/lib/setting/funnel";

import { removeEmailCampaign } from "./actions";
import { CampaignFormDialog } from "./campaign-form-dialog";

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
  const topId = bestCtrIdThisMonth(campaigns);

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
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">Envoi</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Envois</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Ouverture</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">Clic</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">CA attribué</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const metrics = computeEmailCampaignMetrics(campaign);
            return (
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
