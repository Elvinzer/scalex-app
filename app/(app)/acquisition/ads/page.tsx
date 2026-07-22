import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeCampaignMetrics } from "@/lib/ad-campaigns/metrics";
import { getAdCampaigns } from "@/lib/ad-campaigns/queries";
import { getBusinessProfile } from "@/lib/business/queries";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { AdCopyTrigger } from "./ad-copy-trigger";
import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignsTable } from "./campaigns-table";

export default async function AdsPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const [campaigns, profile] = await Promise.all([getAdCampaigns(accountId), getBusinessProfile(accountId)]);

  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
  const ctrValues = campaigns.map((c) => computeCampaignMetrics(c).ctr).filter((v): v is number => v !== null);
  const avgCtr = ctrValues.length > 0 ? ctrValues.reduce((sum, v) => sum + v, 0) / ctrValues.length : null;
  const cplValues = campaigns
    .map((c) => computeCampaignMetrics(c).costPerLead)
    .filter((v): v is number => v !== null);
  const avgCpl = cplValues.length > 0 ? cplValues.reduce((sum, v) => sum + v, 0) / cplValues.length : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ads</h1>
          <p className="mt-1 text-muted-foreground">
            Le suivi de tes campagnes publicitaires, avec un chat IA pour rédiger tes accroches.
          </p>
        </div>
        <div className="flex gap-2">
          <AdCopyTrigger offers={profile.sales.offers} />
          <CampaignFormDialog
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                Ajouter une campagne
              </Button>
            }
          />
        </div>
      </div>

      {profile.sales.offers.length === 0 && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune offre renseignée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute tes offres dans Mon business pour que le chat de création de pub s&apos;appuie dessus.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Dépenses totales</p>
          <p className="mt-2 font-display text-3xl font-bold">{formatEur(totalSpend)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CTR moyen</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgCtr === null ? "—" : formatPercent(avgCtr)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Coût par lead moyen</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgCpl === null ? "—" : formatEur(avgCpl)}</p>
        </div>
      </div>

      <CampaignsTable campaigns={campaigns} />
    </div>
  );
}
