"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setMetaCampaignType } from "@/app/(app)/acquisition/ads/meta-actions";
import { META_CAMPAIGN_TYPES, type MetaCampaignType } from "@/lib/meta-ads/types";

const labels: Record<MetaCampaignType, string> = {
  vsl: "VSL",
  webinar: "Webinaire",
  instagram_profile_growth: "Visite de profil Instagram",
  retargeting: "Retargeting",
  other: "Autre",
};

export function MetaCampaignProfileSelector({
  campaignId,
  campaignType,
  typeSource,
}: {
  campaignId: string;
  campaignType: MetaCampaignType;
  typeSource: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(campaignType);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(nextValue: MetaCampaignType) {
    const previousValue = value;
    setValue(nextValue);
    setMessage(null);
    startTransition(async () => {
      const result = await setMetaCampaignType({ campaignId, campaignType: nextValue });
      if (result.error) {
        setValue(previousValue);
        setMessage(result.error);
      } else {
        setMessage("Type enregistré.");
        router.refresh();
      }
    });
  }

  return (
    <div className="sticker-card flex flex-wrap items-end justify-between gap-4 p-5">
      <div>
        <p className="font-bold">Type de campagne</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {typeSource === "manual" ? "Classification choisie par toi." : "Pré-classification détectée depuis les signaux Meta."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="meta-campaign-type" className="sr-only">Type de campagne</label>
        <select
          id="meta-campaign-type"
          value={value}
          disabled={isPending}
          onChange={(event) => update(META_CAMPAIGN_TYPES.find((type) => type === event.target.value) ?? "other")}
          className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        >
          {META_CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}
        </select>
        {message && <span className="text-xs font-bold text-muted-foreground" role="status">{message}</span>}
      </div>
    </div>
  );
}
