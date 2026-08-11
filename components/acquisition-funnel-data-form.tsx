"use client";

import { Check, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveAcquisitionFunnelMetrics } from "@/app/(app)/acquisition/actions";

type MetricField = {
  inputMetricKey: string;
  label: string;
  unit: string;
  value: number | null;
  sourceHref: string;
  sourceLabel: string;
  shared: boolean;
};

const SCALAR_KEYS = new Set([
  "new_followers",
  "first_messages",
  "conversations",
  "calls_proposed",
  "calls_booked",
  "calls_attended",
  "sales_closed",
]);

const SCALAR_BY_INPUT: Record<string, string> = {
  new_followers: "newFollowers",
  first_messages: "firstMessages",
  conversations: "conversations",
  calls_proposed: "callsProposed",
  calls_booked: "callsBooked",
  calls_attended: "callsTaken",
  sales_closed: "salesClosed",
};

export function AcquisitionFunnelDataForm({
  funnelKey,
  year,
  month,
  fields,
}: {
  funnelKey: string;
  year: number;
  month: number;
  fields: MetricField[];
}) {
  const locale = useLocale();
  const t = useTranslations("app.acquisition.journey");
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.inputMetricKey, field.value === null ? "" : String(field.value)])),
    [fields]
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = fields.some((field) => values[field.inputMetricKey] !== savedValues[field.inputMetricKey]);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  function update(key: string, value: string) {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const scalar: Record<string, number | null> = {};
    const acquisitionMetrics: Record<string, number | null> = {};

    for (const field of fields) {
      if (values[field.inputMetricKey] === savedValues[field.inputMetricKey]) continue;
      const raw = values[field.inputMetricKey]?.trim() ?? "";
      const value = raw === "" ? null : Number(raw);
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        setError(t("invalidNumber"));
        return;
      }
      if (SCALAR_KEYS.has(field.inputMetricKey)) scalar[SCALAR_BY_INPUT[field.inputMetricKey] ?? field.inputMetricKey] = value;
      else acquisitionMetrics[field.inputMetricKey] = value;
    }

    startTransition(async () => {
      const result = await saveAcquisitionFunnelMetrics(funnelKey, year, month, { scalar, acquisitionMetrics });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedValues(values);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="sticker-card p-5 sm:p-6" aria-labelledby="journey-data-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("dataEyebrow")}</p>
          <h2 id="journey-data-title" className="mt-1 text-lg font-bold">{t("dataTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("dataHelp", { month: monthLabel })}</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-healthy/10 px-2.5 py-1 text-xs font-bold text-state-healthy">
            <Check className="size-3.5" aria-hidden="true" />
            {t("saved")}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <label key={field.inputMetricKey} className="flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-control)] border border-border bg-background p-3">
            <span className="flex items-start justify-between gap-2 text-sm font-bold">
              <span className="min-w-0">{field.label}</span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{field.unit}</span>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values[field.inputMetricKey] ?? ""}
              onChange={(event) => update(field.inputMetricKey, event.target.value)}
              placeholder="—"
              className="w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm font-bold tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15"
            />
            <span className="flex min-h-5 items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{field.shared ? t("shared") : t("manual")}</span>
              <Link href={field.sourceHref} className="font-bold text-accent-text hover:underline" prefetch>
                {field.sourceLabel}
              </Link>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("canonicalSource")}</p>
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export type { MetricField };
