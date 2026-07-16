"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "revenue" | "stripe" | "scanning" | "done";

const REVENUE_OPTIONS = [
  { value: "10-25", label: "$10k – $25k / month" },
  { value: "25-50", label: "$25k – $50k / month" },
  { value: "50-100", label: "$50k – $100k / month" },
  { value: "100+", label: "$100k+ / month" },
] as const;

const SCAN_MESSAGES = [
  "Connecting to Stripe...",
  "Scanning your failed payments...",
  "Checking your funnel...",
  "Calculating your bottleneck...",
];

const VISIBLE_STEPS: Step[] = ["revenue", "stripe", "scanning"];

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(() =>
    searchParams.get("step") === "scanning" ? "scanning" : "revenue"
  );
  const [revenue, setRevenue] = useState<string | null>(null);
  const [funnelUrl, setFunnelUrl] = useState("");
  const [scanIndex, setScanIndex] = useState(0);
  const stripeError = searchParams.get("stripe_error");

  useEffect(() => {
    if (step !== "scanning") return;

    if (scanIndex >= SCAN_MESSAGES.length - 1) {
      const timeout = setTimeout(() => setStep("done"), 900);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => setScanIndex((i) => i + 1), 1300);
    return () => clearTimeout(timeout);
  }, [step, scanIndex]);

  const progressIndex = VISIBLE_STEPS.indexOf(step === "done" ? "scanning" : step);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <ProgressDots current={progressIndex} total={VISIBLE_STEPS.length} />

      {step === "revenue" && (
        <RevenueStep
          value={revenue}
          onSelect={setRevenue}
          onContinue={() => setStep("stripe")}
        />
      )}

      {step === "stripe" && (
        <StripeStep
          funnelUrl={funnelUrl}
          onFunnelUrlChange={setFunnelUrl}
          onBack={() => setStep("revenue")}
          onSkip={() => router.push("/dashboard")}
          stripeError={stripeError}
        />
      )}

      {(step === "scanning" || step === "done") && (
        <ScanningStep
          step={step}
          messageIndex={Math.min(scanIndex, SCAN_MESSAGES.length - 1)}
        />
      )}
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "h-1.5 w-6 rounded-full transition-colors",
            i <= current ? "bg-signal" : "bg-border"
          )}
        />
      ))}
      <span className="sr-only">
        Step {current + 1} of {total}
      </span>
    </div>
  );
}

function RevenueStep({
  value,
  onSelect,
  onContinue,
}: {
  value: string | null;
  onSelect: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        What&apos;s your monthly revenue right now?
      </h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Monthly revenue</legend>
        {REVENUE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center rounded-xl border px-4 py-3 text-sm font-medium transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              value === option.value
                ? "border-signal bg-signal/5"
                : "border-border hover:bg-muted"
            )}
          >
            <input
              type="radio"
              name="revenue"
              value={option.value}
              checked={value === option.value}
              onChange={() => onSelect(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <Button size="lg" disabled={!value} onClick={onContinue} className="self-start">
        Continue →
      </Button>
    </div>
  );
}

function StripeStep({
  funnelUrl,
  onFunnelUrlChange,
  onBack,
  onSkip,
  stripeError,
}: {
  funnelUrl: string;
  onFunnelUrlChange: (value: string) => void;
  onBack: () => void;
  onSkip: () => void;
  stripeError: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>

      {stripeError && (
        <p className="rounded-lg border border-state-critical/30 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          We couldn&apos;t reach Stripe. Reconnect your account.
        </p>
      )}

      <div className="signature-glow flex flex-col gap-4 rounded-4xl border-2 border-signal p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect your Stripe account
        </h1>
        <p className="text-sm text-muted-foreground">
          This is how Scale X finds your bottleneck. Read-only access. Revoke
          anytime.
        </p>
        <Button size="lg" asChild className="w-full">
          <a href="/api/stripe/connect">Connect Stripe</a>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Everything below is optional
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Your funnel URL</span>
          <input
            type="url"
            value={funnelUrl}
            onChange={(e) => onFunnelUrlChange(e.target.value)}
            placeholder="https://yoursite.com/offer"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Plus tard — j&apos;irai directement au dashboard
      </button>
    </div>
  );
}

function ScanningStep({
  step,
  messageIndex,
}: {
  step: Extract<Step, "scanning" | "done">;
  messageIndex: number;
}) {
  const progress = messageIndex / (SCAN_MESSAGES.length - 1);
  const gapHalf = step === "done" ? 2 : 22 - progress * 19;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className="absolute top-0 left-0 h-full bg-foreground/[0.06] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `calc(50% - ${gapHalf}%)` }}
        />
        <div
          className="absolute top-0 right-0 h-full bg-foreground/[0.06] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `calc(50% - ${gapHalf}%)` }}
        />
        {step === "done" && (
          <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-in zoom-in fade-in rounded-full bg-signal duration-500 motion-reduce:animate-none" />
        )}
      </div>

      <p aria-live="polite" className="font-mono text-sm text-muted-foreground">
        {step === "done" ? "Your diagnosis is ready" : SCAN_MESSAGES[messageIndex]}
      </p>

      {step === "done" && (
        <Button size="lg" asChild>
          <a href="/dashboard">See what&apos;s costing you →</a>
        </Button>
      )}
    </div>
  );
}
