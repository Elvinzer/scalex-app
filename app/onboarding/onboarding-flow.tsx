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
import { FunnelBlockBuilder, type FunnelBlockBuilderPayload } from "@/components/funnel-block-builder";
import { FunnelPresetCards, type FunnelPresetKey } from "@/components/funnel-preset-cards";
import { formatEur } from "@/lib/currency";
import type { Locale } from "@/lib/i18n/config";
import type { SaleMode } from "@/lib/business/types";
import type { FunnelBlockCatalogEntry, FunnelBlockSelectionItem, FunnelSourceKey } from "@/lib/funnel-blocks/types";
import type { LeverCatalogEntry } from "@/lib/levers/catalog";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { cn } from "@/lib/utils";

import { completeOnboardingAfterImport, saveOnboardingBlocks, saveOnboardingMonth, saveOnboardingOffer, skipOnboarding } from "./actions";
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
  acquisitionMetrics: {},
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

function ProgressBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4].map((i) => (
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
  funnelBlocks,
  needsLanguageChoice,
  suggestedLocale,
}: {
  previousMonthYear: number;
  previousMonthNum: number;
  previousMonthLabel: string;
  discoveryLevers: LeverCatalogEntry[];
  discoveryTotal: number;
  discoveryAnswered: number;
  funnelBlocks: FunnelBlockCatalogEntry[];
  needsLanguageChoice: boolean;
  suggestedLocale: Locale;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const tDiagnostic = useTranslations("diagnostic");
  const tMetric = useTranslations("funnelBlocks.metrics");
  const tSource = useTranslations("funnelBlocks.sources");
  // Step 0 (§B): shown only to accounts that have never chosen. An existing
  // user reaching the wizard again never sees it — `needsLanguageChoice` is
  // false as soon as users.locale holds a value.
  const [languageChosen, setLanguageChosen] = useState(!needsLanguageChoice);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // Optional step-4 questionnaire, offered on the step-3 reveal — kept out of
  // the 1..3 ProgressBar so it reads as a bonus, not a mandatory step.
  const [showDiscovery, setShowDiscovery] = useState(false);

  const [niche, setNiche] = useState("");
  const [offerName, setOfferName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [saleMode, setSaleMode] = useState<SaleMode>("appel_closing");
  const [selectedBlocks, setSelectedBlocks] = useState<FunnelBlockSelectionItem[]>([
    { blockKey: "lead_magnet", order: 1 },
    { blockKey: "appel", order: 2 },
  ]);
  const [sources, setSources] = useState<FunnelSourceKey[]>(["organique"]);
  const [selectedPreset, setSelectedPreset] = useState<FunnelPresetKey | null>("leadMagnetCall");
  const [builderOpen, setBuilderOpen] = useState(false);

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

  function handlePresetSelect(key: FunnelPresetKey, blocks: FunnelBlockSelectionItem[]) {
    setSelectedPreset(key);
    if (key === "different") {
      setBuilderOpen(true);
      return;
    }
    setBuilderOpen(false);
    setSelectedBlocks(blocks);
  }

  function toggleSource(source: FunnelSourceKey) {
    setSources((current) => current.includes(source)
      ? (current.length === 1 ? current : current.filter((item) => item !== source))
      : [...current, source]);
  }

  async function handleBuilderSave(payload: FunnelBlockBuilderPayload) {
    const result = await saveOnboardingBlocks(payload);
    if (!result.error) {
      setSelectedBlocks(payload.blocks);
      setSources(payload.sources);
      setSelectedPreset("different");
    }
    return result;
  }

  async function handleFunnelSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const res = await saveOnboardingBlocks({ blocks: selectedBlocks, sources });
    setIsPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setStep(3);
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
    setStep(4);
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
    setStep(4);
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
    step === 4 && result?.kind === "point"
      ? "alert"
      : step === 4 && result?.kind === "no_gap"
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

  const selectedEntries = selectedBlocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => funnelBlocks.find((entry) => entry.blockKey === item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined);
  const activeInputKeys = new Set(selectedEntries.flatMap((entry) => entry.steps.map((stage) => stage.metricKey)));
  const hasInput = (key: string) => activeInputKeys.has(key);
  const customMetricFields = Array.from(
    new Map(
      selectedEntries
        .flatMap((entry) => entry.steps)
        .filter((stage) => !["new_followers", "first_messages", "conversations", "calls_proposed", "calls_booked", "calls_attended", "sales_closed"].includes(stage.metricKey))
        .map((stage) => [stage.metricKey, stage] as const)
    ).values()
  );
  const sourceEntries = funnelBlocks.filter((entry) => entry.family === "source");

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

      {step === 2 && (
        <form onSubmit={handleFunnelSubmit} className="flex flex-col gap-4">
          <Bubble index={0}>{t("acquisitionQuestion")}</Bubble>
          <p className="text-sm text-muted-foreground">{t("acquisitionHelp")}</p>
          {!builderOpen && (
            <FunnelPresetCards
              selectedKey={selectedPreset}
              onSelect={handlePresetSelect}
            />
          )}

          {builderOpen && (
            <div className="rounded-[var(--radius-control)] border border-border bg-card p-4">
              <FunnelBlockBuilder
                catalog={funnelBlocks}
                initialBlocks={selectedBlocks}
                initialSources={sources}
                simplified
                showSources={false}
                onSave={handleBuilderSave}
              />
            </div>
          )}

          <div className="rounded-[var(--radius-control)] border border-border p-4">
            <div>
              <p className="text-sm font-bold">{t("trafficSources")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("trafficSourcesHelp")}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sourceEntries.filter((entry) => entry.blockKey !== "communaute_externe").map((entry) => {
                const source = entry.blockKey as FunnelSourceKey;
                const selected = sources.includes(source);
                return (
                  <button
                    key={entry.blockKey}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSource(source)}
                    className={selected
                      ? "min-h-11 rounded-full border-2 border-accent bg-accent-soft px-4 py-2 text-sm font-bold text-accent-text"
                      : "min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-accent/50"}
                  >
                    {tSource(source)}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-state-critical">{error}</p>}
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? t("loading") : t("continue")}
          </Button>
        </form>
      )}

      {step === 3 && step2Mode === "choice" && (
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

      {step === 3 && step2Mode === "manual" && (
        <form onSubmit={handleScreen2Submit} className="flex flex-col gap-4">
          <Bubble index={0}>
            {t("manualNumbersQuestion", { month: previousMonthLabel })}
          </Bubble>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label={t("cashCollected")} value={monthDraft.cashCollected} onChange={(v) => updateMonth({ cashCollected: v })} />
            <NumberField label={t("cashContracted")} value={monthDraft.cashContracted} onChange={(v) => updateMonth({ cashContracted: v })} />
            {hasInput("new_followers") && <NumberField label={t("newFollowers")} value={monthDraft.newFollowers} onChange={(v) => updateMonth({ newFollowers: v })} />}
          </div>

          {hasInput("first_messages") || hasInput("conversations") || hasInput("calls_proposed") || hasInput("calls_booked") || hasInput("calls_attended") ? (
            <>
              <Bubble index={1}>{t("prospectingQuestion")}</Bubble>
              <div className="grid gap-3 sm:grid-cols-2">
                {hasInput("first_messages") && <NumberField label={t("firstMessages")} value={monthDraft.firstMessages} onChange={(v) => updateMonth({ firstMessages: v })} />}
                {hasInput("conversations") && <NumberField label={t("conversations")} value={monthDraft.conversations} onChange={(v) => updateMonth({ conversations: v })} />}
                {hasInput("calls_proposed") && <NumberField label={t("callsProposed")} value={monthDraft.callsProposed} onChange={(v) => updateMonth({ callsProposed: v })} />}
                {hasInput("calls_booked") && <NumberField label={t("callsBooked")} value={monthDraft.callsBooked} onChange={(v) => updateMonth({ callsBooked: v })} />}
                {hasInput("calls_attended") && <NumberField label={t("callsTaken")} value={monthDraft.callsTaken} onChange={(v) => updateMonth({ callsTaken: v })} />}
              </div>
            </>
          ) : null}

          {customMetricFields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {customMetricFields.map((field) => (
                <NumberField
                  key={field.metricKey}
                  label={`${tMetric.has(`${field.metricKey}.label`) ? tMetric(`${field.metricKey}.label`) : field.label} (${tMetric.has(`${field.metricKey}.unit`) ? tMetric(`${field.metricKey}.unit`) : field.unit})`}
                  value={monthDraft.acquisitionMetrics?.[field.metricKey] ?? null}
                  onChange={(value) => updateMonth({ acquisitionMetrics: { ...(monthDraft.acquisitionMetrics ?? {}), [field.metricKey]: value } })}
                />
              ))}
            </div>
          )}

          {hasInput("sales_closed") && (
            <>
              <Bubble index={2}>{t("lastQuestion")}</Bubble>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label={t("salesClosed")} value={monthDraft.salesClosed} onChange={(v) => updateMonth({ salesClosed: v })} />
              </div>
            </>
          )}

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

      {step === 4 && result?.kind === "point" && (
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

      {step === 4 && result?.kind === "no_gap" && (
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
