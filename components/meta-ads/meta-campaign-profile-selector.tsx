"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { setMetaCampaignProfile } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { campaignTypeNeedsConversionGoal, META_CAMPAIGN_TYPES, META_CONVERSION_GOALS, type MetaCampaignType, type MetaConversionGoal } from "@/lib/meta-ads/types";

const labels: Record<MetaCampaignType, string> = {
  vsl: "VSL",
  webinar: "Webinaire",
  instagram_profile_growth: "Trafic Instagram",
  retargeting: "Retargeting",
};

const conversionGoalLabels: Record<MetaConversionGoal, string> = {
  call: "Appel",
  sale: "Vente",
};

export function MetaCampaignProfileSelector({
  campaignId,
  campaignType,
  conversionGoal,
  metaObjective,
  typeSource,
}: {
  campaignId: string;
  campaignType: MetaCampaignType | null;
  conversionGoal: MetaConversionGoal | null;
  metaObjective: string | null;
  typeSource: string;
}) {
  const router = useRouter();
  const initialType = campaignType ?? "";
  const initialGoal = conversionGoal ?? "";
  const [value, setValue] = useState<MetaCampaignType | "">(initialType);
  const [goal, setGoal] = useState<MetaConversionGoal | "">(initialGoal);
  const [savedValue, setSavedValue] = useState<MetaCampaignType | "">(initialType);
  const [savedGoal, setSavedGoal] = useState<MetaConversionGoal | "">(initialGoal);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedType = value === "" ? null : value;
  const needsGoal = campaignTypeNeedsConversionGoal(selectedType);
  const isComplete = value !== "" && (!needsGoal || goal !== "");
  const isDirty = value !== savedValue || goal !== savedGoal;

  function updateType(nextValue: MetaCampaignType | "") {
    setValue(nextValue);
    if (nextValue !== "vsl" && nextValue !== "webinar") setGoal("");
    setMessage(null);
    setError(null);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value === "" || !isComplete) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const nextGoal = needsGoal && goal !== "" ? goal : null;
      const result = await setMetaCampaignProfile({ campaignId, campaignType: value, conversionGoal: nextGoal });
      if (result.error) {
        setError(result.error);
      } else {
        setSavedValue(value);
        setSavedGoal(nextGoal ?? "");
        setMessage("Configuration enregistrée.");
        router.refresh();
      }
    });
  }

  return (
    <form className="sticker-card p-5" onSubmit={save}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">Configurer la campagne</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Meta fournit un objectif technique, mais pas le parcours business réel. Choisis le contexte utilisé par le funnel et les insights Scale X.
          </p>
          {metaObjective && <p className="mt-2 text-xs text-muted-foreground">Objectif technique Meta : <span className="font-bold">{metaObjective}</span></p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isComplete && !isDirty ? "bg-state-healthy-bg text-state-healthy" : "bg-state-caution/10 text-state-caution"}`}>
          {isComplete && !isDirty ? "Configurée" : "Configuration requise"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-campaign-type">
          Type de campagne
          <select
            id="meta-campaign-type"
            value={value}
            disabled={isPending}
            onChange={(event) => updateType(META_CAMPAIGN_TYPES.find((type) => type === event.target.value) ?? "")}
            className="h-10 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">Choisir un type</option>
            {META_CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}
          </select>
        </label>

        {needsGoal ? (
          <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-conversion-goal">
            Objectif de conversion
            <select
              id="meta-conversion-goal"
              value={goal}
              disabled={isPending}
              onChange={(event) => {
                setGoal(META_CONVERSION_GOALS.find((candidate) => candidate === event.target.value) ?? "");
                setMessage(null);
              }}
              className="h-10 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">Choisir un objectif</option>
              {META_CONVERSION_GOALS.map((candidate) => <option key={candidate} value={candidate}>{conversionGoalLabels[candidate]}</option>)}
            </select>
            <span className="text-xs font-normal text-muted-foreground">Ce choix est demandé pour distinguer la lecture d’un appel de celle d’une vente.</span>
          </label>
        ) : (
          <div className="flex min-h-10 flex-col justify-center rounded-[var(--radius-control)] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {value === "" ? "Choisis d’abord un type pour voir les réglages spécifiques." : "Aucun objectif de conversion supplémentaire n’est requis pour ce type."}
          </div>
        )}
      </div>

      {typeSource === "pending" && <p className="mt-4 text-xs font-bold text-state-caution">Le funnel et les insights spécialisés restent en attente tant que cette configuration n’est pas enregistrée.</p>}
      {error && <p className="mt-4 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      {message && <p className="mt-4 text-sm font-bold text-state-healthy" role="status">{message}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Tu peux modifier ce contexte plus tard ; cela ne modifie rien dans Meta Ads.</p>
        <Button type="submit" disabled={isPending || !isComplete || !isDirty}>
          {isPending ? "Enregistrement…" : "Enregistrer la configuration"}
        </Button>
      </div>
    </form>
  );
}
