"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PRICING_TIERS } from "./content";

export function PricingSection() {
  const t = useTranslations("marketing");
  const locale = useLocale();
  const [annual, setAnnual] = useState(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 0 }).format(price);

  return (
    <section id="tarifs" className="mx-auto max-w-[1120px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="mb-3 text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">{t("pricing.heading")}</h2>
        <p className="text-[15.5px] text-muted-foreground">{t("pricing.description")}</p>
      </div>

      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-muted p-1" role="group" aria-label={t("pricing.billingLabel")}>
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
            className={cn(
              "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
              !annual ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("pricing.monthly")}
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
            className={cn(
              "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
              annual ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("pricing.annual")}
          </button>
        </div>
        <p className="text-center text-sm font-medium text-accent-text">{t("pricing.annualNote")}</p>
      </div>

      <div className="mx-auto grid max-w-4xl items-stretch gap-5 md:grid-cols-2">
        {PRICING_TIERS.map((tier) => {
          const price = annual ? tier.annualPrice : tier.monthlyPrice;

          return (
            <article
              key={tier.key}
              className={cn(
                "relative flex h-full flex-col rounded-[22px] border p-7 sm:p-8",
                tier.highlight
                  ? "border-accent bg-ink text-white shadow-[var(--shadow-lg)]"
                  : "border-border bg-white",
              )}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white">
                  {t("pricing.popular")}
                </span>
              )}

              <div className="mb-7">
                <p className="mb-1 font-display text-xl font-bold">{t(`pricing.${tier.key}.name`)}</p>
                <p className={cn("text-[14px]", tier.highlight ? "text-white/70" : "text-muted-foreground")}>
                  {t(`pricing.${tier.key}.tagline`)}
                </p>
              </div>

              <div className="mb-7">
                <p className="font-display text-[2.4rem] leading-none font-bold tabular-nums">
                  {formatPrice(price)} €
                  <span className={cn("ml-1 text-[14px] font-bold", tier.highlight ? "text-white/60" : "text-muted-foreground")}>
                    {annual ? t("pricing.perYear") : t("pricing.perMonth")}
                  </span>
                </p>
                {annual && (
                  <p className={cn("mt-2 text-xs", tier.highlight ? "text-white/60" : "text-muted-foreground")}>
                    {t("pricing.annualEquivalent", { price: formatPrice(Math.round(tier.annualPrice / 12)) })}
                  </p>
                )}
              </div>

              <ul className="mb-8 flex flex-col gap-3" aria-label={t(`pricing.${tier.key}.name`)}>
                {Array.from({ length: 6 }, (_, index) => index + 1).map((featureNumber) => (
                  <li key={featureNumber} className="flex items-start gap-2.5 text-[14px] leading-snug">
                    <span className="mt-0.5 font-bold text-accent" aria-hidden="true">✓</span>
                    <span className={tier.highlight ? "text-white/85" : "text-foreground"}>
                      {t(`pricing.${tier.key}.feature${featureNumber}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <Button asChild variant={tier.highlight ? "default" : "outline"} className="mt-auto w-full rounded-[12px]">
                <Link href={`/sign-in?intent=trial&plan=${tier.key}${annual ? "&billing=annual" : ""}`}>{t("pricing.trialCta")}</Link>
              </Button>
            </article>
          );
        })}
      </div>

      <p className="mt-7 text-center text-sm text-muted-foreground">{t("pricing.terms")}</p>
      <p className="mt-3 text-center text-sm font-semibold text-accent-text">
        <Link href="/diagnostic" className="transition-colors hover:text-accent hover:underline">
          {t("pricing.diagnosticLink")}
        </Link>
      </p>
    </section>
  );
}
