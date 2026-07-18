"use client";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { BusinessDelivery, Offer, SupportFormat } from "@/lib/business/types";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-lg border-2 border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
  onChange,
}: {
  value: BusinessDelivery;
  offers: Offer[];
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

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Délivrabilité</h2>
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
                      ? "rounded-full border-2 border-signal bg-signal/15 px-3 py-1.5 text-sm font-bold text-signal"
                      : "rounded-full border-2 border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-signal/50"
                  }
                >
                  {channel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border-2 border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-bold">Upsell / ascension</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update({ upsellOfferId: offers[0]?.id ?? "" })}
                className={
                  hasUpsell
                    ? "rounded-full border-2 border-signal bg-signal/15 px-3 py-1 text-xs font-bold text-signal"
                    : "rounded-full border-2 border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                }
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => update({ upsellOfferId: null })}
                className={
                  !hasUpsell
                    ? "rounded-full border-2 border-signal bg-signal/15 px-3 py-1 text-xs font-bold text-signal"
                    : "rounded-full border-2 border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                }
              >
                Non
              </button>
            </div>
          </div>

          {hasUpsell && (
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Offre concernée</span>
              {offers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ajoute d&apos;abord une offre dans la section Vente.
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
