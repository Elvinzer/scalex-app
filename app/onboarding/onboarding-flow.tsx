"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DiscoveryConversation } from "@/app/(app)/diagnostic/discovery-conversation";
import { Falco, type FalcoPose } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { ImportFlow } from "@/components/import/import-flow";
import { Button } from "@/components/ui/button";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { formatEur } from "@/lib/currency";
import type { SaleMode } from "@/lib/business/types";
import type { LeverCatalogEntry } from "@/lib/levers/catalog";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { cn } from "@/lib/utils";

import { saveOnboardingMonth, saveOnboardingOffer, skipOnboarding } from "./actions";

const inputClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

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

// Falco's lines, revealed with a gentle stagger (CSS rise-in on the wrapper,
// staggered by `index`) — a plain-string child additionally typewriters its
// own text (see FalcoBubble); JSX children (e.g. an interpolated <strong>)
// fall back to the instant `children` path automatically, never blocked.
function Bubble({ index, children }: { index: number; children: React.ReactNode }) {
  const text = typeof children === "string" ? children : undefined;
  return (
    <div className="animate-rise self-start" style={{ animationDelay: `${index * 120}ms` }}>
      <FalcoBubble arrow="none" className="max-w-[440px]" text={text} typewriter={!!text}>
        {text ? undefined : children}
      </FalcoBubble>
    </div>
  );
}

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
      <span className="font-bold">{label}</span>
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

// Optional nudge into the levers questionnaire, shown under the step-3 reveal.
// Secondary to the primary CTA and clearly skippable — the questionnaire is
// facultatif per the brief.
function DiscoveryInvite({ count, onStart }: { count: number; onStart: () => void }) {
  if (count <= 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
      <Bubble index={0}>
        Tu veux que je creuse encore ? J&apos;ai {count} question{count > 1 ? "s" : ""} rapide
        {count > 1 ? "s" : ""} sur tes leviers. Facultatif — tu pourras le faire plus tard depuis ton diagnostic.
      </Bubble>
      <Button type="button" variant="outline" onClick={onStart} className="w-full">
        Répondre au questionnaire (2 min)
      </Button>
    </div>
  );
}

