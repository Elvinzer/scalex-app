"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Falco, type FalcoPose } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { computeGlobalCompletion } from "@/lib/business/completion";
import type { OfferPerformance, UpsellPerformance } from "@/lib/business/performance";
import type { BusinessProfileData } from "@/lib/business/types";

import { AcquisitionSection } from "./acquisition-section";
import { DeliverySection } from "./delivery-section";
import { IdentitySection } from "./identity-section";
import { SalesSection } from "./sales-section";

// The one deliberate exception to "no lifted client state" in this codebase:
// page-scoped (not global) useState holding the whole profile, so the header
// completion % and the Delivery section's "offre concernée" dropdown (which
// needs the live Sales offers list) can react instantly without a reload.
// Each section still persists itself via its own saveBusinessSection call —
// this wrapper only mirrors state for display math.
export function BusinessPageClient({
  initialProfile,
  isOwner,
  canViewSalesPerformance,
  offerPerformance,
  upsellPerformance,
}: {
  initialProfile: BusinessProfileData;
  isOwner: boolean;
  canViewSalesPerformance: boolean;
  offerPerformance: OfferPerformance[];
  upsellPerformance: UpsellPerformance;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const completion = computeGlobalCompletion(profile);
  const sectionLabels: Record<string, string> = {
    identity: "Identité",
    acquisition: "Acquisition",
    sales: "Offres & vente",
    delivery: "Livraison",
  };
  const incompleteCount = Object.values(completion.bySection).reduce((sum, section) => sum + section.total - section.answered, 0);

  const falcoPose: FalcoPose = completion.percent >= 80 ? "happy" : completion.percent >= 40 ? "neutral" : "sleeping";
  const falcoLine =
    completion.percent >= 80
      ? "Nickel. J'ai tout ce qu'il me faut pour un diagnostic précis."
      : completion.percent >= 40
        ? "On progresse. Encore quelques réponses et je vois plus clair."
        : "Aide-moi à te connaître : plus tu remplis, plus je peux t'aider.";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">Configuration</p>
          <h1 className="mt-1 text-3xl font-bold">Business &amp; offres</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">Décris ton modèle, tes offres et ta livraison pour que le diagnostic de Falco soit actionnable.</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Falco pose={falcoPose} size="xs" animate="enter" />
          <p className="max-w-xs text-sm text-muted-foreground">{falcoLine}</p>
        </div>
      </div>

      <section className="sticker-card flex flex-col gap-5 p-6" aria-labelledby="business-completion-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Profil du business</p>
            <h2 id="business-completion-heading" className="mt-1 text-xl font-bold">Ton diagnostic sera plus précis avec ces informations.</h2>
            <p className="mt-1 text-sm text-muted-foreground">{incompleteCount} élément{incompleteCount > 1 ? "s" : ""} à compléter pour débloquer des recommandations plus fines.</p>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="font-display text-3xl font-bold tabular-nums">{completion.percent}%</p>
              <p className="text-xs text-muted-foreground">complété</p>
            </div>
            <Button asChild size="sm">
              <a href="#identite">Compléter</a>
            </Button>
          </div>
        </div>
        <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-muted" aria-label={`${completion.percent}% du profil complété`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percent}>
          <div className="bg-foreground transition-[flex-basis]" style={{ flexBasis: `${completion.bySection.identity.percent / 4}%` }} />
          <div className="bg-foreground/70 transition-[flex-basis]" style={{ flexBasis: `${completion.bySection.acquisition.percent / 4}%` }} />
          <div className="bg-foreground/45 transition-[flex-basis]" style={{ flexBasis: `${completion.bySection.sales.percent / 4}%` }} />
          <div className="bg-foreground/25 transition-[flex-basis]" style={{ flexBasis: `${completion.bySection.delivery.percent / 4}%` }} />
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(completion.bySection).map(([key, section]) => (
            <a key={key} href={key === "identity" ? "#identite" : key === "sales" ? "#offres" : key === "delivery" ? "#livraison" : "#acquisition"} className="rounded-[var(--radius-control)] border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex items-center justify-between gap-2 font-bold"><span>{sectionLabels[key]}</span><span>{section.percent}%</span></span>
              <span className="mt-1 block text-xs text-muted-foreground">{section.total - section.answered > 0 ? `${section.total - section.answered} à renseigner` : "Complet"}</span>
            </a>
          ))}
        </div>
      </section>

      <nav
        aria-label="Sections de Mon business"
        className="sticky top-20 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-background/95 p-1 backdrop-blur-sm"
      >
        <a
          href="#identite"
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2"
        >
          Identité &amp; modèle
        </a>
        <a
          href="#offres"
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
        >
          Offres &amp; prix
        </a>
        <a
          href="#upsell"
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
        >
          Upsell &amp; ascension
        </a>
        <a
          href="#livraison"
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
        >
          Livraison client
        </a>
        <a
          href="#equipe"
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2"
        >
          Équipe
        </a>
      </nav>

      <section id="identite" className="scroll-mt-28">
        <IdentitySection
          value={profile.identity}
          onChange={(identity) => setProfile((prev) => ({ ...prev, identity }))}
        />
      </section>

      <section id="acquisition" className="scroll-mt-28">
        <AcquisitionSection
          value={profile.acquisition}
          onChange={(acquisition) => setProfile((prev) => ({ ...prev, acquisition }))}
        />
      </section>

      <section id="offres" className="scroll-mt-28">
        <SalesSection
          value={profile.sales}
          showPerformance={canViewSalesPerformance}
          offerPerformance={offerPerformance}
          onChange={(sales) => setProfile((prev) => ({ ...prev, sales }))}
        />
      </section>

      <section id="livraison" className="scroll-mt-28">
        <DeliverySection
          value={profile.delivery}
          offers={profile.sales.offers}
          showPerformance={canViewSalesPerformance}
          upsellPerformance={upsellPerformance}
          onChange={(delivery) => setProfile((prev) => ({ ...prev, delivery }))}
        />
      </section>

      {/* Team & roles management belongs to the business itself — owner-only
          (the /settings/equipe page re-checks server-side regardless). */}
      {isOwner && (
        <div id="equipe" className="sticker-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Users className="size-4.5" />
            </div>
            <div>
              <p className="font-bold">Équipe</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Invite des membres, attribue-leur des rôles (setting, closing, financier…) et
                configure leurs accès.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/settings/equipe">Gérer l&apos;équipe →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
