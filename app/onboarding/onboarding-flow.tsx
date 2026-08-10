"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { DiscoveryConversation } from "@/app/(app)/diagnostic/discovery-conversation";
import { Falco, type FalcoPose } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { Button } from "@/components/ui/button";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { formatEur } from "@/lib/currency";
import type { Locale } from "@/lib/i18n/config";
import type { SaleMode } from "@/lib/business/types";
import type { LeverCatalogEntry } from "@/lib/levers/catalog";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { cn } from "@/lib/utils";

import { completeOnboardingAfterImport, saveOnboardingMonth, saveOnboardingOffer, skipOnboarding } from "./actions";
import { LanguageStep } from "./language-step";

// Same reasoning as app/(app)/datas/datas-page-client.tsx: ImportFlow pulls
// exceljs/pdf-parse/papaparse (≈380 Ko gzip) but only renders once the user
// reaches the import step, so a static import was shipping those in this
// flow's initial JS unconditionally.
const ImportFlow = dynamic(() => import("@/components/import/import-flow").then((m) => m.ImportFlow), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">Loading…</div>,
});

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
  const t = useTranslations("onboarding");
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-border")}
        />
      ))}
      <span className="sr-only">{t("stepProgress", { step })}</span>
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
  const t = useTranslations("onboarding");
  if (count <= 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
      <Bubble index={0}>
        {t("discoveryInvite", { count })}
      </Bubble>
      <Button type="button" variant="outline" onClick={onStart} className="w-full">
        {t("answerQuestionnaire")}
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
  needsLanguageChoice,
  suggestedLocale,
}: {
  previousMonthYear: number;
  previousMonthNum: number;
  previousMonthLabel: string;
  discoveryLevers: LeverCatalogEntry[];
  discoveryTotal: number;
  discoveryAnswered: number;
  needsLanguageChoice: boolean;
  suggestedLocale: Locale;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const tDiagnostic = useTranslations("diagnostic");
  // Step 0 (§B): shown only to accounts that have never chosen. An existing
  // user reaching the wizard again never sees it — `needsLanguageChoice` is
  // false as soon as users.locale holds a value.
  const [languageChosen, setLanguageChosen] = useState(!needsLanguageChoice);
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
      router.push("/roadmap");
      return;
    }

    setResult(res.result ?? null);
    setStep(3);
  }

  // The import path no longer targets a single month — commitImport (called
  // by ImportFlow's own onCommit) already wrote however many months the
  // file had, so this only needs to compute the diagnosis over whatever
  // now exists and close out onboarding. Same no_data/result handling as
  // the manual path above.
  async function handleImportCommitted() {
    setError(null);
    setIsPending(true);
    const res = await completeOnboardingAfterImport();
    setIsPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.result?.kind === "no_data") {
      router.push("/roadmap");
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
          onComplete={() => router.push("/roadmap")}
        />
        <Button type="button" variant="ghost" className="self-center" onClick={() => router.push("/roadmap")}>
          {t("finishLater")} →
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

  const localizedPointLabel =
    result?.kind === "point" && locale === "en"
      ? tDiagnostic(`metrics.${result.point.key}`)
      : result?.kind === "point"
        ? result.point.label
        : null;
  const localizedPointCategory =
    result?.kind === "point" && locale === "en"
      ? tDiagnostic(`categories.${result.point.category.toLowerCase()}`)
      : result?.kind === "point"
        ? result.point.category
        : null;
  const localizedPointExplanation =
    result?.kind === "point" && locale === "en"
      ? tDiagnostic(`metricExplanations.${result.point.key}`, {
          current: result.point.currentRatePercent,
          benchmark: result.point.benchmarkRatePercent,
          gain: result.point.extraClients,
          noShow: 100 - result.point.currentRatePercent,
        })
      : result?.kind === "point"
        ? result.point.explanation
        : null;

  if (!languageChosen) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-12">
        <LanguageStep
          suggested={suggestedLocale}
          onChosen={() => {
            setLanguageChosen(true);
            // The server action revalidated the layout, so the rest of the
            // wizard re-renders with the chosen locale's messages.
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-4">
        <Falco key={`${step}-${headerPose}`} pose={headerPose} size="lg" animate="enter" priority />
        <ProgressBar step={step} />
      </div>

      {step === 1 && (
        <form onSubmit={handleScreen1Submit} className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("welcome")}
          </Bubble>
          <input
            type="text"
            required
            value={offerName}
            onChange={(event) => setOfferName(event.target.value)}
            placeholder={t("offerPlaceholder")}
            className={inputClass}
          />

          <Bubble index={1}>{t("priceQuestion")}</Bubble>
          <input
            type="number"
            required
            min={0}
            value={price ?? ""}
            onChange={(event) => setPrice(event.target.value === "" ? null : Number(event.target.value))}
            placeholder={t("pricePlaceholder")}
            className={inputClass}
          />

          <Bubble index={2}>{t("salesModeQuestion")}</Bubble>
          <div className="flex flex-col gap-2">
            {(
              [
                { value: "appel_closing", label: t("closingCall") },
                { value: "page_vente", label: t("salesPage") },
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

          <Bubble index={3}>{t("nicheQuestion")}</Bubble>
          <input
            type="text"
            required
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            placeholder={t("nichePlaceholder")}
            className={inputClass}
          />

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <div className="mt-2 flex flex-col items-center gap-3">
            <Button type="submit" size="lg" disabled={isPending || !niche.trim() || !offerName.trim() || price === null} className="w-full">
              {isPending ? t("loading") : t("continue")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void skipOnboarding()}>
              {t("skip")}
            </Button>
          </div>
        </form>
      )}

      {step === 2 && step2Mode === "choice" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("numbersQuestion", { month: previousMonthLabel })}
          </Bubble>
          <ImportFlow source="onboarding" onCommitted={() => void handleImportCommitted()} />
              {isPending && <FalcoPondering isLoading pose="thinking" size="xs" label={t("calculating")} className="self-start" />}
          {error && <p className="text-sm text-state-critical">{error}</p>}
          <Button type="button" variant="ghost" className="self-center" onClick={() => setStep2Mode("manual")}>
            {t("enterManually")}
          </Button>
        </div>
      )}

      {step === 2 && step2Mode === "manual" && (
        <form onSubmit={handleScreen2Submit} className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("manualNumbersQuestion", { month: previousMonthLabel })}
          </Bubble>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label={t("cashCollected")} value={monthDraft.cashCollected} onChange={(v) => updateMonth({ cashCollected: v })} />
            <NumberField label={t("cashContracted")} value={monthDraft.cashContracted} onChange={(v) => updateMonth({ cashContracted: v })} />
            <NumberField label={t("newFollowers")} value={monthDraft.newFollowers} onChange={(v) => updateMonth({ newFollowers: v })} />
          </div>

          {saleMode === "appel_closing" && (
            <>
              <Bubble index={1}>{t("prospectingQuestion")}</Bubble>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label={t("firstMessages")} value={monthDraft.firstMessages} onChange={(v) => updateMonth({ firstMessages: v })} />
                <NumberField label={t("conversations")} value={monthDraft.conversations} onChange={(v) => updateMonth({ conversations: v })} />
                <NumberField label={t("callsProposed")} value={monthDraft.callsProposed} onChange={(v) => updateMonth({ callsProposed: v })} />
                <NumberField label={t("callsBooked")} value={monthDraft.callsBooked} onChange={(v) => updateMonth({ callsBooked: v })} />
                <NumberField label={t("callsTaken")} value={monthDraft.callsTaken} onChange={(v) => updateMonth({ callsTaken: v })} />
              </div>
            </>
          )}

          <Bubble index={2}>{t("lastQuestion")}</Bubble>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label={t("salesClosed")} value={monthDraft.salesClosed} onChange={(v) => updateMonth({ salesClosed: v })} />
          </div>

          {isPending && <FalcoPondering isLoading pose="thinking" size="xs" label="Je calcule…" className="self-start" />}
          {error && <p className="text-sm text-state-critical">{error}</p>}

          <div className="mt-2 flex flex-col items-center gap-3">
            <Button type="submit" size="lg" disabled={isPending} className="w-full">
              {isPending ? t("calculating") : t("seeDiagnostic")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void skipOnboarding()}>
              {t("skip")}
            </Button>
          </div>
        </form>
      )}

      {step === 3 && result?.kind === "point" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("bottleneckFound")} <strong>{localizedPointLabel?.toLowerCase()}</strong>.
          </Bubble>

          <div className="sticker-spotlight px-7 py-6">
            <p className="text-xs text-mist/70">
              {localizedPointCategory} · {localizedPointLabel}
            </p>
            <p className="mt-2 text-[38px] leading-[1.1] font-bold tracking-[-0.02em] tabular-nums">
              {result.point.monthlyGain === null ? "—" : `≈ ${formatEur(result.point.monthlyGain, locale)}${t("lostPerMonth")}`}
            </p>
            <p className="mt-2 text-sm text-mist/70">{t("onThisPoint")}</p>
            <div className="mt-4">
              <RateVsBenchmarkBar currentRate={result.point.currentRatePercent / 100} benchmarkRate={result.point.benchmarkRatePercent / 100} />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{localizedPointExplanation}</p>

          <Bubble index={1}>{t("improveTogether")}</Bubble>
          <Button size="lg" asChild className="w-full">
            <a href={`/diagnostic?open=${result.point.key}`}>{t("improveNow")} →</a>
          </Button>

          <DiscoveryInvite count={discoveryLevers.length} onStart={() => setShowDiscovery(true)} />
        </div>
      )}

      {step === 3 && result?.kind === "no_gap" && (
        <div className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("noGapFound")}
          </Bubble>
          <Button size="lg" asChild className="w-full">
            <a href="/roadmap">{t("openJournal")} →</a>
          </Button>

          <DiscoveryInvite count={discoveryLevers.length} onStart={() => setShowDiscovery(true)} />
        </div>
      )}
    </div>
  );
}
