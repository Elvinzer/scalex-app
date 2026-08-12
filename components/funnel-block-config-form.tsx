"use client";

import { Check, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveFunnelBlockConfiguration } from "@/app/(app)/acquisition/actions";
import { Button } from "@/components/ui/button";
import type { FunnelBlockCatalogEntry } from "@/lib/funnel-blocks/types";
import type { FunnelBlockConfigurations } from "@/lib/business/types";

export function FunnelBlockConfigForm({
  entry,
  initial,
}: {
  entry: FunnelBlockCatalogEntry;
  initial: FunnelBlockConfigurations[string] | undefined;
}) {
  const t = useTranslations("funnelBlocks.page");
  const router = useRouter();
  const [values, setValues] = useState({
    link: typeof initial?.link === "string" ? initial.link : "",
    platform: typeof initial?.platform === "string" ? initial.platform : "",
    note: typeof initial?.note === "string" ? initial.note : "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submit() {
    setIsPending(true);
    setError(null);
    const result = await saveFunnelBlockConfiguration({ blockKey: entry.blockKey, values });
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="funnel-block-config-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("configurationEyebrow")}</p>
          <h2 id="funnel-block-config-title" className="mt-1 text-lg font-bold">{t("configurationTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("configurationHelp")}</p>
        </div>
        {saved && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-state-healthy"><Check className="size-3.5" aria-hidden="true" />{t("saved")}</span>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">{t("configFieldLink")}</span>
          <input type="url" value={values.link} onChange={(event) => { setSaved(false); setValues((current) => ({ ...current, link: event.target.value })); }} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">{t("configFieldPlatform")}</span>
          <input type="text" value={values.platform} onChange={(event) => { setSaved(false); setValues((current) => ({ ...current, platform: event.target.value })); }} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15" />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1.5 text-sm">
        <span className="font-bold">{t("configFieldNote")}</span>
        <textarea value={values.note} onChange={(event) => { setSaved(false); setValues((current) => ({ ...current, note: event.target.value })); }} placeholder={t("configNotePlaceholder")} rows={3} className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15" />
      </label>
      {error && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button type="button" variant="outline" onClick={() => void submit()} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isPending ? t("saving") : t("saveConfiguration")}
        </Button>
      </div>
    </section>
  );
}
