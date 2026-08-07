"use client";

import { useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { computeSectionCompletion } from "@/lib/business/completion";
import type { OfferPerformance } from "@/lib/business/performance";
import type { BusinessSales, Offer, OfferType, Recurrence, SaleMode } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";

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
    isUpsell: false,
    commissionSetterPct: null,
  };
}

export function SalesSection({
  value,
  showPerformance,
  offerPerformance,
  onChange,
}: {
  value: BusinessSales;
  showPerformance: boolean;
  offerPerformance: OfferPerformance[];
  onChange: (next: BusinessSales) => void;
}) {
  const { schedule, status, error } = useDebouncedSave<BusinessSales>((next) =>
    saveBusinessSection("sales", next)
  );
  // Accordion is display-only — collapsed by default so N offers don't
  // stack N fully-expanded edit forms; the newly-added offer opens itself.
  const [openOfferIds, setOpenOfferIds] = useState<string[]>([]);

  function update(patch: Partial<BusinessSales>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  function addOffer() {
    const offer = emptyOffer();
    update({ offers: [...value.offers, offer] });
    setOpenOfferIds((prev) => [...prev, offer.id]);
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
  const performanceByOfferId = new Map(offerPerformance.map((stats) => [stats.offerId, stats]));

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Offres &amp; prix</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ce que tu vends, à quel prix et comment c&apos;est vendu.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold">Offres</p>

          <Accordion type="multiple" value={openOfferIds} onValueChange={setOpenOfferIds} className="flex flex-col gap-3">
          {value.offers.map((offer) => (
            <AccordionItem key={offer.id} value={offer.id} className="rounded-xl border border-border px-4">
              <AccordionTrigger>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="font-bold">{offer.name || "Offre sans nom"}</span>
                  <span className="text-sm text-muted-foreground">
                    {offer.price === null ? "Prix non renseigné" : formatEur(offer.price)}
                  </span>
                  {offer.isMain && (
                    <span className="rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy">
                      Principale
                    </span>
                  )}
                  {offer.isUpsell && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-text">
                      Upsell
                    </span>
                  )}
                  {offer.commissionSetterPct != null && (
                    <span className="rounded-full bg-accent-2-soft px-2 py-0.5 text-xs font-bold text-accent-2-text">
                      Commission setter : {Math.round(offer.commissionSetterPct * 100)} %
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3">
              {showPerformance && (() => {
                const stats = performanceByOfferId.get(offer.id);
                return (
                  <div className="rounded-[var(--radius-control)] bg-muted/50 p-3">
                    <p className="text-xs font-bold text-muted-foreground">Performance ce mois</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">CA</p>
                        <p className="font-bold tabular-nums">{formatEur(stats?.revenue ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ventes</p>
                        <p className="font-bold tabular-nums">{stats?.salesCount ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Panier moyen</p>
                        <p className="font-bold tabular-nums">
                          {stats?.avgBasket === null || stats?.avgBasket === undefined
                            ? "—"
                            : formatEur(Math.round(stats.avgBasket))}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-bold text-muted-foreground">Nom</span>
                  <input
                    type="text"
                    value={offer.name}
                    onChange={(event) => updateOffer(offer.id, { name: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-bold text-muted-foreground">Prix (€)</span>
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

              {/* Optional — primes over the setter's own defaultCommissionPct
                  (lib/setters/queries.ts's computeSetterCommissions) when set,
                  never stored/computed elsewhere. */}
              <label className="flex flex-col gap-1 text-xs sm:w-1/2 sm:pr-1.5">
                <span className="font-bold text-muted-foreground">Commission setter (%, optionnel)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={offer.commissionSetterPct != null ? Math.round(offer.commissionSetterPct * 100) : ""}
                  onChange={(event) =>
                    updateOffer(offer.id, {
                      commissionSetterPct: event.target.value === "" ? null : Number(event.target.value) / 100,
                    })
                  }
                  className={inputClass}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-bold text-muted-foreground">Type</span>
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
                  <span className="font-bold text-muted-foreground">Mode de vente</span>
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
                  <span className="font-bold text-muted-foreground">Récurrence</span>
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

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateOffer(offer.id, { isMain: !offer.isMain })}
                    className={
                      offer.isMain
                        ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
                        : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
                    }
                  >
                    {offer.isMain ? "Offre principale ✓" : "Définir comme offre principale"}
                  </button>
                  {/* Non-exclusive (unlike isMain) — several offers can be
                      upsells at once. The performance breakdown stays beside
                      this configuration in Mon business. */}
                  <button
                    type="button"
                    onClick={() => updateOffer(offer.id, { isUpsell: !offer.isUpsell })}
                    className={
                      offer.isUpsell
                        ? "rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-xs font-bold text-accent-text"
                        : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
                    }
                  >
                    {offer.isUpsell ? "Upsell ✓" : "Marquer comme upsell"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeOffer(offer.id)}
                  className="text-xs font-bold text-state-critical hover:underline"
                >
                  Supprimer
                </button>
              </div>
              </AccordionContent>
            </AccordionItem>
          ))}
          </Accordion>

          <button
            type="button"
            onClick={addOffer}
            className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:border-signal hover:text-signal"
          >
            + Ajouter une offre
          </button>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-bold">Process de closing</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-muted-foreground">Qui close</span>
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
              <span className="font-bold text-muted-foreground">Durée moyenne (min)</span>
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
              <span className="font-bold text-muted-foreground">Script utilisé ?</span>
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
          <p className="text-sm font-bold">Relances</p>
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
              ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
              : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
          }
        >
          Oui
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={
            value === false
              ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
              : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
          }
        >
          Non
        </button>
      </div>
    </div>
  );
}