export function OnboardingFlow({
  previousMonthYear,
  previousMonthNum,
  previousMonthLabel,
  discoveryLevers,
  discoveryTotal,
  discoveryAnswered,
}: {
  previousMonthYear: number;
  previousMonthNum: number;
  previousMonthLabel: string;
  discoveryLevers: LeverCatalogEntry[];
  discoveryTotal: number;
  discoveryAnswered: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Optional step-4 questionnaire, offered on the step-3 reveal — kept out of
  // the 1..3 ProgressBar so it reads as a bonus, not a mandatory step.
  const [showDiscovery, setShowDiscovery] = useState(false);

  const [niche, setNiche] = useState("");
  const [offerName, setOfferName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [saleMode, setSaleMode] = useState<SaleMode>("appel_closing");

  const [monthDraft, setMonthDraft] = useState<MonthlyMetricsInput>(EMPTY_MONTH);
  const [result, setResult] = useState<OnboardingGoulotResult | null>(null);
  // "choice" shows the import option first (per brief); picking either
  // path never blocks the other — a failed/partial import just falls
  // through to "manual" with whatever was extracted already pre-filled,
  // never a dead end or double entry.
  const [step2Mode, setStep2Mode] = useState<"choice" | "manual">("choice");

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

  // Optional questionnaire taking over the wizard — DiscoveryConversation
  // brings its own Falco + progress, so the 1..3 header is dropped here.
  // Answers persist one by one (saveLeverAnswer), so "Finir plus tard" keeps
  // everything already entered; onboardingCompleted is already true by now.
  if (showDiscovery) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-6 px-6 py-12">
        <DiscoveryConversation
          levers={discoveryLevers}
          initialTotal={discoveryTotal}
          initialAnswered={discoveryAnswered}
          onComplete={() => router.push("/dashboard")}
        />
        <Button type="button" variant="ghost" className="self-center" onClick={() => router.push("/dashboard")}>
          Finir plus tard →
        </Button>
      </div>
    );
  }

  const headerPose: FalcoPose =
    step === 3 && result?.kind === "point"
      ? "alert"
      : step === 3 && result?.kind === "no_gap"
        ? "happy"
        : step === 2 && isPending
          ? "thinking"
          : "neutral";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-4">
        <Falco key={`${step}-${headerPose}`} pose={headerPose} size="lg" animate="enter" priority />
        <ProgressBar step={step} />
      </div>

      {step === 1 && (
        <form onSubmit={handleScreen1Submit} className="flex flex-col gap-4">
          <Bubble index={0}>
            Salut, moi c&apos;est Falco 👋 Je vais t&apos;aider à trouver où ton business perd de l&apos;argent.
            D&apos;abord : tu vends quoi ?
          </Bubble>
          <input
            type="text"
            required
            value={offerName}
            onChange={(event) => setOfferName(event.target.value)}
            placeholder="Nom de ton offre principale"
            className={inputClass}
          />

          <Bubble index={1}>Et à quel prix ?</Bubble>
          <input
            type="number"
            required
            min={0}
            value={price ?? ""}
            onChange={(event) => setPrice(event.target.value === "" ? null : Number(event.target.value))}
            placeholder="Prix (€)"
            className={inputClass}
          />

          <Bubble index={2}>Tu la vends comment ?</Bubble>
          <div className="flex flex-col gap-2">
            {(
              [
                { value: "appel_closing", label: "En appel de closing" },
                { value: "page_vente", label: "Page de vente" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold transition-colors",
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
          </div>

          <Bubble index={3}>Dernière chose : ta niche ?</Bubble>
          <input
            type="text"
            required
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            placeholder="Ex : coaching business pour thérapeutes"
            className={inputClass}
          />

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <div className="mt-2 flex flex-col items-center gap-3">
            <Button type="submit" size="lg" disabled={isPending || !niche.trim() || !offerName.trim() || price === null} className="w-full">
              {isPending ? "..." : "Continuer →"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void skipOnboarding()}>
              Passer pour l&apos;instant
            </Button>
          </div>
        </form>
      )}

      {step === 2 && step2Mode === "choice" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            Tes chiffres de {previousMonthLabel} — tu as un export ou une capture ? Glisse-le ici, je m&apos;occupe du
            tri. Sinon on les remplit ensemble.
          </Bubble>
          <ImportFlow
            source="onboarding"
            onExtracted={(values, year, month) => {
              void year;
              void month;
              setMonthDraft((prev) => ({ ...prev, ...values }));
              setStep2Mode("manual");
            }}
          />
          <Button type="button" variant="ghost" className="self-center" onClick={() => setStep2Mode("manual")}>
            Saisir à la main
          </Button>
        </div>
      )}

      {step === 2 && step2Mode === "manual" && (
        <form onSubmit={handleScreen2Submit} className="flex flex-col gap-4">
          <Bubble index={0}>
            Maintenant tes chiffres de {previousMonthLabel}. Des valeurs approx suffisent, je préfère un vrai
            « à peu près » qu&apos;un faux précis.
          </Bubble>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="CA collecté (€)" value={monthDraft.cashCollected} onChange={(v) => updateMonth({ cashCollected: v })} />
            <NumberField label="CA contracté (€)" value={monthDraft.cashContracted} onChange={(v) => updateMonth({ cashContracted: v })} />
            <NumberField label="Nouveaux abonnés" value={monthDraft.newFollowers} onChange={(v) => updateMonth({ newFollowers: v })} />
          </div>

          {saleMode === "appel_closing" && (
            <>
              <Bubble index={1}>Ok. Et côté prospection et appels ?</Bubble>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="Premiers messages envoyés" value={monthDraft.firstMessages} onChange={(v) => updateMonth({ firstMessages: v })} />
                <NumberField label="Conversations démarrées" value={monthDraft.conversations} onChange={(v) => updateMonth({ conversations: v })} />
                <NumberField label="Appels proposés" value={monthDraft.callsProposed} onChange={(v) => updateMonth({ callsProposed: v })} />
                <NumberField label="Appels réservés" value={monthDraft.callsBooked} onChange={(v) => updateMonth({ callsBooked: v })} />
                <NumberField label="Appels pris" value={monthDraft.callsTaken} onChange={(v) => updateMonth({ callsTaken: v })} />
              </div>
            </>
          )}

          <Bubble index={2}>Et pour finir :</Bubble>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Ventes conclues" value={monthDraft.salesClosed} onChange={(v) => updateMonth({ salesClosed: v })} />
          </div>

          {isPending && <FalcoPondering isLoading pose="thinking" size="xs" label="Je calcule…" className="self-start" />}
          {error && <p className="text-sm text-state-critical">{error}</p>}

          <div className="mt-2 flex flex-col items-center gap-3">
            <Button type="submit" size="lg" disabled={isPending} className="w-full">
              {isPending ? "Calcul en cours..." : "Voir mon diagnostic →"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void skipOnboarding()}>
              Passer pour l&apos;instant
            </Button>
          </div>
        </form>
      )}

      {step === 3 && result?.kind === "point" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            Trouvé. Ton goulot, c&apos;est <strong>{result.point.label.toLowerCase()}</strong>.
          </Bubble>

          <div className="sticker-spotlight px-7 py-6">
            <p className="text-xs text-mist/70">
              {result.point.category} · {result.point.label}
            </p>
            <p className="mt-2 text-[38px] leading-[1.1] font-bold tracking-[-0.02em] tabular-nums">
              {result.point.monthlyGain === null ? "—" : `≈ ${formatEur(result.point.monthlyGain)}/mois perdus`}
            </p>
            <p className="mt-2 text-sm text-mist/70">sur ce point</p>
            <div className="mt-4">
              <RateVsBenchmarkBar currentRate={result.point.currentRatePercent / 100} benchmarkRate={result.point.benchmarkRatePercent / 100} />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{result.point.explanation}</p>

          <Bubble index={1}>On s&apos;en occupe ensemble ?</Bubble>
          <Button size="lg" asChild className="w-full">
            <a href={`/diagnostic?open=${result.point.key}`}>Améliorer ça maintenant →</a>
          </Button>

          <DiscoveryInvite count={discoveryLevers.length} onStart={() => setShowDiscovery(true)} />
        </div>
      )}

      {step === 3 && result?.kind === "no_gap" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            Tes chiffres sont déjà solides 🎉 Sur ce que tu as pu mesurer ce mois-ci, rien n&apos;est sous les
            standards de ta niche. Continue à remplir tes chiffres pour affiner ton diagnostic.
          </Bubble>
          <Button size="lg" asChild className="w-full">
            <a href="/dashboard">Aller sur mon dashboard →</a>
          </Button>

          <DiscoveryInvite count={discoveryLevers.length} onStart={() => setShowDiscovery(true)} />
        </div>
      )}
    </div>
  );
}
