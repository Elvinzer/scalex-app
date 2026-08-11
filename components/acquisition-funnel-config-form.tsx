"use client";

import { Check, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveAcquisitionFunnelConfiguration } from "@/app/(app)/acquisition/actions";

type ConfigurationField = {
  name: string;
  label: string;
  type: "text" | "url" | "number" | "decimal" | "select";
  value: string | number | null;
  options?: Array<{ value: string; label: string }>;
};

export function AcquisitionFunnelConfigForm({
  funnelKey,
  fields,
}: {
  funnelKey: string;
  fields: ConfigurationField[];
}) {
  const t = useTranslations("app.acquisition.journey");
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.name, field.value === null ? "" : String(field.value)])),
    [fields]
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isDirty = fields.some((field) => values[field.name] !== savedValues[field.name]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data: Record<string, string | number | null> = {};
    for (const field of fields) {
      const raw = values[field.name]?.trim() ?? "";
      if (field.type === "number" || field.type === "decimal") {
        const value = raw === "" ? null : Number(raw);
        if (value !== null && (!Number.isFinite(value) || value < 0 || (field.type === "number" && !Number.isInteger(value)))) {
          setError(t("invalidNumber"));
          return;
        }
        data[field.name] = value;
      } else {
        data[field.name] = raw;
      }
    }

    startTransition(async () => {
      const result = await saveAcquisitionFunnelConfiguration(funnelKey, data);
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
    <form onSubmit={submit} className="sticker-card p-5 sm:p-6" aria-labelledby="journey-config-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("configEyebrow")}</p>
          <h2 id="journey-config-title" className="mt-1 text-lg font-bold">{t("configTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("configHelp")}</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-healthy/10 px-2.5 py-1 text-xs font-bold text-state-healthy">
            <Check className="size-3.5" aria-hidden="true" />
            {t("saved")}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{field.label}</span>
            {field.type === "select" ? (
              <select
                value={values[field.name] ?? ""}
                onChange={(event) => {
                  setSaved(false);
                  setValues((current) => ({ ...current, [field.name]: event.target.value }));
                }}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15"
              >
                <option value="">{t("choose")}</option>
                {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                type={field.type}
                min={field.type === "number" || field.type === "decimal" ? 0 : undefined}
                step={field.type === "decimal" ? "any" : undefined}
                value={values[field.name] ?? ""}
                onChange={(event) => {
                  setSaved(false);
                  setValues((current) => ({ ...current, [field.name]: event.target.value }));
                }}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15"
              />
            )}
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {t("saveConfig")}
        </Button>
      </div>
    </form>
  );
}

export type { ConfigurationField };
