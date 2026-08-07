"use client";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { UpsellPerformance } from "@/lib/business/performance";
import type { BusinessDelivery, Offer, SupportFormat } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const SUPPORT_FORMATS: { value: SupportFormat; label: string }[] = [
  { value: "communaute", label: "Communauté" },
  { value: "calls_groupe", label: "Calls de groupe" },
  { value: "un_to_un", label: "1-to-1" },
  { value: "aucun", label: "Aucun" },
];

const TESTIMONIAL_CHANNELS = ["Site web", "Réseaux sociaux", "Page de vente", "Communauté", "Autre"];

// Read-only reference to the sales offers list, lifted from the parent page
// state — the reason delivery-section can't be fully self-contained: the
// upsell dropdown needs to know what offers currently exist.
export function DeliverySection({
  value,
  offers,
  showPerformance,
  upsellPerformance,
  onChange,
}: {
  value: BusinessDelivery;
  offers: Offer[];
  showPerformance: boolean;
  upsellPerformance: UpsellPerformance;
  onChange: (next: BusinessDelivery) => void;
}) {
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

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Délivrabilité</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce qui se passe une fois que quelqu&apos;un a acheté.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Onboarding client</span>
          <span className="text-xs text-muted-foreground">
            Décris le parcours des 7 premiers jours.
          </span>
          <textarea
            value={value.onboardingDescription}
            onChange={(event) => update({ onboardingDescription: event.target.value })}
            rows={4}
            className={inputClass}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Suivi client — format</span>
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
              <option value="">Choisir...</option>
              {SUPPORT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Fréquence</span>
            <input
              type="text"
              value={value.support.frequency}
              onChange={(event) => update({ support: { ...value.support, frequency: event.target.value } })}
              placeholder="Ex : 1x/semaine"
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold">Témoignages</p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-muted-foreground">Combien collectés</span>
            <input
              type="number"
              min={0}
              value={value.testimonials.count ?? ""}
              onChange={(event) =>
                update({
                  testimonials: {
                    ...value.testimonials,
                    count: event.target.value === "" ? null : Number(event.target.value),
                  },
                })
              }
              className={`${inputClass} max-w-40`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
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
                  {channel}
                </button>
              );
            })}
          </div>
        </div>

        <div id="upsell" className="scroll-mt-28 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold">Upsell &amp; ascension</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure ici tes offres complémentaires et suis leur performance.
              </p>
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
                Oui
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
                Non
              </button>
            </div>
          </div>

          {showPerformance && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">Take-rate ce mois</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.takeRate === null ? "—" : `${Math.round(upsellPerformance.takeRate * 100)} %`}
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">CA upsell ce mois</p>
              <p className="mt-1 font-display text-xl font-bold">{formatEur(upsellPerformance.revenue)}</p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">Panier avec upsell</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.avgWithUpsell === null ? "—" : formatEur(Math.round(upsellPerformance.avgWithUpsell))}
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
              <p className="text-xs font-bold text-muted-foreground">Panier sans upsell</p>
              <p className="mt-1 font-display text-xl font-bold">
                {upsellPerformance.avgWithoutUpsell === null ? "—" : formatEur(Math.round(upsellPerformance.avgWithoutUpsell))}
              </p>
            </div>
            </div>
          )}

          {showPerformance && upsellOffers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">Performance par offre ce mois</p>
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
                        <p className="font-bold">{offer.name || "Offre sans nom"}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreClass}`}>
                          {stats?.score === null || stats?.score === undefined ? "Pas encore de données" : `Score ${stats.score}`}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Take-rate</p>
                          <p className="font-bold tabular-nums">
                            {stats?.takeRate === null || stats?.takeRate === undefined
                              ? "—"
                              : `${Math.round(stats.takeRate * 100)} %`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">CA généré</p>
                          <p className="font-bold tabular-nums">{formatEur(stats?.revenue ?? 0)}</p>
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
              <span className="font-bold">Offre concernée</span>
              {offers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ajoute d&apos;abord une offre dans la section Offres &amp; prix.
                </p>
              ) : (
                <select
                  value={value.upsellOfferId ?? ""}
                  onChange={(event) => update({ upsellOfferId: event.target.value || null })}
                  className={inputClass}
                >
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name || "Offre sans nom"}
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
