"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { setMetaCampaignProfile } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { campaignTypeNeedsConversionGoal, META_CAMPAIGN_TYPES, META_CONVERSION_GOALS, type MetaCampaignType, type MetaConversionGoal } from "@/lib/meta-ads/types";

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
  const t = useTranslations("app.ads.profile");
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
        setMessage(t("saved"));
        router.refresh();
      }
    });
  }

  return (
    <form className="sticker-card p-5" onSubmit={save}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{t("title")}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
          {metaObjective && <p className="mt-2 text-xs text-muted-foreground">{t("technicalObjective")} <span className="font-bold">{metaObjective}</span></p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isComplete && !isDirty ? "bg-state-healthy-bg text-state-healthy" : "bg-state-caution/10 text-state-caution"}`}>
          {isComplete && !isDirty ? t("configured") : t("required")}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-campaign-type">
          {t("campaignType")}
          <select
            id="meta-campaign-type"
            value={value}
            disabled={isPending}
            onChange={(event) => updateType(META_CAMPAIGN_TYPES.find((type) => type === event.target.value) ?? "")}
            className="h-10 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">{t("chooseType")}</option>
            {META_CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{t(type === "instagram_profile_growth" ? "instagramGrowth" : type)}</option>)}
          </select>
        </label>

        {needsGoal ? (
          <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-conversion-goal">
            {t("conversionGoal")}
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
              <option value="">{t("chooseGoal")}</option>
              {META_CONVERSION_GOALS.map((candidate) => <option key={candidate} value={candidate}>{t(candidate)}</option>)}
            </select>
            <span className="text-xs font-normal text-muted-foreground">{t("goalHelp")}</span>
          </label>
        ) : (
          <div className="flex min-h-10 flex-col justify-center rounded-[var(--radius-control)] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {value === "" ? t("chooseTypeHelp") : t("noGoalHelp")}
          </div>
        )}
      </div>

      {typeSource === "pending" && <p className="mt-4 text-xs font-bold text-state-caution">{t("pendingHelp")}</p>}
      {error && <p className="mt-4 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      {message && <p className="mt-4 text-sm font-bold text-state-healthy" role="status">{message}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("laterHelp")}</p>
        <Button type="submit" disabled={isPending || !isComplete || !isDirty}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
