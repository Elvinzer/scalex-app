"use client";

import { Save, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setMetaCampaignTargets } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";

type Props = {
  campaignId: string;
  targetCpaCents: number | null;
  targetRoas: number | null;
  leadValueCents: number | null;
  suggestedLeadValueCents?: number | null;
};

function initialEuros(cents: number | null): string {
  return cents === null ? "" : String(Math.round(cents) / 100);
}

export function MetaCampaignTargets({ campaignId, targetCpaCents, targetRoas, leadValueCents, suggestedLeadValueCents }: Props) {
  const t = useTranslations("app.ads.targets");
  const router = useRouter();
  const [targetCpa, setTargetCpa] = useState(initialEuros(targetCpaCents));
  const [targetRoasValue, setTargetRoasValue] = useState(targetRoas === null ? "" : String(targetRoas));
  const [leadValue, setLeadValue] = useState(initialEuros(leadValueCents ?? suggestedLeadValueCents ?? null));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function save() {
    setMessage(null);
    const cpaEuros = optionalNumber(targetCpa);
    const roas = optionalNumber(targetRoasValue);
    const leadEuros = optionalNumber(leadValue);
    startTransition(async () => {
      const result = await setMetaCampaignTargets({
        campaignId,
        targetCpaCents: cpaEuros === null ? null : Math.round(cpaEuros * 100),
        targetRoas: roas,
        leadValueCents: leadEuros === null ? null : Math.round(leadEuros * 100),
      });
      setMessage(result.error ?? t("saved"));
      if (!result.error) router.refresh();
    });
  }

  return (
    <section className="sticker-card p-5" aria-labelledby="meta-targets-title">
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 size-5 shrink-0 text-accent-2" />
        <div>
          <h2 id="meta-targets-title" className="font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
          {t("targetCpa")}
          <input value={targetCpa} onChange={(event) => setTargetCpa(event.target.value)} inputMode="decimal" type="number" min="0" step="0.01" placeholder={t("placeholderCpa")} className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-normal text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
          {t("targetRoas")}
          <input value={targetRoasValue} onChange={(event) => setTargetRoasValue(event.target.value)} inputMode="decimal" type="number" min="0" step="0.1" placeholder={t("placeholderRoas")} className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-normal text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
          {t("leadValue")}
          <input value={leadValue} onChange={(event) => setLeadValue(event.target.value)} inputMode="decimal" type="number" min="0" step="0.01" placeholder={t("placeholderLead")} className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-normal text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="accent2" onClick={save} disabled={isPending}>
          <Save className="size-4" />
          {isPending ? t("saving") : t("save")}
        </Button>
        {message && <span className="text-xs font-bold text-muted-foreground" role="status">{message}</span>}
      </div>
    </section>
  );
}
