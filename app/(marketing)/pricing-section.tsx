import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PRICING_TIERS } from "./content";

export function PricingSection() {
  return (
    <section id="tarifs" className="mx-auto max-w-[1360px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto mb-14 max-w-xl text-center">
        <h2 className="mb-3 text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">Tarifs</h2>
        <p className="text-[15.5px] text-muted-foreground">
          Choisis ta formule Annule quand tu veux.
        </p>
      </div>

      <div className="grid items-stretch gap-5 sm:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.key}
            className={cn(
              "flex h-full flex-col rounded-[20px] border p-8",
              tier.highlight ? "border-ink bg-ink text-white shadow-[var(--shadow-lg)]" : "border-border bg-white"
            )}
          >
            {tier.highlight && (
              <span className="mb-4 self-start rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white">
                Plus populaire
              </span>
            )}
            <p className="mb-1 font-display text-lg font-bold">{tier.name}</p>
            <p className={cn("mb-5 text-[13.5px]", tier.highlight ? "text-white/65" : "text-muted-foreground")}>
              {tier.tagline}
            </p>
            <p className="mb-6 font-display text-[2rem] font-bold">
              {tier.price} €<span className={cn("text-[14px] font-bold", tier.highlight ? "text-white/55" : "text-muted-foreground")}>/mois</span>
            </p>
            <div className="mb-8 flex flex-col gap-2.5">
              {tier.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2.5 text-[13.5px]">
                  <span className={tier.highlight ? "font-bold text-accent" : "font-bold text-accent"}>✓</span>
                  <span className={tier.highlight ? "text-white/85" : "text-foreground"}>{feature}</span>
                </div>
              ))}
            </div>
            <Button
              asChild
              variant={tier.highlight ? "default" : "outline"}
              className={cn("mt-auto rounded-[12px]", tier.highlight && "bg-accent text-white")}
            >
              <a href="/onboarding">Choisir {tier.name}</a>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
