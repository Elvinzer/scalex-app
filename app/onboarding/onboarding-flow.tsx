"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { formatEur } from "@/lib/currency";
import type { SaleMode } from "@/lib/business/types";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { cn } from "@/lib/utils";

import { saveOnboardingMonth, saveOnboardingOffer, skipOnboarding } from "./actions";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const EMPTY_MONTH: MonthlyMetricsInput = {
  cashCollected: null,
  cashContracted: null,
  newFollowers: null,
  firstMessages: null,
  conversations: null,
  callsProposed: null,
  callsBooked: null,
  callsTaken: null,
  salesClosed: null,
};

function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-border")}
        />
      ))}
      <span className="sr-only">Étape {step} sur 3</span>
    </div>
  );
}

function SkipButton() {
  return (
    <Button type="button" variant="ghost" onClick={() => void skipOnboarding()} className="self-center">
      Passer pour l&apos;instant
    </Button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

export function OnboardingFlow({
  previousMonthYear,
  previousMonthNum,
  previousMonthLabel,
}: {
  previousMonthYear: number;
  previousMonthNum: number;
  previousMonthLabel: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [niche, setNiche] = useState("");
  const [offerName, setOfferName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [saleMode, setSaleMode] = useState<SaleMode>("appel_closing");

  const [monthDraft, setMonthDraft] = useState<MonthlyMetricsInput>(EMPTY_MONTH);
  const [result, setResult] = useState<OnboardingGoulotResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function updateMonth(patch: Partial<MonthlyMetricsInput>) {
    setMonthDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleScreen1Submit(event: React.FormEvent) {
    event.preventDefault();
    if (!niche.trim() || !offerName.trim() || price === null) return;
    setError(null);
    setIsPending(true);

    const res = await saveOnboardingOffer({ niche: niche.trim(), offerName: offerName.trim(), price, saleMode });
    setIsPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setStep(2);
  }

  async function handleScreen2Submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const res = await saveOnboardingMonth(previousMonthYear, previousMonthNum, monthDraft);
    setIsPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.result?.kind === "no_data") {
      router.push("/dashboard?bandeau=incomplete_data");
      return;
    }

    setResult(res.result ?? null);
    setStep(3);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <ProgressBar step={step} />

      {step === 1 && (
        <form onSubmit={handleScreen1Submit} className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-medium">Ton offre</h1>
            <p className="mt-1 text-sm text-muted-foreground">60 secondes, 4 champs.</p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Ta niche</span>
            <input
              type="text"
              required
              value={niche}
              onChange={(event) => setNiche(event.target.value)}
              placeholder="Ex : coaching business pour thérapeutes"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Nom de ton offre principale</span>
            <input
              type="text"
              required
              value={offerName}
              onChange={(event) => setOfferName(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Prix (€)</span>
            <input
              type="number"
              required
              min={0}
              value={price ?? ""}
              onChange={(event) => setPrice(event.target.value === "" ? null : Number(event.target.value))}
              className={inputClass}
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Mode de vente</legend>
            {(
              [
                { value: "appel_closing", label: "Appel de closing" },
                { value: "page_vente", label: "Page de vente" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center rounded-[var(--radius-control)] border px-4 py-3 text-sm font-medium transition-colors",
                  saleMode === option.value ? "border-accent bg-accent-soft text-accent-text" : "border-border hover:bg-muted"
                )}
              >
                <input
                  type="radio"
                  name="saleMode"
                  className="sr-only"
                  checked={saleMode === option.value}
                  onChange={() => setSaleMode(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" size="lg" disabled={isPending || !niche.trim() || !offerName.trim() || price === null} className="self-start">
            {isPending ? "..." : "Continuer →"}
          </Button>

          <SkipButton />
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleScreen2Submit} className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-medium">Tes chiffres de {previousMonthLabel}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Des chiffres approximatifs suffisent pour commencer.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="CA collecté (€)" value={monthDraft.cashCollected} onChange={(v) => updateMonth({ cashCollected: v })} />
            <NumberField label="CA contracté (€)" value={monthDraft.cashContracted} onChange={(v) => updateMonth({ cashContracted: v })} />
            <NumberField label="Nouveaux abonnés" value={monthDraft.newFollowers} onChange={(v) => updateMonth({ newFollowers: v })} />

            {saleMode === "appel_closing" && (
              <>
                <NumberField label="Premiers messages envoyés" value={monthDraft.firstMessages} onChange={(v) => updateMonth({ firstMessages: v })} />
                <NumberField label="Conversations démarrées" value={monthDraft.conversations} onChange={(v) => updateMonth({ conversations: v })} />
                <NumberField label="Appels proposés" value={monthDraft.callsProposed} onChange={(v) => updateMonth({ callsProposed: v })} />
                <NumberField label="Appels réservés" value={monthDraft.callsBooked} onChange={(v) => updateMonth({ callsBooked: v })} />
                <NumberField label="Appels pris" value={monthDraft.callsTaken} onChange={(v) => updateMonth({ callsTaken: v })} />
              </>
            )}

            <NumberField label="Ventes conclues" value={monthDraft.salesClosed} onChange={(v) => updateMonth({ salesClosed: v })} />
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" size="lg" disabled={isPending} className="self-start">
            {isPending ? "Calcul en cours..." : "Voir mon diagnostic →"}
          </Button>

          <SkipButton />
        </form>
      )}

      {step === 3 && result?.kind === "point" && (
        <div className="flex flex-col gap-6 text-center">
          <div className="sticker-spotlight px-7 py-6 text-left">
            <p className="text-xs text-mist/70">{result.point.category} · {result.point.label}</p>
            <p className="mt-2 text-[38px] leading-[1.1] font-medium tracking-[-0.02em] tabular-nums">
              {result.point.monthlyGain === null ? "—" : `≈ ${formatEur(result.point.monthlyGain)}/mois perdus`}
            </p>
            <p className="mt-2 text-sm text-mist/70">sur ce point</p>
            <div className="mt-4">
              <RateVsBenchmarkBar currentRate={result.point.currentRatePercent / 100} benchmarkRate={result.point.benchmarkRatePercent / 100} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{result.point.explanation}</p>
          <Button size="lg" asChild>
            <a href={`/diagnostic?open=${result.point.key}`}>Améliorer ça maintenant →</a>
          </Button>
        </div>
      )}

      {step === 3 && result?.kind === "no_gap" && (
        <div className="flex flex-col gap-6 text-center">
          <h1 className="text-2xl font-medium">Tes chiffres sont déjà solides 🎉</h1>
          <p className="text-sm text-muted-foreground">
            Sur ce que tu as pu mesurer ce mois-ci, rien n&apos;est sous les standards de ta niche. Continue à
            remplir tes chiffres pour affiner ton diagnostic.
          </p>
          <Button size="lg" asChild>
            <a href="/dashboard">Aller sur mon dashboard →</a>
          </Button>
        </div>
      )}
    </div>
  );
}
