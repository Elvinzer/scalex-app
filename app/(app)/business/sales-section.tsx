"use client";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { BusinessSales, Offer, OfferType, Recurrence, SaleMode } from "@/lib/business/types";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const OFFER_TYPES: { value: OfferType; label: string }[] = [
  { value: "formation", label: "Formation" },
  { value: "coaching", label: "Coaching" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "saas", label: "SaaS" },
  { value: "autre", label: "Autre" },
];

const SALE_MODES: { value: SaleMode; label: string }[] = [
  { value: "appel_closing", label: "Appel de closing" },
  { value: "page_vente", label: "Page de vente directe" },
  { value: "dm", label: "DM" },
];

const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: "one_shot", label: "One-shot" },
  { value: "mensuel", label: "Mensuel" },
  { value: "annuel", label: "Annuel" },
];

function emptyOffer(): Offer {
  return {
    id: crypto.randomUUID(),
    name: "",
    price: null,
    type: null,
    saleMode: null,
    recurrence: null,
    isMain: false,
  };
}

export function SalesSection({
  value,
  onChange,
}: {
  value: BusinessSales;
  onChange: (next: BusinessSales) => void;
}) {
  const { schedule, status, error } = useDebouncedSave<BusinessSales>((next) =>
    saveBusinessSection("sales", next)
  );

  function update(patch: Partial<BusinessSales>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  function addOffer() {
    update({ offers: [...value.offers, emptyOffer()] });
  }

  function updateOffer(id: string, patch: Partial<Offer>) {
    update({
      offers: value.offers.map((offer) => {
        if (offer.id !== id) {
          // Only one offer can be "principale" — flip the others off.
          return patch.isMain ? { ...offer, isMain: false } : offer;
        }
        return { ...offer, ...patch };
      }),
    });
  }

  function removeOffer(id: string) {
    update({ offers: value.offers.filter((offer) => offer.id !== id) });
  }

  const completion = computeSectionCompletion("sales", value);

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Vente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tes offres et ton process de closing.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Offres</p>

          {value.offers.map((offer) => (
            <div key={offer.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Nom</span>
                  <input
                    type="text"
                    value={offer.name}
                    onChange={(event) => updateOffer(offer.id, { name: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Prix (€)</span>
                  <input
                    type="number"
                    min={0}
                    value={offer.price ?? ""}
                    onChange={(event) =>
                      updateOffer(offer.id, { price: event.target.value === "" ? null : Number(event.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Type</span>
                  <select
                    value={offer.type ?? ""}
                    onChange={(event) =>
                      updateOffer(offer.id, { type: event.target.value === "" ? null : (event.target.value as OfferType) })
                    }
                    className={inputClass}
                  >
                    <option value="">Choisir...</option>
                    {OFFER_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Mode de vente</span>
                  <select
                    value={offer.saleMode ?? ""}
                    onChange={(event) =>
                      updateOffer(offer.id, {
                        saleMode: event.target.value === "" ? null : (event.target.value as SaleMode),
                      })
                    }
                    className={inputClass}
                  >
                    <option value="">Choisir...</option>
                    {SALE_MODES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Récurrence</span>
                  <select
                    value={offer.recurrence ?? ""}
                    onChange={(event) =>
                      updateOffer(offer.id, {
                        recurrence: event.target.value === "" ? null : (event.target.value as Recurrence),
                      })
                    }
                    className={inputClass}
                  >
                    <option value="">Choisir...</option>
                    {RECURRENCES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => updateOffer(offer.id, { isMain: !offer.isMain })}
                  className={
                    offer.isMain
                      ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-medium text-signal"
                      : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                  }
                >
                  {offer.isMain ? "Offre principale ✓" : "Définir comme offre principale"}
                </button>
                <button
                  type="button"
                  onClick={() => removeOffer(offer.id)}
                  className="text-xs font-medium text-state-critical hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addOffer}
            className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-signal hover:text-signal"
          >
            + Ajouter une offre
          </button>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Process de closing</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Qui close</span>
              <select
                value={value.closing.closer ?? ""}
                onChange={(event) =>
                  update({
                    closing: {
                      ...value.closing,
                      closer: event.target.value === "" ? null : (event.target.value as "moi" | "closer"),
                    },
                  })
                }
                className={inputClass}
              >
                <option value="">Non renseigné</option>
                <option value="moi">Moi</option>
                <option value="closer">Closer</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Durée moyenne (min)</span>
              <input
                type="number"
                min={0}
                value={value.closing.avgCallDurationMin ?? ""}
                onChange={(event) =>
                  update({
                    closing: {
                      ...value.closing,
                      avgCallDurationMin: event.target.value === "" ? null : Number(event.target.value),
                    },
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Script utilisé ?</span>
              <select
                value={value.closing.hasScript === null ? "" : value.closing.hasScript ? "yes" : "no"}
                onChange={(event) =>
                  update({
                    closing: {
                      ...value.closing,
                      hasScript: event.target.value === "" ? null : event.target.value === "yes",
                    },
                  })
                }
                className={inputClass}
              >
                <option value="">Non renseigné</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Relances</p>
          <div className="mt-3 flex flex-col gap-3">
            <FollowupToggle
              label="Séquence de relance non-acheteurs"
              value={value.followups.nonBuyers}
              onChange={(next) => update({ followups: { ...value.followups, nonBuyers: next } })}
            />
            <FollowupToggle
              label="Relance no-show"
              value={value.followups.noShow}
              onChange={(next) => update({ followups: { ...value.followups, noShow: next } })}
            />
            <FollowupToggle
              label="Relance paiements échoués"
              value={value.followups.failedPayments}
              onChange={(next) => update({ followups: { ...value.followups, failedPayments: next } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowupToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={
            value === true
              ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-medium text-signal"
              : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          Oui
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={
            value === false
              ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-medium text-signal"
              : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          Non
        </button>
      </div>
    </div>
  );
}
