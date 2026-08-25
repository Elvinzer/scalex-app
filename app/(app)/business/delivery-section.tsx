"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { UpsellPerformance } from "@/lib/business/performance";
import type { BusinessDelivery, Offer, SupportFormat } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import { cn } from "@/lib/utils";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const SUPPORT_FORMATS: { value: SupportFormat; labelKey: string }[] = [
  { value: "communaute", labelKey: "community" },
  { value: "calls_groupe", labelKey: "groupCalls" },
  { value: "un_to_un", labelKey: "oneToOne" },
  { value: "aucun", labelKey: "none" },
];

const TESTIMONIAL_CHANNELS = ["Site web", "Réseaux sociaux", "Page de vente", "Communauté", "Autre"];

function translateChannel(channel: string, t: (key: string) => string) {
  const keyByChannel: Record<string, string> = {
    "Site web": "website",
    "Réseaux sociaux": "social",
    "Page de vente": "salesPage",
    Communauté: "community",
    Autre: "other",
  };
  return t(keyByChannel[channel] ?? channel);
}

// Read-only reference to the sales offers list, lifted from the parent page
// state — the reason delivery-section can't be fully self-contained: the
// upsell dropdown needs to know what offers currently exist.
export function DeliverySection({
  value,
  offers,
  showPerformance,
  upsellPerformance,
  scaleScoreTarget,
  onChange,
}: {
  value: BusinessDelivery;
  offers: Offer[];
  showPerformance: boolean;
  upsellPerformance: UpsellPerformance;
  scaleScoreTarget: boolean;
  onChange: (next: BusinessDelivery) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("business.delivery");
  const { schedule, status, error } = useDebouncedSave<BusinessDelivery>((next) =>
    saveBusinessSection("delivery", next)
  );

  function update(patch: Partial<BusinessDelivery>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  function toggleChannel(channel: string, active: boolean) {
    update({
      testimonials: {
        ...value.testimonials,
        displayedOn: active
          ? [...value.testimonials.displayedOn, channel]
          : value.testimonials.displayedOn.filter((entry) => entry !== channel),
      },
    });
  }

  const completion = computeSectionCompletion("delivery", value);
  const hasUpsell = value.upsellOfferId !== null;
  const defaultUpsellOffer = offers.find((offer) => offer.isUpsell) ?? offers[0];
  const upsellOffers = offers.filter((offer) => offer.isUpsell);
  const upsellStatsByOfferId = new Map(upsellPerformance.offers.map((stats) => [stats.offerId, stats]));
  const scaleScoreTargetFields = [
    { key: "onboardingDescription", label: t("clientOnboarding"), filled: value.onboardingDescription.trim().length > 0 },
    { key: "supportFormat", label: t("supportFormat"), filled: value.support.format !== null },
    { key: "frequency", label: t("frequency"), filled: value.support.frequency.trim().length > 0 },
    { key: "testimonialsCount", label: t("countManaged"), filled: value.testimonials.count !== null },
    { key: "displayedOn", label: t("testimonials"), filled: value.testimonials.displayedOn.length > 0 },
    { key: "upsellOfferId", label: t("upsell"), filled: value.upsellOfferId !== null },
  ];
  const scaleScoreTargetField = scaleScoreTarget
    ? scaleScoreTargetFields.find((field) => !field.filled) ?? null
    : null;
  const isTargetField = (key: string) => scaleScoreTargetField?.key === key;

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      {scaleScoreTarget && (
        <div role="status" className="mt-4 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-accent-text">
          {scaleScoreTargetField
            ? t("scaleScoreTargetNotice", { field: scaleScoreTargetField.label })
            : t("scaleScoreSectionNotice")}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        <label className={cn("flex flex-col gap-1.5 text-sm", isTargetField("onboardingDescription") && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
          <span className="font-bold">{t("clientOnboarding")}</span>
          <span className="text-xs text-muted-foreground">
            {t("onboardingHelp")}
          </span>
          <textarea
            value={value.onboardingDescription}
            onChange={(event) => update({ onboardingDescription: event.target.value })}
            rows={4}
            className={inputClass}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={cn("flex flex-col gap-1.5 text-sm", isTargetField("supportFormat") && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
            <span className="font-bold">{t("supportFormat")}</span>
            <select
              value={value.support.format ?? ""}
              onChange={(event) =>
                update({
                  support: {
                    ...value.support,
                    format: event.target.value === "" ? null : (event.target.value as SupportFormat),
                  },
                })
              }
              className={inputClass}
            >
              <option value="">{t("choose")}</option>
              {SUPPORT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className={cn("flex flex-col gap-1.5 text-sm", isTargetField("frequency") && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
            <span className="font-bold">{t("frequency")}</span>
            <input
              type="text"
              value={value.support.frequency}
              onChange={(event) => update({ support: { ...value.support, frequency: event.target.value } })}
              placeholder="Ex : 1x/semaine"
              className={inputClass}
            />
          </label>
        </div>

        <div className={cn("flex flex-col gap-3", isTargetField("testimonialsCount") && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
          <p className="text-sm font-bold">{t("testimonials")}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-muted/35 p-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("countManaged")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value.testimonials.count ?? 0}</p>
            </div>
            <Link
              href="/delivrabilite/temoignages"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:border-border-hover hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("openTestimonials")}
            </Link>
          </div>
          <div className={cn("flex flex-wrap gap-2", isTargetField("displayedOn") && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
            {TESTIMONIAL_CHANNELS.map((channel) => {
              const active = value.testimonials.displayedOn.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel, !active)}
                  className={
                    active
                      ? "rounded-full border border-positive bg-positive-soft px-3 py-1.5 text-sm font-bold text-positive"
                      : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-positive/50"
                  }
                >
                  {translateChannel(channel, t)}
                </button>
              );
            })}
          </div>
        </div>

        <div id="upsell" className={cn("scroll-mt-28 rounded-xl border border-border p-4", isTargetField("upsellOfferId") && "border-accent/40 bg-accent-soft/40 ring-2 ring-accent/20")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold">{t("upsell")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("upsellHelp")}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update({ upsellOfferId: defaultUpsellOffer?.id ?? "" })}
                className={
                  hasUpsell
                    ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
                    : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
                }
              >
                {t("yes")}
              </button>
              <button
                type="button"
                onClick={() => update({ upsellOfferId: null })}
                className={
                  !hasUpsell
                    ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
                    : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
                }
              >
                {t("no")}
              </button>
            </div>
          </div>

          {showPerformance && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">{t("takeRate")}</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.takeRate === null ? "—" : `${Math.round(upsellPerformance.takeRate * 100)} %`}
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">{t("upsellRevenue")}</p>
              <p className="mt-1 font-display text-xl font-bold">{formatEur(upsellPerformance.revenue, locale)}</p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">{t("basketWithUpsell")}</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.avgWithUpsell === null ? "—" : formatEur(Math.round(upsellPerformance.avgWithUpsell), locale)}
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">{t("basketWithoutUpsell")}</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.avgWithoutUpsell === null ? "—" : formatEur(Math.round(upsellPerformance.avgWithoutUpsell), locale)}
              </p>
            </div>
            </div>
          )}

          {showPerformance && upsellOffers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">{t("offerPerformance")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {upsellOffers.map((offer) => {
                  const stats = upsellStatsByOfferId.get(offer.id);
                  const scoreClass =
                    stats?.score === null || stats?.score === undefined
                      ? "bg-muted text-muted-foreground"
                      : stats.score < 40
                        ? "bg-state-critical/10 text-state-critical"
                        : stats.score < 70
                          ? "bg-state-caution/10 text-state-caution"
                          : "bg-state-healthy/10 text-state-healthy";

                  return (
                    <div key={offer.id} className="rounded-[var(--radius-control)] border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold">{offer.name || t("unnamedOffer")}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreClass}`}>
                          {stats?.score === null || stats?.score === undefined ? t("noData") : t("score", { score: stats.score })}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("takeRateShort")}</p>
                          <p className="font-bold tabular-nums">
                            {stats?.takeRate === null || stats?.takeRate === undefined
                              ? "—"
                              : `${Math.round(stats.takeRate * 100)} %`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("generatedRevenue")}</p>
                          <p className="font-bold tabular-nums">{formatEur(stats?.revenue ?? 0, locale)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasUpsell && (
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("relatedOffer")}</span>
              {offers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("addOfferFirst")}
                </p>
              ) : (
                <select
                  value={value.upsellOfferId ?? ""}
                  onChange={(event) => update({ upsellOfferId: event.target.value || null })}
                  className={inputClass}
                >
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name || t("unnamedOffer")}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
