"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { computeEmailContentScore } from "@/lib/email-campaigns/content-score";

export function EmailCampaignContentScore({ subject, body }: { subject: string; body: string }) {
  const t = useTranslations("app.mail");
  const result = computeEmailContentScore({ subject, body });

  return (
    <section className="rounded-[var(--radius-control)] border border-border bg-surface-sunken p-4" aria-labelledby="email-content-score-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="email-content-score-title" className="text-sm font-bold">{t("scoreTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("scoreHelp")}</p>
        </div>
        {result.score === null ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{t("scoreMissing")}</span>
        ) : (
          <span className="rounded-full bg-accent-2/10 px-2.5 py-1 text-sm font-bold tabular-nums text-accent-2-text">
            {result.score}/100
          </span>
        )}
      </div>

      {result.score !== null && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["structure", result.structure],
              ["seo", result.seo],
              ["deliverability", result.deliverability],
              ["readability", result.readability],
            ].map(([key, value]) => (
              <div key={key} className="rounded-[var(--radius-control)] border border-border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">{t(`scoreBreakdown.${key}`)}</p>
                <p className="mt-1 font-bold tabular-nums">{value}/100</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">{t("scoreExplanation")}</p>
          {result.dangerousWords.length > 0 ? (
            <p className="mt-2 flex items-start gap-2 text-xs text-state-caution">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t("dangerousWordsFound", { words: result.dangerousWords.join(", ") })}</span>
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-xs text-state-healthy">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t("noDangerousWords")}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("seoScope")}</p>
        </>
      )}
    </section>
  );
}
