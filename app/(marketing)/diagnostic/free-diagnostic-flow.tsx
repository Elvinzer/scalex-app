"use client";

import { toPng } from "html-to-image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Falco } from "@/components/falco/falco";
import { ScaleScoreShareCard } from "@/components/scale-score-share-card";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";
import {
  calculateFreeDiagnostic,
  freeDiagnosticInputSchema,
  type FreeDiagnosticInput,
  type FreeDiagnosticResult,
} from "@/lib/free-diagnostic";
import { cn } from "@/lib/utils";

type Draft = {
  niche: string;
  offer: string;
  price: string;
  audience: string;
  leads: string;
  appointments: string;
  sales: string;
  revenue: string;
};

type EmailStatus = "idle" | "sending" | "sent" | "error";

const EMPTY_DRAFT: Draft = {
  niche: "",
  offer: "",
  price: "",
  audience: "",
  leads: "",
  appointments: "",
  sales: "",
  revenue: "",
};

function parseMetric(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildInput(draft: Draft): FreeDiagnosticInput | null {
  const parsed = freeDiagnosticInputSchema.safeParse({
    niche: draft.niche,
    offer: draft.offer,
    price: parseMetric(draft.price),
    audience: parseMetric(draft.audience),
    leads: parseMetric(draft.leads),
    appointments: parseMetric(draft.appointments),
    sales: parseMetric(draft.sales),
    revenue: parseMetric(draft.revenue),
  });
  return parsed.success ? parsed.data : null;
}

function formatPercent(value: number | null, locale: string): string {
  if (value === null) return "0";
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatEuro(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function FreeDiagnosticFlow() {
  const t = useTranslations("freeDiagnostic");
  const locale = useLocale();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [input, setInput] = useState<FreeDiagnosticInput | null>(null);
  const [result, setResult] = useState<FreeDiagnosticResult | null>(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasValidationError, setHasValidationError] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackClient("free_diagnostic_started");
  }, []);

  const measuredRevenue = input?.revenue ?? (input && input.sales !== null ? input.sales * input.price : null);
  const potentialRevenue = measuredRevenue !== null && result !== null && result.estimatedGain !== null
    ? measuredRevenue + result.estimatedGain
    : null;
  const canShareCard = result?.score !== null && measuredRevenue !== null && measuredRevenue > 0 && potentialRevenue !== null;

  const bottleneckLabel = useMemo(() => {
    if (!result?.bottleneck) return null;
    return t(`result.bottlenecks.${result.bottleneck}`);
  }, [result?.bottleneck, t]);

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setHasValidationError(false);
  }

  function goToNumbers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.niche.trim() || !draft.offer.trim() || parseMetric(draft.price) === null) {
      setHasValidationError(true);
      return;
    }
    setStep(2);
  }

  function showResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildInput(draft);
    if (!parsed) {
      setHasValidationError(true);
      return;
    }
    const calculated = calculateFreeDiagnostic(parsed);
    setInput(parsed);
    setResult(calculated);
    setStep(3);
    trackClient("free_diagnostic_completed", {
      score: calculated.score,
      bottleneck: calculated.bottleneck,
      measured_signals: calculated.measuredSignals,
    });
  }

  function savePrefill() {
    if (!input) return;
    window.localStorage.setItem("minaly-free-diagnostic", JSON.stringify(input));
    trackClient("free_diagnostic_to_signup", { bottleneck: result?.bottleneck ?? "unknown" });
  }

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input || !result) return;
    setEmailStatus("sending");
    try {
      const response = await fetch("/api/public/free-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, diagnostic: input, result, locale }),
      });
      if (!response.ok) throw new Error("email_failed");
      setEmailStatus("sent");
      trackClient("free_diagnostic_email_captured", { bottleneck: result.bottleneck ?? "unknown" });
    } catch {
      setEmailStatus("error");
    }
  }

  async function downloadCard() {
    if (!shareCardRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = "minaly-diagnostic.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            ← {t("backToHome")}
          </Link>
          {step < 3 && <span className="text-sm font-semibold text-muted-foreground">{t("stepLabel", { step })}</span>}
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div className="flex flex-col gap-5 lg:sticky lg:top-32">
            <span className="inline-flex w-fit items-center rounded-full border border-accent-border bg-accent-soft px-3.5 py-2 text-xs font-bold text-accent-text">
              {t("eyebrow")}
            </span>
            <h1 className="text-[clamp(2.2rem,4.6vw,3.7rem)] leading-[1.06] font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="max-w-lg text-[16px] leading-relaxed text-muted-foreground">{t("intro")}</p>
            <Falco
              skin="diagnostic"
              skinSizePx={116}
              animate="enter"
              withBubble
              bubbleText={bottleneckLabel ? t("result.falcoVerdict", { bottleneck: bottleneckLabel }) : undefined}
              className="mt-2 w-28"
            />
          </div>

          <section className="rounded-[24px] border border-border bg-white p-6 shadow-[var(--shadow-md)] sm:p-8" aria-live="polite">
            <div className="mb-8 flex gap-2" aria-hidden="true">
              {[1, 2, 3].map((item) => (
                <span key={item} className={cn("h-1.5 flex-1 rounded-full", item <= step ? "bg-accent" : "bg-muted")} />
              ))}
            </div>

            {step === 1 && (
              <form onSubmit={goToNumbers} className="flex flex-col gap-6">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("stepLabel", { step: 1 })}</p>
                  <h2 className="text-2xl font-bold text-foreground">{t("step1.title")}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{t("step1.description")}</p>
                </div>
                <TextField label={t("step1.niche")} placeholder={t("step1.nichePlaceholder")} value={draft.niche} onChange={(value) => updateDraft("niche", value)} required />
                <TextField label={t("step1.offer")} placeholder={t("step1.offerPlaceholder")} value={draft.offer} onChange={(value) => updateDraft("offer", value)} required />
                <MetricField label={t("step1.price")} placeholder={t("step1.pricePlaceholder")} value={draft.price} onChange={(value) => updateDraft("price", value)} required />
                {hasValidationError && <p className="text-sm text-state-critical" role="alert">{t("validationError")}</p>}
                <Button type="submit" size="lg" className="mt-1 w-full rounded-[12px]">{t("next")}</Button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={showResult} className="flex flex-col gap-6">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("stepLabel", { step: 2 })}</p>
                  <h2 className="text-2xl font-bold text-foreground">{t("step2.title")}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{t("step2.description")}</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <MetricField label={t("step2.audience")} help={t("step2.audienceHelp")} value={draft.audience} onChange={(value) => updateDraft("audience", value)} />
                  <MetricField label={t("step2.leads")} value={draft.leads} onChange={(value) => updateDraft("leads", value)} />
                  <MetricField label={t("step2.appointments")} value={draft.appointments} onChange={(value) => updateDraft("appointments", value)} />
                  <MetricField label={t("step2.sales")} value={draft.sales} onChange={(value) => updateDraft("sales", value)} />
                  <MetricField label={t("step2.revenue")} help={t("step2.revenueHelp")} value={draft.revenue} onChange={(value) => updateDraft("revenue", value)} />
                </div>
                <p className="rounded-[12px] bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-text">{t("roughNumbers")}</p>
                {hasValidationError && <p className="text-sm text-state-critical" role="alert">{t("validationError")}</p>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => setStep(1)}>{t("back")}</Button>
                  <Button type="submit" size="lg" className="rounded-[12px] sm:min-w-48">{t("seeResult")}</Button>
                </div>
              </form>
            )}

            {step === 3 && input && result && (
              <div className="flex flex-col gap-7">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("result.eyebrow")}</p>
                  <h2 className="text-2xl font-bold text-foreground">{t("result.title")}</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-[16px] bg-ink p-5 text-white">
                    <p className="text-xs font-bold tracking-[0.12em] text-mist/65 uppercase">{t("result.score")}</p>
                    <p className="mt-3 font-display text-5xl font-bold tabular-nums">
                      {result.score ?? "–"}<span className="ml-1 text-base text-mist/60">{t("result.outOf")}</span>
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-accent-border bg-accent-soft p-5">
                    <p className="text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("result.bottleneckLabel")}</p>
                    <p className="mt-2 text-xl font-bold text-foreground">{bottleneckLabel ?? t("result.insufficient")}</p>
                    {bottleneckLabel && result.currentRate !== null && result.benchmarkRate !== null && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("result.rate", {
                          current: formatPercent(result.currentRate, locale),
                          benchmark: formatPercent(result.benchmarkRate, locale),
                        })}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-base font-semibold text-foreground">
                  {result.estimatedGain !== null
                    ? t("result.gain", { amount: formatEuro(result.estimatedGain, locale) })
                    : t("result.gainUnavailable")}
                </p>
                <details className="group rounded-[14px] border border-border bg-muted/40 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                    {t("result.methodToggle")}
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                    {t("result.method", { measured: result.measuredSignals })}
                  </p>
                </details>

                {canShareCard && measuredRevenue !== null && potentialRevenue !== null && result.score !== null ? (
                  <div className="flex flex-col gap-3">
                    <div ref={shareCardRef} className="rounded-[22px] bg-ink p-1">
                      <ScaleScoreShareCard score={result.score} currentMonthlyRevenue={measuredRevenue} potentialMonthlyRevenue={potentialRevenue} />
                    </div>
                    <Button type="button" variant="outline" onClick={() => void downloadCard()} disabled={isDownloading} className="w-full rounded-[12px]">
                      {isDownloading ? t("result.downloading") : t("result.download")}
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-[12px] border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t("result.cardUnavailable")}</p>
                )}

                <div className="flex flex-col gap-3 border-t border-border pt-6">
                  <Button asChild size="lg" className="w-full rounded-[12px]" onClick={savePrefill}>
                    <Link href="/sign-in?intent=diagnostic">{t("result.primaryCta")}</Link>
                  </Button>
                  <div className="rounded-[14px] border border-border bg-muted/40 p-4">
                    <p className="mb-3 text-sm font-semibold text-foreground">{t("result.emailCta")}</p>
                    {emailStatus === "sent" ? (
                      <p className="text-sm font-semibold text-state-healthy">{t("result.emailSent")}</p>
                    ) : (
                      <form onSubmit={sendEmail} className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder={t("result.emailPlaceholder")}
                          className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-border bg-white px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                        />
                        <Button type="submit" variant="outline" disabled={emailStatus === "sending"} className="min-h-11 rounded-[12px]">
                          {emailStatus === "sending" ? t("result.emailSending") : t("result.emailSubmit")}
                        </Button>
                      </form>
                    )}
                    {emailStatus === "error" && <p className="mt-2 text-sm text-state-critical" role="alert">{t("result.emailError")}</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function TextField({
  label,
  placeholder,
  value,
  onChange,
  required = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
      {label}
      <input
        type="text"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 rounded-[var(--radius-control)] border border-border bg-white px-3 text-sm font-normal outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
      />
    </label>
  );
}

function MetricField({
  label,
  help,
  placeholder,
  value,
  onChange,
  required = false,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      {help && <span className="-mt-1 text-xs font-normal text-muted-foreground">{help}</span>}
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 rounded-[var(--radius-control)] border border-border bg-white px-3 text-sm font-normal outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
      />
    </label>
  );
}
